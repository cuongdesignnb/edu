import {one,iso,type Row,type Transaction} from '../../database/database';
import {dto,resource,getResource,listResource} from '../../database/resources';
import {auditResource,auditView} from '../../database/audit-view';
import {grantAllows,grantDto,type Grant,type Permissions} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

/** A purpose-bound choice does not expose a role's permission catalog. */
export async function schoolRoleChoices(tx:Transaction,schoolId:string,grants:Grant[]){
  const rows=(await tx.query<Row>(`SELECT r.id,r.version,r.label,r.code,r.system_role,
    ARRAY(SELECT p.action_code FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id AND 'SCHOOL'=ANY(p.allowed_scopes) ORDER BY p.action_code) AS actions
    FROM app.roles r WHERE r.school_id=$1 AND r.status='ACTIVE' AND EXISTS(SELECT 1 FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id AND 'SCHOOL'=ANY(p.allowed_scopes))
    ORDER BY r.label COLLATE app.vi_names,r.id LIMIT 1001`,[schoolId])).rows;
  if(rows.length>1000)throw new Problem(422,'MEMBER_ROLE_CHOICE_LIMIT');
  return rows.map(row=>{
    let canDelegate=true,until:Date|null=null;
    for(const action of new Set([...(row.actions as string[]),'role.manage'])){
      const held=grants.filter(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action));
      if(!held.length){canDelegate=false;break;}
      if(held.some(g=>g.valid_until===null))continue;
      const ceiling=new Date(Math.max(...held.map(g=>g.valid_until!.getTime())));
      if(until===null||ceiling<until)until=ceiling;
    }
    return {id:row.id,version:row.version,label:row.label,code:row.code,systemRole:row.system_role,canDelegate,delegationUntil:canDelegate&&until?iso(until):null};
  });
}

async function memberAssignments(tx:Transaction,schoolId:string,memberId:string,today:string,effective:Grant[],accessActive:boolean){
  const rows=(await tx.query<Row>(`SELECT a.*,cl.name AS class_name,y.name AS year_name,s.name AS subject_name,r.label AS role_label,
    g.valid_from,g.valid_until,g.revoked_at AS grant_revoked_at,r.status AS role_status,g.granted_by,
    (SELECT m.work_display_name FROM app.memberships m WHERE m.school_id=a.school_id AND m.user_id=g.granted_by) AS creator_name
    FROM app.teaching_assignments a JOIN app.classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id
    JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
    LEFT JOIN app.subjects s ON s.school_id=a.school_id AND s.id=a.subject_id
    JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
    JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id
    WHERE a.school_id=$1 AND a.member_id=$2 ORDER BY a.starts_on DESC,a.id LIMIT 2001`,[schoolId,memberId])).rows;
  if(rows.length>2000)throw new Problem(422,'MEMBER_ASSIGNMENT_LIMIT');
  const currentIds=new Set(effective.filter(g=>g.assignment_id).map(g=>g.assignment_id));
  return rows.map(row=>({id:row.id,version:row.version,classId:row.class_id,className:row.class_name,yearName:row.year_name,
    memberId:row.member_id,roleGrantId:row.role_grant_id,kind:row.kind,subjectId:row.subject_id,subjectName:row.subject_name,
    startsOn:row.starts_on,endsOn:row.ends_on,revokedAt:row.revoked_at?iso(row.revoked_at as Date):null,
    grantValidFrom:iso(row.valid_from as Date),grantValidUntil:row.valid_until?iso(row.valid_until as Date):null,
    grantRevokedAt:row.grant_revoked_at?iso(row.grant_revoked_at as Date):null,roleLabel:row.role_label,roleStatus:row.role_status,
    createdAt:iso(row.created_at as Date),createdBy:row.granted_by,createdByName:row.creator_name,
    live:accessActive&&currentIds.has(String(row.id))&&row.revoked_at===null&&String(row.starts_on)<=today&&(!row.ends_on||String(row.ends_on)>today)}));
}

export async function memberDetails(tx:Transaction,c:RequestContext,policy:Permissions,schoolRoleGrants:unknown){
  const schoolId=c.params.schoolId!,memberId=c.params.memberId!,raw=await getResource(tx,resource('member'),schoolId,memberId);
  const member=dto(resource('member'),raw),grants=await policy.grants(tx,c.principal!.userId,schoolId);
  const ref=(await one<{today:string;joined_on:string|null;access_active:boolean}>(tx,`SELECT (now() AT TIME ZONE s.timezone)::date AS today,
    (m.joined_at AT TIME ZONE s.timezone)::date AS joined_on,m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' AS access_active
    FROM app.memberships m JOIN identity.users u ON u.id=m.user_id JOIN platform.schools s ON s.id=m.school_id
    WHERE m.school_id=$1 AND m.id=$2`,[schoolId,memberId]))!;
  const effective=(await policy.grants(tx,String(raw.user_id),schoolId)).flatMap(g=>{
    const actions=g.actions.filter(action=>grantAllows(g,action,{schoolId,classId:g.class_id??undefined,subjectId:g.subject_id??undefined,allowSubject:true},ref.today));
    return actions.length?[{...g,actions}]:[];
  });
  member.grants=effective.map(grantDto);member.schoolRoleGrants=schoolRoleGrants;
  const has=(action:string)=>grants.some(g=>grantAllows(g,action,{schoolId},ref.today));
  const count=(await one<{count:number}>(tx,'SELECT app.member_other_school_count($1) AS count',[memberId]))!;
  return {member,referenceDate:ref.today,joinedOn:ref.joined_on,accessActive:ref.access_active,otherSchools:count.count,
    assignments:has('assignment.read')?await memberAssignments(tx,schoolId,memberId,ref.today,effective,ref.access_active):null,
    roleChoices:has('role.manage')?await schoolRoleChoices(tx,schoolId,grants):null,
    canAssign:has('assignment.manage'),canSuspend:has('member.manage'),canRole:has('role.manage'),canViewHistory:has('audit.read'),isSelf:raw.user_id===c.principal!.userId};
}

export async function memberHistory(tx:Transaction,c:RequestContext){
  const schoolId=c.params.schoolId!,memberId=c.params.memberId!;await getResource(tx,resource('member'),schoolId,memberId);
  for(const field of Object.keys(c.query))if(!['limit','cursor','sort','dir'].includes(field))validation(field,'Tham số lịch sử thành viên không hợp lệ');
  if(c.query.sort&&!['id','createdAt'].includes(c.query.sort))validation('sort','Sắp xếp lịch sử thành viên không hợp lệ');
  const result=await listResource(tx,auditResource,schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},
    {sql:`(t.target_type='member' AND t.target_id=$1::uuid OR t.target_type='assignment' AND EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=t.school_id AND a.member_id=$1 AND a.id=t.target_id)
      OR t.target_type='grant' AND EXISTS(SELECT 1 FROM app.role_grants g WHERE g.school_id=t.school_id AND g.member_id=$1 AND g.id=t.target_id))`,values:[memberId]},c.principal!.userId);
  result.data=result.data.map(auditView);return result;
}

export async function staffActivity(tx:Transaction,c:RequestContext){
  for(const field of Object.keys(c.query))if(!['limit','cursor','sort','dir','action'].includes(field))validation(field,'Bộ lọc nhật ký nhân sự không hợp lệ');
  if(c.query.sort&&!['id','createdAt'].includes(c.query.sort))validation('sort','Sắp xếp nhật ký nhân sự không hợp lệ');
  const result=await listResource(tx,auditResource,c.params.schoolId!,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},
    {sql:"t.target_type IN ('member','assignment','grant','role','invitation','handover')",values:[]},c.principal!.userId);
  result.data=result.data.map(auditView);return result;
}
