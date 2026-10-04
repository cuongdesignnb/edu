import crypto from 'node:crypto';
import {one,type Transaction,type Row} from '../../database/database';
import {Problem,validation} from '../../common/problem';
import {encryptSmtpPassword,encryptMail,hashToken} from '../../common/security';
import {platformAudit} from './platform-data';
import type {RequestContext} from '../../api.router';

export interface MailSettingsRow extends Row {
 id:string;enabled:boolean;host:string;port:number;security:'STARTTLS'|'TLS';username:string;from_email:string;from_name:string;
 encrypted_password:string|null;version:number;updated_at:Date;last_tested_at:Date|null;
 last_test_status:'NOT_TESTED'|'PENDING'|'SENT'|'FAILED'|'CANCELLED';last_error_code:string|null;
}
export async function mailSettings(tx:Transaction,lock=false) {
 const row=await one<MailSettingsRow>(tx,'SELECT * FROM platform.mail_settings WHERE singleton'+(lock?' FOR UPDATE':''));
 if(!row)throw new Problem(403,'FORBIDDEN');return row;
}
export function mailStatus(s:Pick<MailSettingsRow,'enabled'|'host'|'username'|'from_email'|'encrypted_password'|'last_test_status'>) {
 const configured=!!(s.host&&s.username&&s.from_email&&s.encrypted_password);
 return !configured?'UNCONFIGURED':!s.enabled?'DISABLED':s.last_test_status==='FAILED'?'ERROR':s.last_test_status==='SENT'?'WORKING':'ENABLED_UNVERIFIED';
}
export function mailSettingsDto(s:MailSettingsRow) {
 return {enabled:s.enabled,host:s.host,port:s.port,security:s.security,username:s.username,fromEmail:s.from_email,fromName:s.from_name,
 passwordConfigured:!!s.encrypted_password,version:s.version,updatedAt:s.updated_at.toISOString(),lastTestedAt:s.last_tested_at?.toISOString()??null,
 lastTestStatus:s.last_test_status,lastErrorCode:s.last_error_code,configurationStatus:mailStatus(s)};
}
export async function saveMailSettings(tx:Transaction,c:RequestContext) {
 const old=await mailSettings(tx,true),b=c.body;
 if(b.expectedVersion!==old.version)throw new Problem(409,'VERSION_CONFLICT',undefined,old.version);
 const host=String(b.host??'').trim(),username=String(b.username??'').trim(),from=String(b.fromEmail??'').trim(),name=String(b.fromName??'').trim();
 const password=typeof b.password==='string'&&b.password.trim()?b.password:null;
 if(password&&b.clearPassword===true)validation('password','Chọn thay mật khẩu hoặc xóa, không thực hiện cả hai.');
 const encrypted=b.clearPassword===true?null:password?encryptSmtpPassword(password):old.encrypted_password;
 if(host&&!/^[a-zA-Z0-9.-]+$/.test(host))validation('host','Nhập hostname hoặc IPv4, không gồm URL.');
 if([username,name].some(v=>/[\r\n]/.test(v)))validation('username','Không dùng ký tự xuống dòng.');
 if(from&&!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(from))validation('fromEmail','Địa chỉ gửi chưa hợp lệ.');
 if(b.enabled===true){
  if(!host)validation('host','Nhập SMTP host.');if(!username)validation('username','Nhập SMTP username.');
  if(!from)validation('fromEmail','Nhập email gửi.');if(!encrypted)validation('password','Cần mật khẩu SMTP để bật gửi email.');
 }
 const saved=(await one<MailSettingsRow>(tx,`UPDATE platform.mail_settings SET enabled=$1,host=$2,port=$3,security=$4,username=$5,
  from_email=$6,from_name=$7,encrypted_password=$8,version=version+1,updated_at=now(),last_tested_at=NULL,
  last_test_status='NOT_TESTED',last_error_code=NULL,last_test_mail_id=NULL WHERE singleton RETURNING *`,
 [b.enabled,host,b.port,b.security,username,from,name,encrypted]))!;
 await platformAudit(tx,c,'mail-settings',old.id,{enabledChanged:old.enabled!==saved.enabled,hostChanged:old.host!==host,
 usernameChanged:old.username!==username,passwordChanged:!!password||b.clearPassword===true,fromChanged:old.from_email!==from||old.from_name!==name});
 return mailSettingsDto(saved);
}
export async function queueMailTest(tx:Transaction,c:RequestContext) {
 const s=await mailSettings(tx,true);
 if(c.body.expectedVersion!==s.version)throw new Problem(409,'VERSION_CONFLICT',undefined,s.version);
 if(!s.enabled||mailStatus(s)==='UNCONFIGURED')throw new Problem(422,'SMTP_NOT_ENABLED');
 for(const [key,limit] of [[`smtp-test:${c.principal!.userId}`,2],['smtp-test:global',5]] as const){
  const bucket=hashToken(key),start=new Date(Math.floor(Date.now()/60000)*60000);
  const hits=(await one<{hits:number}>(tx,`INSERT INTO identity.rate_limit_buckets(bucket_hash,window_start,hits,expires_at)
   VALUES($1,$2,1,$2::timestamptz+interval '1 minute') ON CONFLICT(bucket_hash,window_start)
   DO UPDATE SET hits=identity.rate_limit_buckets.hits+1 RETURNING hits`,[bucket,start]))!;
  if(hits.hits>limit)throw new Problem(429,'RATE_LIMITED');
 }
 const id=crypto.randomUUID();
 await tx.query(`INSERT INTO identity.mail_outbox(id,user_id,template_key,encrypted_payload,dedupe_key)
  VALUES($1,$2,'SMTP_TEST',$3,$4)`,[id,c.principal!.userId,encryptMail({email:c.body.recipient,configVersion:s.version}),`SMTP_TEST:${s.version}:${id}`]);
 await tx.query("UPDATE platform.mail_settings SET last_tested_at=now(),last_test_status='PENDING',last_error_code=NULL,last_test_mail_id=$1 WHERE singleton",[id]);
 await platformAudit(tx,c,'mail-settings',s.id,{testQueued:true});
 return mailSettingsDto(await mailSettings(tx));
}
