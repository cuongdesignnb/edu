import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { Database,one,type Transaction,type Row } from '../database/database';
import { runtimeConfig,secret } from '../common/config';
import { decryptMail } from '../common/security';
import { Problem } from '../common/problem';
import { Permissions } from '../common/permissions';
import { Commands } from '../common/commands';
import { FilesService } from '../modules/files/files.service';
import { ImportsService } from '../modules/imports/imports.service';
import { ImportWorker } from '../modules/imports/import-worker';
import { InvitationsService } from '../modules/identity/invitations.service';
import { IdentityService } from '../modules/identity/identity.service';

interface Job extends Row {id:string;school_id:string;kind:string;payload:Record<string,unknown>;attempts:number}
interface Mail extends Row {id:string;school_id:string|null;template_key:string;encrypted_payload:string;attempts:number}
export type JobHandler=(job:Job,guard:(tx:Transaction)=>Promise<void>)=>Promise<void>;
export class WorkerRunner {
  readonly owner=crypto.randomUUID();
  private readonly handlers=new Map<string,JobHandler>();
  constructor(readonly db=new Database('worker')){
    const policy=new Permissions(db),commands=new Commands(db),files=new FilesService(db,policy,commands);
    this.register('PROCESS_FILE',(job,guard)=>files.processFile(job.school_id,String(job.payload.fileId),String(job.payload.userId),guard));
    const imports=new ImportsService(db,policy,commands,files);
    const importer=new ImportWorker(db,policy,imports,new InvitationsService(db,new IdentityService(db),policy));
    for(const kind of ['PARSE_IMPORT','VALIDATE_IMPORT','COMMIT_IMPORT'])this.register(kind,(job,guard)=>importer.run(kind,job.school_id,String(job.payload.importId),guard));
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
  private async mailClaim(){
    return this.db.transaction(tx=>one<Mail>(tx,`WITH candidate AS (
      SELECT id FROM identity.mail_outbox WHERE attempts<5 AND run_after<=now() AND encrypted_payload<>''
      AND (status IN ('PENDING','FAILED') OR (status='LEASED' AND lease_until<=now()))
      ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE identity.mail_outbox q SET status='LEASED',attempts=q.attempts+1,lease_owner=$1,lease_until=now()+interval '60 seconds'
      FROM candidate c WHERE q.id=c.id RETURNING q.*`,[this.owner]));
  }
  private async mailGuard(tx:Transaction,mail:Mail){
    if(!await one(tx,"SELECT id FROM identity.mail_outbox WHERE id=$1 AND status='LEASED' AND lease_owner=$2 AND lease_until>now() FOR UPDATE",[mail.id,this.owner]))throw new Problem(409,'JOB_LEASE_LOST');
  }
  async deliver(mail:Mail){
    try{
      const allowed=await this.db.transaction(async tx=>{
        await this.mailGuard(tx,mail);
        return (await one<{allowed:boolean}>(tx,'SELECT identity.mail_delivery_allowed($1) AS allowed',[mail.id]))?.allowed;
      },{schoolId:mail.school_id??undefined});
      if(!allowed){await this.db.transaction(async tx=>{await this.mailGuard(tx,mail);await tx.query("UPDATE identity.mail_outbox SET status='CANCELLED',encrypted_payload='',lease_owner=NULL,lease_until=NULL,last_error_code='TOKEN_UNAVAILABLE' WHERE id=$1",[mail.id]);});return;}
      const decoded=decryptMail(mail.encrypted_payload);
      if(!decoded||typeof decoded!=='object')throw new Problem(422,'MAIL_PAYLOAD_REJECTED');
      const payload=decoded as Record<string,unknown>;
      if(typeof payload.email!=='string'||typeof payload.url!=='string'||!payload.url.startsWith(runtimeConfig().appUrl+'/'))throw new Problem(422,'MAIL_PAYLOAD_REJECTED');
      const subject=mail.template_key==='PASSWORD_RESET'?'EduManage — Đặt lại mật khẩu':'EduManage — Lời mời nhân sự';
      const text=`${subject}\n\n${payload.url}\n\nLink riêng có thời hạn. Không chia sẻ cho người khác.`;
      const mode=process.env.MAIL_MODE==='smtp'?'SMTP':'FILE';
      if(mode==='FILE'){
        if(runtimeConfig().appEnv==='production')throw new Problem(422,'LOCAL_MAIL_IN_PRODUCTION');
        const root=runtimeConfig().mailRoot;await fs.mkdir(root,{recursive:true,mode:0o700});
        const temporary=path.join(root,`${mail.id}.${this.owner}.tmp`),target=path.join(root,`${mail.id}.eml`);
        const content=`X-EduManage-Delivery: LOCAL_FILE (không gửi Internet)\nTo: ${payload.email}\nSubject: ${subject}\nMessage-ID: <${mail.id}@edumanage.local>\n\n${text}\n`;
        await fs.writeFile(temporary,content,{mode:0o600});await fs.rename(temporary,target);
      }else{
        const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==='true',
          requireTLS:true,auth:{user:process.env.SMTP_USER,pass:secret('SMTP_PASSWORD')},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,
          tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true});
        try{await transport.sendMail({from:process.env.SMTP_FROM,to:payload.email,subject,text,messageId:`<${mail.id}@${new URL(runtimeConfig().appUrl).hostname}>`});}
        finally{transport.close();}
      }
      await this.db.transaction(async tx=>{await this.mailGuard(tx,mail);await tx.query("UPDATE identity.mail_outbox SET status='SENT',delivery_mode=$2,sent_at=now(),encrypted_payload='',lease_owner=NULL,lease_until=NULL,last_error_code=NULL WHERE id=$1",[mail.id,mode]);});
    }catch(error){
      const code=error instanceof Problem?error.code:'MAIL_DELIVERY_FAILED';
      await this.db.transaction(tx=>tx.query(`UPDATE identity.mail_outbox SET status='FAILED',last_error_code=$3,lease_owner=NULL,lease_until=NULL,
        run_after=now()+($4::int*interval '1 second') WHERE id=$1 AND status='LEASED' AND lease_owner=$2 AND lease_until>now()`,
      [mail.id,this.owner,code,Math.min(300,2**mail.attempts+crypto.randomInt(0,5))]));
      if(process.env.APP_ENV!=='test')process.stderr.write(JSON.stringify({event:'mail_failed',mailId:mail.id,code})+'\n');
    }
  }
  async processOnce(){
    const schools=(await this.db.app.query<{id:string}>('SELECT id FROM platform.schools ORDER BY id')).rows;
    let processed=0;
    for(const school of schools){
      const jobs:Job[]=[];for(let slot=0;slot<2;slot++){const job=await this.claim(school.id);if(job)jobs.push(job);}
      await Promise.all(jobs.map(job=>this.run(job)));processed+=jobs.length;
    }
    const mail=await this.mailClaim();if(mail){await this.deliver(mail);processed++;}
    return processed;
  }
  async close(){await this.db.onApplicationShutdown();}
}
