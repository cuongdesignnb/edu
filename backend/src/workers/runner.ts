import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { Database,one,type Transaction,type Row } from '../database/database';
import { runtimeConfig } from '../common/config';
import { decryptMail,decryptSmtpPassword } from '../common/security';
import type {MailSettingsRow} from '../modules/platform/platform-mail';
import { Problem } from '../common/problem';
import { Permissions } from '../common/permissions';
import { Commands } from '../common/commands';
import { FilesService } from '../modules/files/files.service';
import { ImportsService } from '../modules/imports/imports.service';
import { ImportWorker } from '../modules/imports/import-worker';
import { InvitationsService } from '../modules/identity/invitations.service';
import { IdentityService } from '../modules/identity/identity.service';
import { PublicationsService } from '../modules/publications/publications.service';
import { AnnouncementsService } from '../modules/announcements/announcements.service';
import { ReportsService } from '../modules/reports/reports.service';

interface Job extends Row {id:string;school_id:string;kind:string;payload:Record<string,unknown>;attempts:number}
interface Mail extends Row {id:string;school_id:string|null;template_key:string;encrypted_payload:string;attempts:number}
function smtpFailure(error:unknown) {
 const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';
 return code==='EAUTH'?'SMTP_AUTH_FAILED':['ETIMEDOUT','ECONNECTION','ECONNREFUSED','EDNS','ESOCKET'].includes(code)?'SMTP_CONNECTION_FAILED':code.startsWith('CERT_')||code==='ETLS'?'SMTP_TLS_FAILED':'SMTP_DELIVERY_FAILED';
}
export type JobHandler=(job:Job,guard:(tx:Transaction)=>Promise<void>)=>Promise<void>;
export class WorkerRunner {
  readonly owner=crypto.randomUUID();
  private readonly startedAt=new Date();
  private readonly handlers=new Map<string,JobHandler>();
  constructor(readonly db=new Database('worker')){
    const policy=new Permissions(db),commands=new Commands(db),files=new FilesService(db,policy,commands);
    this.register('PROCESS_FILE',(job,guard)=>files.processFile(job.school_id,String(job.payload.fileId),String(job.payload.userId),guard));
    const imports=new ImportsService(db,policy,commands,files);
    const importer=new ImportWorker(db,policy,imports,new InvitationsService(db,new IdentityService(db),policy));
    for(const kind of ['PARSE_IMPORT','VALIDATE_IMPORT','COMMIT_IMPORT'])this.register(kind,(job,guard)=>importer.run(kind,job.school_id,String(job.payload.importId),guard));
    const announcements=new AnnouncementsService(db,policy,commands,new PublicationsService(db,policy,commands),files);
    this.register('PUBLISH_ANNOUNCEMENT',(job,guard)=>announcements.runScheduled(job.school_id,String(job.payload.announcementId),String(job.payload.userId),Number(job.payload.sourceVersion),guard));
    const reports=new ReportsService(db,policy,commands);
    this.register('EXPORT_REPORT',(job,guard)=>reports.runExport(job.school_id,String(job.payload.exportId),guard));
  }
  register(kind:string,handler:JobHandler){this.handlers.set(kind,handler);}
  async claim(schoolId:string):Promise<Job|undefined>{
    return this.db.transaction(async tx=>one<Job>(tx,`WITH candidate AS (
      SELECT id FROM app.outbox_events WHERE school_id=$1 AND attempts<5 AND run_after<=now()
        AND (status IN ('PENDING','FAILED') OR (status='LEASED' AND lease_until<=now()))
      ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE app.outbox_events q SET status='LEASED',attempts=q.attempts+1,lease_owner=$2,lease_until=now()+interval '60 seconds'
      FROM candidate c WHERE q.id=c.id AND q.school_id=$1 RETURNING q.*`,[schoolId,this.owner]),{schoolId});
  }
  async guard(tx:Transaction,job:Job){
    const leased=await one(tx,`SELECT id FROM app.outbox_events WHERE school_id=$1 AND id=$2 AND status='LEASED'
      AND lease_owner=$3 AND lease_until>now() FOR UPDATE`,[job.school_id,job.id,this.owner]);
    if(!leased)throw new Problem(409,'JOB_LEASE_LOST');
  }
  async run(job:Job){
    let renewalFailed=false;
    const timer=setInterval(()=>{void this.db.transaction(tx=>tx.query(`UPDATE app.outbox_events SET lease_until=now()+interval '60 seconds'
      WHERE school_id=$1 AND id=$2 AND status='LEASED' AND lease_owner=$3 AND lease_until>now()`,[job.school_id,job.id,this.owner]),{schoolId:job.school_id})
      .then(result=>{if(result.rowCount!==1)renewalFailed=true;}).catch(()=>{renewalFailed=true;});},20_000);
    try{
      const handler=this.handlers.get(job.kind);if(!handler)throw new Problem(422,'JOB_HANDLER_UNAVAILABLE');
      await handler(job,async tx=>{if(renewalFailed)throw new Problem(409,'JOB_LEASE_LOST');await this.guard(tx,job);});
      await this.db.transaction(async tx=>{await this.guard(tx,job);await tx.query(`UPDATE app.outbox_events
        SET status='DONE',processed_at=now(),lease_owner=NULL,lease_until=NULL,last_error_code=NULL WHERE school_id=$1 AND id=$2`,[job.school_id,job.id]);},{schoolId:job.school_id});
    }catch(error){
      const code=error instanceof Problem?error.code:'JOB_PROCESSING_FAILED';
      await this.db.transaction(tx=>tx.query(`UPDATE app.outbox_events SET status='FAILED',last_error_code=$4,
        lease_owner=NULL,lease_until=NULL,run_after=now()+($5::int*interval '1 second')
        ,attempts=CASE WHEN $6::boolean THEN 5 ELSE attempts END
        WHERE school_id=$1 AND id=$2 AND status='LEASED' AND lease_owner=$3 AND lease_until>now()`,
      [job.school_id,job.id,this.owner,code,Math.min(300,2**job.attempts+crypto.randomInt(0,5)),error instanceof Problem&&[401,403,404,422].includes(error.status)]),{schoolId:job.school_id});
      // No raw DB/parser/SMTP errors or payloads in logs.
      if(process.env.APP_ENV!=='test')process.stderr.write(JSON.stringify({event:'job_failed',jobId:job.id,kind:job.kind,code})+'\n');
    }finally{clearInterval(timer);}
  }
  private async smtpSettings(){
    return this.db.transaction(tx=>one<MailSettingsRow>(tx,'SELECT * FROM platform.mail_settings WHERE singleton'));
  }
  private async mailClaim(version:number,mailId?:string){
    return this.db.transaction(tx=>one<Mail>(tx,`WITH candidate AS (
      SELECT id FROM identity.mail_outbox WHERE attempts<5 AND run_after<=now() AND encrypted_payload<>''
      AND (status IN ('PENDING','FAILED') OR (status='LEASED' AND lease_until<=now()))
      AND EXISTS(SELECT 1 FROM platform.mail_settings s WHERE s.enabled AND s.version=$2)
      ${mailId?'AND id=$3::uuid':''} ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE identity.mail_outbox q SET status='LEASED',attempts=q.attempts+1,lease_owner=$1,lease_until=now()+interval '60 seconds'
      FROM candidate c WHERE q.id=c.id RETURNING q.*`,mailId?[this.owner,version,mailId]:[this.owner,version]));
  }
  private async mailGuard(tx:Transaction,mail:Mail){
    if(!await one(tx,"SELECT id FROM identity.mail_outbox WHERE id=$1 AND status='LEASED' AND lease_owner=$2 AND lease_until>now() FOR UPDATE",[mail.id,this.owner]))throw new Problem(409,'JOB_LEASE_LOST');
  }
  private async testReceipt(tx:Transaction,mail:Mail,status:string,code:string|null,version:number){
    if(mail.template_key==='SMTP_TEST')await tx.query(`UPDATE platform.mail_settings SET last_test_status=$2,last_error_code=$3
      WHERE singleton AND version=$4 AND last_test_mail_id=$1`,[mail.id,status,code,version]);
  }
  async deliver(mail:Mail,settings?:MailSettingsRow){
    const smtp=settings??await this.smtpSettings();
    if(!smtp)return;
    try{
      const current=await this.smtpSettings();
      if(!current?.enabled||current.version!==smtp.version){
        await this.db.transaction(async tx=>{await this.mailGuard(tx,mail);await tx.query(`UPDATE identity.mail_outbox
          SET status='PENDING',attempts=greatest(attempts-1,0),lease_owner=NULL,lease_until=NULL WHERE id=$1`,[mail.id]);});return;
      }
      const allowed=await this.db.transaction(async tx=>{
        await this.mailGuard(tx,mail);
        return (await one<{allowed:boolean}>(tx,'SELECT identity.mail_delivery_allowed($1) AS allowed',[mail.id]))?.allowed;
      },{schoolId:mail.school_id??undefined});
      if(!allowed){await this.db.transaction(async tx=>{await this.mailGuard(tx,mail);await tx.query("UPDATE identity.mail_outbox SET status='CANCELLED',encrypted_payload='',lease_owner=NULL,lease_until=NULL,last_error_code='TOKEN_UNAVAILABLE' WHERE id=$1",[mail.id]);await this.testReceipt(tx,mail,'CANCELLED','TOKEN_UNAVAILABLE',smtp.version);});return;}
      const decoded=decryptMail(mail.encrypted_payload);
      if(!decoded||typeof decoded!=='object')throw new Problem(422,'MAIL_PAYLOAD_REJECTED');
      const payload=decoded as Record<string,unknown>;
      const test=mail.template_key==='SMTP_TEST';
      if(typeof payload.email!=='string'||!test&&(typeof payload.url!=='string'||!payload.url.startsWith(runtimeConfig().appUrl+'/')))throw new Problem(422,'MAIL_PAYLOAD_REJECTED');
      const subject=test?'EduManage — Kiểm tra gửi email':mail.template_key==='PASSWORD_RESET'?'EduManage — Đặt lại mật khẩu':'EduManage — Lời mời nhân sự';
      const text=test?'Email kiểm tra cấu hình gửi thư EduManage.':`${subject}\n\n${payload.url}\n\nLink riêng có thời hạn. Không chia sẻ cho người khác.`;
      const transport=nodemailer.createTransport({host:smtp.host,port:smtp.port,secure:smtp.security==='TLS',
        requireTLS:true,auth:{user:smtp.username,pass:decryptSmtpPassword(smtp.encrypted_password!)},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,
        tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
      try{await transport.sendMail({from:{name:smtp.from_name,address:smtp.from_email},to:payload.email,subject,text,messageId:`<${mail.id}@${new URL(runtimeConfig().appUrl).hostname}>`});}
      finally{transport.close();}
      await this.db.transaction(async tx=>{await this.mailGuard(tx,mail);await tx.query("UPDATE identity.mail_outbox SET status='SENT',delivery_mode='SMTP',sent_at=now(),encrypted_payload='',lease_owner=NULL,lease_until=NULL,last_error_code=NULL WHERE id=$1",[mail.id]);await this.testReceipt(tx,mail,'SENT',null,smtp.version);});
    }catch(error){
      const code=error instanceof Problem?error.code:smtpFailure(error);
      await this.db.transaction(async tx=>{const updated=await tx.query(`UPDATE identity.mail_outbox SET status='FAILED',last_error_code=$3,lease_owner=NULL,lease_until=NULL,
        run_after=now()+($4::int*interval '1 second') WHERE id=$1 AND status='LEASED' AND lease_owner=$2 AND lease_until>now()`,
      [mail.id,this.owner,code,Math.min(300,2**mail.attempts+crypto.randomInt(0,5))]);if(updated.rowCount===1)await this.testReceipt(tx,mail,'FAILED',code,smtp.version);});
      if(process.env.APP_ENV!=='test')process.stderr.write(JSON.stringify({event:'mail_failed',mailId:mail.id,code})+'\n');
    }
  }
  /** A worker may retry one known mail while retaining the same lease and delivery checks. */
  async processMail(mailId?:string){
    const settings=await this.smtpSettings();
    if(!settings?.enabled||!settings.host||!settings.username||!settings.from_email||!settings.encrypted_password)return 0;
    const mail=await this.mailClaim(settings.version,mailId);if(!mail)return 0;await this.deliver(mail,settings);return 1;
  }
  async processOnce(){
    const schools=(await this.db.app.query<{id:string}>('SELECT id FROM platform.schools ORDER BY id')).rows;
    let processed=0;
    for(const school of schools){
      const jobs:Job[]=[];for(let slot=0;slot<2;slot++){const job=await this.claim(school.id);if(job)jobs.push(job);}
      await Promise.all(jobs.map(job=>this.run(job)));processed+=jobs.length;
    }
    processed+=await this.processMail();
    await this.db.app.query(`INSERT INTO platform.runtime_heartbeats(worker_id,started_at,last_healthy_at,processed_jobs)
      VALUES($1,$2,now(),$3) ON CONFLICT(worker_id) DO UPDATE SET last_healthy_at=excluded.last_healthy_at,processed_jobs=excluded.processed_jobs`,[this.owner,this.startedAt,processed]);
    return processed;
  }
  async close(){await this.db.onApplicationShutdown();}
}
