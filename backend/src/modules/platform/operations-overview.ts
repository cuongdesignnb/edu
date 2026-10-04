import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {Database,one,type Transaction,type Row} from '../../database/database';
import {dto} from '../../database/resources';
import {verifyInstallation} from '../../database/verify';
import {runtimeConfig} from '../../common/config';
import {operationResource,operationView} from './platform-data';
import {supportResource} from '../support/support-data';

type State='operational'|'degraded'|'unknown'|'local';
interface Service {key:string;state:State;note:string;observedAt:string|null}

/** Authenticated operational evidence; no backup commands or secrets in this GET. */
export async function operationsOverview(db:Database,tx:Transaction){
  const checkedAt=(await one<{at:Date}>(tx,'SELECT now() AS at'))!.at.toISOString(),services:Service[]=[{key:'api',state:'operational',note:'API đã xác thực và trả kết quả kiểm tra này.',observedAt:checkedAt}];
  let schemaOk=false;
  try{await verifyInstallation(db.app);schemaOk=true;}catch{/* The measured check is explicitly degraded below. */}
  services.push({key:'database',state:schemaOk?'operational':'degraded',note:schemaOk?'Đúng migration, checksum, runtime roles và FORCE RLS.':'Kiểm tra schema, checksum hoặc runtime roles chưa đạt.',observedAt:checkedAt});
  let parentOk=false;try{await db.parent.query('SELECT 1');parentOk=true;}catch{/* Explicit failed dependency probe. */}
  services.push({key:'parent',state:parentOk&&schemaOk?'operational':'degraded',note:parentOk&&schemaOk?'Kết nối DB bằng role phụ huynh hoạt động. Quyền từng link vẫn được kiểm tra ở mỗi lần đọc.':'Kết nối hoặc schema cho cổng phụ huynh chưa sẵn sàng.',observedAt:checkedAt});
  const root=runtimeConfig().storageRoot,probe=path.join(root,`.operations-${crypto.randomUUID()}`);let storageOk=false,freeBytes:number|null=null;
  try{await fs.mkdir(root,{recursive:true,mode:0o700});await fs.writeFile(probe,'',{flag:'wx',mode:0o600});await fs.unlink(probe);const stat=await fs.statfs(root);freeBytes=stat.bavail*stat.bsize;storageOk=true;}catch{await fs.unlink(probe).catch(()=>undefined);}
  services.push({key:'storage',state:storageOk?'operational':'degraded',note:storageOk?'Kho tệp riêng đọc được dung lượng và ghi/xóa tệp kiểm tra thành công.':'Không kiểm tra được dung lượng hoặc khả năng ghi kho tệp.',observedAt:checkedAt});
  const heartbeat=(await one<{at:Date|null;recent:number}>(tx,"SELECT max(last_healthy_at) AS at,count(*) FILTER(WHERE last_healthy_at>now()-interval '60 seconds')::int AS recent FROM platform.runtime_heartbeats"))!;
  services.push({key:'worker',state:heartbeat.recent>0?'operational':heartbeat.at?'degraded':'unknown',note:heartbeat.recent>0?'Ít nhất một worker hoàn tất vòng xử lý và DB trong 60 giây vừa qua.':heartbeat.at?'Chưa có vòng xử lý khỏe trong 60 giây vừa qua.':'Chưa nhận được bằng chứng vòng xử lý khỏe của worker.',observedAt:heartbeat.at?.toISOString()??null});
  const mail=(await one<{smtpAt:Date|null;failed:number;pending:number}>(tx,"SELECT max(sent_at) FILTER(WHERE status='SENT' AND delivery_mode='SMTP') AS \"smtpAt\",count(*) FILTER(WHERE status='FAILED')::int AS failed,count(*) FILTER(WHERE status IN ('PENDING','LEASED'))::int AS pending FROM identity.mail_outbox"))!;
  const settings=(await one<{value:{enabled:boolean;configured:boolean;lastTestStatus:string;lastTestedAt:string|null}}>(tx,'SELECT platform.mail_status() AS value'))!.value;
  const failed=settings.enabled&&(settings.lastTestStatus==='FAILED'||mail.failed>0),working=settings.enabled&&settings.lastTestStatus==='SENT';
  services.push({key:'mail',state:!settings.enabled?'unknown':failed?'degraded':working?'operational':'unknown',note:!settings.configured?'Chưa cấu hình SMTP. Email đang chờ; các chức năng khác hoạt động bình thường.':!settings.enabled?'SMTP đang tắt. Email đang chờ, không tính lần gửi lỗi.':failed?'SMTP có lỗi. Kiểm tra cấu hình và hàng đợi.':working?'SMTP hoạt động; email kiểm tra đã gửi thành công.':'SMTP đã bật, chưa xác nhận gửi.',observedAt:settings.lastTestedAt});
  const schema=(await one<{schema:string|null;migratedAt:Date|null;migrations:number}>(tx,'SELECT max(version) AS schema,max(applied_at) AS "migratedAt",count(*)::int AS migrations FROM public.schema_migrations'))!,counts=(await one<{schools:number;users:number;auditEvents:number;drafts:number;backups:number}>(tx,"SELECT (SELECT count(*)::int FROM platform.schools) AS schools,(SELECT count(*)::int FROM identity.users) AS users,(SELECT count(*)::int FROM platform.audit_events) AS \"auditEvents\",(SELECT count(*)::int FROM platform.schools WHERE status='DRAFT') AS drafts,(SELECT count(*)::int FROM platform.operation_runs WHERE kind='BACKUP') AS backups"))!;
  const school=(await one<{active_without_admin:number;pending_admin_invitations:number;expiring_admin_invitations:number}>(tx,'SELECT * FROM platform.operations_school_totals()'))!,tickets=(await one<{high:number;unassigned:number}>(tx,"SELECT count(*) FILTER(WHERE priority='HIGH')::int AS high,count(*) FILTER(WHERE assignee_id IS NULL)::int AS unassigned FROM platform.support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')"))!,grants=(await one<{active:number;requested:number}>(tx,`SELECT count(*) FILTER(WHERE t.view_status='active')::int AS active,count(*) FILTER(WHERE t.view_status='requested')::int AS requested FROM ${supportResource.table} t`))!;
  const backups=(await tx.query<Row>('SELECT * FROM platform.operation_runs WHERE kind=\'BACKUP\' ORDER BY created_at DESC,id DESC LIMIT 10')).rows.map(row=>operationView(dto(operationResource,row)));
  return {checkedAt,services,backups,backupTotal:counts.backups,storageFreeBytes:freeBytes,mail:{failed:mail.failed,pending:mail.pending},store:{schema:schema.schema??'UNINITIALIZED',migratedAt:schema.migratedAt?.toISOString()??null,migrations:schema.migrations,schools:counts.schools,users:counts.users,auditEvents:counts.auditEvents},checklist:{noAdmin:school.active_without_admin,drafts:counts.drafts,expiringAdminInvitations:school.expiring_admin_invitations,pendingAdminInvitations:school.pending_admin_invitations,highTickets:tickets.high,unassignedTickets:tickets.unassigned,activeGrants:grants.active,requestedGrants:grants.requested}};
}
