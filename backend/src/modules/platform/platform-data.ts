import { dto,type Resource } from '../../database/resources';
import { one,type Transaction,type Row } from '../../database/database';
import type { ActorContext } from '../../api.router';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
export const schoolResource:Resource={table:'(SELECT s.*,coalesce(s.short_name,s.name) AS display_short_name,coalesce(s.province,\'\') AS display_province FROM platform.schools s)',fields:{...meta,code:'code',slug:'slug',name:'name',status:'status',timezone:'timezone',publicContactEmail:'public_contact_email',publicContactPhone:'public_contact_phone',publicAddress:'public_address',shortName:'display_short_name',province:'display_province',level:'level',accentColor:'accent_color',motto:'motto',publicIntro:'public_intro',statusReason:'status_reason',activatedAt:'activated_at',website:'public_website'},writeFields:[],search:['code','slug','name','province'],filters:{status:'status',province:'province'}};
export const schoolWriteColumns:Record<string,string>={code:'code',slug:'slug',name:'name',timezone:'timezone',publicContactEmail:'public_contact_email',publicContactPhone:'public_contact_phone',publicAddress:'public_address',shortName:'short_name',province:'province',level:'level',accentColor:'accent_color',motto:'motto',publicIntro:'public_intro',website:'public_website'};
export const schoolListResource:Resource={...schoolResource,table:`(SELECT s.*,coalesce(s.short_name,s.name) AS display_short_name,coalesce(s.province,'') AS display_province,op.class_count,op.staff_count,op.admin_labels,op.onboarding FROM platform.schools s CROSS JOIN LATERAL platform.operational_counts(s.id) op)`,unsearchedCountTable:schoolResource.table,fields:{...schoolResource.fields,classCount:'class_count',staffCount:'staff_count',adminNames:'admin_labels',onboarding:'onboarding'},search:[...schoolResource.search,'admin_labels::text']};
export const adminInvitationResource:Resource={table:`(SELECT i.*,coalesce(i.work_profile->>'workDisplayName','') AS work_name FROM app.staff_invitations i WHERE jsonb_array_length(i.proposed_assignments)=1 AND EXISTS(SELECT 1 FROM app.roles r WHERE r.school_id=i.school_id AND r.code='SCHOOL_ADMIN' AND r.system_role AND r.id::text=i.proposed_assignments->0->>'roleId' AND i.proposed_assignments->0->>'scopeType'='SCHOOL'))`,fields:{...meta,email:'email_normalized',expiresAt:'expires_at',status:'status',workDisplayName:'work_name'},writeFields:[],search:['email_normalized','work_name'],filters:{status:'status'}};
export const platformAuditResource:Resource={table:`(SELECT e.*,coalesce(u.display_name,'Hệ thống') AS actor_label FROM platform.audit_events e LEFT JOIN identity.users u ON u.id=e.actor_id)`,fields:{id:'id',actorId:'actor_id',actorLabel:'actor_label',action:'action',targetType:'target_type',targetId:'target_id',createdAt:'created_at',diff:'redacted_diff'},writeFields:[],search:['actor_label','action','target_type'],filters:{schoolId:'school_id',action:'action',targetType:'target_type',actorId:'actor_id'}};
export const operationResource:Resource={table:'platform.operation_runs',fields:{id:'id',kind:'kind',status:'status',createdAt:'created_at',startedAt:'started_at',finishedAt:'finished_at',summary:'summary'},writeFields:[],search:['kind'],filters:{kind:'kind',status:'status'}};
export const adminResource:Resource={table:`(SELECT m.*,u.email_normalized AS login_email FROM app.memberships m JOIN identity.users u ON u.id=m.user_id
 WHERE EXISTS(SELECT 1 FROM app.role_grants g JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN'
 WHERE g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'))`,fields:{...meta,userId:'user_id',workDisplayName:'work_display_name',status:'status',shareWorkContact:'share_work_contact',loginEmail:'login_email'},writeFields:[],search:['work_display_name','login_email'],filters:{status:'status'}};
export interface OperationalCounts extends Row {class_count:number;staff_count:number;admin_count:number;admin_labels:string[];onboarding:Record<string,boolean>;link_opens_30d:string}
export async function schoolView(tx:Transaction,row:Row){
  const counts=(await one<OperationalCounts>(tx,'SELECT * FROM platform.operational_counts($1)',[row.id]))!;
  return {...dto(schoolResource,{...row,display_short_name:row.short_name??row.name,display_province:row.province??''}),classCount:counts.class_count,staffCount:counts.staff_count,adminNames:counts.admin_labels,onboarding:counts.onboarding};
}
export async function platformAudit(tx:Transaction,c:ActorContext,type:string,id:string,metadata:Record<string,unknown>={}){
  await tx.query('INSERT INTO platform.audit_events(actor_id,school_id,action,target_type,target_id,request_id,redacted_diff) VALUES($1,$2,$3,$4,$5,$6,$7)',[c.principal!.userId,c.params.schoolId??(type==='school'?id:null),c.operation.id,type,id,c.requestId,metadata]);
}
export function platformSettings(row:Row){const value=row.value as Record<string,unknown>;return {version:row.version,brandName:value.brandName,supportEmail:value.supportEmail??null,publicSupportPhone:value.publicSupportPhone??null,footerNote:value.footerNote??''};}
const safeDiffFields=new Set(['name','shortName','province','level','status','adminCount','brandName','footerNote','supportEmail','publicSupportPhone']);
export function auditView(row:Record<string,unknown>){
  const diff=row.diff as Record<string,unknown>,changes=[];
  for(const [field,value] of Object.entries(diff)){if(!safeDiffFields.has(field)||!(value===null||['string','number','boolean'].includes(typeof value)))continue;changes.push({field,before:null,after:value===null?null:String(value)});}
  const view={...row};delete view.diff;return {...view,changes,...(typeof diff.reason==='string'&&diff.reason.length<=2000&&!/\b\d{9,12}\b/.test(diff.reason)?{reason:diff.reason}:{})};
}
export function operationView(item:Record<string,unknown>){
  const view={...item},numbers=new Set(['durationMs','migrations','rows','files','byteSize','readers','writers','p95ReadMs','p95WriteMs','errorRate','retentionDays']);
  if(view.startedAt===null)delete view.startedAt;if(view.finishedAt===null)delete view.finishedAt;
  view.summary=Object.fromEntries(Object.entries(view.summary as Record<string,unknown>).filter(([key,value])=>
    numbers.has(key)?typeof value==='number'&&Number.isFinite(value)&&value>=0:
    key==='checksum'?typeof value==='string'&&/^[a-f0-9]{64}$/.test(value):
    key==='schemaRevision'?typeof value==='string'&&/^\d{3}-[a-z0-9-]+\.sql$/.test(value):
    key==='errorCode'?typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value):false));return view;
}
