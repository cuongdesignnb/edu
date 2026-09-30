import { Injectable } from '@nestjs/common';
import { Database,one,iso,type Transaction,type Row } from '../../database/database';
import { resource,dto,getResource,updateResource,listResource,type Resource } from '../../database/resources';
import { Permissions,grantDto,grantAllows,coversDelegatedExpiry } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { permissions as actionAllowlist } from '../../common/contract';
import { Problem,validation,notFound } from '../../common/problem';
import { InvitationsService,invitationDto } from '../identity/invitations.service';
import type { RequestContext,Result,Handler } from '../../api.router';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
const assignmentResource:Resource={table:'app.teaching_assignments',fields:{...meta,classId:'class_id',memberId:'member_id',roleGrantId:'role_grant_id',kind:'kind',subjectId:'subject_id',startsOn:'starts_on',endsOn:'ends_on',revokedAt:'revoked_at'},writeFields:[],search:[],filters:{classId:'class_id',memberId:'member_id'}};
const roleResource:Resource={table:'app.roles',fields:{...meta,code:'code',label:'label',systemRole:'system_role'},writeFields:[],search:['code','label'],filters:{}};
const inviteResource:Resource={table:'app.staff_invitations',fields:{...meta,email:'email_normalized',expiresAt:'expires_at',status:'status'},writeFields:[],search:['email_normalized'],filters:{status:'status'}};
interface PermissionInput {action:string;scopes:string[]}
@Injectable()
export class StaffService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly invitations:InvitationsService){}
  handlers():Record<string,Handler>{
    const handlers:Record<string,Handler>={};
    for(const id of ['listMembers','getMember','updateMember','suspendMember','reactivateMember','listRoles','getRole','createRole','updateRole',
      'previewGrant','createGrant','revokeGrant','listAssignments','createAssignment','revokeAssignment','listInvitations','inviteStaff','revokeInvitation'])
      handlers[id]=c=>this.handle(c);
    return handlers;
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id;
    const authorize=(tx:Transaction)=>this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,...(op==='listAssignments'&&c.principal!.support?.classId?{classId:c.principal!.support.classId}:{})});
    const work=async(tx:Transaction):Promise<Result>=>{
      if(c.operation.method!=='GET')await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
      if(op==='listMembers'){
        const result=await listResource(tx,resource('member'),schoolId,c.query,undefined,c.principal!.userId);
        for(const member of result.data)member.grants=(await this.policy.grants(tx,String(member.userId),schoolId)).map(grantDto);
        return result;
      }
      if(op==='getMember'){
        const member=dto(resource('member'),await getResource(tx,resource('member'),schoolId,c.params.memberId!));
        member.grants=(await this.policy.grants(tx,String(member.userId),schoolId)).map(grantDto);return {data:member};
      }
      if(['updateMember','suspendMember','reactivateMember'].includes(op)){
        const id=c.params.memberId!,member=await getResource(tx,resource('member'),schoolId,id,true);
        if(op==='suspendMember'){
          if(member.user_id===c.principal!.userId)throw new Problem(422,'SELF_SUSPENSION_FORBIDDEN');
          await this.lastAdmin(tx,schoolId,id);
        }
        const data=await updateResource(tx,resource('member'),schoolId,id,c.body,
          op==='suspendMember'?{status:'SUSPENDED'}:op==='reactivateMember'?{status:'ACTIVE',ended_at:null}:{});
        data.grants=(await this.policy.grants(tx,String(member.user_id),schoolId)).map(grantDto);
        await audit(tx,c,'member',id,{status:data.status,version:data.version});return {data};
      }
      if(op==='listRoles'){
        const result=await listResource(tx,roleResource,schoolId,c.query,undefined,c.principal!.userId);
        for(const role of result.data)role.permissions=await this.rolePermissions(tx,schoolId,String(role.id));return result;
      }
      if(op==='getRole')return {data:await this.role(tx,schoolId,c.params.roleId!)};
      if(op==='createRole'||op==='updateRole')return {data:await this.saveRole(tx,c),status:op==='createRole'?201:200};
      if(op==='listAssignments')return listResource(tx,assignmentResource,schoolId,c.query,c.principal!.support?.classId?{sql:'t.class_id=$1',values:[c.principal!.support.classId]}:undefined,c.principal!.userId);
      if(op==='createAssignment'){
        const data=await this.createAssignment(tx,c,c.body);await audit(tx,c,'assignment',String(data.id));return {data,status:201};
      }
      if(op==='revokeAssignment'){
        const row=await getResource(tx,assignmentResource,schoolId,c.params.assignmentId!,true);
        this.version(row,c.body.expectedVersion);
        await tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2 AND revoked_at IS NULL',[schoolId,row.role_grant_id]);
        const changed=await one<Row>(tx,'UPDATE app.teaching_assignments SET revoked_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,row.id]);
        await audit(tx,c,'assignment',String(row.id),{status:'REVOKED'});return {data:dto(assignmentResource,changed!)};
      }
      if(op==='previewGrant'||op==='createGrant'){
        const proposal=await this.validateGrant(tx,c,c.body);
        if(op==='previewGrant')return {data:{allowed:true,added:[{id:c.body.roleId,version:1,roleId:c.body.roleId,roleLabel:proposal.role.label,roleCode:proposal.role.code,
          actions:proposal.actions,scopeType:c.body.scopeType,...(c.body.classId?{classId:c.body.classId}:{}),...(c.body.subjectId?{subjectId:c.body.subjectId}:{}),
          validFrom:c.body.validFrom,validUntil:c.body.validUntil??null}],removed:[],warnings:['HOMEROOM','SUBJECT_TEACHER'].includes(String(proposal.role.code))?['Phân công tương ứng phải còn hiệu lực để dùng quyền giáo viên.']:[]}};
        const row=(await tx.query<Row>(`INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,class_id,subject_id,valid_from,valid_until,granted_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[schoolId,c.body.memberId,c.body.roleId,c.body.scopeType,c.body.classId??null,c.body.subjectId??null,
          c.body.validFrom,c.body.validUntil??null,c.principal!.userId])).rows[0]!;
        await audit(tx,c,'grant',String(row.id));return {data:this.grantView(row,proposal.role,proposal.actions),status:201};
      }
      if(op==='revokeGrant'){
        const row=await one<Row>(tx,'SELECT * FROM app.role_grants WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,c.params.grantId]);if(!row)notFound();
        this.version(row,c.body.expectedVersion);await this.lastAdmin(tx,schoolId,undefined,String(row.id));
        await tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[schoolId,row.id]);
        await tx.query('UPDATE app.teaching_assignments SET revoked_at=now() WHERE school_id=$1 AND role_grant_id=$2 AND revoked_at IS NULL',[schoolId,row.id]);
        await audit(tx,c,'grant',String(row.id),{status:'REVOKED'});return {data:{id:row.id,status:'REVOKED'}};
      }
      if(op==='listInvitations')return listResource(tx,inviteResource,schoolId,c.query,undefined,c.principal!.userId);
      if(op==='inviteStaff'){
        const role=await this.role(tx,schoolId,String(c.body.roleId));
        const scopeType=c.body.subjectId?'SUBJECT':c.body.classId?'CLASS':'SCHOOL';
        await this.validateGrant(tx,c,{...c.body,scopeType},true);
        if((scopeType==='CLASS'&&role.code!=='HOMEROOM')||(scopeType==='SUBJECT'&&role.code!=='SUBJECT_TEACHER'))validation('roleId','Lời mời phân công cần đúng mẫu giáo viên');
        const data=await this.invitations.create(tx,schoolId,c.principal!.userId,String(c.body.email),{
          roleId:String(c.body.roleId),scopeType,classId:c.body.classId as string|undefined,subjectId:c.body.subjectId as string|undefined,
          validFrom:String(c.body.validFrom),validUntil:c.body.validUntil as string|null|undefined,reason:c.body.reason as string|undefined});
        await audit(tx,c,'invitation',data.id);return {data,status:201};
      }
      const row=await one<Row>(tx,'SELECT * FROM app.staff_invitations WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,c.params.invitationId]);if(!row)notFound();
      this.version(row,c.body.expectedVersion);if(row.status!=='PENDING')throw new Problem(409,'INVITATION_UNAVAILABLE');
      const invitation=(await tx.query('UPDATE app.staff_invitations SET status=$3 WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,row.id,'REVOKED'])).rows[0];
      await tx.query("UPDATE identity.mail_outbox SET status='CANCELLED',encrypted_payload='' WHERE dedupe_key=$1 AND status IN ('PENDING','FAILED')",[`invitation:${row.id}`]);
      await audit(tx,c,'invitation',String(row.id),{status:'REVOKED'});return {data:invitationDto(invitation)};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
  private async rolePermissions(tx:Transaction,schoolId:string,roleId:string):Promise<PermissionInput[]>{
    return (await tx.query<{action_code:string;allowed_scopes:string[]}>('SELECT action_code,allowed_scopes FROM app.role_permissions WHERE school_id=$1 AND role_id=$2 ORDER BY action_code',[schoolId,roleId])).rows.map(row=>({action:row.action_code,scopes:row.allowed_scopes}));
  }
  private async role(tx:Transaction,schoolId:string,id:string){
    const data=dto(roleResource,await getResource(tx,roleResource,schoolId,id));data.permissions=await this.rolePermissions(tx,schoolId,id);return data;
  }
  private async validateGrant(tx:Transaction,c:RequestContext,body:Record<string,unknown>,invitation=false){
    const schoolId=c.params.schoolId!,role=await this.role(tx,schoolId,String(body.roleId));
    if(!invitation){const member=await getResource(tx,resource('member'),schoolId,String(body.memberId));if(member.status!=='ACTIVE')validation('memberId','Thành viên chưa hoạt động');}
    const scopes=['SCHOOL','CLASS','SUBJECT'];if(!scopes.includes(String(body.scopeType)))validation('scopeType','Phạm vi không hợp lệ');
    if((body.scopeType==='SCHOOL'&&(body.classId||body.subjectId))||(body.scopeType==='CLASS'&&(!body.classId||body.subjectId))
      ||(body.scopeType==='SUBJECT'&&(!body.classId||!body.subjectId)))validation('scopeType','Phạm vi và lớp/môn không khớp');
    if(body.classId)await getResource(tx,resource('class'),schoolId,String(body.classId));
    if(body.subjectId)await getResource(tx,resource('subject'),schoolId,String(body.subjectId));
    const roleActions=(role.permissions as PermissionInput[]).filter(p=>p.scopes.includes(String(body.scopeType))).map(p=>p.action);
    if(!roleActions.length)validation('roleId','Mẫu không hỗ trợ phạm vi đã chọn');
    const start=new Date(String(body.validFrom)),end=body.validUntil?new Date(String(body.validUntil)):null;
    if(!Number.isFinite(start.getTime())||(end&&(!Number.isFinite(end.getTime())||end<=start)))validation('validUntil','Khoảng hiệu lực không hợp lệ');
    for(const action of new Set([...roleActions,...c.operation.permission.split('+')])){
      if(!actionAllowlist.includes(action)||action.startsWith('platform.'))throw new Problem(403,'DELEGATION_CEILING');
      const scope={schoolId,classId:body.classId as string|undefined,subjectId:body.subjectId as string|undefined,allowSubject:body.scopeType==='SUBJECT'},allowed=await this.policy.require(tx,c.principal!,action,scope);
      if(!allowed.grants.some(g=>grantAllows(g,action,scope,allowed.today)&&coversDelegatedExpiry(g,start,end)))throw new Problem(403,'DELEGATION_EXPIRY_CEILING');
    }
    if(body.classId){
      const valid=await one<{valid:boolean}>(tx,`SELECT ($2::timestamptz AT TIME ZONE s.timezone)::date>=y.starts_on
        AND ($2::timestamptz AT TIME ZONE s.timezone)::date<y.ends_on
        AND ($3::timestamptz IS NULL OR ($3::timestamptz AT TIME ZONE s.timezone)::date<=y.ends_on) AS valid
        FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
        JOIN platform.schools s ON s.id=cl.school_id WHERE cl.school_id=$1 AND cl.id=$4`,[schoolId,start,end,body.classId]);
      if(!valid?.valid)validation('validFrom','Phân công phải nằm trong năm học');
      if(invitation){const dates=(await one<{starts:string;today:string}>(tx,"SELECT ($2::timestamptz AT TIME ZONE timezone)::date AS starts,(now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1",[schoolId,start]))!;
        if(dates.starts<dates.today&&(typeof body.reason!=='string'||body.reason.trim().length<5))validation('reason','Lời mời phân công lùi ngày cần lý do');}
    }
    return {role,actions:roleActions};
  }
  private grantView(row:Row,role:Record<string,unknown>,actions:string[]){return {
    id:row.id,version:row.version,roleId:row.role_id,roleLabel:role.label,roleCode:role.code,actions,scopeType:row.scope_type,
    ...(row.class_id?{classId:row.class_id}:{}),...(row.subject_id?{subjectId:row.subject_id}:{}),
    validFrom:iso(row.valid_from as Date),validUntil:row.valid_until?iso(row.valid_until as Date):null,
    revokedAt:row.revoked_at?iso(row.revoked_at as Date):null,
  };}
  private async saveRole(tx:Transaction,c:RequestContext){
    const schoolId=c.params.schoolId!,id=c.params.roleId;
    let current:Row|undefined;
    if(id){
      current=await getResource(tx,roleResource,schoolId,id,true);this.version(current,c.body.expectedVersion);
      const held=(await this.policy.grants(tx,c.principal!.userId,schoolId)).some(grant=>grant.role_id===id);
      if(held)throw new Problem(403,'OWN_ROLE_EDIT_FORBIDDEN');
      if(current.system_role)throw new Problem(409,'SYSTEM_ROLE_IMMUTABLE');
    }
    const inputs=(c.body.permissions??(id?await this.rolePermissions(tx,schoolId,id):[])) as PermissionInput[];
    if(new Set(inputs.map(p=>p.action)).size!==inputs.length)validation('permissions','Hành động bị trùng');
    for(const p of inputs){
      if(!actionAllowlist.includes(p.action)||p.action.startsWith('platform.'))throw new Problem(403,'DELEGATION_CEILING');
      if(!p.scopes.length||new Set(p.scopes).size!==p.scopes.length)validation('permissions','Phạm vi bị thiếu hoặc trùng');
      await this.policy.require(tx,c.principal!,p.action,{schoolId});
    }
    const row=id?await one<Row>(tx,'UPDATE app.roles SET label=$3 WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,id,c.body.label??current!.label]):
      await one<Row>(tx,'INSERT INTO app.roles(school_id,code,label) VALUES($1,$2,$3) RETURNING *',[schoolId,c.body.code,c.body.label]);
    if(c.body.permissions!==undefined||!id){
      await tx.query('DELETE FROM app.role_permissions WHERE school_id=$1 AND role_id=$2',[schoolId,row!.id]);
      for(const p of inputs)await tx.query('INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes) VALUES($1,$2,$3,$4)',[schoolId,row!.id,p.action,p.scopes]);
    }
    await audit(tx,c,'role',String(row!.id),{version:row!.version});return this.role(tx,schoolId,String(row!.id));
  }
  async createAssignment(tx:Transaction,c:RequestContext,body:Record<string,unknown>){
    const schoolId=c.params.schoolId!;
    await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
    const cls=await getResource(tx,resource('class'),schoolId,String(body.classId),true);
    const year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
    const starts=String(body.startsOn),ends=body.endsOn?String(body.endsOn):String(year.ends_on);
    if(starts<String(year.starts_on)||starts>=ends||ends>String(year.ends_on)||year.status==='ARCHIVED'||cls.status==='ARCHIVED')validation('startsOn','Khoảng phân công không thuộc năm/lớp đang quản lý');
    const current=(await one<{today:string}>(tx,"SELECT (now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1",[schoolId]))!.today;
    if(starts<current&&(typeof body.reason!=='string'||body.reason.trim().length<5))validation('reason','Phân công lùi ngày cần lý do ít nhất 5 ký tự');
    const role=await one<Row>(tx,"SELECT id FROM app.roles WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[schoolId,body.kind==='HOMEROOM'?'HOMEROOM':'SUBJECT_TEACHER']);
    if(!role)validation('kind','Thiếu mẫu quyền giáo viên');
    const dates=await one<{valid_from:Date;valid_until:Date}>(tx,`SELECT $2::date::timestamp AT TIME ZONE timezone AS valid_from,
      $3::date::timestamp AT TIME ZONE timezone AS valid_until FROM platform.schools WHERE id=$1`,[schoolId,starts,ends]);
    const grantBody={memberId:body.memberId,roleId:role.id,scopeType:body.kind==='HOMEROOM'?'CLASS':'SUBJECT',
      classId:body.classId,...(body.subjectId?{subjectId:body.subjectId}:{}),validFrom:iso(dates!.valid_from),validUntil:iso(dates!.valid_until)};
    await this.validateGrant(tx,c,grantBody);
    const grant=await one<{id:string}>(tx,`INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,class_id,subject_id,valid_from,valid_until,granted_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[schoolId,body.memberId,role.id,grantBody.scopeType,body.classId,body.subjectId??null,dates!.valid_from,dates!.valid_until,c.principal!.userId]);
    const row=await one<Row>(tx,`INSERT INTO app.teaching_assignments(school_id,class_id,year_id,member_id,role_grant_id,subject_id,kind,starts_on,ends_on)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[schoolId,body.classId,cls.year_id,body.memberId,grant!.id,body.subjectId??null,body.kind,starts,ends]);
    return dto(assignmentResource,row!);
  }
  private async lastAdmin(tx:Transaction,schoolId:string,excludedMember?:string,excludedGrant?:string){
    await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
    const counts=await one<{before:string;after:string}>(tx,`SELECT count(DISTINCT m.id) AS before,
      count(DISTINCT m.id) FILTER(WHERE ($2::uuid IS NULL OR m.id<>$2) AND ($3::uuid IS NULL OR g.id<>$3)) AS after
      FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
      JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'
      JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.status='ACTIVE'
      WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL AND g.revoked_at IS NULL
      AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())`,[schoolId,excludedMember??null,excludedGrant??null]);
    if(Number(counts!.before)>0&&Number(counts!.after)===0)throw new Problem(409,'LAST_ADMIN_REQUIRED');
  }
}
