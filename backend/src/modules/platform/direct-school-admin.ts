import {one,type Transaction} from '../../database/database';
import {hashPassword} from '../../common/security';
import {coversDelegatedExpiry} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import {platformAudit} from './platform-data';
import type {RequestContext} from '../../api.router';
import {grantDto,type Grant} from '../../common/permissions';

/** Administration listing includes scheduled grants; authorization still uses current grants only. */
export async function schoolAdminGrants(tx:Transaction,schoolId:string,userId:string){
 const rows=await tx.query<Grant>(`SELECT g.id,g.version,g.role_id,r.code AS role_code,r.label,g.scope_type,
  g.class_id,g.subject_id,g.valid_from,g.valid_until,array_agg(DISTINCT p.action_code) AS actions,
  NULL AS assignment_id,NULL AS starts_on,NULL AS ends_on
  FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
  JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id
  JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.status='ACTIVE'
  JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND 'SCHOOL'=ANY(p.allowed_scopes)
  WHERE m.school_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL
   AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL
  GROUP BY g.id,r.code,r.label`,[schoolId,userId]);
 return rows.rows.map(grantDto);
}

/** Identity, membership, grant and safe audit share the platform command transaction. */
export async function createSchoolAdmin(tx:Transaction,c:RequestContext,existing=false){
 const schoolId=c.params.schoolId!,b=c.body,email=String(b.email).trim().toLowerCase(),name=String(b.displayName).trim();
 if(name.length<3)validation('displayName','Họ tên tối thiểu 3 ký tự.');
 const from=b.validFrom?new Date(String(b.validFrom)):new Date(),until=b.validUntil?new Date(String(b.validUntil)):null;
 if(!Number.isFinite(from.getTime())||until&&(!Number.isFinite(until.getTime())||until<=from||until.getTime()<=Date.now()))validation('validUntil','Thời hạn quyền chưa hợp lệ.');
 const authority=(await tx.query<{valid_until:Date|null}>("SELECT valid_until FROM platform.operator_grants WHERE user_id=$1 AND action_code='platform.admins.create_direct' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",[c.principal!.userId])).rows;
 if(!authority.some(g=>coversDelegatedExpiry(g,from,until)))throw new Problem(403,'DELEGATION_CEILING');
 const role=await one<{id:string}>(tx,"SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_ADMIN' AND system_role AND status='ACTIVE'",[schoolId]);if(!role)throw new Problem(409,'DEFAULT_ROLES_REQUIRED');
 let user=await one<{id:string;status:string;password_hash:string|null;must_change_password:boolean}>(tx,'SELECT id,status,password_hash,must_change_password FROM identity.users WHERE email_normalized=$1 FOR UPDATE',[email]);
 if(existing){
  if(!user)throw new Problem(404,'IDENTITY_NOT_FOUND');
  if(user.status!=='ACTIVE'||!user.password_hash)throw new Problem(409,'IDENTITY_NOT_ELIGIBLE');
 }else{
  if(user)throw new Problem(409,'IDENTITY_EXISTS_USE_ASSIGN');
  const password=String(b.password);if(password.trim()!==password||!/[A-Za-zÀ-ỹ]/.test(password)||!/\d/.test(password))validation('password','Mật khẩu phải có chữ, số và không có khoảng trắng đầu/cuối.');
  const inserted=await one<{id:string;status:string;password_hash:string;must_change_password:boolean}>(tx,`INSERT INTO identity.users(email_normalized,display_name,password_hash,status,must_change_password)
   VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(email_normalized) DO NOTHING RETURNING id,status,password_hash,must_change_password`,[email,name,await hashPassword(String(b.password)),b.mustChangePassword]);
  if(!inserted)throw new Problem(409,'IDENTITY_EXISTS_USE_ASSIGN');user=inserted;
 }
 if(await one(tx,'SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2',[schoolId,user!.id]))throw new Problem(409,'ALREADY_SCHOOL_MEMBER');
 const member=(await one<{id:string}>(tx,"INSERT INTO app.memberships(school_id,user_id,work_display_name,status,joined_at) VALUES($1,$2,$3,'ACTIVE',now()) RETURNING id",[schoolId,user!.id,name]))!;
 const grant=(await one<{id:string}>(tx,"INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,valid_from,valid_until,granted_by) VALUES($1,$2,$3,'SCHOOL',$4,$5,$6) RETURNING id",[schoolId,member.id,role.id,from,until,c.principal!.userId]))!;
 await platformAudit(tx,c,'member',member.id,{userId:user!.id,memberId:member.id,grantId:grant.id,scope:'SCHOOL',roleCode:'SCHOOL_ADMIN',validFrom:from.toISOString(),validUntil:until?.toISOString()??null,identityCreated:!existing});
 return {id:member.id,userId:user!.id,displayName:name,email,status:'ACTIVE',grantId:grant.id,roleCode:'SCHOOL_ADMIN',scopeType:'SCHOOL',validFrom:from.toISOString(),validUntil:until?.toISOString()??null,mustChangePassword:user!.must_change_password};
}
