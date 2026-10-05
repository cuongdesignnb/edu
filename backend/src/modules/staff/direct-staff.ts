import {one,type Transaction} from '../../database/database';
import {hashPassword} from '../../common/security';
import {Problem,validation} from '../../common/problem';
import {audit} from '../../common/commands';
import type {RequestContext} from '../../api.router';

export async function createDirectStaff(tx:Transaction,c:RequestContext,existing:boolean,
 validate:(body:Record<string,unknown>)=>Promise<unknown>,assign:(body:Record<string,unknown>)=>Promise<unknown>){
 const b=c.body,schoolId=c.params.schoolId!,email=String(b.email).trim().toLowerCase(),name=String(b.displayName).trim();
 if(name.length<3)validation('displayName','Họ tên tối thiểu 3 ký tự.');
 const proposal={roleId:b.roleId,scopeType:'SCHOOL',validFrom:b.validFrom??new Date().toISOString(),validUntil:b.validUntil??null};
 await validate(proposal);
 let user=await one<{id:string;status:string;password_hash:string|null;must_change_password:boolean}>(tx,'SELECT id,status,password_hash,must_change_password FROM identity.users WHERE email_normalized=$1 FOR UPDATE',[email]);
 if(existing){if(!user)throw new Problem(404,'IDENTITY_NOT_FOUND');if(user.status!=='ACTIVE'||!user.password_hash)throw new Problem(409,'IDENTITY_NOT_ELIGIBLE');}
 else{
  if(user)throw new Problem(409,'IDENTITY_EXISTS_USE_ASSIGN');
  const password=String(b.password);if(password.trim()!==password||!/[A-Za-zÀ-ỹ]/.test(password)||!/\d/.test(password))validation('password','Mật khẩu cần chữ, số, không có khoảng trắng đầu/cuối.');
  user=await one(tx,`INSERT INTO identity.users(email_normalized,display_name,password_hash,status,must_change_password) VALUES($1,$2,$3,'ACTIVE',$4)
   ON CONFLICT(email_normalized) DO NOTHING RETURNING id,status,password_hash,must_change_password`,[email,name,await hashPassword(password),b.mustChangePassword]);
  if(!user)throw new Problem(409,'IDENTITY_EXISTS_USE_ASSIGN');
 }
 if(await one(tx,'SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2',[schoolId,user.id]))throw new Problem(409,'ALREADY_SCHOOL_MEMBER');
 const member=(await one<{id:string}>(tx,`INSERT INTO app.memberships(school_id,user_id,work_display_name,department,status,joined_at) VALUES($1,$2,$3,$4,'ACTIVE',now()) RETURNING id`,[schoolId,user.id,name,b.department??null]))!;
 await tx.query(`INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,valid_from,valid_until,granted_by) VALUES($1,$2,$3,'SCHOOL',$4,$5,$6)`,[schoolId,member.id,b.roleId,proposal.validFrom,proposal.validUntil,c.principal!.userId]);
 if(b.assignment)await assign({...b.assignment as Record<string,unknown>,memberId:member.id});
 await tx.query('UPDATE identity.users SET authz_version=authz_version+1 WHERE id=$1',[user.id]);
 await audit(tx,c,'member',member.id,{userId:user.id,roleId:b.roleId,identityCreated:!existing,scope:'SCHOOL'});
 return {id:member.id,userId:user.id,displayName:name,email,status:'ACTIVE',mustChangePassword:user.must_change_password};
}
