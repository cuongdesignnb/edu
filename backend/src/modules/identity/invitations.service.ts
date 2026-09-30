import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { Database,one,iso,type Transaction } from '../../database/database';
import { IdentityService,type UserRow } from './identity.service';
import { Permissions } from '../../common/permissions';
import { hashToken,randomToken,hashPassword,encryptMail } from '../../common/security';
import { Problem,validation } from '../../common/problem';
import type { RequestContext,Handler } from '../../api.router';

export interface Proposal {roleId:string;scopeType:string;classId?:string;subjectId?:string;validFrom:string;validUntil?:string|null}
export interface WorkProfile {staffCode?:string;workDisplayName?:string;workPhone?:string;department?:string}
interface InvitationRow {
  id:string;school_id:string;email_normalized:string;proposed_assignments:Proposal[];status:string;
  expires_at:Date;invited_by:string;accepted_user_id:string|null;version:number;created_at:Date;updated_at:Date;
  work_profile:WorkProfile;
}
export function invitationDto(invitation:InvitationRow,schoolName?:string,deliveryState?:string){
  return {id:invitation.id,version:invitation.version,createdAt:iso(invitation.created_at),updatedAt:iso(invitation.updated_at),
    email:invitation.email_normalized,expiresAt:iso(invitation.expires_at),status:invitation.status,
    ...(schoolName?{schoolName}:{}),...(deliveryState?{deliveryState}:{})};
}
@Injectable()
export class InvitationsService {
  constructor(private readonly db:Database,private readonly identity:IdentityService,private readonly permissions:Permissions){}
  handlers():Record<string,Handler>{return {
    inspectInvitation:async c=>({data:await this.inspect(c)}),
    acceptInvitation:async c=>({data:await this.respond(c,true)}),
    declineInvitation:async c=>({data:await this.respond(c,false)}),
  };}
  private async scope(c:RequestContext){
    await this.identity.rateLimit(`invite:${c.request.ip}`,20,300);
    const school=(await this.db.app.query<{id:string;name:string;status:string}>('SELECT id,name,status FROM platform.schools WHERE slug=$1',[c.body.schoolSlug])).rows[0];
    if(!school)throw new Problem(422,'INVITATION_UNAVAILABLE');return school;
  }
  private async inspect(c:RequestContext){
    const school=await this.scope(c);
    return this.db.transaction(async tx=>{
      const invitation=await this.token(tx,school.id,String(c.body.token));
      if(!['ACTIVE','DRAFT'].includes(school.status))throw new Problem(422,'INVITATION_UNAVAILABLE');
      return invitationDto(invitation,school.name);
    },{schoolId:school.id});
  }
  private async token(tx:Transaction,schoolId:string,token:string,lock=false){
    const invitation=await one<InvitationRow>(tx,`SELECT * FROM app.staff_invitations WHERE school_id=$1 AND token_hash=$2
      AND expires_at>now()${lock?' FOR UPDATE':''}`,[schoolId,hashToken(token)]);
    if(!invitation||invitation.status==='REVOKED'||invitation.status==='DECLINED')throw new Problem(422,'INVITATION_UNAVAILABLE');
    return invitation;
  }
  private async respond(c:RequestContext,accept:boolean){
    const school=await this.scope(c),principal=await this.identity.optional(c.request);
    const newHash=typeof c.body.newPassword==='string'?await hashPassword(c.body.newPassword):undefined;
    return this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[school.id]);
      const invitation=await this.token(tx,school.id,String(c.body.token),true);
      if(invitation.status==='ACCEPTED'){
        if(!principal||principal.userId!==invitation.accepted_user_id)throw new Problem(422,'INVITATION_UNAVAILABLE');
        return {id:invitation.id,status:'ACCEPTED'};
      }
      if(!accept){await tx.query("UPDATE app.staff_invitations SET status='DECLINED' WHERE school_id=$1 AND id=$2",[school.id,invitation.id]);return {id:invitation.id,status:'DECLINED'};}
      if(!['ACTIVE','DRAFT'].includes(school.status))throw new Problem(422,'INVITATION_UNAVAILABLE');
      let user=await one<UserRow>(tx,'SELECT * FROM identity.users WHERE email_normalized=$1 FOR UPDATE',[invitation.email_normalized]);
      if(user){
        if(!principal||principal.userId!==user.id||user.status!=='ACTIVE')throw new Problem(403,'INVITATION_LOGIN_REQUIRED');
        if(c.body.newPassword!==undefined)validation('newPassword','Lời mời không đổi mật khẩu danh tính hiện có');
      }else{
        if(!newHash||typeof c.body.displayName!=='string')validation('newPassword','Cần họ tên và mật khẩu cho nhân sự mới');
        user=await one<UserRow>(tx,`INSERT INTO identity.users(email_normalized,display_name,password_hash,status,email_verified_at)
          VALUES($1,$2,$3,'ACTIVE',now()) RETURNING *`,[invitation.email_normalized,String(c.body.displayName).trim(),newHash]);
      }
      // Existing identities retain all passwords and memberships at other schools.
      const profile=invitation.work_profile;
      const member=(await tx.query<{id:string;status:string;staff_code:string|null}>(`INSERT INTO app.memberships(school_id,user_id,work_display_name,staff_code,work_phone,department,status,joined_at)
        VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',now()) ON CONFLICT(school_id,user_id) DO UPDATE SET
        work_display_name=app.memberships.work_display_name RETURNING id,status,staff_code`,[school.id,user!.id,profile.workDisplayName??user!.display_name,
          profile.staffCode??null,profile.workPhone??null,profile.department??null])).rows[0]!;
      if(member.status!=='ACTIVE')throw new Problem(409,'MEMBERSHIP_REACTIVATION_REQUIRED');
      if(profile.staffCode&&member.staff_code!==profile.staffCode)throw new Problem(409,'STAFF_CODE_CONFLICT');
      const inviterGrants=await this.permissions.grants(tx,invitation.invited_by,school.id);
      const platformAdmin=(await tx.query(`SELECT g.id FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id
        WHERE g.user_id=$1 AND u.status='ACTIVE' AND g.action_code='platform.admins.manage' AND g.revoked_at IS NULL
        AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())`,[invitation.invited_by])).rowCount;
      if(!platformAdmin&&!inviterGrants.some(grant=>grant.scope_type==='SCHOOL'&&grant.actions.includes('member.manage')))
        throw new Problem(422,'INVITATION_UNAVAILABLE');
      for(const proposal of invitation.proposed_assignments){
        const role=await one<{id:string;code:string}>(tx,"SELECT id,code FROM app.roles WHERE school_id=$1 AND id=$2 AND status='ACTIVE'",[school.id,proposal.roleId]);
        if(!role)throw new Problem(422,'INVITATION_UNAVAILABLE');
        const actions=(await tx.query<{action_code:string}>(`SELECT action_code FROM app.role_permissions WHERE school_id=$1 AND role_id=$2
          AND $3=ANY(allowed_scopes)`,[school.id,proposal.roleId,proposal.scopeType])).rows;
        if(!actions.length||(platformAdmin&&!inviterGrants.length&&role.code!=='SCHOOL_ADMIN')||(!platformAdmin&&actions.some(action=>
          !inviterGrants.some(grant=>grant.scope_type==='SCHOOL'&&grant.actions.includes(action.action_code)))))throw new Problem(422,'INVITATION_UNAVAILABLE');
        if(proposal.validUntil&&new Date(proposal.validUntil).getTime()<=Date.now())throw new Problem(422,'INVITATION_UNAVAILABLE');
        const grant=(await tx.query<{id:string}>(`INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,class_id,subject_id,valid_from,valid_until,granted_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[school.id,member.id,proposal.roleId,proposal.scopeType,
          proposal.classId??null,proposal.subjectId??null,proposal.validFrom,proposal.validUntil??null,invitation.invited_by])).rows[0]!;
        if(proposal.scopeType!=='SCHOOL'){
          if(!proposal.classId)throw new Problem(422,'INVITATION_UNAVAILABLE');
          const year=await one<{starts_on:string;ends_on:string}>(tx,`SELECT y.starts_on,y.ends_on FROM app.academic_years y JOIN app.classes cl
            ON cl.school_id=y.school_id AND cl.year_id=y.id WHERE cl.school_id=$1 AND cl.id=$2`,[school.id,proposal.classId]);
          if(!year)throw new Problem(422,'INVITATION_UNAVAILABLE');
          const dates=await one<{starts:string;ends:string}>(tx,`SELECT ($1::timestamptz AT TIME ZONE s.timezone)::date AS starts,
            COALESCE(($2::timestamptz AT TIME ZONE s.timezone)::date,$3::date) AS ends FROM platform.schools s WHERE s.id=$4`,
          [proposal.validFrom,proposal.validUntil??null,year.ends_on,school.id]);
          if(!dates||dates.starts<year.starts_on||dates.ends>year.ends_on||dates.starts>=dates.ends)throw new Problem(422,'INVITATION_UNAVAILABLE');
          await tx.query(`INSERT INTO app.teaching_assignments(school_id,class_id,member_id,role_grant_id,subject_id,kind,starts_on,ends_on)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[school.id,proposal.classId,member.id,grant.id,proposal.subjectId??null,
            proposal.scopeType==='CLASS'?'HOMEROOM':'SUBJECT',dates.starts,dates.ends]);
        }
      }
      await tx.query("UPDATE app.staff_invitations SET status='ACCEPTED',accepted_at=now(),accepted_user_id=$3 WHERE school_id=$1 AND id=$2",[school.id,invitation.id,user!.id]);
      await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id)
        VALUES($1,$2,'STAFF','acceptInvitation','invitation',$3,$4)`,[school.id,user!.id,invitation.id,c.requestId]);
      return {id:invitation.id,status:'ACCEPTED'};
    },{schoolId:school.id});
  }
  async create(tx:Transaction,schoolId:string,inviterId:string,email:string,proposal:Proposal,profile:WorkProfile={}){
    const token=randomToken(),id=crypto.randomUUID();
    const invitation=await one<InvitationRow>(tx,`INSERT INTO app.staff_invitations(id,school_id,email_normalized,token_hash,proposed_assignments,expires_at,invited_by,work_profile)
      VALUES($1,$2,$3,$4,$5,now()+interval '48 hours',$6,$7) RETURNING *`,[id,schoolId,email.trim().toLowerCase(),hashToken(token),JSON.stringify([proposal]),inviterId,profile]);
    const school=await one<{slug:string}>(tx,'SELECT slug FROM platform.schools WHERE id=$1',[schoolId]);
    await tx.query(`INSERT INTO identity.mail_outbox(school_id,template_key,encrypted_payload,dedupe_key)
      VALUES($1,'STAFF_INVITATION',$2,$3)`,[schoolId,encryptMail({email:email.trim().toLowerCase(),schoolSlug:school!.slug,
        invitationId:id,url:`${process.env.APP_URL}/invitations/${id}#token=${token}&school=${school!.slug}`}),`invitation:${id}`]);
    return invitationDto(invitation!,undefined,'QUEUED');
  }
}
