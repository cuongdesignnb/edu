import {one,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {hashPassword} from '../../common/security';
import {Problem,notFound,validation} from '../../common/problem';
import {audit} from '../../common/commands';
import type {RequestContext} from '../../api.router';

export async function manageStaffCredential(tx:Transaction,c:RequestContext,policy:Permissions){
 const schoolId=c.params.schoolId!,memberId=c.params.memberId!;
 const access=await policy.require(tx,c.principal!,'member.manage+role.manage',{schoolId});
 const member=await one<Row>(tx,'SELECT * FROM app.memberships WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,memberId]);if(!member)notFound();
 if(member.user_id===c.principal!.userId)throw new Problem(422,'USE_OWN_PASSWORD_CHANGE');
 if(Number(member.version)!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT');
 if(!access.grants.some(g=>g.role_code==='SCHOOL_ADMIN'&&g.scope_type==='SCHOOL'))throw new Problem(403,'FORBIDDEN');
 const shared=await one<Row>(tx,'SELECT app.member_other_school_count($1) AS count',[memberId]);
 if(Number(shared!.count)>0)throw new Problem(409,'SHARED_IDENTITY_USE_SELF_RECOVERY');
 if(await one(tx,'SELECT id FROM platform.operator_grants WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1',[member.user_id]))throw new Problem(403,'PLATFORM_IDENTITY_PROTECTED');
 const target=await policy.grants(tx,String(member.user_id),schoolId);
 const targetActions=[...new Set(target.flatMap(g=>g.actions.filter(a=>grantAllows(g,a,{schoolId,classId:g.class_id??undefined,subjectId:g.subject_id??undefined,allowSubject:true},access.today))))];
 if(targetActions.some(action=>!access.grants.some(g=>g.scope_type==='SCHOOL'&&grantAllows(g,action,{schoolId},access.today))))throw new Problem(403,'DELEGATION_CEILING');
 const reason=String(c.body.reason??'').trim();if(reason.length<5)validation('reason','Lý do tối thiểu 5 ký tự');
 if(c.operation.id==='resetSchoolStaffPassword'){
  const password=String(c.body.password??'');if(password.length<12||password.length>128||password.trim()!==password||!/[A-Za-zÀ-ỹ]/.test(password)||!/\d/.test(password))validation('password','Mật khẩu 12–128 ký tự, gồm chữ và số');
  await tx.query('UPDATE identity.users SET password_hash=$2,must_change_password=true,password_changed_at=now(),authz_version=authz_version+1 WHERE id=$1',[member.user_id,await hashPassword(password)]);
 }else await tx.query('UPDATE identity.users SET authz_version=authz_version+1 WHERE id=$1',[member.user_id]);
 await tx.query('UPDATE identity.staff_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[member.user_id]);
 await tx.query('UPDATE app.memberships SET updated_at=now() WHERE school_id=$1 AND id=$2',[schoolId,memberId]);
 await audit(tx,c,'member',memberId,{passwordReset:c.operation.id==='resetSchoolStaffPassword',mustChangePassword:c.operation.id==='resetSchoolStaffPassword',sessionsRevoked:true});
 return {data:{id:memberId,sessionsRevoked:true,mustChangePassword:c.operation.id==='resetSchoolStaffPassword'}};
}
