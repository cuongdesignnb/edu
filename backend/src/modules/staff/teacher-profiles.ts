import {one,iso,type Row,type Transaction} from '../../database/database';
import {dto} from '../../database/resources';
import {roleSummaryResource} from './role-details';
import {permissionCatalog} from '../../common/contract';
import {Problem,validation} from '../../common/problem';
import {audit} from '../../common/commands';
import type {RequestContext} from '../../api.router';

export async function assignmentProfile(tx:Transaction,schoolId:string,kind:string,requested?:unknown):Promise<Row & {permissions:{action:string;scopes:string[]}[]}>{
 const school=(await one<{settings:Record<string,string>}>(tx,'SELECT settings FROM platform.schools WHERE id=$1',[schoolId]))!;
 const chosen=requested??school.settings[kind==='HOMEROOM'?'homeroomRoleId':'subjectTeacherRoleId'];
 const role=chosen?await one<Row>(tx,"SELECT * FROM app.roles WHERE school_id=$1 AND id=$2 AND status='ACTIVE'",[schoolId,chosen]):await one<Row>(tx,"SELECT * FROM app.roles WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[schoolId,kind==='HOMEROOM'?'HOMEROOM':'SUBJECT_TEACHER']);
 if(!role||role.code==='SCHOOL_ADMIN'||String(role.code).startsWith('PLATFORM'))validation('roleId','Chọn mẫu quyền giáo viên đang hoạt động của trường');
 const permissions=(await tx.query<{action:string;scopes:string[]}>('SELECT action_code AS action,allowed_scopes AS scopes FROM app.role_permissions WHERE school_id=$1 AND role_id=$2',[schoolId,role.id])).rows;
 const scope=kind==='HOMEROOM'?'CLASS':'SUBJECT';
 if(!permissions.some(p=>p.scopes.includes(scope))||permissions.some(p=>p.action.startsWith('platform.')))validation('roleId','Mẫu quyền không hỗ trợ đúng phạm vi lớp/môn');
 return {...role,permissions};
}
export async function teacherProfiles(tx:Transaction,schoolId:string){
 const school=(await one<Row>(tx,'SELECT version FROM platform.schools WHERE id=$1',[schoolId]))!;
 const roles=(await tx.query<Row>(`SELECT * FROM ${roleSummaryResource.table} t WHERE school_id=$1 AND status='ACTIVE' ORDER BY label COLLATE app.vi_names`,[schoolId])).rows;
 return {version:school.version,homeroomRoleId:(await assignmentProfile(tx,schoolId,'HOMEROOM')).id,subjectTeacherRoleId:(await assignmentProfile(tx,schoolId,'SUBJECT')).id,roles:roles.map(r=>dto(roleSummaryResource,r)),catalog:permissionCatalog};
}
type ValidateGrant=(body:Record<string,unknown>)=>Promise<{actions:string[]}>;
export async function switchAssignmentProfile(tx:Transaction,c:RequestContext,validate:ValidateGrant,preview=false,assignmentId=c.params.assignmentId!,roleId=c.body.roleId,expected=c.body.expectedVersion){
 const schoolId=c.params.schoolId!,a=await one<Row>(tx,'SELECT * FROM app.teaching_assignments WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,assignmentId]);
 if(!a)throw new Problem(404,'RESOURCE_NOT_FOUND');if(a.version!==expected)throw new Problem(409,'VERSION_CONFLICT');
 if(a.revoked_at)throw new Problem(409,'ASSIGNMENT_REVOKED');
 const today=(await one<{today:string}>(tx,"SELECT (now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1",[schoolId]))!.today;
 if(a.ends_on&&String(a.ends_on)<=today)throw new Problem(409,'ASSIGNMENT_ENDED');
 const role=await assignmentProfile(tx,schoolId,String(a.kind),roleId),old=await one<Row>(tx,'SELECT * FROM app.role_grants WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,a.role_grant_id]);
 if(!old||old.revoked_at)throw new Problem(409,'GRANT_REVOKED');
 if(old.valid_until&&(old.valid_until as Date).getTime()<=Date.now())throw new Problem(409,'GRANT_EXPIRED');
 const body={memberId:a.member_id,roleId:role.id,scopeType:old.scope_type,classId:a.class_id,...(a.subject_id?{subjectId:a.subject_id}:{}),validFrom:iso(old.valid_from as Date),validUntil:old.valid_until?iso(old.valid_until as Date):null};
 const next=await validate(body),previous=(await tx.query<{action:string}>('SELECT action_code AS action FROM app.role_permissions WHERE school_id=$1 AND role_id=$2 AND $3=ANY(allowed_scopes)',[schoolId,old.role_id,old.scope_type])).rows.map(p=>p.action);
 const info={assignmentId:a.id,version:a.version,roleId:role.id,roleLabel:role.label,classId:a.class_id,startsOn:a.starts_on,endsOn:a.ends_on,added:next.actions.filter(p=>!previous.includes(p)),removed:previous.filter(p=>!next.actions.includes(p))};
 if(preview)return info;
 const grant=await one<Row>(tx,`INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,class_id,subject_id,valid_from,valid_until,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[schoolId,a.member_id,role.id,old.scope_type,a.class_id,a.subject_id,old.valid_from,old.valid_until,c.principal!.userId]);
 const changed=await one<Row>(tx,'UPDATE app.teaching_assignments SET role_grant_id=$3 WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,a.id,grant!.id]);
 await tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[schoolId,old.id]);
 await audit(tx,c,'assignment',String(a.id),{previousRoleId:old.role_id,roleId:role.id,previousGrantId:old.id,grantId:grant!.id,added:info.added,removed:info.removed});
 return changed!;
}
export async function defaultProfilePreview(tx:Transaction,c:RequestContext){
 const schoolId=c.params.schoolId!,school=(await one<Row>(tx,'SELECT version,timezone FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]))!;
 if(school.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT');
 const role=await assignmentProfile(tx,schoolId,String(c.body.kind),c.body.roleId),scope=c.body.kind==='HOMEROOM'?'CLASS':'SUBJECT';
 // Validate the whole proposed role against the editor's current school ceiling.
 const permissions=role.permissions.filter(p=>p.scopes.includes(scope));
 const current=(await tx.query<Row>(`SELECT a.* FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE' JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id JOIN identity.users u ON u.id=m.user_id JOIN platform.schools s ON s.id=a.school_id WHERE a.school_id=$1 AND a.kind=$2 AND a.revoked_at IS NULL AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date) ORDER BY a.id`,[schoolId,c.body.kind])).rows;
 return {version:school.version,kind:c.body.kind,roleId:role.id,roleLabel:role.label,affected:c.body.applyCurrent?current.length:0,classIds:c.body.applyCurrent?[...new Set(current.map(a=>String(a.class_id)))]:[],current,permissions};
}
