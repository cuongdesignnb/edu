import 'reflect-metadata';
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Pool} from 'pg';
import {migrate} from '../../dist/database/migrate.js';
import {seedLocal,seedId} from '../../dist/modules/identity/seed.js';
import {databaseConfig,runtimeConfig} from '../../dist/common/config.js';
import {hashPassword,decryptSmtpPassword,decryptMail} from '../../dist/common/security.js';
import {Database} from '../../dist/database/database.js';
import {createApplication} from '../../dist/main.js';
import {WorkerRunner} from '../../dist/workers/runner.js';
import {controlledSmtp} from './controlled-smtp.mjs';

let app,server,db,worker,smtp,second,raw;
const password=crypto.randomBytes(24).toString('base64url'),jar=new Map(),url='/api/v1/platform/settings/mail';
let csrf;
async function request(method,target,body,write=false,headers={}){
 const response=await server.inject({method,url:target,headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(write?{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()}:{}),...headers},...(body===undefined?{}:{payload:body})});
 for(const c of response.cookies)jar.set(c.name,c.value);return response;
}
async function login(email='operator@example.invalid'){
 jar.clear();const c=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
 const r=await request('POST','/api/v1/auth/login',{email,password},false,{'x-csrf-token':c});assert.equal(r.statusCode,200,r.body);csrf=r.json().data.csrfToken;
}
async function settings(){const r=await request('GET',url);assert.equal(r.statusCode,200,r.body);return r.json().data;}
async function save(patch={}){
 const s=await settings(),body={enabled:s.enabled,host:s.host,port:s.port,security:s.security,username:s.username,fromEmail:s.fromEmail,fromName:s.fromName,expectedVersion:s.version,...patch};
 return request('PUT',url,body,true);
}
async function enabled(serverFixture=smtp){
 const r=await save({enabled:true,host:'127.0.0.1',port:serverFixture.port,security:'TLS',username:serverFixture.state.username,password:serverFixture.state.password,fromEmail:'sender@example.invalid',fromName:'Controlled SMTP'});assert.equal(r.statusCode,200,r.body);return r.json().data;
}
async function queue(){const s=await settings(),r=await request('POST',url+'/test',{expectedVersion:s.version,recipient:'recipient@example.invalid'},true);assert.equal(r.statusCode,200,r.body);return (await raw.query('SELECT last_test_mail_id AS id FROM platform.mail_settings')).rows[0].id;}
before(async()=>{
 assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');
 await migrate();await seedLocal(password,true);raw=new Pool(databaseConfig('migrator'));
 await raw.query('UPDATE identity.users SET password_hash=$1 WHERE id=ANY($2)',[await hashPassword(password),['operator','admin-a','teacher-a'].map(n=>seedId('user:'+n))]);
 await raw.query("UPDATE platform.mail_settings SET enabled=false,host='',username='',from_email='',from_name='',encrypted_password=NULL,last_test_status='NOT_TESTED',last_error_code=NULL,last_test_mail_id=NULL WHERE singleton");
 // Production runtime with real keys/DB, secure cookies and intentionally blank SMTP.
 Object.assign(process.env,{APP_ENV:'production',APP_URL:'https://chunhiemso.com',COOKIE_SECURE:'true',MAIL_MODE:'smtp',SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_PORT:'',SMTP_SECURE:'',MAIL_FROM:''});delete process.env.SMTP_PASSWORD_FILE;
 runtimeConfig();app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();db=app.get(Database);worker=new WorkerRunner();
 smtp=await controlledSmtp();second=await controlledSmtp();
});
after(async()=>{await Promise.all([worker?.close(),app?.close(),smtp?.close(),second?.close(),raw?.end()]);});
beforeEach(async()=>{await raw.query('DELETE FROM identity.rate_limit_buckets');await login();});

test('SMTP production startup readiness and worker heartbeat pass without a configured sender',async()=>{
 assert.equal((await request('GET','/api/v1/health/live')).statusCode,200);assert.equal((await request('GET','/api/v1/health/ready')).statusCode,200);
 assert.equal(await worker.processMail(),0);await worker.processOnce();
 assert.ok((await raw.query('SELECT count(*)::int AS n FROM platform.runtime_heartbeats')).rows[0].n>0);
 assert.equal((await settings()).configurationStatus,'UNCONFIGURED');
});
test('SMTP top operator only, no school teacher support parent or ciphertext access',async()=>{
 for(const email of ['admin-a@example.invalid','teacher-a@example.invalid']){
  await login(email);for(const method of ['GET','PUT','POST']){
   const body={enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',expectedVersion:1};
   const r=await request(method,method==='POST'?url+'/test':url,method==='GET'?undefined:method==='POST'?{expectedVersion:1,recipient:'test@example.invalid'}:body,method!=='GET');assert.equal(r.statusCode,403,r.body);
  }
 }
 await login();assert.equal((await request('GET',url,undefined,false,{'x-support-access':crypto.randomUUID()})).statusCode,403);
 const partial=crypto.randomUUID();await raw.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status) VALUES($1,$2,'Support only',$3,'ACTIVE')",[partial,`support-${partial}@example.invalid`,await hashPassword(password)]);
 for(const action of ['platform.support','platform.settings'])await raw.query('INSERT INTO platform.operator_grants(user_id,action_code) VALUES($1,$2)',[partial,action]);
 await login(`support-${partial}@example.invalid`);assert.equal((await request('GET',url)).statusCode,403);
 jar.clear();assert.equal((await request('GET',url,undefined,false,{cookie:'__Host-edu_parent=opaque-parent-session'})).statusCode,401);
 const rows=await db.transaction(tx=>tx.query('SELECT encrypted_password FROM platform.mail_settings'),{userId:seedId('user:teacher-a')});assert.equal(rows.rowCount,0);
 await assert.rejects(()=>db.parent.query('SELECT encrypted_password FROM platform.mail_settings'),e=>e.code==='42501');
});
test('SMTP migration grants an existing full operator only, never partial or expired operators',async()=>{
 const full=crypto.randomUUID(),partial=crypto.randomUUID(),expired=crypto.randomUUID();
 const actions=['platform.admins.manage','platform.audit','platform.operations','platform.read','platform.schools.manage','platform.schools.read','platform.settings','platform.support'];
 for(const id of [full,partial,expired]){
  await raw.query("INSERT INTO identity.users(id,email_normalized,display_name,status) VALUES($1,$2,'Legacy operator fixture','ACTIVE')",[id,`legacy-${id}@example.invalid`]);
  for(const action of id===partial?['platform.settings','platform.support']:actions)await raw.query("INSERT INTO platform.operator_grants(user_id,action_code,valid_from,valid_until) VALUES($1,$2,now()-interval '1 day',CASE WHEN $3 THEN now()-interval '1 hour' ELSE NULL END)",[id,action,id===expired]);
 }
 const migration=fs.readFileSync('migrations/057-platform-mail-settings.sql','utf8');
 const grant=migration.match(/INSERT INTO platform\.operator_grants[\s\S]*?;/)[0];await raw.query(grant);
 const rows=(await raw.query("SELECT user_id FROM platform.operator_grants WHERE action_code='platform.mail.manage' AND user_id=ANY($1)",[[full,partial,expired]])).rows;assert.deepEqual(rows.map(r=>r.user_id),[full]);
});
test('SMTP disabled blank save and validation optimistic version and CSRF gates',async()=>{
 let r=await save({enabled:false,host:'',username:'',fromEmail:'',password:''});assert.equal(r.statusCode,200,r.body);
 r=await save({enabled:true});assert.equal(r.statusCode,422);
 const s=await settings();r=await request('PUT',url,{enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',expectedVersion:s.version-1},true);assert.equal(r.statusCode,409);
 r=await request('PUT',url,{enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',expectedVersion:s.version});assert.equal(r.statusCode,403);
});
test('SMTP password encrypted and never returned or audited; blank preserves and explicit clear requires disabled',async()=>{
 const secret=crypto.randomBytes(20).toString('hex');let r=await save({enabled:false,password:secret});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.passwordConfigured,true);
 const stored=(await raw.query('SELECT encrypted_password FROM platform.mail_settings')).rows[0].encrypted_password;assert.notEqual(stored,secret);assert.equal(decryptSmtpPassword(stored),secret);
 r=await save({password:''});assert.equal(r.statusCode,200);assert.equal((await raw.query('SELECT encrypted_password FROM platform.mail_settings')).rows[0].encrypted_password,stored);
 const response=await request('GET',url),audit=JSON.stringify((await raw.query("SELECT redacted_diff FROM platform.audit_events WHERE target_type='mail-settings'")).rows),cache=JSON.stringify((await raw.query("SELECT response_metadata FROM platform.idempotency_keys WHERE operation_id='updatePlatformMailSettings'")).rows);
 for(const text of [response.body,audit,cache]){assert.ok(!text.includes(secret));assert.ok(!text.includes(stored));assert.ok(!text.includes('encrypted_password'));}
 r=await save({clearPassword:true});assert.equal(r.statusCode,200);assert.equal(r.json().data.passwordConfigured,false);
});
test('SMTP disabled forgot and invitations queue without enumeration tokens claims attempts or failures',async()=>{
 await save({enabled:false});
 const c=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
 const known=await request('POST','/api/v1/auth/password/forgot',{email:'operator@example.invalid'},false,{'x-csrf-token':c});
 const unknown=await request('POST','/api/v1/auth/password/forgot',{email:`missing-${crypto.randomUUID()}@example.invalid`},false,{'x-csrf-token':c});
 assert.equal(known.statusCode,200,known.body);assert.equal(unknown.statusCode,200,unknown.body);assert.equal(known.json().data.status,unknown.json().data.status);assert.ok(!known.body.includes('token'));
 const s=seedId('school:A'),r=await request('POST',`/api/v1/platform/schools/${s}/admin-invitations`,{email:`invite-${crypto.randomUUID()}@example.invalid`,roleId:null},true);
 assert.equal(r.statusCode,201,r.body);assert.ok(!r.body.includes('#token='));assert.ok(!r.body.includes('encrypted_payload'));
 const invitationMail=(await raw.query("SELECT status,attempts FROM identity.mail_outbox WHERE dedupe_key=$1",['invitation:'+r.json().data.id])).rows[0];assert.equal(invitationMail.status,'PENDING');assert.equal(invitationMail.attempts,0);
 const before=(await raw.query("SELECT id,status,attempts FROM identity.mail_outbox WHERE status='PENDING' ORDER BY id")).rows;assert.ok(before.length>0);
 for(let i=0;i<3;i++)assert.equal(await worker.processMail(),0);
 assert.deepEqual((await raw.query("SELECT id,status,attempts FROM identity.mail_outbox WHERE status='PENDING' ORDER BY id")).rows,before);
 const operations=(await request('GET','/api/v1/platform/operations-overview')).json().data;assert.notEqual(operations.services.find(s=>s.key==='mail').state,'degraded');
});
test('SMTP controlled TLS sends via outbox and configuration changes take effect without restarting worker',async()=>{
 await enabled();const owner=worker.owner,id=await queue(),contender=new WorkerRunner();
 try{assert.deepEqual((await Promise.all([worker.processMail(id),contender.processMail(id)])).sort(),[0,1]);}finally{await contender.close();}
 let mail=(await raw.query('SELECT status,delivery_mode,encrypted_payload FROM identity.mail_outbox WHERE id=$1',[id])).rows[0];assert.equal(mail.status,'SENT');assert.equal(mail.delivery_mode,'SMTP');assert.equal(mail.encrypted_payload,'');
 assert.equal((await settings()).lastTestStatus,'SENT');assert.equal((await settings()).configurationStatus,'WORKING');assert.ok(smtp.state.messages.length>0);assert.ok(smtp.state.tls.every(v=>['TLSv1.2','TLSv1.3'].includes(v)));
 second.state.username='changed-user';second.state.password='changed-password';await enabled(second);const newer=await queue();assert.equal(await worker.processMail(newer),1);assert.equal(worker.owner,owner);assert.equal(second.state.messages.length,1);assert.equal(second.state.auths.at(-1).username,'changed-user');
 assert.equal((await raw.query('SELECT status FROM identity.mail_outbox WHERE id=$1',[newer])).rows[0].status,'SENT');
});
test('SMTP auth failure retries with a normalized code; disabling freezes attempts and current test status',async()=>{
 await enabled();smtp.state.fail=true;const id=await queue();assert.equal(await worker.processMail(id),1);smtp.state.fail=false;
 const failed=(await raw.query('SELECT status,attempts,last_error_code FROM identity.mail_outbox WHERE id=$1',[id])).rows[0];assert.equal(failed.status,'FAILED');assert.equal(failed.last_error_code,'SMTP_AUTH_FAILED');assert.equal(failed.attempts,1);
 const result=await settings();assert.equal(result.configurationStatus,'ERROR');assert.ok(!JSON.stringify(result).includes('must-not-leak'));
 await save({enabled:false});for(let i=0;i<3;i++)assert.equal(await worker.processMail(id),0);
 assert.deepEqual((await raw.query('SELECT status,attempts,last_error_code FROM identity.mail_outbox WHERE id=$1',[id])).rows[0],failed);
});
test('SMTP expired reset token is cancelled before delivery',async()=>{
 await enabled();const c=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
 const response=await request('POST','/api/v1/auth/password/forgot',{email:'operator@example.invalid'},false,{'x-csrf-token':c});assert.equal(response.statusCode,200,response.body);
 const mail=(await raw.query("SELECT id,dedupe_key,encrypted_payload FROM identity.mail_outbox WHERE template_key='PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1")).rows[0];assert.ok(decryptMail(mail.encrypted_payload).url);
 await raw.query("UPDATE identity.auth_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[mail.dedupe_key.split(':')[1]]);
 const prior=smtp.state.messages.length;assert.equal(await worker.processMail(mail.id),1);assert.equal((await raw.query('SELECT status FROM identity.mail_outbox WHERE id=$1',[mail.id])).rows[0].status,'CANCELLED');assert.equal(smtp.state.messages.length,prior);
});
test('SMTP test action is rate limited and changed configuration invalidates older queued test',async()=>{
 await enabled();const id=await queue();await queue();const s=await settings();assert.equal((await request('POST',url+'/test',{expectedVersion:s.version,recipient:'recipient@example.invalid'},true)).statusCode,429);
 await save({fromName:'New config revision'});const prior=smtp.state.messages.length;assert.equal(await worker.processMail(id),1);assert.equal((await raw.query('SELECT status FROM identity.mail_outbox WHERE id=$1',[id])).rows[0].status,'CANCELLED');assert.equal(smtp.state.messages.length,prior);assert.equal((await settings()).lastTestStatus,'NOT_TESTED');
});
test('SMTP disabled after claim releases pending mail and restores attempts without sending',async()=>{
 await enabled();const config=(await raw.query('SELECT * FROM platform.mail_settings')).rows[0],id=await queue(),mail=await worker.mailClaim(config.version,id);assert.ok(mail);
 await save({enabled:false});const prior=smtp.state.messages.length;await worker.deliver(mail,config);
 const row=(await raw.query('SELECT status,attempts,lease_owner,last_error_code FROM identity.mail_outbox WHERE id=$1',[id])).rows[0];assert.deepEqual(row,{status:'PENDING',attempts:0,lease_owner:null,last_error_code:null});assert.equal(smtp.state.messages.length,prior);
});
test('SMTP lost lease cannot overwrite the latest test receipt or mail state',async()=>{
 await enabled();const config=(await raw.query('SELECT * FROM platform.mail_settings')).rows[0],id=await queue(),mail=await worker.mailClaim(config.version,id);assert.ok(mail);
 await raw.query("UPDATE identity.mail_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);const prior=smtp.state.messages.length;await worker.deliver(mail,config);
 assert.equal((await settings()).lastTestStatus,'PENDING');assert.equal((await raw.query('SELECT status FROM identity.mail_outbox WHERE id=$1',[id])).rows[0].status,'LEASED');assert.equal(smtp.state.messages.length,prior);
});
