import 'reflect-metadata';
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Pool} from 'pg';
import {migrate} from '../../dist/database/migrate.js';
import {seedLocal,seedId} from '../../dist/modules/identity/seed.js';
import {Database} from '../../dist/database/database.js';
import {databaseConfig} from '../../dist/common/config.js';
import {hashPassword,verifyPassword} from '../../dist/common/security.js';
import {createApplication} from '../../dist/main.js';

let app,server,raw,db,csrf;
const password='Aa1-'+crypto.randomBytes(24).toString('base64url'),jar=new Map(),school=seedId('school:A'),other=seedId('school:B'),url=`/api/v1/platform/schools/${school}/admins`;
const body=(patch={})=>({displayName:'Quản trị trực tiếp kiểm thử',email:`direct-${crypto.randomUUID()}@example.invalid`,password,mustChangePassword:false,validFrom:null,validUntil:null,...patch});
async function req(method,target,input,write=false,headers={}){
 const r=await server.inject({method,url:target,headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(write?{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()}:{}),...headers},...(input===undefined?{}:{payload:input})});for(const c of r.cookies)jar.set(c.name,c.value);return r;
}
async function login(email='operator@example.invalid',secret=password){jar.clear();const c=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken,r=await req('POST','/api/v1/auth/login',{email,password:secret},false,{'x-csrf-token':c});assert.equal(r.statusCode,200,r.body);csrf=r.json().data.csrfToken;return r.json().data;}
before(async()=>{assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');await migrate();await seedLocal(password,true);raw=new Pool(databaseConfig('migrator'));await raw.query('UPDATE identity.users SET password_hash=$1,must_change_password=false WHERE id=ANY($2)',[await hashPassword(password),['operator','admin-a','teacher-a'].map(n=>seedId('user:'+n))]);await raw.query('UPDATE platform.mail_settings SET enabled=false WHERE singleton');db=new Database();app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();});
after(async()=>{await app?.close();await raw?.end();await db?.onApplicationShutdown();});
beforeEach(async()=>{await raw.query('DELETE FROM identity.rate_limit_buckets');await login();});
test('direct admin with disabled SMTP is atomic active membership and school grant; no invitation/mail or secret in audit/cache/response',async()=>{
 const b=body({email:`DIRECT-${crypto.randomUUID()}@example.invalid`}),key=crypto.randomUUID();const before=(await db.transaction(tx=>tx.query('SELECT (SELECT count(*) FROM identity.mail_outbox)::int AS mail,(SELECT count(*) FROM app.staff_invitations)::int AS invites'),{schoolId:school})).rows[0];
 const logs=[],priorEnv=process.env.APP_ENV,priorWrite=process.stdout.write;let r;
 try{process.env.APP_ENV='local';process.stdout.write=function(chunk){logs.push(String(chunk));return true;};r=await req('POST',url,b,true,{'idempotency-key':key});}finally{process.env.APP_ENV=priorEnv;process.stdout.write=priorWrite;}
 assert.equal(r.statusCode,201,r.body);assert.ok(logs.some(l=>l.includes('createSchoolAdminAccount')));assert.ok(!logs.join('').includes(password));assert.ok(!logs.join('').includes(b.email));const dto=r.json().data;assert.equal(dto.email,b.email.toLowerCase());assert.equal(dto.status,'ACTIVE');
 const user=(await raw.query('SELECT password_hash,status FROM identity.users WHERE id=$1',[dto.userId])).rows[0];assert.ok(await verifyPassword(user.password_hash,password));assert.equal(user.status,'ACTIVE');assert.notEqual(user.password_hash,password);
 const grants=(await db.transaction(tx=>tx.query('SELECT school_id,scope_type,class_id,subject_id,role_id FROM app.role_grants WHERE member_id=$1',[dto.id]),{schoolId:school})).rows;assert.equal(grants.length,1);assert.equal(grants[0].school_id,school);assert.equal(grants[0].scope_type,'SCHOOL');assert.equal(grants[0].class_id,null);assert.equal(grants[0].subject_id,null);
 assert.deepEqual((await db.transaction(tx=>tx.query('SELECT (SELECT count(*) FROM identity.mail_outbox)::int AS mail,(SELECT count(*) FROM app.staff_invitations)::int AS invites'),{schoolId:school})).rows[0],before);
 const replay=await req('POST',url,b,true,{'idempotency-key':key});assert.equal(replay.statusCode,201);assert.equal(replay.json().data.id,dto.id);
 const auditRows=(await raw.query("SELECT * FROM platform.audit_events WHERE action='createSchoolAdminAccount' AND target_id=$1",[dto.id])).rows;assert.equal(auditRows.length,1);
 const cacheRows=(await raw.query("SELECT response_metadata FROM platform.idempotency_keys WHERE operation_id='createSchoolAdminAccount' AND response_metadata->'data'->>'id'=$1",[dto.id])).rows;assert.equal(cacheRows.length,1);
 const audit=JSON.stringify((await raw.query("SELECT * FROM platform.audit_events WHERE action='createSchoolAdminAccount' AND target_id=$1",[dto.id])).rows),cache=JSON.stringify((await raw.query("SELECT response_metadata FROM platform.idempotency_keys WHERE operation_id='createSchoolAdminAccount'")).rows);for(const text of [r.body,audit,cache]){assert.ok(!text.includes(password));assert.ok(!text.includes(user.password_hash));assert.ok(!text.includes('password_hash'));}
 await login(dto.email);assert.equal((await req('GET',`/api/v1/schools/${school}/profile`)).statusCode,200);assert.equal((await req('GET',`/api/v1/schools/${other}/profile`)).statusCode,404);
});
test('direct create denies school admin teacher parent partial support and revoked platform operator; CSRF required',async()=>{
 for(const email of ['admin-a@example.invalid','teacher-a@example.invalid']){await login(email);assert.equal((await req('POST',url,body(),true)).statusCode,403);assert.equal((await req('POST',url+'/assign-existing',{displayName:'Người đã có',email:'operator@example.invalid'},true)).statusCode,403);}
 jar.clear();assert.equal((await req('POST',url,body(),true,{cookie:'edu_parent=opaque'})).statusCode,401);
 await login();assert.equal((await req('POST',url,body(),false)).statusCode,403);assert.equal((await req('POST',url,body(),true,{'x-support-access':crypto.randomUUID()})).statusCode,403);
 const id=crypto.randomUUID();await raw.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status) VALUES($1,$2,'Partial support',$3,'ACTIVE')",[id,`partial-${id}@example.invalid`,await hashPassword(password)]);for(const a of ['platform.support','platform.admins.manage'])await raw.query('INSERT INTO platform.operator_grants(user_id,action_code) VALUES($1,$2)',[id,a]);await login(`partial-${id}@example.invalid`);assert.equal((await req('POST',url,body(),true)).statusCode,403);
 await login();await raw.query("UPDATE platform.operator_grants SET revoked_at=now() WHERE user_id=$1 AND action_code='platform.admins.create_direct' AND revoked_at IS NULL",[seedId('user:operator')]);try{assert.equal((await req('POST',url,body(),true)).statusCode,403);}finally{await raw.query("UPDATE platform.operator_grants SET revoked_at=NULL WHERE user_id=$1 AND action_code='platform.admins.create_direct'",[seedId('user:operator')]);}
});
test('duplicate email cannot overwrite identity; explicit assignment preserves password and rejects existing member/locked account',async()=>{
 const email=`existing-${crypto.randomUUID()}@example.invalid`,oldHash=await hashPassword('Old-Identity-Password-13579'),id=(await raw.query("INSERT INTO identity.users(email_normalized,display_name,password_hash,status) VALUES($1,'Existing name',$2,'ACTIVE') RETURNING id",[email,oldHash])).rows[0].id;
 const duplicate=await req('POST',url,body({email}),true);assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().code,'IDENTITY_EXISTS_USE_ASSIGN');assert.equal((await raw.query('SELECT password_hash FROM identity.users WHERE id=$1',[id])).rows[0].password_hash,oldHash);
 const r=await req('POST',url+'/assign-existing',{email,displayName:'Hồ sơ trường mới'},true);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().data.userId,id);assert.equal((await raw.query('SELECT display_name FROM identity.users WHERE id=$1',[id])).rows[0].display_name,'Existing name');assert.equal((await raw.query('SELECT password_hash FROM identity.users WHERE id=$1',[id])).rows[0].password_hash,oldHash);
 assert.equal((await req('POST',url+'/assign-existing',{email,displayName:'Gán lần hai'},true)).statusCode,409);
 assert.equal((await req('POST',url+'/assign-existing',{email,displayName:'Gán không hợp lệ',password},true)).statusCode,422);
 await raw.query("UPDATE identity.users SET status='LOCKED' WHERE id=$1",[id]);assert.equal((await req('POST',`/api/v1/platform/schools/${other}/admins/assign-existing`,{email,displayName:'Tài khoản khóa'},true)).json().code,'IDENTITY_NOT_ELIGIBLE');
});
test('grant failure rolls back identity membership audit and idempotency',async()=>{
 const b=body();await raw.query(`CREATE FUNCTION app.direct_admin_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.school_id='${other}'::uuid THEN RAISE EXCEPTION 'CONTROLLED_GRANT_FAILURE'; END IF; RETURN NEW; END $$;CREATE TRIGGER direct_admin_fixture_fail BEFORE INSERT ON app.role_grants FOR EACH ROW EXECUTE FUNCTION app.direct_admin_fixture_fail()`);
 try{const r=await req('POST',`/api/v1/platform/schools/${other}/admins`,b,true);assert.equal(r.statusCode,500);assert.equal((await raw.query('SELECT count(*)::int AS n FROM identity.users WHERE email_normalized=$1',[b.email])).rows[0].n,0);assert.ok(!r.body.includes('CONTROLLED_GRANT_FAILURE'));}finally{await raw.query('DROP TRIGGER direct_admin_fixture_fail ON app.role_grants; DROP FUNCTION app.direct_admin_fixture_fail()');}
});
test('temporary password login requires change at the API; change clears flag and revokes old session',async()=>{
 const b=body({mustChangePassword:true}),r=await req('POST',url,b,true);assert.equal(r.statusCode,201,r.body);const dto=r.json().data;
 assert.equal((await login(dto.email)).user.mustChangePassword,true);assert.equal((await req('GET','/api/v1/me/context')).json().data.user.mustChangePassword,true);
 const blocked=await req('GET',`/api/v1/schools/${school}/profile`);assert.equal(blocked.statusCode,403);assert.equal(blocked.json().code,'PASSWORD_CHANGE_REQUIRED');
 assert.equal((await req('PATCH','/api/v1/me/profile',{expectedVersion:1,displayName:'Bypass'},true)).json().code,'PASSWORD_CHANGE_REQUIRED');
 assert.equal((await req('POST','/api/v1/auth/password/change',{currentPassword:password,newPassword:password},true)).statusCode,422);
 const next='New-Password-Strong-98765';const changed=await req('POST','/api/v1/auth/password/change',{currentPassword:password,newPassword:next},true);assert.equal(changed.statusCode,200,changed.body);assert.equal((await req('GET','/api/v1/me/context')).statusCode,401);
 assert.equal((await raw.query('SELECT must_change_password FROM identity.users WHERE id=$1',[dto.userId])).rows[0].must_change_password,false);assert.equal((await login(dto.email,next)).user.mustChangePassword,false);assert.equal((await req('GET',`/api/v1/schools/${school}/profile`)).statusCode,200);
});
test('validity and school state gates remain; enabled SMTP still queues no email',async()=>{
 const bad=await req('POST',url,body({validUntil:'2020-01-01T00:00:00Z'}),true);assert.equal(bad.statusCode,422);
 const from=new Date(Date.now()+3600000).toISOString(),until=new Date(Date.now()+7200000).toISOString(),r=await req('POST',url,body({validFrom:from,validUntil:until}),true);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().data.validFrom,from);const listed=await req('GET',url);assert.equal(listed.statusCode,200,listed.body);assert.equal(listed.json().data.find(m=>m.id===r.json().data.id).grants[0].validFrom,from);
 await login(r.json().data.email);assert.equal((await req('GET',`/api/v1/schools/${school}/profile`)).statusCode,403);await login();
 const before=(await raw.query('SELECT count(*)::int AS n FROM identity.mail_outbox')).rows[0].n;await raw.query("UPDATE platform.mail_settings SET enabled=true,host='uncontacted-fixture.invalid',username='unused',from_email='unused@example.invalid',encrypted_password='not-decrypted-test-marker' WHERE singleton");
 try{assert.equal((await req('POST',url,body(),true)).statusCode,201);assert.equal((await raw.query('SELECT count(*)::int AS n FROM identity.mail_outbox')).rows[0].n,before);}finally{await raw.query('UPDATE platform.mail_settings SET enabled=false WHERE singleton');}
});
test('legacy migration grants full operators only',async()=>{
 const id=crypto.randomUUID(),full=crypto.randomUUID(),actions=['platform.admins.manage','platform.audit','platform.operations','platform.read','platform.schools.manage','platform.schools.read','platform.settings','platform.support','platform.mail.manage'];
 for(const target of [id,full]){await raw.query("INSERT INTO identity.users(id,email_normalized,display_name,status) VALUES($1,$2,'Legacy fixture','ACTIVE')",[target,`legacy-${target}@example.invalid`]);for(const action of target===id?['platform.admins.manage']:actions)await raw.query('INSERT INTO platform.operator_grants(user_id,action_code) VALUES($1,$2)',[target,action]);}
 await raw.query(fs.readFileSync('migrations/058-direct-school-admin.sql','utf8').match(/INSERT INTO platform\.operator_grants[\s\S]*?;/)[0]);assert.deepEqual((await raw.query("SELECT user_id FROM platform.operator_grants WHERE action_code='platform.admins.create_direct' AND user_id=ANY($1)",[[id,full]])).rows.map(r=>r.user_id),[full]);
});
test('email invitation flow is retained while SMTP is disabled',async()=>{
 const r=await req('POST',`/api/v1/platform/schools/${school}/admin-invitations`,{email:`invite-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Lời mời được giữ',roleId:null},true);assert.equal(r.statusCode,201,r.body);assert.ok(!r.body.includes('#token='));assert.equal((await raw.query('SELECT status,attempts FROM identity.mail_outbox WHERE dedupe_key=$1',['invitation:'+r.json().data.id])).rows[0].status,'PENDING');
});
