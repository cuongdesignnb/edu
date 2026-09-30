import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { listResource,dto } from '../../database/resources';
import { Commands } from '../../common/commands';
import { Permissions,grantDto,coversDelegatedExpiry } from '../../common/permissions';
import { roleTemplates } from '../../common/contract';
import { Problem,notFound,validation } from '../../common/problem';
import {validateSchoolWebsite} from '../../common/school-website';
import { InvitationsService } from '../identity/invitations.service';
import { schoolListResource,adminInvitationResource,schoolWriteColumns,schoolView,platformAuditResource,operationResource,adminResource,platformSettings,platformAudit,auditView,operationView,type OperationalCounts } from './platform-data';
import {operationsOverview} from './operations-overview';
import type { Handler,RequestContext,Result } from '../../api.router';

@Injectable()
export class PlatformService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly invitations:InvitationsService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['getPlatformOperationsOverview','getPlatformOverview','listPlatformSchools','getPlatformSchoolOptions','checkPlatformSchoolIdentity','getPlatformAuditOptions','listSchoolAdminInvitations','revokePlatformAdminInvitation','createSchool','getPlatformSchool','updatePlatformSchool','setSchoolStatus','listSchoolAdmins','inviteSchoolAdmin','revokeSchoolAdmin','listPlatformAudit','listOperations','getPlatformSettings','updatePlatformSettings'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async school(tx:Transaction,id:string,lock=false){const row=await one<Row>(tx,`SELECT * FROM platform.schools WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);if(!row)notFound();return row;}
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
  private async inviteAdmin(tx:Transaction,c:RequestContext,schoolId:string,input:Record<string,unknown>){
    await this.policy.platform(c.principal!,'platform.admins.manage',tx);
    const role=await one<{id:string}>(tx,"SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_ADMIN' AND system_role AND status='ACTIVE'",[schoolId]);if(!role)throw new Problem(409,'DEFAULT_ROLES_REQUIRED');
    if(input.roleId&&input.roleId!==role.id||input.classId||input.subjectId)validation('roleId','Chỉ mời quản trị mặc định của đúng trường');
    const from=input.validFrom?new Date(String(input.validFrom)):new Date(),until=input.validUntil?new Date(String(input.validUntil)):null;
    if(!Number.isFinite(from.getTime())||until&&(!Number.isFinite(until.getTime())||until<=from||until.getTime()<=Date.now()))validation('validUntil','Thời hạn quyền chưa hợp lệ');
    const grants=(await tx.query<{valid_until:Date|null}>(txPermission,[c.principal!.userId])).rows;if(!grants.some(g=>coversDelegatedExpiry(g,from,until)))throw new Problem(403,'DELEGATION_CEILING');
    const invitation=await this.invitations.create(tx,schoolId,c.principal!.userId,String(input.email),{roleId:role.id,scopeType:'SCHOOL',validFrom:from.toISOString(),validUntil:until?.toISOString()??null},{...(input.workDisplayName?{workDisplayName:String(input.workDisplayName)}:{})},Number(input.expiresInDays??2));
    await platformAudit(tx,{...c,params:{...c.params,schoolId}},'invitation',String(invitation.id),{status:'PENDING'});return invitation;
  }
  private async roles(tx:Transaction,schoolId:string){
    for(const template of roleTemplates.filter(r=>r.scope!=='PLATFORM')){
      const role=(await one<{id:string}>(tx,'INSERT INTO app.roles(school_id,code,label,system_role) VALUES($1,$2,$3,true) RETURNING id',[schoolId,template.code,template.label]))!;
      await tx.query('INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes) SELECT $1,$2,action,ARRAY[$3]::text[] FROM unnest($4::text[]) action',[schoolId,role.id,template.scope,template.actions]);
    }
  }
  private async overview(tx:Transaction,c:RequestContext){
    const row=(await one<Row>(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE s.status='ACTIVE')::int AS active,count(*) FILTER(WHERE s.status='DRAFT')::int AS draft,count(*) FILTER(WHERE s.status='SUSPENDED')::int AS suspended,
      coalesce(sum(op.staff_count) FILTER(WHERE s.status='ACTIVE'),0)::int AS staff,coalesce(sum(op.link_opens_30d),0)::int AS opens FROM platform.schools s CROSS JOIN LATERAL platform.operational_counts(s.id) op`))!;
    const tickets=(await one<{n:number}>(tx,"SELECT count(*)::int AS n FROM platform.support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')"))!.n,asOf=(await one<{at:Date}>(tx,'SELECT now() AS at'))!.at.toISOString();
    const descriptions:Record<string,string>={total:'Tổng số trường',active:'Trường hoạt động',draft:'Trường nháp',suspended:'Trường tạm dừng',staff:'Nhân sự tại trường hoạt động',opens:'Lượt mở và xem link trong 30 ngày',tickets:'Yêu cầu hỗ trợ chưa hoàn tất'},metrics=Object.entries({...row,tickets}).map(([key,value])=>({key,label:descriptions[key],value:Number(value),denominator:null,unit:key==='staff'?'nhân sự':key==='opens'?'lượt':key==='tickets'?'yêu cầu':'trường',asOf}));
    const support=await one(tx,"SELECT id FROM platform.operator_grants WHERE user_id=$1 AND action_code='platform.support' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",[c.principal!.userId]);
    const tasks=support?(await tx.query<Row>("SELECT id,school_id,subject FROM platform.support_tickets WHERE status NOT IN ('RESOLVED','CLOSED') ORDER BY created_at,id LIMIT 6")).rows.map(t=>({id:`ticket:${t.id}`,kind:'support',title:t.subject,schoolId:t.school_id,targetType:'ticket',targetId:t.id})):[];
    return {data:{metrics,tasks,asOf}};
  }
  private async handle(c:RequestContext):Promise<Result>{
    const op=c.operation.id,schoolId=c.params.schoolId;
    const authorize=async(tx:Transaction)=>{await this.policy.platform(c.principal!,c.operation.permission,tx);if(op==='createSchool'&&c.body.firstAdmin)await this.policy.platform(c.principal!,'platform.admins.manage',tx);if(schoolId)await this.school(tx,schoolId);};
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='getPlatformOverview')return this.overview(tx,c);
      if(op==='getPlatformAuditOptions'){
        const actors=(await tx.query<{id:string;name:string}>("SELECT DISTINCT e.actor_id AS id,coalesce(u.display_name,'Hệ thống') AS name FROM platform.audit_events e LEFT JOIN identity.users u ON u.id=e.actor_id WHERE e.actor_id IS NOT NULL ORDER BY name,id LIMIT 1001")).rows;if(actors.length>1000)throw new Problem(422,'AUDIT_CHOICE_LIMIT');return {data:{actors}};
      }
      if(op==='getPlatformSchoolOptions'){
        const provinces=(await tx.query<{province:string}>("SELECT DISTINCT province FROM platform.schools WHERE province IS NOT NULL AND province<>'' ORDER BY province LIMIT 201")).rows;
        if(provinces.length>200)throw new Problem(422,'CHOICE_LIMIT');return {data:{provinces:provinces.map(p=>p.province)}};
      }
      if(op==='checkPlatformSchoolIdentity'){
        const value=(await one<{codeTaken:boolean;slugTaken:boolean}>(tx,'SELECT EXISTS(SELECT 1 FROM platform.schools WHERE code=$1) AS "codeTaken",EXISTS(SELECT 1 FROM platform.schools WHERE slug=$2) AS "slugTaken"',[c.query.code??'',c.query.slug??'']))!;return {data:value};
      }
      if(op==='listPlatformSchools'){
        return listResource(tx,schoolListResource,null,c.query,undefined,c.principal!.userId);
      }
      if(op==='getPlatformSchool')return {data:await schoolView(tx,await this.school(tx,schoolId!))};
      if(op==='listPlatformAudit'){
        if(c.query.from&&c.query.to&&c.query.from>c.query.to)validation('to','Ngày kết thúc không được trước ngày bắt đầu');
        const predicates:string[]=[],values:unknown[]=[];
        if(c.query.from){values.push(c.query.from);predicates.push(`t.created_at>=($${values.length}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);}
        if(c.query.to){values.push(c.query.to);predicates.push(`t.created_at<(($${values.length}::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);}
        const result=await listResource(tx,platformAuditResource,null,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},{sql:predicates.join(' AND '),values},c.principal!.userId);return {...result,data:result.data.map(auditView)};
      }
      if(op==='listOperations'){
        const result=await listResource(tx,operationResource,null,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);return {...result,data:result.data.map(operationView)};
      }
      if(op==='getPlatformOperationsOverview')return {data:await operationsOverview(this.db,tx)};
      if(['getPlatformSettings','updatePlatformSettings'].includes(op)){
        const settings=(await one<Row>(tx,`SELECT * FROM platform.settings WHERE key='business_ui'${op==='updatePlatformSettings'?' FOR UPDATE':''}`))!;
        if(op==='getPlatformSettings')return {data:platformSettings(settings)};
        this.version(settings,c.body.expectedVersion);const value={...settings.value as Record<string,unknown>,...Object.fromEntries(['brandName','supportEmail','publicSupportPhone','footerNote'].filter(k=>Object.hasOwn(c.body,k)).map(k=>[k,c.body[k]]))};
        const saved=(await one<Row>(tx,'UPDATE platform.settings SET value=$2 WHERE id=$1 RETURNING *',[settings.id,value]))!;await platformAudit(tx,c,'platform-settings',String(settings.id),value);return {data:platformSettings(saved)};
      }
      if(op==='createSchool'){
        validateSchoolWebsite(c.body.website);
        const timezone=String(c.body.timezone??'Asia/Ho_Chi_Minh');if(!await one(tx,'SELECT name FROM pg_timezone_names WHERE name=$1',[timezone]))validation('timezone','Múi giờ IANA không hợp lệ');
        const body={...c.body,timezone,shortName:c.body.shortName??c.body.name},fields=Object.keys(schoolWriteColumns).filter(k=>Object.hasOwn(body,k)),values=fields.map(k=>body[k as keyof typeof body]);
        const created=(await one<Row>(tx,`INSERT INTO platform.schools(${fields.map(k=>schoolWriteColumns[k]).join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values))!;
        await tx.query("SELECT set_config('app.school_id',$1,true)",[created.id]);await tx.query('SELECT app.lock_school()');await this.roles(tx,String(created.id));await platformAudit(tx,c,'school',String(created.id),{status:'DRAFT'});
        if(c.body.firstAdmin)await this.inviteAdmin(tx,c,String(created.id),c.body.firstAdmin as Record<string,unknown>);
        return {data:await schoolView(tx,created),status:201};
      }
      const school=await this.school(tx,schoolId!,c.operation.method!=='GET');
      if(op==='listSchoolAdminInvitations')return listResource(tx,adminInvitationResource,schoolId!,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);
      if(op==='revokePlatformAdminInvitation'){
        const row=await one<Row>(tx,`SELECT i.* FROM app.staff_invitations i WHERE i.school_id=$1 AND i.id=$2 AND jsonb_array_length(i.proposed_assignments)=1 AND EXISTS(SELECT 1 FROM app.roles r WHERE r.school_id=i.school_id AND r.code='SCHOOL_ADMIN' AND r.system_role AND r.id::text=i.proposed_assignments->0->>'roleId' AND i.proposed_assignments->0->>'scopeType'='SCHOOL') FOR UPDATE`,[schoolId,c.params.invitationId]);if(!row)notFound();this.version(row,c.body.expectedVersion);
        if(row.status!=='PENDING'||new Date(row.expires_at as Date).getTime()<=Date.now())throw new Problem(409,'INVITATION_UNAVAILABLE');
        await tx.query("UPDATE app.staff_invitations SET status='REVOKED' WHERE school_id=$1 AND id=$2",[schoolId,row.id]);await platformAudit(tx,c,'invitation',String(row.id),{status:'REVOKED'});
        const saved=(await one<Row>(tx,`SELECT * FROM ${adminInvitationResource.table} t WHERE t.school_id=$1 AND t.id=$2`,[schoolId,row.id]))!;return {data:dto(adminInvitationResource,saved)};
      }
      if(op==='updatePlatformSchool'){
        validateSchoolWebsite(c.body.website);
        this.version(school,c.body.expectedVersion);const fields=Object.keys(schoolWriteColumns).filter(k=>!['code','slug','timezone'].includes(k)&&Object.hasOwn(c.body,k));if(!fields.length)validation('body','Chọn thông tin cần cập nhật');
        const values=[schoolId,...fields.map(k=>c.body[k])],saved=(await one<Row>(tx,`UPDATE platform.schools SET ${fields.map((k,i)=>`${schoolWriteColumns[k]}=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`,values))!;
        await platformAudit(tx,c,'school',schoolId!,Object.fromEntries(fields.filter(k=>['name','shortName','province','level'].includes(k)).map(k=>[k,c.body[k]])));return {data:await schoolView(tx,saved)};
      }
      if(op==='setSchoolStatus'){
        this.version(school,c.body.expectedVersion);if(c.body.status==='ACTIVE'){const count=(await one<OperationalCounts>(tx,'SELECT * FROM platform.operational_counts($1)',[schoolId]))!;if(!count.admin_count)throw new Problem(409,'ACTIVE_ADMIN_REQUIRED');}
        const saved=(await one<Row>(tx,"UPDATE platform.schools SET status=$2,status_reason=$3,activated_at=CASE WHEN $2='ACTIVE' THEN coalesce(activated_at,now()) ELSE activated_at END WHERE id=$1 RETURNING *",[schoolId,c.body.status,c.body.reason]))!;
        await platformAudit(tx,c,'school',schoolId!,{status:c.body.status});return {data:await schoolView(tx,saved)};
      }
      if(op==='listSchoolAdmins'){
        const result=await listResource(tx,adminResource,schoolId!,c.query,undefined,c.principal!.userId);
        for(const member of result.data)member.grants=(await this.policy.grants(tx,String(member.userId),schoolId!)).filter(g=>g.role_code==='SCHOOL_ADMIN'&&g.scope_type==='SCHOOL').map(grantDto);return result;
      }
      if(op==='inviteSchoolAdmin'){
        if(!['DRAFT','ACTIVE'].includes(String(school.status)))throw new Problem(409,'SCHOOL_UNAVAILABLE');
        return {data:await this.inviteAdmin(tx,c,schoolId!,c.body),status:201};
      }
      if(op==='revokeSchoolAdmin'){
        const member=await one<Row>(tx,'SELECT * FROM app.memberships WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,c.params.memberId]);if(!member)notFound();this.version(member,c.body.expectedVersion);
        const active=(await tx.query<{id:string}>(`SELECT DISTINCT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.status='ACTIVE' WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL`,[schoolId])).rows;
        if(active.some(m=>m.id===member.id)&&!active.some(m=>m.id!==member.id))throw new Problem(409,'LAST_ADMIN_REQUIRED');
        const revoked=await tx.query("UPDATE app.role_grants g SET revoked_at=now() FROM app.roles r WHERE g.school_id=$1 AND g.member_id=$2 AND r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL RETURNING g.id",[schoolId,member.id]);if(!revoked.rowCount)notFound();
        await tx.query('UPDATE app.memberships SET work_display_name=work_display_name WHERE school_id=$1 AND id=$2',[schoolId,member.id]);await platformAudit(tx,c,'member',String(member.id),{status:'ADMIN_REVOKED'});return {data:{id:member.id,status:'REVOKED'}};
      }
      throw new Error('Unexpected registered platform operation');
    };
    return c.operation.method==='GET'?this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId,userId:c.principal!.userId,readOnly:true}):this.commands.platform(c,authorize,work);
  }
}
const txPermission="SELECT valid_until FROM platform.operator_grants WHERE user_id=$1 AND action_code='platform.admins.manage' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())";
