import {one,type Transaction,type Row} from '../../database/database';
import {dto,listResource,type Resource} from '../../database/resources';
import {grantAllows} from '../../common/permissions';
import {Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';
import type {IssueScope} from './access-issue-source';

const source=`(SELECT l.school_id,l.id,l.version,l.created_at,l.updated_at,l.student_id,s.version AS student_version,s.full_name AS student_name,s.student_code,s.status AS student_status,
  l.year_id,y.name AS year_name,y.status AS year_status,cl.id AS class_id,cl.version AS class_version,cl.name AS class_name,
  (e.starts_on<=$3::date AND (e.ends_on IS NULL OR e.ends_on>$3::date)) AS enrollment_in_effect,
  l.relationship_id,r.version AS relationship_version,r.relationship_label,r.status AS relationship_status,r.can_receive_info,r.revoked_at AS relationship_revoked_at,
  g.id AS guardian_id,g.version AS guardian_version,g.full_name AS guardian_name,l.allowed_sections,l.allow_download,l.expires_at,l.revoked_at,l.revoke_reason,l.issued_by,m.work_display_name AS issued_by_name,
  CASE WHEN l.revoked_at IS NOT NULL OR r.revoked_at IS NOT NULL OR r.status<>'VERIFIED' OR NOT r.can_receive_info THEN 'REVOKED' WHEN l.expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS access_status,
  (SELECT count(*)::int FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS opens,
  (SELECT max(ev.created_at) FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS last_opened_at
  FROM app.parent_access_links l JOIN app.students s ON s.school_id=l.school_id AND s.id=l.student_id
  JOIN app.academic_years y ON y.school_id=l.school_id AND y.id=l.year_id
  JOIN app.guardian_relationships r ON r.school_id=l.school_id AND r.id=l.relationship_id AND r.student_id=l.student_id
  JOIN app.guardians g ON g.school_id=r.school_id AND g.id=r.guardian_id
  JOIN LATERAL(SELECT id,class_id,starts_on,ends_on FROM app.enrollments WHERE school_id=l.school_id AND student_id=l.student_id AND year_id=l.year_id AND status<>'CANCELLED'
    AND ($2::uuid[] IS NULL OR (class_id=ANY($2) AND starts_on<=$3::date AND (ends_on IS NULL OR ends_on>$3::date)))
    ORDER BY (starts_on<=$3::date AND (ends_on IS NULL OR ends_on>$3::date)) DESC,starts_on DESC,id LIMIT 1)e ON true
  JOIN app.classes cl ON cl.school_id=l.school_id AND cl.id=e.class_id
  LEFT JOIN app.memberships m ON m.school_id=l.school_id AND m.user_id=l.issued_by WHERE l.school_id=$1)`;
const resource:Resource={table:source,fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',studentId:'student_id',studentVersion:'student_version',studentName:'student_name',studentCode:'student_code',studentStatus:'student_status',
  yearId:'year_id',yearName:'year_name',yearStatus:'year_status',classId:'class_id',classVersion:'class_version',className:'class_name',enrollmentInEffect:'enrollment_in_effect',
  relationshipId:'relationship_id',relationshipVersion:'relationship_version',relationshipLabel:'relationship_label',relationshipStatus:'relationship_status',canReceiveInfo:'can_receive_info',relationshipRevokedAt:'relationship_revoked_at',
  guardianId:'guardian_id',guardianVersion:'guardian_version',guardianName:'guardian_name',allowedSections:'allowed_sections',allowDownload:'allow_download',expiresAt:'expires_at',revokedAt:'revoked_at',revokeReason:'revoke_reason',issuedBy:'issued_by',issuedByName:'issued_by_name',status:'access_status',opens:'opens',lastOpenedAt:'last_opened_at'},
  writeFields:[],search:[],filters:{studentId:'student_id',yearId:'year_id',classId:'class_id',status:'access_status'},sortKeys:{studentName:[{column:'student_name',collation:'app.vi_names'},{column:'student_code'}],guardianName:[{column:'guardian_name',collation:'app.vi_names'}]}};
const parameters=(access:IssueScope)=>[access.all?null:access.classIds,access.today];
function capability(access:IssueScope,action:string,schoolId:string,row:Record<string,unknown>){
  return access.grants.some(g=>grantAllows(g,action,{schoolId,...(row.enrollmentInEffect&&typeof row.classId==='string'?{classId:row.classId}:{})},access.today));
}
function capabilities(value:Record<string,unknown>,c:RequestContext,access:IssueScope){
  return {...value,canIssue:capability(access,'parent_access.issue',c.params.schoolId!,value)&&value.yearStatus==='ACTIVE'&&value.studentStatus==='ACTIVE'&&value.relationshipStatus==='VERIFIED'&&value.canReceiveInfo===true&&value.relationshipRevokedAt===null,
    canRevoke:capability(access,'parent_access.revoke',c.params.schoolId!,value)&&value.revokedAt===null,canPreview:capability(access,'parent_access.preview',c.params.schoolId!,value)};
}
export async function parentAccessDirectory(tx:Transaction,c:RequestContext,access:IssueScope){
  const q=c.query.q?.trim(),search=q?{sql:'(app.fold_vi(t.student_name) LIKE app.fold_vi($1) OR app.fold_vi(t.student_code) LIKE app.fold_vi($1) OR app.fold_vi(t.guardian_name) LIKE app.fold_vi($1))',values:['%'+q.replace(/[\\%_]/g,'\\$&')+'%']}:{sql:'',values:[]};
  const result=await listResource(tx,resource,c.params.schoolId!,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},search,c.principal!.userId,parameters(access));
  result.data=result.data.map(row=>capabilities(row,c,access));return result;
}
export async function parentAccessDirectorySummary(tx:Transaction,c:RequestContext,access:IssueScope){
  const values=[c.params.schoolId,...parameters(access)],counts=await one<Row>(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE t.access_status='ACTIVE')::int AS active,
    count(*) FILTER(WHERE t.access_status='EXPIRED')::int AS expired,count(*) FILTER(WHERE t.access_status='REVOKED')::int AS revoked FROM ${source}t`,values);
  const classes=(await tx.query<Row>(`SELECT DISTINCT t.class_id,t.class_version,t.class_name,t.year_id,t.year_name FROM ${source}t ORDER BY t.class_name,t.year_name,t.class_id LIMIT 1001`,values)).rows;
  if(classes.length>1000)throw new Problem(422,'PARENT_ACCESS_CLASS_CHOICE_LIMIT');
  return {today:access.today,kpi:counts,canIssue:access.grants.some(g=>g.actions.includes('parent_access.issue')&&(g.scope_type==='SCHOOL'||g.class_id&&grantAllows(g,'parent_access.issue',{schoolId:c.params.schoolId!,classId:g.class_id},access.today))),
    classes:classes.map(row=>({id:row.class_id,version:row.class_version,name:row.class_name,yearId:row.year_id,yearName:row.year_name}))};
}
export async function parentAccessDetails(tx:Transaction,c:RequestContext,access:IssueScope){
  const schoolId=c.params.schoolId!,row=await one<Row>(tx,`SELECT t.* FROM ${source}t WHERE t.id=$4`,[schoolId,...parameters(access),c.params.accessId]);
  if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');
  const value=capabilities(dto(resource,row),c,access),canViewContact=capability(access,'guardian.read',schoolId,value);
  const phone=canViewContact?await one<Row>(tx,"SELECT regexp_replace(phone,'^(....).*(...)$','\\1 *** \\2') AS masked FROM app.guardians WHERE school_id=$1 AND id=$2",[schoolId,row.guardian_id]):null;
  const next=await one<Row>(tx,`SELECT replacement.id FROM app.audit_events ev JOIN app.parent_access_links replacement ON replacement.school_id=ev.school_id AND replacement.id=ev.target_id
    WHERE ev.school_id=$1 AND ev.action='issueReviewedParentAccess' AND ev.target_type='parentAccess' AND ev.redacted_after->>'replacesAccessId'=$2
      AND replacement.student_id=$3 AND replacement.year_id=$4 AND replacement.relationship_id=$5 ORDER BY ev.created_at DESC,ev.id DESC LIMIT 1`,[schoolId,String(row.id),row.student_id,row.year_id,row.relationship_id]);
  const revoked=await one<Row>(tx,`SELECT m.work_display_name FROM app.audit_events ev LEFT JOIN app.memberships m ON m.school_id=ev.school_id AND m.user_id=ev.actor_user_id
    WHERE ev.school_id=$1 AND ev.target_type='parentAccess' AND ev.target_id=$2 AND ev.redacted_after->>'status'='REVOKED'
      AND ev.action=ANY($3::text[]) ORDER BY ev.created_at DESC,ev.id DESC LIMIT 1`,[schoolId,String(row.id),['revokeParentAccess','reissueParentAccess','issueReviewedParentAccess']]);
  const siblings=await listResource(tx,resource,schoolId,{studentId:String(row.student_id),yearId:String(row.year_id),limit:'20',sort:'createdAt',dir:'desc'},
    {sql:'t.id<>$1',values:[row.id]},c.principal!.userId,parameters(access));
  return {access:value,today:access.today,canViewContact,phoneMasked:phone?.masked??null,revokedByName:revoked?.work_display_name??null,replacedById:next?.id??null,
    siblings:{items:siblings.data.map(s=>({id:s.id,status:s.status,guardianName:s.guardianName,relationshipLabel:s.relationshipLabel})),hasMore:siblings.page.hasMore,total:siblings.page.total}};
}
