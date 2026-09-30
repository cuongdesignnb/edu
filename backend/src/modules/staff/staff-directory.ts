import {one,type Transaction} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {Problem} from '../../common/problem';
import type {Grant} from '../../common/permissions';
import type {RequestContext} from '../../api.router';

/** Rows and search fields are built inside PostgreSQL, before keyset/count. */
const directory:Resource={table:`(WITH school AS (
 SELECT id,(now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1
), school_roles AS (
 SELECT g.member_id,array_agg(DISTINCT r.label ORDER BY r.label) AS labels FROM app.role_grants g
 JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
 WHERE g.school_id=$1 AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL AND g.valid_from<=now()
 AND (g.valid_until IS NULL OR g.valid_until>now()) GROUP BY g.member_id
), duties AS (
 SELECT a.member_id,bool_or(a.kind='HOMEROOM') AS homeroom,bool_or(a.kind='SUBJECT') AS subject,
 array_agg(CASE a.kind WHEN 'HOMEROOM' THEN 'Chủ nhiệm '||c.name ELSE s.name||' '||c.name END ORDER BY c.name,s.name,a.id) AS labels
 FROM app.teaching_assignments a JOIN school config ON config.id=a.school_id
 JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id
 LEFT JOIN app.subjects s ON s.school_id=a.school_id AND s.id=a.subject_id
 JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL
 AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
 JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
 WHERE a.school_id=$1 AND a.revoked_at IS NULL AND a.starts_on<=config.today AND (a.ends_on IS NULL OR a.ends_on>config.today)
 GROUP BY a.member_id
), members AS (
 SELECT m.school_id,m.id,m.version,m.created_at,m.updated_at,'MEMBER'::text AS kind,m.id AS member_id,m.user_id,m.status,
 m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' AS access_active,m.work_display_name AS full_name,
 m.work_email AS email,m.department,m.staff_code,NULL::timestamptz AS expires_at,
 coalesce(sr.labels,ARRAY[]::text[])||CASE WHEN d.homeroom THEN ARRAY['GVCN'] ELSE ARRAY[]::text[] END||
 CASE WHEN d.subject THEN ARRAY['Giáo viên bộ môn'] ELSE ARRAY[]::text[] END AS assigned_labels,
 coalesce(d.labels,ARRAY[]::text[]) AS duty_labels
 FROM app.memberships m JOIN identity.users u ON u.id=m.user_id
 LEFT JOIN school_roles sr ON sr.member_id=m.id LEFT JOIN duties d ON d.member_id=m.id WHERE m.school_id=$1
), invitations AS (
 SELECT i.school_id,i.id,i.version,i.created_at,i.updated_at,'INVITATION'::text AS kind,NULL::uuid AS member_id,NULL::uuid AS user_id,NULL::text AS status,
 false AS access_active,coalesce(i.work_profile->>'workDisplayName','') AS full_name,i.email_normalized AS email,
 NULL::text AS department,NULL::text AS staff_code,i.expires_at,ARRAY['Lời mời']::text[] AS assigned_labels,
 CASE WHEN coalesce(i.work_profile->>'proposedDuty','')='' THEN ARRAY[]::text[] ELSE ARRAY[i.work_profile->>'proposedDuty'] END AS duty_labels
 FROM app.staff_invitations i WHERE i.school_id=$1 AND $2::boolean AND i.status='PENDING' AND i.expires_at>now()
), rows AS (SELECT * FROM members UNION ALL SELECT * FROM invitations)
 SELECT rows.*,CASE WHEN cardinality(assigned_labels)=0 THEN ARRAY['Chưa phân công'] ELSE assigned_labels END AS role_labels,
 regexp_replace(btrim(full_name),'^.*[[:space:]]','') AS given_name FROM rows)`,
fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',kind:'kind',memberId:'member_id',userId:'user_id',status:'status',accessActive:'access_active',fullName:'full_name',email:'email',department:'department',staffCode:'staff_code',expiresAt:'expires_at',roleLabels:'role_labels',dutyLabels:'duty_labels'},
writeFields:[],search:[],filters:{department:'department'},sortKeys:{fullName:[{column:'given_name',collation:'app.vi_names'},{column:'full_name',collation:'app.vi_names'}],department:[{column:'department',collation:'app.vi_names'}]}};

export function schoolCapability(grants:Grant[],action:string){return grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action));}
export async function staffDirectory(tx:Transaction,c:RequestContext,grants:Grant[]){
  const includeInvitations=schoolCapability(grants,'member.manage'),status=c.query.status,predicates:string[]=[],values:unknown[]=[];
  if(status==='PENDING_INVITATION'){
    if(!includeInvitations)throw new Problem(403,'FORBIDDEN');predicates.push("t.kind='INVITATION'");
  }else if(status){values.push(status);predicates.push(`t.kind='MEMBER' AND t.status=$${values.length}`);}
  if(c.query.role){values.push(c.query.role);predicates.push(`$${values.length}=ANY(t.role_labels)`);}
  const folded=c.query.q?(await one<{q:string}>(tx,'SELECT app.fold_vi(btrim($1)) AS q',[c.query.q]))!.q:undefined;
  if(folded){
    values.push('%'+folded.replace(/[\\%_]/g,'\\$&')+'%');const needle='$'+values.length;
    predicates.push(`(app.fold_vi(t.full_name) LIKE ${needle} OR app.fold_vi(t.email) LIKE ${needle} OR app.fold_vi(t.department) LIKE ${needle}
      OR EXISTS(SELECT 1 FROM unnest(t.duty_labels) label WHERE app.fold_vi(label) LIKE ${needle}))`);
  }
  const result=await listResource(tx,directory,c.params.schoolId!,{...c.query,sort:c.query.sort??'fullName'},
    {sql:predicates.join(' AND '),values},c.principal!.userId,[includeInvitations]);
  result.data=result.data.map(row=>({...row,memberId:row.memberId??null,userId:row.userId??null}));return result;
}
export async function staffDirectorySummary(tx:Transaction,schoolId:string,grants:Grant[]){
  const canInvite=schoolCapability(grants,'member.manage'),counts=(await one<{total:number;active:number;suspended:number}>(tx,`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE')::int AS active,
    count(*) FILTER(WHERE m.status IN ('SUSPENDED','ENDED'))::int AS suspended FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1`,[schoolId]))!;
  const departments=(await tx.query<{value:string}>("SELECT value FROM (SELECT DISTINCT department AS value FROM app.memberships WHERE school_id=$1 AND department IS NOT NULL AND department<>'') d ORDER BY value COLLATE app.vi_names,value COLLATE \"C\" LIMIT 1001",[schoolId])).rows;
  const roleLabels=(await tx.query<{value:string}>(`SELECT value FROM (SELECT DISTINCT r.label AS value FROM app.roles r WHERE r.school_id=$1 AND r.status='ACTIVE'
    AND EXISTS(SELECT 1 FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id AND 'SCHOOL'=ANY(p.allowed_scopes))) d ORDER BY value COLLATE app.vi_names,value COLLATE "C" LIMIT 1001`,[schoolId])).rows;
  if(departments.length>1000||roleLabels.length>1000)throw new Problem(422,'STAFF_DIRECTORY_CHOICE_LIMIT');
  const pendingInvites=canInvite?(await one<{total:number}>(tx,"SELECT count(*)::int AS total FROM app.staff_invitations WHERE school_id=$1 AND status='PENDING' AND expires_at>now()",[schoolId]))!.total:null;
  return {kpi:{...counts,pendingInvites},departments:departments.map(d=>d.value),roleLabels:[...new Set([...roleLabels.map(r=>r.value),'GVCN','Giáo viên bộ môn','Chưa phân công'])],
    canInvite,canSuspend:canInvite,canAssign:schoolCapability(grants,'assignment.manage'),canExport:schoolCapability(grants,'report.export'),canViewInvitations:canInvite};
}
