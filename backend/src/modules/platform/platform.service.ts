import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { listResource } from '../../database/resources';
import { Commands } from '../../common/commands';
import { Permissions,grantDto,coversDelegatedExpiry } from '../../common/permissions';
import { roleTemplates } from '../../common/contract';
import { Problem,notFound,validation } from '../../common/problem';
import {validateSchoolWebsite} from '../../common/school-website';
import { InvitationsService } from '../identity/invitations.service';
import { schoolResource,schoolWriteColumns,schoolView,platformAuditResource,operationResource,adminResource,platformSettings,platformAudit,auditView,type OperationalCounts } from './platform-data';
import type { Handler,RequestContext,Result } from '../../api.router';

@Injectable()
export class PlatformService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly invitations:InvitationsService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['getPlatformOverview','listPlatformSchools','createSchool','getPlatformSchool','updatePlatformSchool','setSchoolStatus','listSchoolAdmins','inviteSchoolAdmin','revokeSchoolAdmin','listPlatformAudit','listOperations','getPlatformSettings','updatePlatformSettings'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async school(tx:Transaction,id:string,lock=false){const row=await one<Row>(tx,`SELECT * FROM platform.schools WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);if(!row)notFound();return row;}
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
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
    const authorize=async(tx:Transaction)=>{await this.policy.platform(c.principal!,c.operation.permission,tx);if(schoolId)await this.school(tx,schoolId);};
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='getPlatformOverview')return this.overview(tx,c);
      if(op==='listPlatformSchools'){
        const result=await listResource(tx,schoolResource,null,c.query,undefined,c.principal!.userId);
        for(const item of result.data){const counts=(await one<OperationalCounts>(tx,'SELECT * FROM platform.operational_counts($1)',[item.id]))!;Object.assign(item,{classCount:counts.class_count,staffCount:counts.staff_count,adminNames:counts.admin_labels,onboarding:counts.onboarding});}return result;
      }
      if(op==='getPlatformSchool')return {data:await schoolView(tx,await this.school(tx,schoolId!))};
      if(op==='listPlatformAudit'){const result=await listResource(tx,platformAuditResource,null,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);return {...result,data:result.data.map(auditView)};}
      if(op==='listOperations'){
        const result=await listResource(tx,operationResource,null,{...c.query,sort:c.query.sort??'id'},undefined,c.principal!.userId),safe=new Set(['durationMs','schemaRevision','migrations','rows','files','byteSize','checksum','errorCode','readers','writers','p95ReadMs','p95WriteMs','errorRate']);
        result.data=result.data.map(item=>{if(item.startedAt===null)delete item.startedAt;if(item.finishedAt===null)delete item.finishedAt;item.summary=Object.fromEntries(Object.entries(item.summary as Record<string,unknown>).filter(([key,value])=>safe.has(key)&&(value===null||['string','number','boolean'].includes(typeof value))));return item;});return result;
      }
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
        await tx.query("SELECT set_config('app.school_id',$1,true)",[created.id]);await tx.query('SELECT app.lock_school()');await this.roles(tx,String(created.id));await platformAudit(tx,c,'school',String(created.id),{status:'DRAFT'});return {data:await schoolView(tx,created),status:201};
      }
      const school=await this.school(tx,schoolId!,c.operation.method!=='GET');
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
        const role=await one<{id:string}>(tx,"SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_ADMIN' AND system_role AND status='ACTIVE'",[schoolId]);if(!role)throw new Problem(409,'DEFAULT_ROLES_REQUIRED');
        if(c.body.roleId&&c.body.roleId!==role.id||c.body.classId||c.body.subjectId)validation('roleId','Chỉ mời quản trị mặc định của đúng trường');
        const from=new Date(String(c.body.validFrom)),until=c.body.validUntil?new Date(String(c.body.validUntil)):null;
        if(!Number.isFinite(from.getTime())||until&&(!Number.isFinite(until.getTime())||until<=from||until.getTime()<=Date.now()))validation('validUntil','Thời hạn quyền chưa hợp lệ');
        const grants=(await tx.query<{valid_until:Date|null}>(txPermission,[c.principal!.userId])).rows;if(!grants.some(g=>coversDelegatedExpiry(g,from,until)))throw new Problem(403,'DELEGATION_CEILING');
        const invitation=await this.invitations.create(tx,schoolId!,c.principal!.userId,String(c.body.email),{roleId:role.id,scopeType:'SCHOOL',validFrom:from.toISOString(),validUntil:until?.toISOString()??null},{...(c.body.workDisplayName?{workDisplayName:String(c.body.workDisplayName)}:{})});
        await platformAudit(tx,c,'invitation',invitation.id,{status:'PENDING'});return {data:invitation,status:201};
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
