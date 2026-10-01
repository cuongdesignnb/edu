import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../../dist/database/migrate.js';
import { verifyInstallation } from '../../dist/database/verify.js';
import { databaseConfig } from '../../dist/common/config.js';
import { seedLocal,seedId } from '../../dist/modules/identity/seed.js';
import { createApplication } from '../../dist/main.js';
import { Database } from '../../dist/database/database.js';
import { Permissions } from '../../dist/common/permissions.js';
import { hashPassword } from '../../dist/common/security.js';
import { decryptMail } from '../../dist/common/security.js';
import { InvitationsService } from '../../dist/modules/identity/invitations.service.js';
import { WorkerRunner } from '../../dist/workers/runner.js';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import { ImportWorker } from '../../dist/modules/imports/import-worker.js';
import { ImportsService } from '../../dist/modules/imports/imports.service.js';
import { FilesService } from '../../dist/modules/files/files.service.js';
import { Commands } from '../../dist/common/commands.js';
import { IdentityService } from '../../dist/modules/identity/identity.service.js';
import { Problem } from '../../dist/common/problem.js';
import { StaffService } from '../../dist/modules/staff/staff.service.js';
import { runSupportRead } from '../../dist/common/support-context.js';
import {operations} from '../../dist/common/contract.js';
import {DashboardsService} from '../../dist/modules/dashboards/dashboards.service.js';
import {schoolClassOverview} from '../../dist/modules/dashboards/school-class-overview.js';

let app,server,db,policy;
const password=crypto.randomBytes(24).toString('base64url');
const resetPassword=crypto.randomBytes(24).toString('base64url');
const pool=new Pool({...databaseConfig('app'),max:1});
const schoolA=seedId('school:A'),schoolB=seedId('school:B'),classA=seedId('class:A:10A1'),classB=seedId('class:A:10A2');
const origin=process.env.APP_URL;
const jar=new Map();
// UUID text occasionally contains an all-digit segment resembling protected PII.
// Preserve unique test labels without weakening the support privacy validator.
const testTextNonce=()=>crypto.randomUUID().replace(/[0-9]/g,n=>'ghijklmnop'[Number(n)]);
function cookies(){return [...jar].map(([key,value])=>`${key}=${value}`).join('; ');}
async function request(method,url,body,csrf,extra={}){
  const response=await server.inject({method,url,headers:{origin,cookie:cookies(),...(csrf?{'x-csrf-token':csrf}:{}),...extra},
    ...(body!==undefined?{payload:body}:{})});
  for(const cookie of response.cookies)jar.set(cookie.name,cookie.value);
  return response;
}
async function login(email,currentPassword=password){
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const result=await request('POST','/api/v1/auth/login',{email,password:currentPassword},csrf);
  assert.equal(result.statusCode,200,'valid fixture login must succeed');
  return result.json().data.csrfToken;
}
async function unusedYearRange(schoolId,past=false){
  const result=await db.transaction(tx=>tx.query(`SELECT min(starts_on)::text AS lo,max(ends_on)::text AS hi FROM app.academic_years WHERE school_id=$1`,[schoolId]),{schoolId});
  const year=Number(String(past?result.rows[0].lo:result.rows[0].hi).slice(0,4))+(past?-1:1);
  return {startsOn:`${year}-09-01`,endsOn:`${year+1}-06-01`};
}
/** A new retained synthetic school avoids changing locked timezone/history fixtures. */
async function operationalUiSchool(timezone='Asia/Ho_Chi_Minh'){
  jar.delete('edu_staff');const csrf=await login('operator@example.invalid'),suffix=crypto.randomUUID(),created=await request('POST','/api/v1/platform/schools',{name:'Trường vận hành UI giả',code:`UI-${suffix}`,slug:`ui-${suffix}`,timezone},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(created.statusCode,201,created.body);const schoolId=created.json().data.id;
  await db.transaction(async tx=>{
    const member=(await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status) VALUES($1,$2,'Quản trị UI giả','ACTIVE') RETURNING id",[schoolId,seedId('user:admin-a')])).rows[0],role=(await tx.query("SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_ADMIN' AND system_role",[schoolId])).rows[0];
    await tx.query("INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,granted_by) VALUES($1,$2,$3,'SCHOOL',$4)",[schoolId,member.id,role.id,seedId('user:admin-a')]);
    await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status) VALUES($1,$2,'Nhân sự không có quyền nhật ký giả','ACTIVE')",[schoolId,seedId('user:teacher-a')]);
  },{schoolId});
  const active=await request('POST',`/api/v1/platform/schools/${schoolId}/status`,{expectedVersion:created.json().data.version,status:'ACTIVE',reason:'Kích hoạt trường kiểm thử giả'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(active.statusCode,200,active.body);return schoolId;
}
before(async()=>{
  await migrate();await seedLocal(password,true);
  // Only the explicitly disposable test database and synthetic namespace. CLI
  // seed-local itself never rotates passwords of existing identities.
  assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');
  const fixturePool=new Pool(databaseConfig('migrator'));
  try{await fixturePool.query('UPDATE identity.users SET password_hash=$1 WHERE id=ANY($2)',[
    await hashPassword(password),['operator','admin-a','admin-b','teacher-a','teacher-b','multi'].map(name=>seedId(`user:${name}`)),
  ]);await fixturePool.query("SELECT set_config('app.school_id',$1,false)",[schoolA]);
    await fixturePool.query('UPDATE app.role_grants SET revoked_at=NULL WHERE school_id=$1 AND id=$2',[schoolA,seedId('grant:A:admin-a:admin')]);
    // Retire the earlier synthetic contact-test homeroom assignments. They are
    // retained as history; subject-only fixtures must not gain family rights.
    await fixturePool.query(`UPDATE app.role_grants g SET revoked_at=now() WHERE g.school_id=$1 AND g.member_id=$2 AND EXISTS(
      SELECT 1 FROM app.teaching_assignments a JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id WHERE a.school_id=g.school_id AND a.role_grant_id=g.id AND a.kind='HOMEROOM' AND c.code LIKE 'CON-%')`,[schoolA,seedId('member:A:teacher-b')]);
    await fixturePool.query(`UPDATE app.teaching_assignments a SET revoked_at=now() WHERE a.school_id=$1 AND a.member_id=$2 AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND EXISTS(
      SELECT 1 FROM app.classes c WHERE c.school_id=a.school_id AND c.id=a.class_id AND c.code LIKE 'CON-%')`,[schoolA,seedId('member:A:teacher-b')]);
    await fixturePool.query('DELETE FROM identity.rate_limit_buckets');}finally{await fixturePool.end();}
  app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();
  db=app.get(Database);policy=app.get(Permissions);
});
after(async()=>{await app?.close();await pool.end();});
beforeEach(async()=>{
  // Each security case gets a clean test-only throttle window; rate-limit
  // assertions still exercise repeated real requests inside their own case.
  assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');
  await pool.query('DELETE FROM identity.rate_limit_buckets');
});

test('B5 all 264 supplied operations and explicit frontend workflow extensions have registered real handlers',async()=>{
  assert.equal(operations.length,310);for(const op of operations)assert.equal(server.hasRoute({method:op.method,url:op.path.replace(/\{([^}]+)\}/g,':$1')}),true,op.id);
});

test('BE01 migration replay is a no-op, mismatch fails and metadata remains intact',async()=>{
  const result=await migrate();assert.deepEqual(result.applied,[]);assert.equal(result.total,(await fs.readdir('migrations')).filter(name=>name.endsWith('.sql')).length);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'edumanage-migration-'));
  try{
    for(const name of await fs.readdir('migrations'))await fs.copyFile(path.join('migrations',name),path.join(temp,name));
    await fs.appendFile(path.join(temp,'001-schema.sql'),'\n-- checksum mismatch test\n');
    await assert.rejects(migrate({directory:temp}),/checksum mismatch/);
    assert.equal((await verifyInstallation(pool)).forceRls,true);
  }finally{for(const name of await fs.readdir(temp))await fs.unlink(path.join(temp,name));await fs.rmdir(temp);}
});
test('BE02 cross-school enrollment FK rejects write using the real runtime role',async()=>{
  await assert.rejects(db.transaction(async tx=>{
    await tx.query(`INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on,ends_on)
      VALUES($1,$2,$3,$4,'2026-09-01','2027-06-01')`,[schoolA,seedId('student:A:10A1:1'),seedId('class:B:10A1'),seedId('year:A')]);
  },{schoolId:schoolA}),error=>['23503','23514','23P01'].includes(error.code));
});
test('BE03 no-tenant denies and SET LOCAL cannot leak across a reused connection',async()=>{
  const tx=await pool.connect();
  try{
    assert.equal((await tx.query('SELECT id FROM app.students')).rowCount,0);
    await tx.query('BEGIN');await tx.query("SELECT set_config('app.school_id',$1,true)",[schoolA]);
    const fixtures=['10A1','10A2'].flatMap(code=>Array.from({length:6},(_,i)=>seedId(`student:A:${code}:${i+1}`)));
    assert.equal((await tx.query('SELECT id FROM app.students WHERE id=ANY($1::uuid[])',[fixtures])).rowCount,12);await tx.query('COMMIT');
  }finally{tx.release();}
  const reused=await pool.connect();
  try{
    assert.equal((await reused.query('SELECT id FROM app.students')).rowCount,0);
    await reused.query('BEGIN');await reused.query("SELECT set_config('app.school_id',$1,true)",[schoolB]);
    assert.equal((await reused.query('SELECT id FROM app.students WHERE school_id=$1',[schoolA])).rowCount,0);
    assert.equal((await reused.query('SELECT id FROM app.students')).rowCount,6);await reused.query('ROLLBACK');
  }finally{reused.release();}
});
test('BE04 bootstrap only exposes the authenticated user memberships without tenant',async()=>{
  const user=seedId('user:teacher-a');
  const rows=await db.transaction(async tx=>(await tx.query('SELECT user_id,school_id FROM app.memberships')).rows,{userId:user});
  assert.ok(rows.length>=1);assert.ok(rows.every(row=>row.user_id===user));assert.ok(rows.some(row=>row.school_id===schoolA));
  const foreign=await db.transaction(async tx=>(await tx.query('SELECT user_id FROM app.memberships WHERE user_id<>$1',[user])).rows,{userId:user});assert.deepEqual(foreign,[]);
  const noUser=await db.transaction(async tx=>(await tx.query('SELECT id FROM app.memberships')).rows);assert.equal(noUser.length,0);
  const tenant=await db.transaction(async tx=>(await tx.query('SELECT school_id FROM app.memberships')).rows,{schoolId:schoolB,userId:user});
  assert.equal(tenant.every(row=>row.school_id===schoolB),true);
});
test('BE05 HOMEROOM A plus SUBJECT B cannot authorize seating or guardians in B',async()=>{
  await login('teacher-a@example.invalid');
  const context=(await request('GET','/api/v1/me/context')).json().data;
  assert.equal(context.mode,'connected');assert.equal(context.user.id,seedId('user:teacher-a'));
  const owned=await db.transaction(async tx=>(await tx.query('SELECT id FROM app.memberships')).rows,{userId:seedId('user:teacher-a')});
  assert.deepEqual(context.memberships.map(m=>m.memberId).sort(),owned.map(m=>m.id).sort());assert.ok(context.memberships.some(m=>m.schoolId===schoolA));
  const principal={userId:seedId('user:teacher-a')};
  await db.transaction(tx=>policy.require(tx,principal,'seating.manage',{schoolId:schoolA,classId:classA}),{schoolId:schoolA});
  for(const action of ['seating.manage','guardian.read','conduct.publish'])await assert.rejects(db.transaction(
    tx=>policy.require(tx,principal,action,{schoolId:schoolA,classId:classB}),{schoolId:schoolA}),error=>error.status===404);
  await db.transaction(tx=>policy.require(tx,principal,'student.read',{schoolId:schoolA,classId:classB,allowSubject:true}),{schoolId:schoolA});
});
test('BE06 revoked membership is checked during an existing session and B stays independent',async()=>{
  await login('multi@example.invalid');
  const principal={userId:seedId('user:multi')};
  await db.transaction(async tx=>{
    await tx.query("UPDATE app.memberships SET status='SUSPENDED' WHERE id=$1",[seedId('member:A:multi')]);
    await assert.rejects(policy.require(tx,principal,'school.read',{schoolId:schoolA,allowScopedContext:true}),error=>error.status===404);
    throw new Error('ROLLBACK_TEST');
  },{schoolId:schoolA}).catch(error=>assert.equal(error.message,'ROLLBACK_TEST'));
  await db.transaction(tx=>policy.require(tx,principal,'school.read',{schoolId:schoolB,allowScopedContext:true}),{schoolId:schoolB});
});
test('B6 self context carries only own current duties and separates self-profile from school contacts',async()=>{
  const csrf=await login('teacher-a@example.invalid');
  const context=(await request('GET','/api/v1/me/context')).json().data;
  assert.ok(Number.isFinite(Date.parse(context.serverNow)));
  const own=context.memberships.find(m=>m.schoolId===schoolA);assert.ok(own);
  assert.equal(own.schoolSlug,'truong-thu-a');assert.equal(own.teacherWorkspace,true);assert.equal(own.schoolWorkspace,false);
  assert.ok(own.duties.some(d=>d.classId===classA&&d.kind==='HOMEROOM'));
  assert.ok(own.duties.some(d=>d.classId===classB&&d.kind==='SUBJECT'));
  assert.ok(own.duties.every(d=>!Object.hasOwn(d,'studentId')&&!Object.hasOwn(d,'workPhone')));
  const profile=(await request('GET','/api/v1/me/profile')).json().data;
  const updated=await request('PATCH','/api/v1/me/profile',{expectedVersion:profile.version,workPhone:'SELF-ONLY-0900000011',bio:'Hồ sơ cá nhân thử'},csrf);
  assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().data.workPhone,'SELF-ONLY-0900000011');assert.equal(updated.json().data.bio,'Hồ sơ cá nhân thử');
  const workContact=await db.transaction(async tx=>(await tx.query('SELECT work_phone FROM app.memberships WHERE school_id=$1 AND id=$2',[schoolA,own.memberId])).rows[0],{schoolId:schoolA});assert.notEqual(workContact.work_phone,'SELF-ONLY-0900000011');
  const assignment=seedId('assignment:A:teacher-a:10A1:HOMEROOM');
  const original=await db.transaction(async tx=>(await tx.query('SELECT ends_on FROM app.teaching_assignments WHERE school_id=$1 AND id=$2',[schoolA,assignment])).rows[0],{schoolId:schoolA});
  try{await db.transaction(tx=>tx.query('UPDATE app.teaching_assignments SET ends_on=$3 WHERE school_id=$1 AND id=$2',[schoolA,assignment,own.today]),{schoolId:schoolA});
    const after=(await request('GET','/api/v1/me/context')).json().data.memberships.find(m=>m.schoolId===schoolA);
    assert.equal(after.duties.some(d=>d.id===assignment),false);assert.equal(after.grants.some(g=>g.classId===classA),false);assert.ok(after.duties.some(d=>d.classId===classB&&d.kind==='SUBJECT'));
  }finally{await db.transaction(tx=>tx.query('UPDATE app.teaching_assignments SET ends_on=$3 WHERE school_id=$1 AND id=$2',[schoolA,assignment,original.ends_on]),{schoolId:schoolA});}
});

test('BE08 CSRF, credential validation, cookie flags, session rotation and rate limiting',async()=>{
  jar.clear();
  const denied=await request('POST','/api/v1/auth/login',{email:'admin-a@example.invalid',password});assert.equal(denied.statusCode,403);
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const spoof=await request('POST','/api/v1/auth/login',{email:'admin-a@example.invalid',password,role:'ADMIN'},csrf);assert.equal(spoof.statusCode,422);
  const result=await request('POST','/api/v1/auth/login',{email:'admin-a@example.invalid',password},csrf);assert.equal(result.statusCode,200);
  const cookie=[result.headers['set-cookie']].flat().find(value=>value.startsWith('edu_staff='));
  assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);assert.match(cookie,/Path=\//i);
  const old=jar.get('edu_staff'),staffCsrf=result.json().data.csrfToken;
  const rotated=await request('POST','/api/v1/auth/login',{email:'admin-b@example.invalid',password},csrf);assert.equal(rotated.statusCode,200);
  assert.notEqual(jar.get('edu_staff'),old);
  const oldRead=await server.inject({method:'GET',url:'/api/v1/me/context',headers:{cookie:`edu_staff=${old}`}});assert.equal(oldRead.statusCode,401);
  const wrongCsrf=await request('POST','/api/v1/auth/logout',undefined,staffCsrf);assert.equal(wrongCsrf.statusCode,403);
  const correctCsrf=rotated.json().data.csrfToken;
  const loggedOut=await request('POST','/api/v1/auth/logout',undefined,correctCsrf);assert.equal(loggedOut.statusCode,200);
  assert.equal((await request('GET','/api/v1/me/context')).statusCode,401);
  const bucket=`test-single-bucket:${crypto.randomUUID()}`;
  for(let i=0;i<4;i++)await app.get((await import('../../dist/modules/identity/identity.service.js')).IdentityService).rateLimit(bucket,4,60);
  await assert.rejects(app.get((await import('../../dist/modules/identity/identity.service.js')).IdentityService).rateLimit(bucket,4,60),error=>error.status===429);
});
test('BE10 concurrent profile patches serialize with a single version winner',async()=>{
  const csrf=await login('admin-a@example.invalid');
  const current=(await request('GET','/api/v1/me/profile')).json().data;
  const results=await Promise.all([request('PATCH','/api/v1/me/profile',{expectedVersion:current.version,displayName:'Quản trị thử A'},csrf),
    request('PATCH','/api/v1/me/profile',{expectedVersion:current.version,displayName:'Quản trị thử B'},csrf)]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});
test('B6 password/session commands use actual cookies, reject bad passwords and revoke every session after change',async()=>{
  await login('admin-a@example.invalid');
  const email=`auth-${crypto.randomUUID()}@example.invalid`;
  const invite=await db.transaction(tx=>app.get(InvitationsService).create(tx,schoolA,seedId('user:admin-a'),email,{roleId:seedId('role:A:REGISTRAR'),scopeType:'SCHOOL',validFrom:new Date().toISOString(),validUntil:'2027-06-01T00:00:00Z'}),{schoolId:schoolA});
  const mail=decryptMail((await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invite.id}`])).rows[0].encrypted_payload),token=new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token');
  let csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Nhân sự xác thực giả',newPassword:password},csrf);assert.equal(accepted.statusCode,200,accepted.body);
  jar.delete('edu_staff');csrf=await login(email);const oldCookie=jar.get('edu_staff');
  const oldSession=(await request('GET','/api/v1/me/sessions')).json().data.find(s=>s.current);assert.ok(oldSession);
  jar.delete('edu_staff');csrf=await login(email);
  const sessions=await request('GET','/api/v1/me/sessions');assert.equal(sessions.statusCode,200);assert.equal(sessions.json().data.length,2);assert.equal(sessions.json().data.filter(s=>s.current).length,1);
  const bad=await request('POST','/api/v1/auth/password/change',{currentPassword:'wrong-password-fixture',newPassword:resetPassword},csrf);assert.equal(bad.statusCode,401);assert.equal((await request('GET','/api/v1/me/profile')).statusCode,200);
  const revoked=await request('POST',`/api/v1/me/sessions/${oldSession.id}/revoke`,undefined,csrf);assert.equal(revoked.statusCode,200);assert.equal((await server.inject({method:'GET',url:'/api/v1/me/context',headers:{cookie:`edu_staff=${oldCookie}`}})).statusCode,401);
  const changed=await request('POST','/api/v1/auth/password/change',{currentPassword:password,newPassword:resetPassword},csrf);assert.equal(changed.statusCode,200,changed.body);assert.equal((await request('GET','/api/v1/me/context')).statusCode,401);
  jar.delete('edu_staff');await login(email,resetPassword);
  const declined=await db.transaction(tx=>app.get(InvitationsService).create(tx,schoolA,seedId('user:admin-a'),`decline-${crypto.randomUUID()}@example.invalid`,{roleId:seedId('role:A:REGISTRAR'),scopeType:'SCHOOL',validFrom:new Date().toISOString(),validUntil:'2027-06-01T00:00:00Z'}),{schoolId:schoolA});
  const declineMail=decryptMail((await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${declined.id}`])).rows[0].encrypted_payload),declineToken=new URLSearchParams(new URL(declineMail.url).hash.slice(1)).get('token');csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const decline=await request('POST','/api/v1/invitations/decline',{schoolSlug:'truong-thu-a',token:declineToken},csrf);assert.equal(decline.statusCode,200);assert.equal(decline.json().data.status,'DECLINED');
  const consumed=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token:declineToken,displayName:'Không được tạo',newPassword:password},csrf);assert.equal(consumed.statusCode,422);
});

test('BE21 parent runtime role cannot select raw student rows',async()=>{
  await assert.rejects(db.parent.query('SELECT id FROM app.students'),error=>error.code==='42501');
  const started=performance.now();
  assert.equal((await db.parent.query('SELECT id FROM app.parent_publication_items')).rowCount,0);
  const elapsed=performance.now()-started;assert.ok(elapsed<1000,'absent context must be denied before expensive publication/session joins');
  assert.equal((await db.parent.query('SELECT id FROM app.parent_document_items')).rowCount,0);
  const explain=await db.parent.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM app.parent_publication_items');
  const plan=explain.rows[0]['QUERY PLAN'][0];assert.equal(plan.Plan['Actual Rows'],0);assert.ok(plan['Execution Time']<1000);
  console.log(JSON.stringify({checkpoint:'parent-without-context',queryMs:Number(elapsed.toFixed(3)),planExecutionMs:plan['Execution Time'],planRows:plan.Plan['Actual Rows']}));
});
test('B0 health ready checks actual migrations, database and private storage',async()=>{
  const ready=await request('GET','/api/v1/health/ready');assert.equal(ready.statusCode,200);assert.equal(ready.json().data.status,'ok');
  const live=await request('GET','/api/v1/health/live');assert.equal(live.statusCode,200);
  assert.equal(ready.headers['cache-control'],'no-store');
});
test('B2 class lists use SQL scope and cross-school details deny before serialization',async()=>{
  const denied=(await db.transaction(tx=>tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity) VALUES($1,$2,$3,$4,'10A Không được phân công giả',10) RETURNING id",[schoolA,seedId('year:A'),seedId('grade:A'),'DENY-'+crypto.randomUUID()]),{schoolId:schoolA})).rows[0].id;
  await login('teacher-a@example.invalid');
  const classes=await request('GET',`/api/v1/schools/${schoolA}/classes?q=10A`);
  assert.equal(classes.statusCode,200);
  const ids=new Set(classes.json().data.map(row=>row.id));assert.ok(ids.has(classA));assert.ok(ids.has(classB));assert.equal(ids.has(denied),false);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${denied}`)).statusCode,404);
  const classDetail=await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}`);assert.equal(classDetail.statusCode,200);
  const cross=await request('GET',`/api/v1/schools/${schoolB}/classes/${seedId('class:B:10A1')}`);assert.equal(cross.statusCode,404);
  const year=await request('GET',`/api/v1/schools/${schoolA}/academic-years`);assert.equal(year.statusCode,200);
  const knownYear=await request('GET',`/api/v1/schools/${schoolA}/academic-years/${seedId('year:A')}`);assert.equal(knownYear.statusCode,200);
  assert.equal(knownYear.json().data.endsOn,'2027-06-01');
});
test('BE09 idempotent organization create/retry/concurrency performs one write',async()=>{
  const csrf=await login('admin-a@example.invalid');
  const key=crypto.randomUUID(),code=`TEST-${crypto.randomBytes(4).toString('hex')}`;
  const url=`/api/v1/schools/${schoolA}/academic-years`;
  const body={code,name:'Năm kiểm thử idempotency',...await unusedYearRange(schoolA)};
  const results=await Promise.all([request('POST',url,body,csrf,{'idempotency-key':key}),request('POST',url,body,csrf,{'idempotency-key':key})]);
  assert.deepEqual(results.map(r=>r.statusCode),[201,201]);assert.equal(results[0].json().data.id,results[1].json().data.id);
  const conflict=await request('POST',url,{...body,name:'Khác nội dung'},csrf,{'idempotency-key':key});assert.equal(conflict.statusCode,409);
  assert.equal(conflict.json().code,'IDEMPOTENCY_CONFLICT');
  const count=await db.transaction(async tx=>(await tx.query('SELECT id FROM app.academic_years WHERE school_id=$1 AND code=$2',[schoolA,code])).rowCount,{schoolId:schoolA});assert.equal(count,1);
});
test('B2 required idempotency, class capacity/reference validation and version conflicts',async()=>{
  const csrf=await login('admin-a@example.invalid');
  const url=`/api/v1/schools/${schoolA}/classes`;
  const body={yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`TEST-${crypto.randomBytes(4).toString('hex')}`,name:'Lớp thử',capacity:30};
  const missing=await request('POST',url,body,csrf);assert.equal(missing.statusCode,422);
  const cross=await request('POST',url,{...body,gradeLevelId:seedId('grade:B')},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(cross.statusCode,404);
  const created=await request('POST',url,body,csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(created.statusCode,201);
  const cls=created.json().data;assert.equal(cls.status,'DRAFT');
  const activated=await request('POST',`${url}/${cls.id}/activate`,{expectedVersion:cls.version},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(activated.statusCode,422);
  const results=await Promise.all([request('PATCH',`${url}/${cls.id}`,{expectedVersion:cls.version,name:'Lớp thử 1'},csrf,{'idempotency-key':crypto.randomUUID()}),
    request('PATCH',`${url}/${cls.id}`,{expectedVersion:cls.version,name:'Lớp thử 2'},csrf,{'idempotency-key':crypto.randomUUID()})]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const current=(await request('GET',`${url}/${classA}`)).json().data;
  const capacity=await request('PATCH',`${url}/${classA}`,{expectedVersion:current.version,capacity:1},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(capacity.statusCode,422);
});
test('B2 signed cursor rejects scope/filter modification and delivers distinct pages',async()=>{
  await login('admin-a@example.invalid');
  const url=`/api/v1/schools/${schoolA}/classes?limit=1`;
  const first=await request('GET',url);assert.equal(first.statusCode,200);assert.equal(first.json().page.hasMore,true);
  const cursor=first.json().page.nextCursor;
  const second=await request('GET',url+'&cursor='+encodeURIComponent(cursor));assert.equal(second.statusCode,200);
  assert.notEqual(first.json().data[0].id,second.json().data[0].id);
  const tampered=await request('GET',url+'&q=changed&cursor='+encodeURIComponent(cursor));assert.equal(tampered.statusCode,422);
  const tenant=await request('GET',`/api/v1/schools/${schoolB}/classes?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(tenant.statusCode,404);
});
test('B2 subject student projection omits family/internal notes and denies guardians',async()=>{
  await login('teacher-a@example.invalid');
  const subjectStudent=seedId('student:A:10A2:1'),homeStudent=seedId('student:A:10A1:1');
  const minimal=await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/students/${subjectStudent}`);
  assert.equal(minimal.statusCode,200);
  const dto=minimal.json().data;
  for(const field of ['guardians','relationships','internalNote'])assert.equal(Object.hasOwn(dto,field),false);
  assert.equal(Object.hasOwn(dto.student,'dateOfBirth'),false);
  const full=await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}/students/${homeStudent}`);assert.equal(full.statusCode,200);
  assert.equal(full.json().data.guardians.length,3);assert.match(full.json().data.internalNote,/nội bộ/);
  const cross=await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/students/${homeStudent}`);assert.equal(cross.statusCode,404);
  const roster=await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/students`);assert.equal(roster.statusCode,200);assert.equal(roster.json().data.length,6);
  const teacherCsrf=await login('teacher-b@example.invalid');
  const guardians=await request('GET',`/api/v1/schools/${schoolA}/guardians`);assert.equal(guardians.statusCode,403);
  const denied=await request('POST',`/api/v1/schools/${schoolA}/relationships/${seedId('relationship:A:1')}/verify`,
    {expectedVersion:1,canReceiveInfo:true,verificationNote:'Thử không có quyền'},teacherCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(denied.statusCode,403);
});
test('B2 guardian create does not merge matching phone, relationships start unverified',async()=>{
  const csrf=await login('admin-a@example.invalid');
  const url=`/api/v1/schools/${schoolA}/guardians`;
  const one=await request('POST',url,{fullName:'Giám hộ bổ sung giả 1',phone:'0900000000'},csrf,{'idempotency-key':crypto.randomUUID()});
  const two=await request('POST',url,{fullName:'Giám hộ bổ sung giả 2',phone:'0900000000'},csrf,{'idempotency-key':crypto.randomUUID()});
  assert.equal(one.statusCode,201);assert.equal(two.statusCode,201);assert.notEqual(one.json().data.id,two.json().data.id);
  const rel=await request('POST',`/api/v1/schools/${schoolA}/relationships`,{studentId:seedId('student:A:10A1:2'),guardianId:one.json().data.id,relationshipLabel:'Giám hộ'},csrf,{'idempotency-key':crypto.randomUUID()});
  assert.equal(rel.statusCode,201);assert.equal(rel.json().data.status,'UNVERIFIED');assert.equal(rel.json().data.canReceiveInfo,false);
  const verified=await request('POST',`/api/v1/schools/${schoolA}/relationships/${rel.json().data.id}/verify`,
    {expectedVersion:rel.json().data.version,canReceiveInfo:true,verificationNote:'Xác minh quan hệ giả phục vụ kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});
  assert.equal(verified.statusCode,200);assert.equal(verified.json().data.status,'VERIFIED');assert.equal(verified.json().data.canReceiveInfo,true);
});
test('BE07 existing identity invitation requires its session and preserves password/other school',async()=>{
  const userId=seedId('user:teacher-b');
  const before=(await db.app.query('SELECT password_hash,version FROM identity.users WHERE id=$1',[userId])).rows[0];
  const invitation=await db.transaction(tx=>app.get(InvitationsService).create(tx,schoolB,seedId('user:admin-b'),
    'teacher-b@example.invalid',{roleId:seedId('role:B:SCHOOL_ADMIN'),scopeType:'SCHOOL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2027-06-01T00:00:00Z'}),{schoolId:schoolB});
  const mail=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.id}`])).rows[0];
  const payload=decryptMail(mail.encrypted_payload),fragment=new URL(payload.url).hash;
  const token=new URLSearchParams(fragment.slice(1)).get('token');
  assert.equal(mail.encrypted_payload.includes(token),false);
  await login('teacher-a@example.invalid');let csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const wrong=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(wrong.statusCode,403);
  const wrongInspection=await request('POST','/api/v1/invitations/inspect',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(wrongInspection.statusCode,200);assert.equal(wrongInspection.json().data.signedInAsInvited,false);
  await login('teacher-b@example.invalid');csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const inspect=await request('POST','/api/v1/invitations/inspect',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(inspect.statusCode,200,inspect.body);
  const inspection=inspect.json().data;assert.equal(inspection.schoolId,schoolB);assert.equal(inspection.schoolStatus,'ACTIVE');assert.equal(inspection.requiresLogin,true);assert.equal(inspection.signedInAsInvited,true);assert.ok(inspection.roleLabels.length);assert.equal(Object.hasOwn(inspection,'existingUserId'),false);assert.equal(Object.hasOwn(inspection,'workPhone'),false);assert.equal(Object.hasOwn(inspection,'passwordHash'),false);
  const reset=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-b',token,newPassword:'Rejected-new-password'},csrf);assert.equal(reset.statusCode,422);
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(accepted.statusCode,200);
  const replay=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(replay.statusCode,200);
  const after=(await db.app.query('SELECT password_hash,version FROM identity.users WHERE id=$1',[userId])).rows[0];
  assert.equal(before.password_hash,after.password_hash);assert.equal(before.version,after.version);
  const context=(await request('GET','/api/v1/me/context')).json().data;
  assert.equal(context.memberships.some(m=>m.schoolId===schoolA),true);assert.equal(context.memberships.some(m=>m.schoolId===schoolB),true);
});
test('B1 password reset token is encrypted, single-use and revokes all prior sessions',async()=>{
  await login('admin-b@example.invalid');const oldCookie=jar.get('edu_staff');
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const forgot=await request('POST','/api/v1/auth/password/forgot',{email:'admin-b@example.invalid'},csrf);assert.equal(forgot.statusCode,200);
  const id=forgot.json().data.id;
  const mail=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`reset:${id}`])).rows[0];
  const token=new URLSearchParams(new URL(decryptMail(mail.encrypted_payload).url).hash.slice(1)).get('token');
  assert.equal(mail.encrypted_payload.includes(token),false);
  const reset=await request('POST','/api/v1/auth/password/reset',{token,password:resetPassword},csrf);assert.equal(reset.statusCode,200);
  const again=await request('POST','/api/v1/auth/password/reset',{token,password:resetPassword},csrf);assert.equal(again.statusCode,422);
  const oldRead=await server.inject({method:'GET',url:'/api/v1/me/context',headers:{cookie:`edu_staff=${oldCookie}`}});assert.equal(oldRead.statusCode,401);
  const unknown=await request('POST','/api/v1/auth/password/forgot',{email:`absent-${crypto.randomUUID()}@example.invalid`},csrf);
  assert.equal(unknown.statusCode,200);assert.equal(unknown.json().data.status,forgot.json().data.status);
});

test('B2 staff delegation stays within the ceiling, custom class scope and immediate revocation',async()=>{
  let csrf=await login('admin-a@example.invalid');
  const post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const members=await request('GET',`/api/v1/schools/${schoolA}/members`);assert.equal(members.statusCode,200);
  const forbidden=await post('roles',{code:`bad-${crypto.randomUUID()}`,label:'Không được cấp',permissions:[{action:'platform.settings',scopes:['SCHOOL']}]});
  assert.equal(forbidden.statusCode,403);
  const role=await post('roles',{code:`review-${crypto.randomUUID()}`,label:'Đọc gia đình lớp được giao',permissions:[{action:'guardian.read',scopes:['CLASS']}]});
  assert.equal(role.statusCode,201);
  const proposal={memberId:seedId('member:A:teacher-b'),roleId:role.json().data.id,scopeType:'CLASS',classId:classB,
    validFrom:'2026-09-01T00:00:00Z',validUntil:'2027-06-01T00:00:00Z'};
  const preview=await post('grants/preview',proposal);assert.equal(preview.statusCode,200);assert.equal(preview.json().data.allowed,true);
  const grant=await post('grants',proposal);assert.equal(grant.statusCode,201);
  await login('teacher-b@example.invalid');const teacherCookie=cookies();
  const guardians=await request('GET',`/api/v1/schools/${schoolA}/guardians`);assert.equal(guardians.statusCode,200);
  // The grant cannot be combined with the teacher's unrelated subject class.
  const other=await request('GET',`/api/v1/schools/${schoolA}/guardians/${seedId('guardian:A:1')}`);assert.equal(other.statusCode,404);
  jar.delete('edu_staff'); // A different browser session must remain valid.
  csrf=await login('admin-a@example.invalid');
  const revoked=await post(`grants/${grant.json().data.id}/revoke`,{expectedVersion:grant.json().data.version,reason:'Thu hồi quyền trong kiểm thử'});
  assert.equal(revoked.statusCode,200);
  const stale=await server.inject({method:'GET',url:`/api/v1/schools/${schoolA}/guardians`,headers:{cookie:teacherCookie}});assert.equal(stale.statusCode,403);
  const ownGrant=await db.transaction(tx=>tx.query('SELECT id,version FROM app.role_grants WHERE school_id=$1 AND id=$2',
    [schoolA,seedId('grant:A:admin-a:admin')]),{schoolId:schoolA});
  assert.ok(ownGrant.rows[0]);
  // Retained runs can contain other accepted synthetic admins. Exercise the
  // actual last-admin SQL guard in an isolated transaction and roll it back.
  await db.transaction(async tx=>{
    await tx.query(`UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id<>$2
      AND role_id=$3 AND revoked_at IS NULL`,[schoolA,ownGrant.rows[0].id,seedId('role:A:SCHOOL_ADMIN')]);
    await assert.rejects(app.get(StaffService).lastAdmin(tx,schoolA,undefined,ownGrant.rows[0].id),error=>error.code==='LAST_ADMIN_REQUIRED');
    throw new Error('ROLLBACK_TEST');
  },{schoolId:schoolA}).catch(error=>assert.equal(error.message,'ROLLBACK_TEST'));
  const cls=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`staff-${crypto.randomUUID()}`,name:'Lớp phân công giả',capacity:8});
  assert.equal(cls.statusCode,201);
  const assignmentBody={classId:cls.json().data.id,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:'2026-09-01',endsOn:'2027-06-01',reason:'Khởi tạo phân công lịch sử kiểm thử'};
  const [a,b]=await Promise.all([post('assignments',assignmentBody),post('assignments',assignmentBody)]);
  assert.deepEqual([a.statusCode,b.statusCode].sort(),[201,409]);
  const assignment=(a.statusCode===201?a:b).json().data;
  const teacherRead=await server.inject({method:'GET',url:`/api/v1/schools/${schoolA}/classes/${cls.json().data.id}`,headers:{cookie:teacherCookie}});assert.equal(teacherRead.statusCode,200);
  const revoke=await post(`assignments/${assignment.id}/revoke`,{expectedVersion:assignment.version,reason:'Kết thúc phân công kiểm thử'});assert.equal(revoke.statusCode,200);
  const after=await server.inject({method:'GET',url:`/api/v1/schools/${schoolA}/classes/${cls.json().data.id}`,headers:{cookie:teacherCookie}});assert.equal(after.statusCode,404);
  const persisted=await db.transaction(tx=>tx.query('SELECT revoked_at FROM app.role_grants WHERE school_id=$1 AND id=$2',[schoolA,assignment.roleGrantId]),{schoolId:schoolA});
  assert.ok(persisted.rows[0].revoked_at);
});

test('B2 transfers serialize capacity, handover removes the old teacher and rollover binds its preview',async()=>{
  const csrf=await login('admin-a@example.invalid');
  const post=(path,body,key=crypto.randomUUID())=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':key});
  const makeClass=async(capacity,yearId=seedId('year:A'))=>{
    const r=await post('classes',{yearId,gradeLevelId:seedId('grade:A'),code:`tr-${crypto.randomUUID()}`,name:'Lớp chuyển giả',capacity});
    assert.equal(r.statusCode,201);return r.json().data;
  };
  const from=await makeClass(2),to=await makeClass(1),students=[];
  for(let i=0;i<2;i++){
    const r=await post('students',{studentCode:`TR-${crypto.randomUUID()}`,fullName:'Học sinh chuyển lớp giả',initialClassId:from.id,startsOn:'2026-09-01'});
    assert.equal(r.statusCode,201);students.push(r.json().data);
  }
  const transfers=[];
  for(const student of students){
    const enrollment=(await request('GET',`/api/v1/schools/${schoolA}/students/${student.id}/enrollments`)).json().data[0];
    const r=await post('transfers',{studentId:student.id,fromEnrollmentId:enrollment.id,toClassId:to.id,effectiveOn:'2026-09-30',reason:'Chuyển lớp trong kiểm thử'});
    assert.equal(r.statusCode,201);assert.equal(r.json().data.status,'SUBMITTED');transfers.push(r.json().data);
  }
  const approved=await Promise.all(transfers.map(t=>post(`transfers/${t.id}/approve`,{expectedVersion:t.version})));
  assert.deepEqual(approved.map(r=>r.statusCode).sort(),[200,422]);
  const winner=approved.findIndex(r=>r.statusCode===200),loser=1-winner;
  assert.equal(approved[winner].json().data.status,'APPLIED');assert.equal(approved[loser].json().code,'CLASS_CAPACITY_EXCEEDED');
  const enrollmentHistory=(await request('GET',`/api/v1/schools/${schoolA}/students/${students[winner].id}/enrollments`)).json().data;
  assert.equal(enrollmentHistory.length,2);
  assert.equal(enrollmentHistory.find(e=>e.classId===from.id).endsOn,'2026-09-30');
  assert.equal(enrollmentHistory.find(e=>e.classId===to.id).startsOn,'2026-09-30');
  const rejected=await post(`transfers/${transfers[loser].id}/reject`,{expectedVersion:transfers[loser].version,reason:'Lớp nhận đã đủ sĩ số'});assert.equal(rejected.statusCode,200);
  const unchanged=(await request('GET',`/api/v1/schools/${schoolA}/students/${students[loser].id}/enrollments`)).json().data;
  assert.equal(unchanged.length,1);assert.equal(unchanged[0].endsOn,'2027-06-01');

  // New synthetic identities are created through the actual invite/accept APIs.
  const role=await post('roles',{code:`base-${crypto.randomUUID()}`,label:'Nhân sự kiểm thử',permissions:[{action:'school.read',scopes:['SCHOOL']}]});assert.equal(role.statusCode,201);
  const people=[];
  for(let i=0;i<2;i++){
    const email=`handover-${crypto.randomUUID()}@example.invalid`;
    const invitation=await post('invitations',{email,roleId:role.json().data.id,validFrom:'2026-09-01T00:00:00Z'});assert.equal(invitation.statusCode,201);
    const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0].encrypted_payload;
    const token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token');
    const anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
    const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:`Nhân sự bàn giao giả ${i}`,newPassword:password},anonymousCsrf);
    assert.equal(accepted.statusCode,200);
    const member=await db.transaction(tx=>tx.query('SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA});
    people.push({email,memberId:member.rows[0].id});
  }
  const handoverClass=await makeClass(10);
  const assignment=await post('assignments',{classId:handoverClass.id,memberId:people[0].memberId,kind:'HOMEROOM',startsOn:'2026-09-01',endsOn:'2027-06-01',reason:'Khởi tạo phân công lịch sử kiểm thử'});assert.equal(assignment.statusCode,201);
  const handover=await post('handovers',{classId:handoverClass.id,fromAssignmentId:assignment.json().data.id,toMemberId:people[1].memberId,effectiveOn:'2026-09-30',reason:'Bàn giao kiểm thử có lịch sử'});assert.equal(handover.statusCode,201);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');
  await login(people[0].email);const oldTeacherCookies=cookies();
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${handoverClass.id}`)).statusCode,200);
  jar.set('edu_staff',adminCookie);
  const handoverApproved=await post(`handovers/${handover.json().data.id}/approve`,{expectedVersion:handover.json().data.version});assert.equal(handoverApproved.statusCode,200);assert.equal(handoverApproved.json().data.status,'APPLIED');
  const denied=await server.inject({method:'GET',url:`/api/v1/schools/${schoolA}/classes/${handoverClass.id}`,headers:{cookie:oldTeacherCookies}});assert.equal(denied.statusCode,404);
  const stored=await db.transaction(tx=>tx.query('SELECT member_id,starts_on,ends_on FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2 ORDER BY starts_on',[schoolA,handoverClass.id]),{schoolId:schoolA});
  assert.equal(stored.rows.length,2);assert.equal(stored.rows[0].ends_on,stored.rows[1].starts_on);

  const year=await post('academic-years',{code:`NEXT-${crypto.randomUUID()}`,name:'Năm mới giả',...await unusedYearRange(schoolA)});assert.equal(year.statusCode,201,year.body);
  const target=await makeClass(1,year.json().data.id);
  const plan=[{studentId:students[winner].id,fromClassId:to.id,toClassId:target.id,decision:'PROMOTED'}];
  const batch=await post(`academic-years/${seedId('year:A')}/rollovers`,{targetYearId:year.json().data.id,plan});assert.equal(batch.statusCode,201);
  const validated=await post(`rollovers/${batch.json().data.id}/validate`,{expectedVersion:batch.json().data.version});assert.equal(validated.statusCode,200);
  let preview=validated.json().data;
  const badHash=await post(`rollovers/${preview.id}/commit`,{expectedVersion:preview.version,previewHash:'0'.repeat(64)});assert.equal(badHash.statusCode,409);
  const edit=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${target.id}`,{expectedVersion:target.version,name:'Lớp nhận đổi sau preview'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edit.statusCode,200);
  const stale=await post(`rollovers/${preview.id}/commit`,{expectedVersion:preview.version,previewHash:preview.planHash});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'STALE_PREVIEW');
  const refreshed=await post(`rollovers/${preview.id}/validate`,{expectedVersion:preview.version});assert.equal(refreshed.statusCode,200);preview=refreshed.json().data;
  const key=crypto.randomUUID(),body={expectedVersion:preview.version,previewHash:preview.planHash};
  const commit=await post(`rollovers/${preview.id}/commit`,body,key);assert.equal(commit.statusCode,200);assert.equal(commit.json().data.status,'APPLIED');
  const replay=await post(`rollovers/${preview.id}/commit`,body,key);assert.equal(replay.statusCode,200);assert.deepEqual(replay.json().data,commit.json().data);
  const history=(await request('GET',`/api/v1/schools/${schoolA}/students/${students[winner].id}/enrollments`)).json().data;
  assert.equal(history.filter(e=>e.yearId===year.json().data.id).length,1);
  assert.equal(history.find(e=>e.classId===to.id).endsOn,'2027-06-01');
  const counts=await db.transaction(tx=>tx.query('SELECT (SELECT count(*) FROM app.teaching_assignments WHERE school_id=$1 AND year_id=$2)::int AS assignments,(SELECT count(*) FROM app.parent_access_links WHERE school_id=$1 AND year_id=$2)::int AS links',[schoolA,year.json().data.id]),{schoolId:schoolA});
  assert.deepEqual(counts.rows[0],{assignments:0,links:0});
});

test('B2 scoped guardian creation cannot acquire an unrelated family through relationship IDs',async()=>{
  let csrf=await login('admin-a@example.invalid');
  const post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const unrelated=await post('guardians',{fullName:'Gia đình lớp khác giả',phone:'0911111111'});assert.equal(unrelated.statusCode,201);
  const link=await post('relationships',{studentId:seedId('student:A:10A2:3'),guardianId:unrelated.json().data.id,relationshipLabel:'Giám hộ'});assert.equal(link.statusCode,201);
  csrf=await login('teacher-a@example.invalid');
  const denied=await post('relationships',{studentId:seedId('student:A:10A1:3'),guardianId:unrelated.json().data.id,relationshipLabel:'Không được tự mở quyền'});assert.equal(denied.statusCode,404);
  const wrongClass=await post(`guardians?classId=${classB}`,{fullName:'Không được tạo theo quyền bộ môn'});assert.equal(wrongClass.statusCode,404);
  const fresh=await post(`guardians?classId=${classA}`,{fullName:'Giám hộ GVCN tạo giả',phone:'0911111111'});assert.equal(fresh.statusCode,201);
  const rel=await post('relationships',{studentId:seedId('student:A:10A1:3'),guardianId:fresh.json().data.id,relationshipLabel:'Giám hộ'});assert.equal(rel.statusCode,201);
  assert.equal(rel.json().data.status,'UNVERIFIED');assert.equal(rel.json().data.canReceiveInfo,false);
});

test('B2/B5 uploads remain private until worker processing, leases serialize and local mail erases encrypted secrets',async()=>{
  const csrf=await login('admin-a@example.invalid');
  async function upload(bytes,name,type,purpose='CLASS_DOCUMENT',classId=classA,key=crypto.randomUUID()){
    const form=new FormData();form.append('purpose',purpose);if(classId)form.append('classId',classId);form.append('file',new Blob([bytes],{type}),name);
    const prepared=new Request(origin,{method:'POST',body:form});
    return server.inject({method:'POST',url:`/api/v1/schools/${schoolA}/files`,headers:{origin,cookie:cookies(),'x-csrf-token':csrf,'idempotency-key':key,'content-type':prepared.headers.get('content-type')},payload:Buffer.from(await prepared.arrayBuffer())});
  }
  const image=await sharp({create:{width:10,height:10,channels:3,background:'#3377aa'}}).withMetadata().png().toBuffer();
  const key=crypto.randomUUID(),name=`../../ảnh-${key}.png`,imageResponse=await upload(image,name,'image/png','CLASS_DOCUMENT',classA,key);
  assert.equal(imageResponse.statusCode,200);let file=imageResponse.json().data;assert.equal(file.status,'QUARANTINED');assert.equal(file.originalName.includes('/'),false);
  for(const secret of ['objectKey','schoolId','purpose','uploadClassId'])assert.equal(Object.hasOwn(file,secret),false);
  const replay=await upload(image,name,'image/png','CLASS_DOCUMENT',classA,key);assert.equal(replay.statusCode,200);assert.equal(replay.json().data.id,file.id);
  const blocked=await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}/download`);assert.equal(blocked.statusCode,409);
  const dangerous=await upload(Buffer.from('<html><script>bad()</script></html>'),'fake.png','image/png');assert.equal(dangerous.statusCode,200);
  const worker1=new WorkerRunner(),worker2=new WorkerRunner();
  try{
    assert.equal((await worker1.db.app.query('SELECT current_user AS role')).rows[0].role,'edu_worker');
    const [j1,j2]=await Promise.all([worker1.claim(schoolA),worker2.claim(schoolA)]);assert.ok(j1);assert.ok(j2);assert.notEqual(j1.id,j2.id);
    await assert.rejects(worker2.db.transaction(tx=>worker2.guard(tx,j1),{schoolId:schoolA}),error=>error.code==='JOB_LEASE_LOST');
    await Promise.all([worker1.run(j1),worker2.run(j2)]);
    await drainSchool(worker1);
    file=(await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}`)).json().data;
    assert.equal(file.status,'READY');assert.equal(file.scanStatus,'NOT_SCANNED');assert.equal(file.contentType,'image/png');
    const download=await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}/download`);assert.equal(download.statusCode,200);
    assert.equal((await sharp(download.rawPayload).metadata()).exif,undefined);
    assert.equal(download.headers['cache-control'],'no-store');assert.match(download.headers['content-disposition'],/^attachment/);
    const rejected=(await request('GET',`/api/v1/schools/${schoolA}/files/${dangerous.json().data.id}`)).json().data;
    assert.equal(rejected.status,'REJECTED');assert.equal(rejected.rejectionCode,'FILE_TYPE_REJECTED');
    const failed=await db.transaction(tx=>tx.query("SELECT status,attempts FROM app.outbox_events WHERE school_id=$1 AND dedupe_key=$2",[schoolA,`file:${dangerous.json().data.id}`]),{schoolId:schoolA});assert.deepEqual(failed.rows[0],{status:'FAILED',attempts:5});
    const cross=await request('GET',`/api/v1/schools/${schoolB}/files/${file.id}/download`);assert.equal(cross.statusCode,404);
    const link=await request('POST',`/api/v1/schools/${schoolA}/file-links`,{fileId:file.id,classId:classA,shareWithGuardian:false},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(link.statusCode,201);
    const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');
    await login('teacher-b@example.invalid');
    const classDocs=await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}/files?q=${encodeURIComponent(file.originalName)}`);assert.equal(classDocs.statusCode,200);assert.equal(classDocs.json().data.some(f=>f.id===file.id),true);
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}/download`)).statusCode,200);
    jar.set('edu_staff',adminCookie);
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Import');sheet.addRow(['code','name']);sheet.addRow(['HS-FAKE','Nguyễn Văn Giả']);
    const xlsx=await upload(Buffer.from(await workbook.xlsx.writeBuffer()),'students.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','IMPORT',null);
    assert.equal(xlsx.statusCode,200);const job=await worker1.claim(schoolA);await worker1.run(job);
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/files/${xlsx.json().data.id}`)).json().data.status,'READY');
    const csv=await upload(Buffer.from('code,name\nHS-FAKE,Nguyễn Văn Giả\n'),'students.csv','text/csv','IMPORT',null);assert.equal(csv.statusCode,200);
    await worker1.run(await worker1.claim(schoolA));
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/files/${csv.json().data.id}`)).json().data.status,'READY');
    sheet.getCell('A2').value={formula:'1+1',result:2};
    const formula=await upload(Buffer.from(await workbook.xlsx.writeBuffer()),'formula.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','IMPORT',null);assert.equal(formula.statusCode,200);
    await worker1.run(await worker1.claim(schoolA));
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/files/${formula.json().data.id}`)).json().data.rejectionCode,'XLSX_ACTIVE_CONTENT_REJECTED');
    const invitation=await request('POST',`/api/v1/schools/${schoolA}/invitations`,{email:`mail-${crypto.randomUUID()}@example.invalid`,roleId:seedId('role:A:SCHOOL_ADMIN'),validFrom:'2026-09-01T00:00:00Z'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(invitation.statusCode,201);
    let mail;
    for(let attempt=0;attempt<100;attempt++){
      await worker1.processOnce();mail=(await db.app.query('SELECT id,status,delivery_mode,encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0];
      if(mail.status==='SENT')break;
    }
    assert.equal(mail.status,'SENT');assert.equal(mail.delivery_mode,'FILE');assert.equal(mail.encrypted_payload,'');
    const eml=await fs.readFile(path.join(process.env.LOCAL_MAIL_ROOT,`${mail.id}.eml`),'utf8');assert.match(eml,/LOCAL_FILE/);assert.match(eml,/#token=/);
    const stat=await fs.stat(path.join(process.env.LOCAL_MAIL_ROOT,`${mail.id}.eml`));assert.equal(stat.mode&0o077,0);
    const archived=await request('POST',`/api/v1/schools/${schoolA}/files/${file.id}/archive`,{expectedVersion:file.version,reason:'Lưu trữ tệp kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(archived.statusCode,200);
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}/download`)).statusCode,409);
  }finally{await Promise.all([worker1.close(),worker2.close()]);}
});

async function drainSchool(worker){for(let i=0;i<100;i++){const job=await worker.claim(schoolA);if(!job)return;await worker.run(job);}throw new Error('Test queue did not drain');}
async function importCsv(csrf,worker,text,kind,classId){
  const form=new FormData();form.append('purpose','IMPORT');form.append('file',new Blob([text],{type:'text/csv'}),'import.csv');
  const prepared=new Request(origin,{method:'POST',body:form});
  const upload=await server.inject({method:'POST',url:`/api/v1/schools/${schoolA}/files`,headers:{origin,cookie:cookies(),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':prepared.headers.get('content-type')},payload:Buffer.from(await prepared.arrayBuffer())});
  assert.equal(upload.statusCode,200,upload.body);await drainSchool(worker);
  const created=await request('POST',`/api/v1/schools/${schoolA}/imports`,{kind,fileId:upload.json().data.id,yearId:seedId('year:A'),...(classId?{classId}:{})},csrf,{'idempotency-key':crypto.randomUUID()});
  assert.equal(created.statusCode,201,created.body);await drainSchool(worker);
  const job=(await request('GET',`/api/v1/schools/${schoolA}/imports/${created.json().data.id}`)).json().data;
  assert.equal(job.status,'UPLOADED');assert.ok(job.columns.length);return job;
}
async function validateCsv(csrf,worker,job,mapping,mode='ADD_ONLY'){
  const response=await request('POST',`/api/v1/schools/${schoolA}/imports/${job.id}/validate`,{expectedVersion:job.version,mapping,mode},csrf,{'idempotency-key':crypto.randomUUID()});
  assert.equal(response.statusCode,202,response.body);await drainSchool(worker);
  const current=(await request('GET',`/api/v1/schools/${schoolA}/imports/${job.id}`)).json().data;
  assert.equal(current.status,'READY',JSON.stringify(current));assert.ok(current.previewHash);return current;
}
async function commitCsv(csrf,worker,job){
  const key=crypto.randomUUID(),body={expectedVersion:job.version,previewHash:job.previewHash};
  const first=await request('POST',`/api/v1/schools/${schoolA}/imports/${job.id}/commit`,body,csrf,{'idempotency-key':key});assert.equal(first.statusCode,202,first.body);
  const replay=await request('POST',`/api/v1/schools/${schoolA}/imports/${job.id}/commit`,body,csrf,{'idempotency-key':key});assert.equal(replay.statusCode,202);assert.deepEqual(replay.json().data,first.json().data);
  await drainSchool(worker);return (await request('GET',`/api/v1/schools/${schoolA}/imports/${job.id}`)).json().data;
}
const studentMapping=['studentCode','fullName','dateOfBirth','guardianName','guardianPhone'].map(name=>({sourceColumn:name,targetField:name}));
test('B2 imports parse real CSV, bind stale previews, avoid name/phone merges and retain invalid rows safely',async()=>{
  const csrf=await login('admin-a@example.invalid'),worker=new WorkerRunner(),prefix=crypto.randomUUID();
  try{
    const cls=await request('POST',`/api/v1/schools/${schoolA}/classes`,{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`im-${prefix}`,name:'Lớp import giả',capacity:4},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(cls.statusCode,201);let target=cls.json().data;
    const text=`studentCode,fullName,dateOfBirth,guardianName,guardianPhone\n${prefix}-1,Cùng tên giả,30/09/2011,Cùng liên hệ giả,0912222222\n${prefix}-2,Cùng tên giả,2011-09-30,Cùng liên hệ giả,0912222222\n`;
    let job=await importCsv(csrf,worker,text,'STUDENTS',target.id);job=await validateCsv(csrf,worker,job,studentMapping);
    assert.deepEqual(job.summary,{added:2,updated:0,skipped:0,invalid:0,processed:0});
    const edited=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${target.id}`,{expectedVersion:target.version,name:'Đổi sau preview'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200);target=edited.json().data;
    const stale=await request('POST',`/api/v1/schools/${schoolA}/imports/${job.id}/commit`,{expectedVersion:job.version,previewHash:job.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'STALE_PREVIEW');
    job=await validateCsv(csrf,worker,job,studentMapping);job=await commitCsv(csrf,worker,job);assert.equal(job.status,'COMPLETED');assert.equal(job.summary.processed,2);
    const saved=await db.transaction(tx=>tx.query(`SELECT s.id,s.date_of_birth,g.id AS guardian_id,r.status,r.can_receive_info FROM app.students s
      JOIN app.guardian_relationships r ON r.school_id=s.school_id AND r.student_id=s.id JOIN app.guardians g ON g.school_id=r.school_id AND g.id=r.guardian_id
      WHERE s.school_id=$1 AND s.student_code=ANY($2)`,[schoolA,[`${prefix}-1`,`${prefix}-2`]]),{schoolId:schoolA});
    assert.equal(saved.rowCount,2);assert.notEqual(saved.rows[0].id,saved.rows[1].id);assert.notEqual(saved.rows[0].guardian_id,saved.rows[1].guardian_id);
    for(const row of saved.rows){assert.equal(row.date_of_birth,'2011-09-30');assert.equal(row.status,'UNVERIFIED');assert.equal(row.can_receive_info,false);}
    let duplicate=await importCsv(csrf,worker,text,'STUDENTS',target.id);duplicate=await validateCsv(csrf,worker,duplicate,studentMapping);assert.equal(duplicate.summary.skipped,2);
    duplicate=await commitCsv(csrf,worker,duplicate);assert.equal(duplicate.status,'COMPLETED');assert.equal(duplicate.summary.added,0);
    let invalid=await importCsv(csrf,worker,`studentCode,fullName,dateOfBirth,guardianName,guardianPhone\n,=cmd,31/02/2011,,\nBAD-${prefix},Ngày sinh lỗi giả,31/02/2011,,\nVALID-${prefix},Chưa được nhập vì batch lỗi,2011-01-01,,\n`,'STUDENTS',target.id);
    invalid=await validateCsv(csrf,worker,invalid,studentMapping);assert.equal(invalid.summary.invalid,2);assert.equal(invalid.summary.added,1);
    const rows=await request('GET',`/api/v1/schools/${schoolA}/imports/${invalid.id}/rows?limit=1`);assert.equal(rows.statusCode,200);assert.equal(rows.json().data[0].status,'INVALID');assert.equal(rows.json().data[0].errors[0].field,'studentCode');
    const errors=await request('GET',`/api/v1/schools/${schoolA}/imports/${invalid.id}/errors-file`);assert.equal(errors.statusCode,200);assert.match(errors.body,/'=cmd/);
    const blocked=await request('POST',`/api/v1/schools/${schoolA}/imports/${invalid.id}/commit`,{expectedVersion:invalid.version,previewHash:invalid.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(blocked.statusCode,422);
    assert.equal((await db.transaction(tx=>tx.query('SELECT id FROM app.students WHERE school_id=$1 AND student_code=$2',[schoolA,`VALID-${prefix}`]),{schoolId:schoolA})).rowCount,0);
    const cancelled=await request('POST',`/api/v1/schools/${schoolA}/imports/${invalid.id}/cancel`,{expectedVersion:invalid.version,reason:'Huỷ import lỗi kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(cancelled.statusCode,200);assert.equal(cancelled.json().data.status,'CANCELLED');
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/imports?limit=1`)).statusCode,200);
    assert.equal((await request('GET',`/api/v1/schools/${schoolB}/imports/${job.id}`)).statusCode,404);
  }finally{await worker.close();}
});

test('B2/B5 timetable import checks assignments and overlapping slots, creates only a draft and deduplicates retries',async()=>{
  const csrf=await login('admin-a@example.invalid'),worker=new WorkerRunner();
  try{
    const mapping=['weekday','slot','startsAt','endsAt','subjectCode','staffCode'].map(name=>({sourceColumn:name,targetField:name}));
    const text='weekday,slot,startsAt,endsAt,subjectCode,staffCode\n2,1,07:00,07:45,MATH,TEST-teacher-b\n';
    let job=await importCsv(csrf,worker,text,'TIMETABLE',classA);job=await validateCsv(csrf,worker,job,mapping);assert.equal(job.summary.invalid,0);
    job=await commitCsv(csrf,worker,job);assert.equal(job.status,'COMPLETED');
    // A previous retained test run may already have applied this exact source.
    if(job.summary.added){
      const result=await db.transaction(tx=>tx.query('SELECT t.id,t.status,e.weekday,e.starts_at_local FROM app.import_rows r JOIN app.timetable_entries e ON e.school_id=r.school_id AND e.id=r.result_id JOIN app.timetable_versions t ON t.school_id=e.school_id AND t.id=e.timetable_id WHERE r.school_id=$1 AND r.import_id=$2',[schoolA,job.id]),{schoolId:schoolA});
      assert.equal(result.rowCount,1);assert.equal(result.rows[0].status,'DRAFT');assert.equal(result.rows[0].weekday,2);
    }else assert.equal(job.summary.skipped,1);
    let retry=await importCsv(csrf,worker,text,'TIMETABLE',classA);retry=await validateCsv(csrf,worker,retry,mapping);retry=await commitCsv(csrf,worker,retry);assert.equal(retry.status,'COMPLETED');assert.equal(retry.summary.skipped,1);
    let invalid=await importCsv(csrf,worker,'weekday,slot,startsAt,endsAt,subjectCode,staffCode\n3,1,07:00,07:45,MATH,TEST-teacher-b\n3,2,07:30,08:15,MATH,TEST-teacher-b\n','TIMETABLE',classA);
    invalid=await validateCsv(csrf,worker,invalid,mapping);assert.equal(invalid.summary.invalid,1);
  }finally{await worker.close();}
});

test('B2 imports update only verified codes, create class drafts and staff invitations with work profiles',async()=>{
  const csrf=await login('admin-a@example.invalid'),worker=new WorkerRunner(),prefix=crypto.randomUUID();
  try{
    let classes=await importCsv(csrf,worker,`code,name,gradeCode,capacity\nC-${prefix},Lớp mới import giả,10,10\n`,'CLASSES');
    classes=await validateCsv(csrf,worker,classes,['code','name','gradeCode','capacity'].map(name=>({sourceColumn:name,targetField:name})));
    classes=await commitCsv(csrf,worker,classes);assert.equal(classes.status,'COMPLETED');
    const cls=(await db.transaction(tx=>tx.query('SELECT id,status FROM app.classes WHERE school_id=$1 AND year_id=$2 AND code=$3',[schoolA,seedId('year:A'),`C-${prefix}`]),{schoolId:schoolA})).rows[0];assert.equal(cls.status,'DRAFT');
    let students=await importCsv(csrf,worker,`studentCode,fullName\nS-${prefix},Họ tên trước giả\n`,'STUDENTS',cls.id);
    const mapping=['studentCode','fullName'].map(name=>({sourceColumn:name,targetField:name}));students=await validateCsv(csrf,worker,students,mapping);students=await commitCsv(csrf,worker,students);assert.equal(students.status,'COMPLETED');
    let update=await importCsv(csrf,worker,`studentCode,fullName\nS-${prefix},Họ tên sau giả\n`,'STUDENTS',cls.id);update=await validateCsv(csrf,worker,update,mapping,'UPSERT_VERIFIED_CODE');assert.equal(update.summary.updated,1);
    update=await commitCsv(csrf,worker,update);assert.equal(update.status,'COMPLETED');assert.equal(update.summary.updated,1);
    const student=(await db.transaction(tx=>tx.query('SELECT full_name FROM app.students WHERE school_id=$1 AND student_code=$2',[schoolA,`S-${prefix}`]),{schoolId:schoolA})).rows[0];assert.equal(student.full_name,'Họ tên sau giả');
    const email=`import-${prefix}@example.invalid`;
    const roleCode=`import-role-${prefix}`;
    const role=await request('POST',`/api/v1/schools/${schoolA}/roles`,{code:roleCode,label:'Nhân sự import kiểm thử',permissions:[{action:'school.read',scopes:['SCHOOL']}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(role.statusCode,201);
    let staff=await importCsv(csrf,worker,`email,staffCode,workDisplayName,roleCode\n${email},T-${prefix},Nhân sự import giả,${roleCode}\n`,'STAFF');
    staff=await validateCsv(csrf,worker,staff,['email','staffCode','workDisplayName','roleCode'].map(name=>({sourceColumn:name,targetField:name})));assert.equal(staff.summary.invalid,0);
    staff=await commitCsv(csrf,worker,staff);assert.equal(staff.status,'COMPLETED');
    assert.equal((await db.app.query('SELECT id FROM identity.users WHERE email_normalized=$1',[email])).rowCount,0);
    const invitation=(await db.transaction(tx=>tx.query('SELECT id,work_profile,status FROM app.staff_invitations WHERE school_id=$1 AND email_normalized=$2',[schoolA,email]),{schoolId:schoolA})).rows[0];assert.equal(invitation.status,'PENDING');assert.equal(invitation.work_profile.staffCode,`T-${prefix}`);
    const proposed=(await db.transaction(tx=>tx.query('SELECT proposed_assignments FROM app.staff_invitations WHERE school_id=$1 AND id=$2',[schoolA,invitation.id]),{schoolId:schoolA})).rows[0].proposed_assignments[0];assert.ok(Number.isFinite(Date.parse(proposed.validFrom)));assert.ok(Number.isFinite(Date.parse(proposed.validUntil)));
    const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.id}`])).rows[0].encrypted_payload;
    const token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token');
    const anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
    const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Danh tính import giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
    const member=(await db.transaction(tx=>tx.query('SELECT m.staff_code,m.work_display_name FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA})).rows[0];assert.equal(member.staff_code,`T-${prefix}`);assert.equal(member.work_display_name,'Nhân sự import giả');
    const backdateEmail=`backdate-import-${prefix}@example.invalid`,reason='Xác minh phân công từ đầu năm học';
    let backdated=await importCsv(csrf,worker,`email,staffCode,workDisplayName,roleCode,classCode,reason\n${backdateEmail},BACK-T-${prefix},Giáo viên import giả,HOMEROOM,C-${prefix},${reason}\n`,'STAFF');
    const backdateFields=['email','staffCode','workDisplayName','roleCode','classCode'];backdated=await validateCsv(csrf,worker,backdated,backdateFields.map(name=>({sourceColumn:name,targetField:name})));assert.equal(backdated.summary.invalid,1);
    const backdateErrors=await request('GET',`/api/v1/schools/${schoolA}/imports/${backdated.id}/rows`);assert.equal(backdateErrors.json().data[0].errors[0].field,'reason');
    backdated=await validateCsv(csrf,worker,backdated,[...backdateFields,'reason'].map(name=>({sourceColumn:name,targetField:name})));assert.equal(backdated.summary.invalid,0);backdated=await commitCsv(csrf,worker,backdated);assert.equal(backdated.status,'COMPLETED');
    const scopedInvite=(await db.transaction(tx=>tx.query('SELECT id,proposed_assignments FROM app.staff_invitations WHERE school_id=$1 AND email_normalized=$2',[schoolA,backdateEmail]),{schoolId:schoolA})).rows[0];assert.equal(scopedInvite.proposed_assignments[0].reason,reason);
    const scopedMail=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${scopedInvite.id}`])).rows[0];const scopedToken=new URLSearchParams(new URL(decryptMail(scopedMail.encrypted_payload).url).hash.slice(1)).get('token');
    const scopedAccepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token:scopedToken,displayName:'Giáo viên import giả',newPassword:password},anonymousCsrf);assert.equal(scopedAccepted.statusCode,200,scopedAccepted.body);
    assert.equal((await db.transaction(tx=>tx.query("SELECT reason FROM app.audit_events WHERE school_id=$1 AND target_id=$2 AND action='acceptInvitation'",[schoolA,scopedInvite.id]),{schoolId:schoolA})).rows[0].reason,reason);
  }finally{await worker.close();}
});

test('B2 large import resumes after a lost chunk without duplicating applied rows and checks current school authority',async()=>{
  const csrf=await login('admin-a@example.invalid'),worker=new WorkerRunner(),prefix=crypto.randomUUID();
  try{
    const text='code,name,gradeCode,capacity\n'+Array.from({length:501},(_,i)=>`R-${prefix}-${i},Lớp resume giả,10,10`).join('\n')+'\n';
    let job=await importCsv(csrf,worker,text,'CLASSES');job=await validateCsv(csrf,worker,job,['code','name','gradeCode','capacity'].map(name=>({sourceColumn:name,targetField:name})));assert.equal(job.summary.invalid,0);
    const started=await request('POST',`/api/v1/schools/${schoolA}/imports/${job.id}/commit`,{expectedVersion:job.version,previewHash:job.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(started.statusCode,202);
    const wp=new Permissions(worker.db),wc=new Commands(worker.db),wf=new FilesService(worker.db,wp,wc),wi=new ImportsService(worker.db,wp,wc,wf);
    const importer=new ImportWorker(worker.db,wp,wi,new InvitationsService(worker.db,new IdentityService(worker.db),wp));
    let guarded=0;worker.register('COMMIT_IMPORT',async(event,guard)=>importer.run('COMMIT_IMPORT',event.school_id,String(event.payload.importId),async tx=>{
      await guard(tx);if(++guarded===103)throw new Problem(409,'TEST_INTERRUPTION');
    }));
    const event=await worker.claim(schoolA);assert.equal(event.kind,'COMMIT_IMPORT');await worker.run(event);
    let partial=(await request('GET',`/api/v1/schools/${schoolA}/imports/${job.id}`)).json().data;assert.equal(partial.status,'FAILED');assert.equal(partial.summary.processed,100);
    await db.transaction(tx=>tx.query("UPDATE app.outbox_events SET run_after=now() WHERE school_id=$1 AND id=$2",[schoolA,event.id]),{schoolId:schoolA});
    worker.register('COMMIT_IMPORT',(event,guard)=>importer.run('COMMIT_IMPORT',event.school_id,String(event.payload.importId),guard));await drainSchool(worker);
    partial=(await request('GET',`/api/v1/schools/${schoolA}/imports/${job.id}`)).json().data;assert.equal(partial.status,'COMPLETED');assert.equal(partial.summary.processed,501);
    const count=await db.transaction(tx=>tx.query('SELECT count(*)::int AS n,count(DISTINCT result_id)::int AS distinct_n FROM app.import_rows WHERE school_id=$1 AND import_id=$2 AND status=\'APPLIED\'',[schoolA,job.id]),{schoolId:schoolA});assert.deepEqual(count.rows[0],{n:501,distinct_n:501});
    let revoked=await importCsv(csrf,worker,`code,name,gradeCode,capacity\nREVOKE-${prefix},Không được áp dụng,10,10\n`,'CLASSES');revoked=await validateCsv(csrf,worker,revoked,['code','name','gradeCode','capacity'].map(name=>({sourceColumn:name,targetField:name})));
    const queued=await request('POST',`/api/v1/schools/${schoolA}/imports/${revoked.id}/commit`,{expectedVersion:revoked.version,previewHash:revoked.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(queued.statusCode,202);
    try{await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolA]);await drainSchool(worker);}
    finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolA]);}
    const failed=(await request('GET',`/api/v1/schools/${schoolA}/imports/${revoked.id}`)).json().data;assert.equal(failed.status,'FAILED');assert.equal(failed.summary.processed,0);
    assert.equal((await db.transaction(tx=>tx.query('SELECT id FROM app.classes WHERE school_id=$1 AND code=$2',[schoolA,`REVOKE-${prefix}`]),{schoolId:schoolA})).rowCount,0);
  }finally{await worker.close();}
});

test('B3 attendance starts unmarked, versions every source change and publishes immutable one-student projections',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=crypto.randomUUID();
  const post=(path,body,key=crypto.randomUUID())=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':key});
  const created=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`AT-${prefix}`,name:'Lớp điểm danh giả',capacity:10});assert.equal(created.statusCode,201);
  const classId=created.json().data.id;
  for(let i=0;i<2;i++)assert.equal((await post('students',{studentCode:`AT-${prefix}-${i}`,fullName:'Học sinh chuyên cần giả',initialClassId:classId,startsOn:'2026-09-01'})).statusCode,201);
  const base=`classes/${classId}/attendance`;
  const start=await post(base,{date:'2026-09-29',granularity:'DAILY',slot:'MORNING'});assert.equal(start.statusCode,201,start.body);let session=start.json().data;
  assert.equal(session.records.length,2);assert.equal(session.records.every(r=>r.status==='UNMARKED'),true);assert.ok(session.dataVersion>1);
  const duplicate=await post(base,{date:'2026-09-29',granularity:'DAILY',slot:'MORNING'});assert.equal(duplicate.statusCode,409);
  const afternoon=await post(base,{date:'2026-09-29',granularity:'DAILY',slot:'AFTERNOON'});assert.equal(afternoon.statusCode,201);
  const incomplete=await post(`${base}/${session.id}/publish`,{expectedSourceVersion:session.dataVersion});assert.equal(incomplete.statusCode,422);
  const body={expectedVersion:session.version,records:session.records.map((r,i)=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:i?'LATE':'PRESENT',...(i?{lateMinutes:5}:{}),publicNote:'Ghi chú được chia sẻ',internalNote:'Bí mật nội bộ kiểm thử'}))};
  const saved=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/${session.id}/records`,body,csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(saved.statusCode,200,saved.body);const oldVersion=session.dataVersion;session=saved.json().data;assert.ok(session.dataVersion>oldVersion);
  const stale=await post(`${base}/${session.id}/publish`,{expectedSourceVersion:oldVersion});assert.equal(stale.statusCode,409);
  const summary=await request('GET',`/api/v1/schools/${schoolA}/classes/${classId}/attendance-summary?from=2026-09-29&to=2026-09-30&granularity=DAILY&slot=MORNING`);assert.equal(summary.statusCode,200,summary.body);assert.deepEqual(summary.json().data.counts,{unmarked:0,present:1,late:1,excused:0,unexcused:0,expected:2});
  const afternoonSummary=await request('GET',`/api/v1/schools/${schoolA}/classes/${classId}/attendance-summary?from=2026-09-29&to=2026-09-30&granularity=DAILY&slot=AFTERNOON`);assert.equal(afternoonSummary.json().data.counts.unmarked,2);
  const key=crypto.randomUUID(),publishBody={expectedSourceVersion:session.dataVersion,expectedPublicationId:null};
  const published=await post(`${base}/${session.id}/publish`,publishBody,key);assert.equal(published.statusCode,200,published.body);let publication=published.json().data;assert.equal(publication.status,'PUBLISHED');assert.equal(publication.sourceVersion,session.dataVersion);
  const replay=await post(`${base}/${session.id}/publish`,publishBody,key);assert.equal(replay.statusCode,200);assert.equal(replay.json().data.id,publication.id);
  const repeated=await post(`${base}/${session.id}/publish`,{expectedSourceVersion:session.dataVersion,expectedPublicationId:publication.id});assert.equal(repeated.statusCode,200);assert.equal(repeated.json().data.id,publication.id);
  const projection=await db.transaction(tx=>tx.query('SELECT student_id,payload FROM app.parent_publication_items WHERE school_id=$1 AND publication_id=$2',[schoolA,publication.id]),{schoolId:schoolA});assert.equal(projection.rowCount,2);
  for(const row of projection.rows){assert.equal(Object.hasOwn(row.payload,'internalNote'),false);assert.equal(Object.hasOwn(row.payload,'enrollmentId'),false);assert.equal(Object.hasOwn(row.payload,'studentId'),false);assert.equal(row.payload.publicNote,'Ghi chú được chia sẻ');assert.equal(row.payload.slotLabel,'Buổi sáng');}
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.publication_revisions SET staff_snapshot='{}' WHERE school_id=$1 AND id=$2",[schoolA,publication.id]),{schoolId:schoolA}),error=>error.code==='23514');
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.attendance_records SET status='PRESENT' WHERE school_id=$1 AND session_id=$2",[schoolA,session.id]),{schoolId:schoolA}),error=>error.code==='23514');
  session=(await request('GET',`/api/v1/schools/${schoolA}/${base}/${session.id}`)).json().data;assert.equal(session.status,'LOCKED');
  const locked=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:session.records[0].enrollmentId,expectedVersion:session.records[0].version,status:'PRESENT'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(locked.statusCode,409);
  const opened=await post(`${base}/${session.id}/reopen`,{expectedVersion:session.version,reason:'Sửa chuyên cần có lý do'});assert.equal(opened.statusCode,200);session=opened.json().data;
  const edit=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:session.records[0].enrollmentId,expectedVersion:session.records[0].version,status:'EXCUSED',publicNote:'Đã sửa công khai'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edit.statusCode,200);session=edit.json().data;
  const before=(await request('GET',`/api/v1/schools/${schoolA}/classes/${classId}/publications/${publication.id}`)).json().data;assert.equal(before.attendance.records.some(r=>r.publicNote==='Đã sửa công khai'),false);
  const refreshed=await post(`${base}/${session.id}/publish`,{expectedSourceVersion:session.dataVersion,expectedPublicationId:publication.id});assert.equal(refreshed.statusCode,200);const next=refreshed.json().data;assert.equal(next.revision,publication.revision+1);
  const versions=await db.transaction(tx=>tx.query('SELECT id,status FROM app.publication_revisions WHERE school_id=$1 AND attendance_session_id=$2',[schoolA,session.id]),{schoolId:schoolA});assert.equal(versions.rows.filter(r=>r.status==='PUBLISHED').length,1);assert.equal(versions.rows.find(r=>r.id===publication.id).status,'SUPERSEDED');publication=next;
  const list=await request('GET',`/api/v1/schools/${schoolA}/classes/${classId}/publications`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().data.some(p=>p.id===publication.id),true);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/publications?limit=1`)).statusCode,200);
  const withdraw=await post(`publications/${publication.id}/withdraw`,{expectedVersion:publication.version,reason:'Thu hồi bản kiểm thử'});assert.equal(withdraw.statusCode,200);assert.equal(withdraw.json().data.status,'WITHDRAWN');
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}`)).statusCode,200);
});

test('B3 subject attendance requires its actual lesson and cannot borrow daily access from another class',async()=>{
  const fixture=await db.transaction(async tx=>{
    await tx.query('SELECT app.lock_school()');
    const previous=(await tx.query("SELECT id FROM app.lesson_occurrences WHERE school_id=$1 AND class_id=$2 AND member_id=$3 AND starts_at='2026-09-28T01:00:00Z' AND status='SCHEDULED'",[schoolA,classB,seedId('member:A:teacher-a')])).rows[0];
    if(previous)return previous;
    const timetable=(await tx.query(`INSERT INTO app.timetable_versions(school_id,class_id,year_id,revision,starts_on,ends_on,created_by)
      SELECT $1,$2,$3,coalesce(max(revision),0)+1,'2026-09-01','2027-06-01',$4 FROM app.timetable_versions WHERE school_id=$1 AND class_id=$2 RETURNING id`,[schoolA,classB,seedId('year:A'),seedId('user:admin-a')])).rows[0];
    const lesson=(await tx.query(`INSERT INTO app.lesson_occurrences(school_id,class_id,timetable_id,subject_id,member_id,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5,'2026-09-28T01:00:00Z','2026-09-28T01:45:00Z') RETURNING id`,[schoolA,classB,timetable.id,seedId('subject:A:math'),seedId('member:A:teacher-a')])).rows[0];return lesson;
  },{schoolId:schoolA});
  const csrf=await login('teacher-a@example.invalid');
  const post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/classes/${classB}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const daily=await post('attendance',{date:'2026-09-28',granularity:'DAILY'});assert.equal(daily.statusCode,404);
  const noLesson=await post('attendance',{date:'2026-09-28',granularity:'LESSON'});assert.equal(noLesson.statusCode,422);
  const created=await post('attendance',{date:'2026-09-28',granularity:'LESSON',lessonId:fixture.id});assert.ok([201,409].includes(created.statusCode),created.body);
  let session=created.statusCode===201?created.json().data:null;
  if(!session){const list=(await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/attendance`)).json().data;
    const existing=list.find(s=>s.lessonId===fixture.id);assert.ok(existing);session=(await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/attendance/${existing.id}`)).json().data;}
  const wrong=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${classB}/attendance/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:seedId('enrollment:A:10A1:1'),expectedVersion:1,status:'PRESENT'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(wrong.statusCode,422);
  const saved=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${classB}/attendance/${session.id}/records`,{expectedVersion:session.version,records:session.records.map(r=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'PRESENT'}))},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(saved.statusCode,200,saved.body);session=saved.json().data;
  const published=await post(`attendance/${session.id}/publish`,{expectedSourceVersion:session.dataVersion});assert.equal(published.statusCode,404);
  const list=await request('GET',`/api/v1/schools/${schoolA}/classes/${classB}/attendance`);assert.equal(list.statusCode,200);assert.equal(list.json().data.every(s=>s.granularity==='LESSON'),true);
  const wrongDate=await post('attendance',{date:'2026-09-29',granularity:'LESSON',lessonId:fixture.id});assert.equal(wrongDate.statusCode,422);
});

test('B3 a simultaneous attendance edit and publish has one winner and never publishes a mixed source version',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=crypto.randomUUID();
  const post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const cls=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`RACE-${prefix}`,name:'Lớp kiểm thử race',capacity:2});assert.equal(cls.statusCode,201);
  const classId=cls.json().data.id;assert.equal((await post('students',{studentCode:`RACE-${prefix}`,fullName:'Học sinh race giả',initialClassId:classId,startsOn:'2026-09-01'})).statusCode,201);
  const base=`classes/${classId}/attendance`,created=await post(base,{date:'2026-09-29',granularity:'DAILY'});assert.equal(created.statusCode,201);let session=created.json().data;
  const save=async(status)=>request('PATCH',`/api/v1/schools/${schoolA}/${base}/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:session.records[0].enrollmentId,expectedVersion:session.records[0].version,status}]},csrf,{'idempotency-key':crypto.randomUUID()});
  const marked=await save('PRESENT');assert.equal(marked.statusCode,200);session=marked.json().data;
  const [edit,publish]=await Promise.all([save('EXCUSED'),post(`${base}/${session.id}/publish`,{expectedSourceVersion:session.dataVersion,expectedPublicationId:null})]);
  assert.deepEqual([edit.statusCode,publish.statusCode].sort(),[200,409]);
  const actual=(await request('GET',`/api/v1/schools/${schoolA}/${base}/${session.id}`)).json().data;
  const publications=(await request('GET',`/api/v1/schools/${schoolA}/classes/${classId}/publications`)).json().data;
  if(publish.statusCode===200){assert.equal(actual.status,'LOCKED');assert.equal(actual.records[0].status,'PRESENT');assert.equal(publications.length,1);assert.equal(publications[0].sourceVersion,session.dataVersion);}
  else{assert.equal(actual.status,'OPEN');assert.equal(actual.records[0].status,'EXCUSED');assert.equal(publications.length,0);}
});

test('B3 rule sets require explicit points, immutable issuance and effective week application',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=crypto.randomUUID();
  const post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const missing=await post('conduct-rule-sets',{name:'Không có điểm gốc'});assert.equal(missing.statusCode,422);
  const created=await post('conduct-rule-sets',{name:`Nội quy giả ${prefix}`,basePoints:'75.10',minimumPoints:'0',maximumPoints:'100'});assert.equal(created.statusCode,201,created.body);let ruleSet=created.json().data;
  const fixedId=crypto.randomUUID(),manualId=crypto.randomUUID();
  const updated=await request('PATCH',`/api/v1/schools/${schoolA}/conduct-rule-sets/${ruleSet.id}`,{expectedVersion:ruleSet.version,rules:[
    {id:fixedId,code:'late',label:'Đi muộn',groupName:'Chuyên cần',valueMode:'FIXED',defaultDelta:'-5.10',reasonRequired:true,maxOccurrencesPerDay:1},
    {id:manualId,code:'manual',label:'Điểm trong giới hạn',groupName:'Điểm khác',valueMode:'MANUAL',defaultDelta:'0',minimumDelta:'-2',maximumDelta:'2',reasonRequired:true},
  ],thresholds:[{label:'Đạt',minimumScore:'70'},{label:'Cần cố gắng',minimumScore:'0'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(updated.statusCode,200,updated.body);ruleSet=updated.json().data;
  const simulation=await post('conduct-rule-sets/simulate',{ruleSetId:ruleSet.id,events:[{ruleId:fixedId},{ruleId:manualId,manualDelta:'0.10'}]});assert.equal(simulation.statusCode,200,simulation.body);
  assert.deepEqual(simulation.json().data,{basePoints:'75.10',bonusPoints:'0.10',penaltyPoints:'-5.10',finalPoints:'70.10',classification:'Đạt',appliedRuleCount:2});
  const override=await post('conduct-rule-sets/simulate',{ruleSetId:ruleSet.id,events:[{ruleId:fixedId,manualDelta:'0'}]});assert.equal(override.statusCode,422);
  const outOfBounds=await post('conduct-rule-sets/simulate',{ruleSetId:ruleSet.id,events:[{ruleId:manualId,manualDelta:'2.01'}]});assert.equal(outOfBounds.statusCode,422);
  const issued=await post(`conduct-rule-sets/${ruleSet.id}/issue`,{expectedVersion:ruleSet.version});assert.equal(issued.statusCode,200,issued.body);ruleSet=issued.json().data;assert.equal(ruleSet.status,'ISSUED');
  const editIssued=await request('PATCH',`/api/v1/schools/${schoolA}/conduct-rule-sets/${ruleSet.id}`,{expectedVersion:ruleSet.version,basePoints:'100'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(editIssued.statusCode,409);
  await assert.rejects(db.transaction(tx=>tx.query('UPDATE app.conduct_rules SET default_delta=0 WHERE school_id=$1 AND id=$2',[schoolA,fixedId]),{schoolId:schoolA}),error=>error.code==='23514');
  const cls=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`RULE-${prefix}`,name:'Lớp nội quy giả',capacity:10});assert.equal(cls.statusCode,201);
  const apply=await post(`classes/${cls.json().data.id}/rules/apply`,{expectedClassVersion:cls.json().data.version,ruleSetId:ruleSet.id,startsOn:'2026-09-01'});assert.equal(apply.statusCode,200,apply.body);
  const current=await request('GET',`/api/v1/schools/${schoolA}/classes/${cls.json().data.id}/rules`);assert.equal(current.statusCode,200,current.body);assert.equal(current.json().data.id,ruleSet.id);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/conduct-rule-sets/${ruleSet.id}`)).statusCode,200);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/conduct-rule-sets?limit=1`)).statusCode,200);
  await login('teacher-a@example.invalid');
  const knownIssued=await request('GET',`/api/v1/schools/${schoolA}/conduct-rule-sets/${ruleSet.id}`);assert.equal(knownIssued.statusCode,404);
  const catalog=await request('GET',`/api/v1/schools/${schoolA}/conduct-rule-sets`);assert.equal(catalog.statusCode,200,catalog.body);assert.equal(catalog.json().data.some(r=>r.id===ruleSet.id),false);
  const own=await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}/rules`);assert.equal(own.statusCode,200);assert.equal(own.json().data.id,seedId('ruleset:A'));
});

async function conductFixture(csrf){
  const prefix=crypto.randomUUID(),post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const created=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`CON-${prefix}`,name:'Lớp thi đua giả',capacity:4});assert.equal(created.statusCode,201,created.body);const cls=created.json().data;
  const enrollments=[];
  for(let i=0;i<2;i++){
    const student=await post('students',{studentCode:`CON-${prefix}-${i}`,fullName:`Học sinh thi đua giả ${i}`,initialClassId:cls.id,startsOn:'2026-09-01'});assert.equal(student.statusCode,201);
    const roster=await request('GET',`/api/v1/schools/${schoolA}/students/${student.json().data.id}/enrollments`);assert.equal(roster.statusCode,200,roster.body);enrollments.push(roster.json().data[0]);
  }
  const createdRules=await post('conduct-rule-sets',{name:`Nội quy thi đua ${prefix}`,basePoints:'80.10',minimumPoints:'0',maximumPoints:'100'});assert.equal(createdRules.statusCode,201);let rules=createdRules.json().data;
  const fixed=crypto.randomUUID(),manual=crypto.randomUUID(),attendance=crypto.randomUUID();
  const patched=await request('PATCH',`/api/v1/schools/${schoolA}/conduct-rule-sets/${rules.id}`,{expectedVersion:rules.version,rules:[
    {id:fixed,code:'fixed',label:'Đóng góp',groupName:'Học tập',valueMode:'FIXED',defaultDelta:'0.20',reasonRequired:true,maxOccurrencesPerDay:2},
    {id:manual,code:'manual',label:'Ghi nhận trường',groupName:'Khác',valueMode:'MANUAL',defaultDelta:'0',minimumDelta:'-2',maximumDelta:'2',reasonRequired:true},
    {id:attendance,code:'attendance',label:'Đi muộn',groupName:'Chuyên cần',valueMode:'FIXED',defaultDelta:'-5.10',reasonRequired:true,attendanceStatus:'LATE'},
  ],thresholds:[{label:'Đạt',minimumScore:'75'},{label:'Cần cố gắng',minimumScore:'0'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(patched.statusCode,200,patched.body);rules=patched.json().data;
  const issued=await post(`conduct-rule-sets/${rules.id}/issue`,{expectedVersion:rules.version});assert.equal(issued.statusCode,200);
  assert.equal((await post(`classes/${cls.id}/rules/apply`,{expectedClassVersion:cls.version,ruleSetId:rules.id,startsOn:'2026-09-01'})).statusCode,200);
  const periodResponse=await post(`classes/${cls.id}/conduct-periods`,{weekId:seedId('week:A:5')});assert.equal(periodResponse.statusCode,201,periodResponse.body);
  return {classId:cls.id,enrollments,period:periodResponse.json().data,fixed,manual,attendance,post};
}

test('B3 conduct reviews preserve facts, lock READY projections and publish only the exact pinned source',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,records=`${base}/conduct-records`,periods=`${base}/conduct-periods`;
  const event={periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Đóng góp trong tiết học',internalNote:'Chỉ dành cho nhân sự',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()};
  const key=crypto.randomUUID(),first=await f.post(records,event,key);assert.equal(first.statusCode,201,first.body);let record=first.json().data;
  const duplicate=await f.post(records,event);assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().code,'DUPLICATE_SOURCE');
  const override=await f.post(records,{...event,clientEventId:crypto.randomUUID(),manualDelta:'0'});assert.equal(override.statusCode,422);
  const manualBad=await f.post(records,{...event,clientEventId:crypto.randomUUID(),ruleId:f.manual,manualDelta:'2.01'});assert.equal(manualBad.statusCode,422);
  const review=await request('GET',`/api/v1/schools/${schoolA}/${periods}/${f.period.id}/review`);assert.equal(review.statusCode,200,review.body);assert.equal(review.json().data.canLock,false);assert.equal(review.json().data.blockers[0].recordId,record.id);
  const pending=await f.post(`${periods}/${f.period.id}/lock`,{expectedVersion:review.json().data.period.version});assert.equal(pending.statusCode,422);assert.equal(pending.json().code,'REVIEW_BLOCKED');
  const edited=await request('PATCH',`/api/v1/schools/${schoolA}/${records}/${record.id}`,{expectedVersion:record.version,publicReason:'Đóng góp đã xác minh'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200);record=edited.json().data;
  const stale=await f.post(`${records}/${record.id}/approve`,{expectedVersion:record.version-1});assert.equal(stale.statusCode,409);
  const approved=await f.post(`${records}/${record.id}/approve`,{expectedVersion:record.version});assert.equal(approved.statusCode,200,approved.body);record=approved.json().data;
  const readonly=await request('PATCH',`/api/v1/schools/${schoolA}/${records}/${record.id}`,{expectedVersion:record.version,publicReason:'Không được viết lại sự kiện'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(readonly.statusCode,409);
  const excludedEvent=await f.post(records,{...event,ruleId:f.manual,manualDelta:'-1',clientEventId:crypto.randomUUID()});assert.equal(excludedEvent.statusCode,201);
  const excluded=await f.post(`${records}/${excludedEvent.json().data.id}/exclude`,{expectedVersion:excludedEvent.json().data.version,reason:'Nhập nhầm cần giữ lịch sử'});assert.equal(excluded.statusCode,200,excluded.body);assert.equal(excluded.json().data.status,'EXCLUDED');assert.equal(excluded.json().data.exclusionReason,'Nhập nhầm cần giữ lịch sử');
  const summary=await request('GET',`/api/v1/schools/${schoolA}/${periods}/${f.period.id}/summary`);assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.pendingCount,0);assert.equal(summary.json().data.students.find(s=>s.enrollmentId===event.enrollmentId).finalPoints,'80.30');
  const period=summary.json().data.period;
  const locked=await f.post(`${periods}/${period.id}/lock`,{expectedVersion:period.version});assert.equal(locked.statusCode,200,locked.body);assert.equal(locked.json().data.status,'LOCKED');
  const stage=await db.transaction(tx=>tx.query('SELECT id,status,expected_item_count,projection_hash FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2',[schoolA,period.id]),{schoolId:schoolA});assert.equal(stage.rowCount,1);assert.equal(stage.rows[0].status,'READY');assert.equal(stage.rows[0].expected_item_count,2);assert.match(stage.rows[0].projection_hash,/^[a-f0-9]{64}$/);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.conduct_records SET public_reason='Viết lại sau chốt' WHERE school_id=$1 AND id=$2",[schoolA,record.id]),{schoolId:schoolA}),error=>error.code==='23514');
  const wrongSource=await f.post(`${periods}/${period.id}/publish`,{expectedSourceVersion:period.dataVersion-1,expectedPublicationId:null});assert.equal(wrongSource.statusCode,409);
  const published=await f.post(`${periods}/${period.id}/publish`,{expectedSourceVersion:period.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);assert.equal(published.json().data.id,stage.rows[0].id);
  const detail=await request('GET',`/api/v1/schools/${schoolA}/${base}/publications/${published.json().data.id}`);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.conduct.students.length,2);
  const projections=await db.transaction(tx=>tx.query('SELECT payload FROM app.parent_publication_items WHERE school_id=$1 AND publication_id=$2',[schoolA,published.json().data.id]),{schoolId:schoolA});
  assert.equal(projections.rowCount,2);for(const {payload} of projections.rows){assert.equal(Object.hasOwn(payload,'students'),false);assert.equal(JSON.stringify(payload).includes('Chỉ dành cho nhân sự'),false);assert.equal(payload.adjusted,false);}
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${periods}`)).statusCode,200);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${records}?periodId=${period.id}`)).json().data.length,2);
  const combined=await conductFixture(csrf),both=await combined.post(`classes/${combined.classId}/conduct-periods/${combined.period.id}/lock-and-publish`,{expectedSourceVersion:combined.period.dataVersion,expectedPublicationId:null});assert.equal(both.statusCode,200,both.body);assert.equal(both.json().data.status,'PUBLISHED');
});

test('B3 conduct linked attendance detects stale sources and subject teachers see only their own lesson facts',async()=>{
  let csrf=await login('admin-a@example.invalid');const f=await conductFixture(csrf),base=`classes/${f.classId}`,records=`${base}/conduct-records`,periods=`${base}/conduct-periods`;
  const attendanceCreated=await f.post(`${base}/attendance`,{date:'2026-09-29',granularity:'DAILY'});assert.equal(attendanceCreated.statusCode,201);let session=attendanceCreated.json().data;
  const save=async status=>request('PATCH',`/api/v1/schools/${schoolA}/${base}/attendance/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:session.records[0].enrollmentId,expectedVersion:session.records[0].version,status}]},csrf,{'idempotency-key':crypto.randomUUID()});
  session=(await save('LATE')).json().data;
  const linked={periodId:f.period.id,enrollmentId:session.records[0].enrollmentId,ruleId:f.attendance,publicReason:'Đi muộn có nguồn điểm danh',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'ATTENDANCE',sourceId:session.records[0].id,clientEventId:crypto.randomUUID()};
  const linkedCreated=await f.post(records,linked);assert.equal(linkedCreated.statusCode,201,linkedCreated.body);const linkedRecord=linkedCreated.json().data;
  const duplicate=await f.post(records,{...linked,clientEventId:crypto.randomUUID()});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().code,'DUPLICATE_SOURCE');
  await db.transaction(tx=>tx.query("UPDATE app.attendance_records SET status='PRESENT',late_minutes=NULL WHERE school_id=$1 AND id=$2",[schoolA,session.records[0].id]),{schoolId:schoolA});
  session=(await request('GET',`/api/v1/schools/${schoolA}/${base}/attendance/${session.id}`)).json().data;
  const stale=await f.post(`${records}/${linkedRecord.id}/approve`,{expectedVersion:linkedRecord.version});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'STALE_SOURCE');
  assert.equal((await f.post(`${records}/${linkedRecord.id}/exclude`,{expectedVersion:linkedRecord.version,reason:'Nguồn điểm danh đã sửa'})).statusCode,200);
  const assignment=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-a'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:'2026-09-01',endsOn:'2027-06-01',reason:'Khởi tạo phân công lịch sử kiểm thử'});assert.equal(assignment.statusCode,201,assignment.body);
  const fixture=await db.transaction(async tx=>{
    const t=(await tx.query(`INSERT INTO app.timetable_versions(school_id,class_id,year_id,revision,starts_on,ends_on,created_by) VALUES($1,$2,$3,1,'2026-09-01','2027-06-01',$4) RETURNING id`,[schoolA,f.classId,seedId('year:A'),seedId('user:admin-a')])).rows[0];
    const free=(await tx.query(`SELECT min(at) AS at FROM generate_series('2026-09-29T03:00:00Z'::timestamptz,'2026-09-29T06:00:00Z'::timestamptz,interval '1 minute') at
      WHERE NOT EXISTS(SELECT 1 FROM app.lesson_occurrences l WHERE l.school_id=$1 AND l.member_id=$2 AND l.status='SCHEDULED' AND tstzrange(l.starts_at,l.ends_at,'[)')&&tstzrange(at,at+interval '30 seconds','[)'))`,[schoolA,seedId('member:A:teacher-a')])).rows[0];assert.ok(free.at);
    return (await tx.query(`INSERT INTO app.lesson_occurrences(school_id,class_id,timetable_id,subject_id,member_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz+interval '30 seconds') RETURNING id,starts_at`,[schoolA,f.classId,t.id,seedId('subject:A:math'),seedId('member:A:teacher-a'),free.at])).rows[0];
  },{schoolId:schoolA});
  const event={periodId:f.period.id,enrollmentId:f.enrollments[1].id,ruleId:f.fixed,publicReason:'Ghi nhận đúng tiết học',internalNote:'Ghi chú riêng của giáo viên',occurredAt:new Date(fixture.starts_at.getTime()+10000).toISOString(),sourceKind:'MANUAL',clientEventId:crypto.randomUUID(),lessonId:fixture.id};
  const adminFact=await f.post(records,event);assert.equal(adminFact.statusCode,201,adminFact.body);
  csrf=await login('teacher-a@example.invalid');
  const teacherPost=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const noLesson=await teacherPost(records,{...event,lessonId:undefined,clientEventId:crypto.randomUUID()});assert.equal(noLesson.statusCode,404);
  const manual=await teacherPost(records,{...event,ruleId:f.manual,manualDelta:'1',clientEventId:crypto.randomUUID()});assert.equal(manual.statusCode,404);
  const own=await teacherPost(records,{...event,clientEventId:crypto.randomUUID()});assert.equal(own.statusCode,201,own.body);assert.equal(Object.hasOwn(own.json().data,'internalNote'),false);
  const list=await request('GET',`/api/v1/schools/${schoolA}/${records}?periodId=${f.period.id}`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().data.length,1);assert.equal(list.json().data[0].id,own.json().data.id);assert.equal(Object.hasOwn(list.json().data[0],'internalNote'),false);
  for(const suffix of ['summary','review'])assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${periods}/${f.period.id}/${suffix}`)).statusCode,404);
  const wrongAuthor=await request('PATCH',`/api/v1/schools/${schoolA}/${records}/${adminFact.json().data.id}`,{expectedVersion:adminFact.json().data.version,publicReason:'Không được sửa người khác'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(wrongAuthor.statusCode,404);
  assert.equal((await teacherPost(`${records}/${own.json().data.id}/approve`,{expectedVersion:own.json().data.version})).statusCode,404);
  assert.equal((await teacherPost(`${periods}/${f.period.id}/lock-and-publish`,{expectedSourceVersion:f.period.dataVersion})).statusCode,404);
});

test('B3 approved adjustments retain old facts and atomically replace the current publication with a reviewed preview',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,records=`${base}/conduct-records`,periods=`${base}/conduct-periods`,adjustments=`${base}/adjustments`;
  const event={periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Ghi nhận trước điều chỉnh',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()};
  const created=await f.post(records,event);assert.equal(created.statusCode,201);let record=created.json().data;
  const approved=await f.post(`${records}/${record.id}/approve`,{expectedVersion:record.version});assert.equal(approved.statusCode,200);record=approved.json().data;
  const summary=(await request('GET',`/api/v1/schools/${schoolA}/${periods}/${f.period.id}/summary`)).json().data;
  const published=await f.post(`${periods}/${f.period.id}/lock-and-publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);const publication=published.json().data;
  const proposal={periodId:f.period.id,baselinePublicationId:publication.id,reason:'Xác minh lại sự kiện đã chốt',proposedChanges:[{recordId:record.id,action:'REPLACE',replacement:{...event,ruleId:f.manual,manualDelta:'-1.25',publicReason:'Sự kiện sau xác minh',clientEventId:crypto.randomUUID()}}]};
  const submitted=await f.post(adjustments,proposal);assert.equal(submitted.statusCode,201,submitted.body);let adjustment=submitted.json().data;
  assert.equal(adjustment.preview.before.students.find(s=>s.enrollmentId===event.enrollmentId).finalPoints,'80.30');assert.equal(adjustment.preview.after.students.find(s=>s.enrollmentId===event.enrollmentId).finalPoints,'78.85');
  const unchanged=await db.transaction(tx=>tx.query('SELECT status,public_reason FROM app.conduct_records WHERE school_id=$1 AND id=$2',[schoolA,record.id]),{schoolId:schoolA});assert.equal(unchanged.rows[0].status,'APPROVED');assert.equal(unchanged.rows[0].public_reason,event.publicReason);
  const notApproved=await f.post(`${adjustments}/${adjustment.id}/apply-and-publish`,{expectedSourceVersion:publication.sourceVersion,expectedPublicationId:publication.id});assert.equal(notApproved.statusCode,409);assert.equal(notApproved.json().code,'ADJUSTMENT_NOT_APPROVED');
  const competing=await f.post(adjustments,{...proposal,proposedChanges:[{recordId:record.id,action:'EXCLUDE'}]});assert.equal(competing.statusCode,201);
  const accepted=await f.post(`${adjustments}/${adjustment.id}/approve`,{expectedVersion:adjustment.version});assert.equal(accepted.statusCode,200,accepted.body);adjustment=accepted.json().data;
  const acceptedOther=await f.post(`${adjustments}/${competing.json().data.id}/approve`,{expectedVersion:competing.json().data.version});assert.equal(acceptedOther.statusCode,200);
  const key=crypto.randomUUID(),body={expectedSourceVersion:publication.sourceVersion,expectedPublicationId:publication.id};
  const applied=await request('POST',`/api/v1/schools/${schoolA}/${adjustments}/${adjustment.id}/apply-and-publish`,body,csrf,{'idempotency-key':key});assert.equal(applied.statusCode,200,applied.body);const next=applied.json().data;assert.equal(next.revision,publication.revision+1);
  const replay=await request('POST',`/api/v1/schools/${schoolA}/${adjustments}/${adjustment.id}/apply-and-publish`,body,csrf,{'idempotency-key':key});assert.equal(replay.statusCode,200);assert.deepEqual(replay.json().data,next);
  const stale=await f.post(`${adjustments}/${competing.json().data.id}/apply-and-publish`,body);assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'STALE_BASELINE');
  const saved=await db.transaction(async tx=>({records:(await tx.query('SELECT id,status,supersedes_id,recorded_by,approved_by,public_reason FROM app.conduct_records WHERE school_id=$1 AND period_id=$2',[schoolA,f.period.id])).rows,publications:(await tx.query('SELECT id,status,content_hash FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2',[schoolA,f.period.id])).rows,items:(await tx.query('SELECT payload FROM app.parent_publication_items WHERE school_id=$1 AND publication_id=$2',[schoolA,next.id])).rows}),{schoolId:schoolA});
  assert.equal(saved.records.length,2);assert.equal(saved.records.find(r=>r.id===record.id).status,'EXCLUDED');const replacement=saved.records.find(r=>r.supersedes_id===record.id);assert.equal(replacement.status,'APPROVED');assert.equal(replacement.recorded_by,seedId('user:admin-a'));assert.equal(replacement.approved_by,seedId('user:admin-a'));
  assert.equal(saved.publications.filter(p=>p.status==='PUBLISHED').length,1);assert.equal(saved.publications.find(p=>p.id===publication.id).status,'SUPERSEDED');assert.equal(saved.publications.find(p=>p.id===publication.id).content_hash,publication.contentHash);
  assert.equal(saved.items.every(i=>i.payload.adjusted),true);assert.equal(saved.items.find(i=>i.payload.lines.length).payload.finalPoints,'78.85');
  const list=await request('GET',`/api/v1/schools/${schoolA}/${adjustments}`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().data.find(a=>a.id===adjustment.id).status,'APPLIED');assert.equal(list.json().data.find(a=>a.id===adjustment.id).resultPublicationId,next.id);
  const rejected=await f.post(adjustments,{periodId:f.period.id,baselinePublicationId:next.id,reason:'Đề nghị kiểm tra để từ chối',proposedChanges:[{recordId:replacement.id,action:'EXCLUDE'}]});assert.equal(rejected.statusCode,201);
  const declined=await f.post(`${adjustments}/${rejected.json().data.id}/reject`,{expectedVersion:rejected.json().data.version,reason:'Đã kiểm tra không cần điều chỉnh'});assert.equal(declined.statusCode,200,declined.body);assert.equal(declined.json().data.status,'REJECTED');assert.equal(declined.json().data.decisionReason,'Đã kiểm tra không cần điều chỉnh');
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason='Không có phê duyệt hiện hành' WHERE school_id=$1 AND id=$2",[schoolA,replacement.id]),{schoolId:schoolA,userId:seedId('user:admin-a')}),e=>e.code==='23514');
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.adjustment_requests SET reason='Viết lại đề nghị cũ' WHERE school_id=$1 AND id=$2",[schoolA,adjustment.id]),{schoolId:schoolA}),e=>e.code==='23514');
});

test('B3 a simultaneous conduct record and lock/publish has one source winner',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`;
  const event={periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Sự kiện cạnh tranh chốt',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()};
  const [created,published]=await Promise.all([f.post(`${base}/conduct-records`,event),f.post(`${base}/conduct-periods/${f.period.id}/lock-and-publish`,{expectedSourceVersion:f.period.dataVersion,expectedPublicationId:null})]);
  assert.ok((created.statusCode===201&&published.statusCode===409)||(created.statusCode===409&&published.statusCode===200),JSON.stringify({created:created.json(),published:published.json()}));
  const summary=await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`);assert.equal(summary.statusCode,200);
  const publications=await request('GET',`/api/v1/schools/${schoolA}/${base}/publications`);assert.equal(publications.statusCode,200);
  if(published.statusCode===200){assert.equal(summary.json().data.period.status,'LOCKED');assert.equal(summary.json().data.pendingCount,0);assert.equal(publications.json().data.length,1);}
  else{assert.equal(summary.json().data.period.status,'OPEN');assert.equal(summary.json().data.pendingCount,1);assert.equal(publications.json().data.length,0);}
});

test('B3 attendance linkage deduplicates, excludes corrected drafts and leaves locked scores unchanged with explicit warnings',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`;
  const created=await f.post(`${base}/attendance`,{date:'2026-09-29',granularity:'DAILY'});assert.equal(created.statusCode,201);let session=created.json().data;
  async function save(status,linkConduct=true){
    const response=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/attendance/${session.id}/records`,{expectedVersion:session.version,linkConduct,records:[{enrollmentId:session.records[0].enrollmentId,expectedVersion:session.records[0].version,status}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(response.statusCode,200,response.body);session=response.json().data;return session.conductSync;
  }
  assert.deepEqual(await save('LATE'),{created:1,excluded:0,blocked:[]});
  assert.deepEqual(await save('LATE'),{created:0,excluded:0,blocked:[]});
  let records=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-records?periodId=${f.period.id}`)).json().data;assert.equal(records.length,1);assert.equal(records[0].status,'DRAFT');assert.equal(records[0].sourceId,session.records[0].id);
  assert.deepEqual(await save('PRESENT',false),{created:0,excluded:1,blocked:[]});
  assert.deepEqual(await save('LATE'),{created:1,excluded:0,blocked:[]});
  records=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-records?periodId=${f.period.id}`)).json().data;assert.equal(records.length,2);const active=records.find(r=>r.status==='DRAFT');
  assert.equal((await f.post(`${base}/conduct-records/${active.id}/approve`,{expectedVersion:active.version})).statusCode,200);
  const summary=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`)).json().data;
  const published=await f.post(`${base}/conduct-periods/${f.period.id}/lock-and-publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);
  const blocked=await save('PRESENT');assert.deepEqual(blocked,{created:0,excluded:0,blocked:[{enrollmentId:session.records[0].enrollmentId,code:'PERIOD_LOCKED'}]});assert.equal(session.records[0].status,'PRESENT');
  const after=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`)).json().data;
  assert.equal(after.students.find(s=>s.enrollmentId===session.records[0].enrollmentId).finalPoints,'75.00');assert.equal(after.period.dataVersion,summary.period.dataVersion);
  const current=(await request('GET',`/api/v1/schools/${schoolA}/${base}/publications/${published.json().data.id}`)).json().data;assert.equal(current.publication.status,'PUBLISHED');assert.equal(current.publication.contentHash,published.json().data.contentHash);
});

const parentSections=['overview','teachers','attendance','conduct','timetable','duties','activities','announcements','documents'];
async function parentRelationship(csrf,post,studentId){
  const guardian=await post('guardians',{fullName:`Giám hộ giả ${crypto.randomUUID()}`,phone:'0901234567'});assert.equal(guardian.statusCode,201);
  const relation=await post('relationships',{studentId,guardianId:guardian.json().data.id,relationshipLabel:'Giám hộ'});assert.equal(relation.statusCode,201);
  const verified=await post(`relationships/${relation.json().data.id}/verify`,{expectedVersion:relation.json().data.version,canReceiveInfo:true,verificationNote:'Đã kiểm tra quan hệ của fixture giả'});assert.equal(verified.statusCode,200,verified.body);return verified.json().data;
}
async function parentExchange(link,slug='truong-thu-a'){
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');assert.ok(token);
  const response=await request('POST',`/api/v1/parent/${slug}/access/exchange`,{token},csrf);assert.equal(response.statusCode,200,response.body);return response.json().data;
}
function parentGet(path,context,query=''){return request('GET',`/api/v1/parent/truong-thu-a/${path}${query}`,undefined,undefined,{'x-parent-view':context.viewId});}
test('B4 private parent links expose only published child projections, preserve staff cookies and bind the active tab context',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId);
  const body={studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:parentSections,allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'},key=crypto.randomUUID();
  const issued=await request('POST',`/api/v1/schools/${schoolA}/parent-access`,body,csrf,{'idempotency-key':key});assert.equal(issued.statusCode,201,issued.body);const link=issued.json().data;assert.equal(link.displayOnce,true);assert.match(link.link,/#token=[A-Za-z0-9_-]{43}$/);
  assert.ok(new Date(link.access.expiresAt).getTime()<=Date.now()+90*86400000);
  const repeated=await request('POST',`/api/v1/schools/${schoolA}/parent-access`,body,csrf,{'idempotency-key':key});assert.equal(repeated.statusCode,409);assert.equal(repeated.json().code,'LINK_ALREADY_ISSUED');
  const stored=(await request('GET',`/api/v1/schools/${schoolA}/parent-access/${link.access.id}`)).json().data;assert.equal(Object.hasOwn(stored,'tokenHash'),false);assert.equal(Object.hasOwn(stored,'link'),false);
  const adminCookie=jar.get('edu_staff'),context=await parentExchange(link.link);assert.equal(jar.get('edu_staff'),adminCookie);assert.equal(Object.hasOwn(context.student,'id'),false);assert.equal(Object.hasOwn(context.student,'guardians'),false);
  assert.ok(new Date(context.expiresAt).getTime()<=Date.now()+8*3600000);
  const nativeYear=(await db.transaction(tx=>tx.query('SELECT starts_on,ends_on FROM app.academic_years WHERE school_id=$1 AND id=$2',[schoolA,body.yearId]),{schoolId:schoolA})).rows[0];
  assert.deepEqual(context.year,{label:context.student.schoolYearLabel,startsOn:nativeYear.starts_on,endsOn:nativeYear.ends_on});assert.match(context.today,/^\d{4}-\d{2}-\d{2}$/);assert.equal(context.relationshipLabel,'Giám hộ');assert.equal(context.linkExpiresAt,link.access.expiresAt);assert.ok(Date.parse(context.expiresAt)<=Date.parse(context.linkExpiresAt));assert.equal(context.lastPublishedAt,null);
  for(const field of ['dateOfBirth','gender','guardianId','phone','internalNote','token','tokenHash'])assert.equal(Object.hasOwn(context.student,field),false);

  assert.equal((await parentGet('conduct',context)).json().data.length,0);
  assert.equal((await request('GET','/api/v1/parent/truong-thu-a/context')).statusCode,409);
  assert.equal((await request('GET','/api/v1/parent/truong-thu-b/context',undefined,undefined,{'x-parent-view':context.viewId})).statusCode,401);
  const event={periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Nội dung được công bố cho con',internalNote:'Không được lộ cho phụ huynh',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()};
  const recorded=await f.post(`${base}/conduct-records`,event);assert.equal(recorded.statusCode,201);assert.equal((await f.post(`${base}/conduct-records/${recorded.json().data.id}/approve`,{expectedVersion:recorded.json().data.version})).statusCode,200);
  const summary=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`)).json().data;
  const locked=await f.post(`${base}/conduct-periods/${f.period.id}/lock`,{expectedVersion:summary.period.version});assert.equal(locked.statusCode,200);assert.equal((await parentGet('conduct',context)).json().data.length,0);
  const published=await f.post(`${base}/conduct-periods/${f.period.id}/publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);
  const child=await parentGet(`conduct/${f.period.id}`,context);assert.equal(child.statusCode,200,child.body);assert.equal(child.json().data.finalPoints,'80.30');assert.equal(child.json().data.publishedAt,published.json().data.publishedAt);assert.equal(child.body.includes('Không được lộ cho phụ huynh'),false);assert.equal(Object.hasOwn(child.json().data,'students'),false);assert.equal(child.headers['cache-control'],'no-store');assert.equal(child.headers['referrer-policy'],'no-referrer');assert.match(child.headers['x-robots-tag'],/noindex/);
  const overview=await parentGet('overview',context);assert.equal(overview.statusCode,200,overview.body);assert.equal(overview.json().data.latestConduct.periodId,f.period.id);assert.equal(overview.json().data.context.lastPublishedAt,published.json().data.publishedAt);assert.equal((await parentGet('context',context)).json().data.lastPublishedAt,published.json().data.publishedAt);
  const attendance=await f.post(`${base}/attendance`,{date:'2026-09-29',granularity:'DAILY'});assert.equal(attendance.statusCode,201);let session=attendance.json().data;
  const marked=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/attendance/${session.id}/records`,{expectedVersion:session.version,records:session.records.map(r=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'PRESENT',publicNote:r.enrollmentId===f.enrollments[0].id?'Ghi chú riêng của con 0':'Ghi chú riêng của con 1',internalNote:'Nội bộ không chia sẻ'}))},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(marked.statusCode,200);session=marked.json().data;
  assert.equal((await parentGet('attendance',context)).json().data.length,0);assert.equal((await f.post(`${base}/attendance/${session.id}/publish`,{expectedSourceVersion:session.dataVersion})).statusCode,200);
  const childAttendance=await parentGet('attendance',context);assert.equal(childAttendance.statusCode,200,childAttendance.body);assert.equal(childAttendance.json().data.length,1);assert.equal(childAttendance.json().data[0].publicNote,'Ghi chú riêng của con 0');assert.equal(childAttendance.body.includes('Nội bộ không chia sẻ'),false);assert.equal(childAttendance.body.includes('Ghi chú riêng của con 1'),false);
  const preview=await request('GET',`/api/v1/schools/${schoolA}/parent-access/${link.access.id}/preview`);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().data.latestConduct.finalPoints,child.json().data.finalPoints);assert.equal(jar.get('edu_staff'),adminCookie);
  for(const path of ['context','attendance','timetable','duties','activities','announcements','teachers','documents']){const response=await parentGet(path,context);assert.equal(response.statusCode,200,`${path}: ${response.body}`);}
  const missing=await parentGet(`conduct/${crypto.randomUUID()}`,context);assert.equal(missing.statusCode,404);
  for(const resource of ['activities','announcements'])assert.equal((await parentGet(`${resource}/${crypto.randomUUID()}`,context)).statusCode,404);
  const forbidden=await server.inject({method:'GET',url:`/api/v1/schools/${schoolA}/classes/${f.classId}/students`,headers:{cookie:`edu_parent=${jar.get('edu_parent')}`}});assert.equal(forbidden.statusCode,401);
  const relation2=await parentRelationship(csrf,f.post,f.enrollments[1].studentId),issued2=await f.post('parent-access',{...body,studentId:f.enrollments[1].studentId,relationshipId:relation2.id});assert.equal(issued2.statusCode,201);
  const context2=await parentExchange(issued2.json().data.link);assert.notEqual(context2.viewId,context.viewId);assert.equal((await parentGet('overview',context)).statusCode,409);assert.equal((await parentGet(`conduct/${f.period.id}`,context2)).json().data.finalPoints,'80.10');
  const currentEvents=await request('GET',`/api/v1/schools/${schoolA}/parent-access/${link.access.id}/events`);assert.equal(currentEvents.statusCode,200,currentEvents.body);assert.equal(currentEvents.json().data.some(e=>e.eventKind==='EXCHANGED'),true);assert.equal(currentEvents.json().data.some(e=>e.eventKind==='READ'),true);assert.equal(currentEvents.body.includes('ipDailyHash'),false);
  const withdrawn=await f.post(`publications/${published.json().data.id}/withdraw`,{expectedVersion:published.json().data.version,reason:'Thu hồi dữ liệu phụ huynh kiểm thử'});assert.equal(withdrawn.statusCode,200);assert.equal((await parentGet(`conduct/${f.period.id}`,context2)).statusCode,404);
  const end=await request('POST','/api/v1/parent/truong-thu-a/session/end',undefined,context2.csrfToken,{'x-parent-view':context2.viewId});assert.equal(end.statusCode,200,end.body);assert.equal((await parentGet('context',context2)).statusCode,401);
  const minimal=await f.post('parent-access',{...body,allowedSections:['overview']});assert.equal(minimal.statusCode,201,minimal.body);const minimalContext=await parentExchange(minimal.json().data.link);assert.equal(minimalContext.lastPublishedAt,null);assert.equal((await parentGet('conduct',minimalContext)).statusCode,403);
});

test('B4 section/download rights, reissue, relationship revocation and foreign UUIDs are checked on each new parent request',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),body={studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'};
  const issued=await f.post('parent-access',body);assert.equal(issued.statusCode,201);let access=issued.json().data.access,context=await parentExchange(issued.json().data.link);
  assert.equal((await parentGet('conduct',context)).statusCode,403);assert.equal((await parentGet('documents',context)).statusCode,403);
  const reissued=await f.post(`parent-access/${access.id}/reissue`,{expectedVersion:access.version,reason:'Cấp lại link để kiểm tra thu hồi'});assert.equal(reissued.statusCode,200,reissued.body);assert.equal((await parentGet('overview',context)).statusCode,401);
  context=await parentExchange(reissued.json().data.link);access=reissued.json().data.access;
  const revoked=await f.post(`parent-access/${access.id}/revoke`,{expectedVersion:access.version,reason:'Thu hồi quyền đọc hiện tại'});assert.equal(revoked.statusCode,200,revoked.body);assert.equal((await parentGet('context',context)).statusCode,401);
  const again=await f.post('parent-access',body);assert.equal(again.statusCode,201);context=await parentExchange(again.json().data.link);
  const relationRevoked=await f.post(`relationships/${relation.id}/revoke`,{expectedVersion:relation.version,reason:'Quan hệ không còn nhận thông tin'});assert.equal(relationRevoked.statusCode,200);assert.equal((await parentGet('overview',context)).statusCode,401);
  const refused=await f.post('parent-access',body);assert.equal(refused.statusCode,422);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/parent-access?studentId=${body.studentId}`)).statusCode,200);
  await login('teacher-a@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${schoolA}/parent-access/${access.id}`)).statusCode,404);
});

test('B4 private documents stream only with both download rights, and teacher contact projections use shared work fields',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId);
  const form=new FormData(),image=await sharp({create:{width:3,height:3,channels:3,background:'#aabbcc'}}).png().toBuffer();form.append('purpose','CLASS_DOCUMENT');form.append('classId',f.classId);form.append('file',new Blob([image],{type:'image/png'}),'private-parent.png');
  const prepared=new Request(origin,{method:'POST',body:form}),upload=await server.inject({method:'POST',url:`/api/v1/schools/${schoolA}/files`,headers:{origin,cookie:cookies(),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':prepared.headers.get('content-type')},payload:Buffer.from(await prepared.arrayBuffer())});assert.equal(upload.statusCode,200,upload.body);
  const worker=new WorkerRunner();try{await drainSchool(worker);}finally{await worker.close();}
  const docs=await db.transaction(async tx=>{
    const rows=[];for(const e of f.enrollments)rows.push((await tx.query(`INSERT INTO app.parent_document_items(school_id,student_id,year_id,file_id,title,download_allowed,published_at) VALUES($1,$2,$3,$4,'Tài liệu đã công bố cho con',true,now()) RETURNING id`,[schoolA,e.studentId,seedId('year:A'),upload.json().data.id])).rows[0]);return rows;
  },{schoolId:schoolA});
  const assignment=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:'2026-09-01',endsOn:'2027-06-01',reason:'Khởi tạo phân công lịch sử kiểm thử'});assert.equal(assignment.statusCode,201,assignment.body);
  const body={studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview','teachers','documents'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'};
  const deniedLink=await f.post('parent-access',body);assert.equal(deniedLink.statusCode,201);let context=await parentExchange(deniedLink.json().data.link);
  const list=await parentGet('documents',context);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().data.length,1);assert.equal(list.json().data[0].id,docs[0].id);assert.equal(list.json().data[0].downloadAllowed,false);assert.equal(Object.hasOwn(list.json().data[0],'fileId'),false);
  assert.equal((await parentGet(`documents/${docs[0].id}/download`,context)).statusCode,403);assert.equal((await parentGet(`documents/${docs[1].id}/download`,context)).statusCode,404);
  const allowed=await f.post('parent-access',{...body,allowDownload:true});assert.equal(allowed.statusCode,201);context=await parentExchange(allowed.json().data.link);
  const download=await parentGet(`documents/${docs[0].id}/download`,context);assert.equal(download.statusCode,200,download.body);assert.equal(download.headers['content-type'],'image/png');assert.equal((await sharp(download.rawPayload).metadata()).width,3);
  await db.transaction(tx=>tx.query(`INSERT INTO app.parent_document_items(school_id,student_id,year_id,file_id,title,download_allowed,published_at) VALUES($1,$2,$3,$4,'Tài liệu thứ hai',false,now())`,[schoolA,f.enrollments[0].studentId,seedId('year:A'),upload.json().data.id]),{schoolId:schoolA});
  const page1=await parentGet('documents',context,'?limit=1');assert.equal(page1.statusCode,200,page1.body);assert.equal(page1.json().page.total,2);assert.equal(page1.json().page.hasMore,true);
  const page2=await parentGet('documents',context,`?limit=1&cursor=${encodeURIComponent(page1.json().page.nextCursor)}`);assert.equal(page2.statusCode,200,page2.body);assert.equal(page2.json().page.hasMore,false);assert.notEqual(page2.json().data[0].id,page1.json().data[0].id);
  const unavailable=[...page1.json().data,...page2.json().data].find(d=>!d.downloadAllowed);assert.ok(unavailable);assert.equal((await parentGet(`documents/${unavailable.id}/download`,context)).statusCode,403);
  const teachers=await parentGet('teachers',context);assert.equal(teachers.statusCode,200,teachers.body);assert.equal(teachers.json().data.length,1);assert.equal(teachers.json().data[0].workPhone,'Liên hệ công việc kiểm thử');assert.equal(Object.hasOwn(teachers.json().data[0],'userId'),false);assert.equal(teachers.body.includes('teacher-b@example.invalid'),false);
  const existing=await db.transaction(tx=>tx.query('SELECT share_work_contact FROM app.memberships WHERE school_id=$1 AND id=$2',[schoolA,seedId('member:A:teacher-b')]),{schoolId:schoolA});
  try{await db.transaction(tx=>tx.query('UPDATE app.memberships SET share_work_contact=false WHERE school_id=$1 AND id=$2',[schoolA,seedId('member:A:teacher-b')]),{schoolId:schoolA});assert.equal(Object.hasOwn((await parentGet('teachers',context)).json().data[0],'workPhone'),false);}
  finally{await db.transaction(tx=>tx.query('UPDATE app.memberships SET share_work_contact=$3 WHERE school_id=$1 AND id=$2',[schoolA,seedId('member:A:teacher-b'),existing.rows[0].share_work_contact]),{schoolId:schoolA});}
  const file=(await request('GET',`/api/v1/schools/${schoolA}/files/${upload.json().data.id}`)).json().data;
  assert.equal((await f.post(`files/${file.id}/archive`,{expectedVersion:file.version,reason:'Lưu trữ tài liệu đã kiểm thử'})).statusCode,200);
  assert.equal((await parentGet(`documents/${docs[0].id}/download`,context)).statusCode,404);
  const none=await parentGet('documents',context);assert.equal(none.statusCode,200);assert.equal(none.json().page.total,0);
});

test('B4 expired links, suspended schools, CSRF and exchange throttles deny without creating a parent identity',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),body={studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'};
  const count=(await db.app.query('SELECT count(*) AS n FROM identity.users')).rows[0].n;
  const issued=await f.post('parent-access',body);assert.equal(issued.statusCode,201);const context=await parentExchange(issued.json().data.link);
  assert.equal((await db.app.query('SELECT count(*) AS n FROM identity.users')).rows[0].n,count);
  const ended=await request('POST','/api/v1/parent/truong-thu-a/session/end',undefined,'wrong-csrf',{'x-parent-view':context.viewId});assert.equal(ended.statusCode,403);assert.equal((await parentGet('context',context)).statusCode,200);
  try{await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolA]);assert.equal((await parentGet('context',context)).statusCode,401);}
  finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolA]);}
  await db.transaction(tx=>tx.query("UPDATE app.parent_access_links SET expires_at=created_at+interval '1 millisecond' WHERE school_id=$1 AND id=$2",[schoolA,issued.json().data.access.id]),{schoolId:schoolA});assert.equal((await parentGet('context',context)).statusCode,401);
  const bootstrap=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  for(let i=0;i<21;i++){const invalid=await request('POST','/api/v1/parent/truong-thu-a/access/exchange',{token:'x'.repeat(43)},bootstrap);assert.equal(invalid.statusCode,i<19?401:429);assert.equal(invalid.body.includes('displayName'),false);}
});

test('B1 delegated grants and invitation acceptance stay inside the current expiry ceiling; backdated assignments require a reason',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=crypto.randomUUID(),post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const role=await post('roles',{code:`expiry-${prefix}`,label:'Quyền đọc có hạn giả',permissions:[{action:'school.read',scopes:['SCHOOL']}]});assert.equal(role.statusCode,201);
  const grantId=seedId('grant:A:admin-a:admin'),original=(await db.transaction(tx=>tx.query('SELECT valid_until FROM app.role_grants WHERE school_id=$1 AND id=$2',[schoolA,grantId]),{schoolId:schoolA})).rows[0].valid_until;
  const now=Date.now(),proposal={memberId:seedId('member:A:teacher-b'),roleId:role.json().data.id,scopeType:'SCHOOL',validFrom:new Date(now).toISOString()};
  try{
    await db.transaction(tx=>tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[schoolA,grantId,new Date(now+10*60000)]),{schoolId:schoolA});
    for(const until of [null,new Date(now+20*60000).toISOString()]){const denied=await post('grants',{...proposal,validUntil:until});assert.equal(denied.statusCode,403,denied.body);assert.equal(denied.json().code,'DELEGATION_EXPIRY_CEILING');}
    const okay=await post('grants',{...proposal,validUntil:new Date(now+5*60000).toISOString()});assert.equal(okay.statusCode,201,okay.body);
    const email=`expiry-${prefix}@example.invalid`,invitation=await post('invitations',{email,roleId:role.json().data.id,validFrom:proposal.validFrom,validUntil:new Date(now+5*60000).toISOString()});assert.equal(invitation.statusCode,201,invitation.body);
    const mail=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0],payload=decryptMail(mail.encrypted_payload),token=new URLSearchParams(new URL(payload.url).hash.slice(1)).get('token');
    await db.transaction(tx=>tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[schoolA,grantId,new Date(now+2*60000)]),{schoolId:schoolA});
    const anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
    const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Nhân sự bị trần quyền giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,422,accepted.body);assert.equal(accepted.json().code,'INVITATION_UNAVAILABLE');assert.equal((await db.app.query('SELECT id FROM identity.users WHERE email_normalized=$1',[email])).rowCount,0);
  }finally{await db.transaction(tx=>tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[schoolA,grantId,original]),{schoolId:schoolA});}
  const cls=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`BACK-${prefix}`,name:'Lớp lùi ngày giả',capacity:10});assert.equal(cls.statusCode,201);
  const assignment={classId:cls.json().data.id,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:'2026-09-01',endsOn:'2027-06-01'};
  const missing=await post('assignments',assignment);assert.equal(missing.statusCode,422);assert.equal(missing.json().fieldErrors[0].path,'reason');
  const assigned=await post('assignments',{...assignment,reason:'Xác nhận phân công đã có từ đầu năm'});assert.equal(assigned.statusCode,201,assigned.body);
  const audit=await db.transaction(tx=>tx.query("SELECT reason FROM app.audit_events WHERE school_id=$1 AND target_id=$2 AND action='createAssignment'",[schoolA,assigned.json().data.id]),{schoolId:schoolA});assert.equal(audit.rows[0].reason,'Xác nhận phân công đã có từ đầu năm');
});

test('B2 shrinking class capacity checks planned future occupancy peaks, rather than only today',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=crypto.randomUUID(),post=(path,body)=>request('POST',`/api/v1/schools/${schoolA}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const created=await post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`PEAK-${prefix}`,name:'Lớp sĩ số theo thời gian giả',capacity:3});assert.equal(created.statusCode,201);const cls=created.json().data;
  for(let i=0;i<2;i++){const enrolled=await post('students',{studentCode:`PEAK-${prefix}-${i}`,fullName:'Học sinh tương lai giả',initialClassId:cls.id,startsOn:'2026-11-01'});assert.equal(enrolled.statusCode,201,enrolled.body);}
  const denied=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${cls.id}`,{expectedVersion:cls.version,capacity:1},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(denied.statusCode,422);assert.equal(denied.json().code,'CLASS_CAPACITY_EXCEEDED');
  const allowed=await request('PATCH',`/api/v1/schools/${schoolA}/classes/${cls.id}`,{expectedVersion:cls.version,capacity:2},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(allowed.statusCode,200);assert.equal(allowed.json().data.capacity,2);
});

async function schoolToday(){return (await db.app.query('SELECT (now() AT TIME ZONE timezone)::date AS day FROM platform.schools WHERE id=$1',[schoolA])).rows[0].day;}
function nextDate(day,n){return new Date(Date.parse(`${day}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);}
test('B5 dated groups retain moves and same-day cancellations, require current class versions and end group-leader duties',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,today=await schoolToday(),future=nextDate(today,2);
  const first=await f.post(`${base}/groups`,{name:'Tổ một giả',sortOrder:1}),second=await f.post(`${base}/groups`,{name:'Tổ hai giả',sortOrder:2});assert.equal(first.statusCode,201,first.body);assert.equal(second.statusCode,201);let group=first.json().data;
  const edited=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/groups/${group.id}`,{expectedVersion:group.version,name:'Tổ một đổi tên giả'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200);group=edited.json().data;
  const currentClass=async()=>(await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}`)).json().data;
  const move=async(groupId,effectiveOn,reason)=>f.post(`${base}/groups/assign`,{groupId,enrollmentIds:[f.enrollments[0].id],effectiveOn,expectedClassVersion:(await currentClass()).version,...(reason?{reason}:{})});
  const noReason=await move(group.id,'2026-09-28');assert.equal(noReason.statusCode,422);
  const before=await currentClass(),assigned=await move(group.id,'2026-09-28','Xác minh tổ từ đầu tuần');assert.equal(assigned.statusCode,200,assigned.body);
  const stale=await f.post(`${base}/groups/assign`,{groupId:second.json().data.id,enrollmentIds:[f.enrollments[0].id],effectiveOn:future,expectedClassVersion:before.version});assert.equal(stale.statusCode,409);
  const position=await f.post(`${base}/positions`,{code:'group_leader',name:'Tổ trưởng giả',singleHolder:true,groupId:group.id});assert.equal(position.statusCode,201,position.body);
  const leader=await f.post(`${base}/positions/assign`,{positionId:position.json().data.id,enrollmentId:f.enrollments[0].id,startsOn:'2026-09-28',reason:'Xác minh tổ trưởng từ đầu tuần'});assert.equal(leader.statusCode,201,leader.body);
  const invalid=await f.post(`${base}/positions/assign`,{positionId:position.json().data.id,enrollmentId:f.enrollments[1].id,startsOn:today});assert.equal(invalid.statusCode,422);
  assert.equal((await move(second.json().data.id,future)).statusCode,200);
  const old=await request('GET',`/api/v1/schools/${schoolA}/${base}/groups?onDate=${today}`);assert.equal(old.statusCode,200,old.body);assert.deepEqual(old.json().data.find(g=>g.id===group.id).enrollmentIds,[f.enrollments[0].id]);
  const upcoming=await request('GET',`/api/v1/schools/${schoolA}/${base}/groups?onDate=${future}`);assert.deepEqual(upcoming.json().data.find(g=>g.id===second.json().data.id).enrollmentIds,[f.enrollments[0].id]);
  const ended=(await request('GET',`/api/v1/schools/${schoolA}/${base}/position-assignments?positionId=${position.json().data.id}`)).json().data[0];assert.equal(ended.endsOn,future);
  assert.equal((await move(group.id,future)).statusCode,200);assert.equal((await move(null,future)).statusCode,200);
  const history=await db.transaction(tx=>tx.query('SELECT group_id,starts_on,ends_on,cancelled_at FROM app.group_memberships WHERE school_id=$1 AND enrollment_id=$2 ORDER BY created_at',[schoolA,f.enrollments[0].id]),{schoolId:schoolA});assert.equal(history.rowCount,3);assert.equal(history.rows.filter(row=>row.cancelled_at).length,2);assert.equal(history.rows[0].ends_on,future);
  const upcomingAfter=await request('GET',`/api/v1/schools/${schoolA}/${base}/groups?onDate=${future}`);assert.equal(upcomingAfter.json().data.every(g=>!g.enrollmentIds.includes(f.enrollments[0].id)),true);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/positions`)).statusCode,200);
});

test('B5 position holders serialize and remain valid conduct sources; locked source history cannot be shortened',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,position=await f.post(`${base}/positions`,{code:'class_monitor',name:'Lớp trưởng giả',singleHolder:true});assert.equal(position.statusCode,201);const pos=position.json().data;
  const body={positionId:pos.id,startsOn:'2026-09-28',reason:'Xác minh lớp trưởng từ đầu tuần'},race=await Promise.all(f.enrollments.map(e=>f.post(`${base}/positions/assign`,{...body,enrollmentId:e.id})));assert.deepEqual(race.map(r=>r.statusCode).sort(),[201,409]);let assigned=race.find(r=>r.statusCode===201).json().data;
  const inUse=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/positions/${pos.id}`,{expectedVersion:pos.version,singleHolder:false},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(inUse.statusCode,409);
  const renamed=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/positions/${pos.id}`,{expectedVersion:pos.version,name:'Lớp trưởng đã xác minh giả'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(renamed.statusCode,200);
  const created=await f.post(`${base}/conduct-records`,{periodId:f.period.id,enrollmentId:assigned.enrollmentId,ruleId:f.fixed,publicReason:'Hoàn thành chức vụ được xác minh',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'POSITION',sourceId:assigned.id,clientEventId:null});assert.equal(created.statusCode,201,created.body);const record=created.json().data;
  assert.equal((await f.post(`${base}/conduct-records/${record.id}/approve`,{expectedVersion:record.version})).statusCode,200);
  const summary=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`)).json().data;
  const locked=await f.post(`${base}/conduct-periods/${f.period.id}/lock-and-publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:null});assert.equal(locked.statusCode,200,locked.body);
  const denied=await f.post(`${base}/position-assignments/${assigned.id}/end`,{expectedVersion:assigned.version,endsOn:'2026-09-29',reason:'Không được sửa nguồn đã chốt'});assert.equal(denied.statusCode,409,denied.body);assert.equal(denied.json().code,'LOCKED_CONDUCT_SOURCE');
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.position_assignments SET ends_on='2026-09-29' WHERE school_id=$1 AND id=$2",[schoolA,assigned.id]),{schoolId:schoolA}),e=>e.code==='23514');
  const ended=await f.post(`${base}/position-assignments/${assigned.id}/end`,{expectedVersion:assigned.version,endsOn:nextDate(await schoolToday(),1),reason:'Kết thúc từ ngày mai'});assert.equal(ended.statusCode,200,ended.body);assigned=ended.json().data;
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/position-assignments?onDate=2026-09-29`)).json().data.some(row=>row.id===assigned.id),true);
  const other=await f.post(`${base}/positions`,{code:'secretary',name:'Bí thư giả',singleHolder:true});assert.equal(other.statusCode,201);
  const toCancel=await f.post(`${base}/positions/assign`,{...body,positionId:other.json().data.id,enrollmentId:f.enrollments[0].id});assert.equal(toCancel.statusCode,201);
  const cancelled=await f.post(`${base}/position-assignments/${toCancel.json().data.id}/end`,{expectedVersion:toCancel.json().data.version,endsOn:'2026-09-28',reason:'Hủy phân công nhầm cùng ngày'});assert.equal(cancelled.statusCode,200,cancelled.body);assert.ok(cancelled.json().data.cancelledAt);
});

test('B5 seating validates effective enrollment and unique seats, preserves dated revisions and denies subject-only reads',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,today=await schoolToday(),future=nextDate(today,2),seats=[{key:'A1',row:0,column:0,enrollmentId:f.enrollments[0].id},{key:'A2',row:0,column:1,enrollmentId:f.enrollments[1].id},{key:'A3',row:0,column:2,enrollmentId:null}];
  for(const invalid of [[seats[0],{...seats[1],enrollmentId:seats[0].enrollmentId}],[seats[0],{...seats[1],column:0}],[{...seats[0],enrollmentId:seedId('enrollment:A:10A1:1')}]]){const denied=await f.post(`${base}/seating-plans`,{effectiveOn:today,seats:invalid});assert.equal(denied.statusCode,422,denied.body);}
  const race=await Promise.all([1,2].map(()=>f.post(`${base}/seating-plans`,{effectiveOn:today,seats,expectedRevision:0})));assert.deepEqual(race.map(r=>r.statusCode).sort(),[201,409]);let first=race.find(r=>r.statusCode===201).json().data;assert.equal(first.status,'DRAFT');
  const saved=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/seating-plans/${first.id}`,{expectedVersion:first.version,effectiveOn:today,seats},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(saved.statusCode,200,saved.body);first=saved.json().data;
  const stale=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/seating-plans/${first.id}`,{expectedVersion:first.version-1,effectiveOn:today,seats},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(stale.statusCode,409);
  const active=await f.post(`${base}/seating-plans/${first.id}/activate`,{expectedVersion:first.version});assert.equal(active.statusCode,200,active.body);first=active.json().data;
  const next=await f.post(`${base}/seating-plans`,{effectiveOn:future,seats:[{...seats[0],enrollmentId:f.enrollments[1].id},{...seats[1],enrollmentId:f.enrollments[0].id}],expectedRevision:first.revision});assert.equal(next.statusCode,201,next.body);
  assert.equal((await f.post(`${base}/seating-plans/${next.json().data.id}/activate`,{expectedVersion:next.json().data.version})).statusCode,200);
  const old=await request('GET',`/api/v1/schools/${schoolA}/${base}/seating-plans/${first.id}`);assert.equal(old.statusCode,200);assert.equal(old.json().data.endsOn,future);assert.deepEqual(old.json().data.seats,seats);
  const immutable=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/seating-plans/${first.id}`,{expectedVersion:old.json().data.version,effectiveOn:today,seats:[]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(immutable.statusCode,409);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.seating_plans SET layout='{}' WHERE school_id=$1 AND id=$2",[schoolA,first.id]),{schoolId:schoolA}),e=>e.code==='23514');
  await assert.rejects(db.transaction(tx=>tx.query('DELETE FROM app.seat_assignments WHERE school_id=$1 AND plan_id=$2',[schoolA,first.id]),{schoolId:schoolA}),e=>e.code==='23514');
  const history=await request('GET',`/api/v1/schools/${schoolA}/${base}/seating-plans?limit=1`);assert.equal(history.statusCode,200,history.body);assert.equal(history.json().page.total,2);assert.equal(history.json().page.hasMore,true);
  const subject=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-a'),subjectId:seedId('subject:A:math'),kind:'SUBJECT',startsOn:'2026-09-28',endsOn:'2027-06-01',reason:'Phân công môn kiểm tra sơ đồ'});assert.equal(subject.statusCode,201,subject.body);
  await login('teacher-a@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}`)).statusCode,200);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/seating-plans/${first.id}`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/groups`)).statusCode,404);
});

test('B2/B5 a transfer closes dated groups/positions and retains cancelled future plans atomically',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,today=await schoolToday(),cutoff=nextDate(today,1),future=nextDate(today,3);
  const group=await f.post(`${base}/groups`,{name:'Tổ chuyển lớp giả',sortOrder:1}),cls=(await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}`)).json().data;
  assert.equal((await f.post(`${base}/groups/assign`,{groupId:group.json().data.id,enrollmentIds:[f.enrollments[0].id],effectiveOn:'2026-09-28',expectedClassVersion:cls.version,reason:'Xác nhận tổ đầu tuần'})).statusCode,200);
  const position=await f.post(`${base}/positions`,{code:'group_leader',name:'Tổ trưởng chuyển lớp giả',singleHolder:true,groupId:group.json().data.id}),futurePosition=await f.post(`${base}/positions`,{code:'secretary',name:'Chức vụ dự kiến giả',singleHolder:true});
  const current=await f.post(`${base}/positions/assign`,{positionId:position.json().data.id,enrollmentId:f.enrollments[0].id,startsOn:'2026-09-28',reason:'Xác nhận chức vụ đầu tuần'});assert.equal(current.statusCode,201,current.body);
  const planned=await f.post(`${base}/positions/assign`,{positionId:futurePosition.json().data.id,enrollmentId:f.enrollments[0].id,startsOn:future});assert.equal(planned.statusCode,201);
  const target=await f.post('classes',{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`ORG-TRANSFER-${crypto.randomUUID()}`,name:'Lớp nhận tổ chức giả',capacity:4});assert.equal(target.statusCode,201);
  const submitted=await f.post('transfers',{studentId:f.enrollments[0].studentId,fromEnrollmentId:f.enrollments[0].id,toClassId:target.json().data.id,effectiveOn:cutoff,reason:'Chuyển lớp kết thúc tổ chức'});assert.equal(submitted.statusCode,201);
  const applied=await f.post(`transfers/${submitted.json().data.id}/approve`,{expectedVersion:submitted.json().data.version});assert.equal(applied.statusCode,200,applied.body);
  const positions=(await request('GET',`/api/v1/schools/${schoolA}/${base}/position-assignments`)).json().data;assert.equal(positions.find(p=>p.id===current.json().data.id).endsOn,cutoff);assert.ok(positions.find(p=>p.id===planned.json().data.id).cancelledAt);
  const history=await db.transaction(tx=>tx.query('SELECT ends_on FROM app.group_memberships WHERE school_id=$1 AND enrollment_id=$2',[schoolA,f.enrollments[0].id]),{schoolId:schoolA});assert.equal(history.rowCount,1);assert.equal(history.rows[0].ends_on,cutoff);
  const groups=await request('GET',`/api/v1/schools/${schoolA}/${base}/groups?onDate=${cutoff}`);assert.equal(groups.json().data.every(g=>!g.enrollmentIds.includes(f.enrollments[0].id)),true);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/students/${f.enrollments[0].studentId}/enrollments`)).json().data.length,2);
});

async function scheduleFixture(csrf){
  const f=await conductFixture(csrf),day=nextDate(await schoolToday(),1),base=`classes/${f.classId}`;
  const assignment=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-b'),subjectId:seedId('subject:A:math'),kind:'SUBJECT',startsOn:'2026-09-28',endsOn:'2027-06-01',reason:'Phân công cho kiểm thử lịch thật'});assert.equal(assignment.statusCode,201,assignment.body);
  const slot=(await db.transaction(tx=>tx.query(`SELECT to_char(t,'HH24:MI') AS starts,to_char(t+interval '1 minute','HH24:MI') AS ends
    FROM platform.schools s CROSS JOIN LATERAL generate_series($2::date+interval '8 hours',$2::date+interval '23 hours 58 minutes',interval '1 minute') t
    WHERE s.id=$1 AND NOT EXISTS(SELECT 1 FROM app.lesson_occurrences l WHERE l.school_id=s.id AND l.member_id=$3 AND l.status='SCHEDULED'
      AND l.starts_at<(t+interval '1 minute') AT TIME ZONE s.timezone AND l.ends_at>t AT TIME ZONE s.timezone) ORDER BY t LIMIT 1`,[schoolA,day,seedId('member:A:teacher-b')]),{schoolId:schoolA})).rows[0];assert.ok(slot);
  const room=await f.post('dictionaries/rooms',{code:`ROOM-${crypto.randomUUID()}`,name:'Phòng kiểm thử lịch',capacity:20});assert.equal(room.statusCode,201,room.body);
  const entry={weekday:new Date(`${day}T00:00:00Z`).getUTCDay()||7,periodNumber:1,subjectId:seedId('subject:A:math'),memberId:seedId('member:A:teacher-b'),roomId:room.json().data.id,startsAtLocal:slot.starts,endsAtLocal:slot.ends};return {...f,day,base,entry,assignment:assignment.json().data};
}
test('B5 timetable materializes bounded future lessons, publishes child-only projections and preserves past/source history',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await scheduleFixture(csrf),created=await f.post(`${f.base}/timetables`,{startsOn:f.day,endsOn:nextDate(f.day,1),entries:[f.entry]});assert.equal(created.statusCode,201,created.body);let timetable=created.json().data;
  const relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),access=await f.post('parent-access',{studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview','timetable'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(access.statusCode,201);const context=await parentExchange(access.json().data.link);
  assert.ok(Date.parse(context.expiresAt)-Date.now()<=8*3600000+5000);assert.ok(Date.parse(context.expiresAt)-Date.now()>7*3600000);
  assert.equal((await parentGet('timetable',context)).json().page.total,0);
  const validated=await f.post(`${f.base}/timetables/${timetable.id}/validate`,{expectedVersion:timetable.version});assert.equal(validated.statusCode,200,validated.body);assert.deepEqual(validated.json().data,{valid:true,conflicts:[]});
  timetable=(await request('GET',`/api/v1/schools/${schoolA}/${f.base}/timetables/${timetable.id}`)).json().data;assert.equal(timetable.status,'READY');
  assert.equal((await f.post(`${f.base}/timetables/${timetable.id}/publish`,{expectedSourceVersion:timetable.dataVersion-1,expectedPublicationId:null})).statusCode,409);
  const published=await f.post(`${f.base}/timetables/${timetable.id}/publish`,{expectedSourceVersion:timetable.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);const publication=published.json().data;
  const lessons=await request('GET',`/api/v1/schools/${schoolA}/timetable?classId=${f.classId}&from=${f.day}&to=${nextDate(f.day,1)}`);assert.equal(lessons.statusCode,200,lessons.body);assert.equal(lessons.json().data.length,1);const lesson=lessons.json().data[0];assert.equal(lesson.periodNumber,1);assert.equal(lesson.status,'SCHEDULED');
  const parent=await parentGet('timetable',context);assert.equal(parent.statusCode,200,parent.body);assert.equal(parent.json().page.total,1);assert.equal(parent.json().data[0].date,f.day);assert.equal(parent.json().data[0].subjectName,'Toán');assert.equal(Object.hasOwn(parent.json().data[0],'memberId'),false);assert.equal(Object.hasOwn(parent.json().data[0],'classId'),false);
  const detail=await request('GET',`/api/v1/schools/${schoolA}/${f.base}/publications/${publication.id}`);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.lessons.length,1);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${f.base}/timetables`)).statusCode,200);
  const immutable=await request('PATCH',`/api/v1/schools/${schoolA}/${f.base}/timetables/${timetable.id}`,{expectedVersion:(await request('GET',`/api/v1/schools/${schoolA}/${f.base}/timetables/${timetable.id}`)).json().data.version,entries:[]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(immutable.statusCode,409);
  await assert.rejects(db.transaction(tx=>tx.query('UPDATE app.timetable_entries SET starts_at_local=starts_at_local WHERE school_id=$1 AND timetable_id=$2',[schoolA,timetable.id]),{schoolId:schoolA}),e=>e.code==='23514');
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.lesson_occurrences SET starts_at=starts_at+interval '1 minute' WHERE school_id=$1 AND id=$2",[schoolA,lesson.id]),{schoolId:schoolA}),e=>e.code==='23514');
  const attendance=await f.post(`${f.base}/attendance`,{date:f.day,granularity:'LESSON',lessonId:lesson.id});assert.equal(attendance.statusCode,422);assert.equal(attendance.json().fieldErrors[0].path,'date');
  // The attendance API rejects future dates. Seed a synthetic source row to
  // verify replacement also denies an unexpected/preallocated future source.
  await db.transaction(tx=>tx.query(`INSERT INTO app.attendance_sessions(school_id,class_id,year_id,session_date,granularity,slot_key,lesson_id,created_by)
    VALUES($1,$2,$3,$4,'LESSON',$5::uuid::text,$5::uuid,$6)`,[schoolA,f.classId,seedId('year:A'),f.day,lesson.id,seedId('user:admin-a')]),{schoolId:schoolA});
  const replacement=await f.post(`${f.base}/timetables`,{startsOn:f.day,endsOn:nextDate(f.day,1),entries:[]});assert.equal(replacement.statusCode,201);const blocked=await f.post(`${f.base}/timetables/${replacement.json().data.id}/validate`,{expectedVersion:replacement.json().data.version});assert.equal(blocked.statusCode,200);assert.equal(blocked.json().data.valid,false);assert.equal(blocked.json().data.conflicts[0].kind,'CLASS');
  const withheld=await f.post(`${f.base}/timetables/${replacement.json().data.id}/publish`,{expectedSourceVersion:replacement.json().data.dataVersion,expectedPublicationId:publication.id});assert.equal(withheld.statusCode,422);assert.equal(withheld.json().code,'SCHEDULE_CONFLICTS');assert.equal((await parentGet('timetable',context)).json().page.total,1);
  const withdrawn=await f.post(`publications/${publication.id}/withdraw`,{expectedVersion:publication.version,reason:'Thu hồi lịch kiểm thử'});assert.equal(withdrawn.statusCode,200);assert.equal((await parentGet('timetable',context)).json().page.total,0);
});

test('B5 timetable rejects teacher/room collisions and revoked assignments, skips holidays and revalidates source versions',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await scheduleFixture(csrf),body={startsOn:f.day,endsOn:nextDate(f.day,1),entries:[f.entry]},first=await f.post(`${f.base}/timetables`,body);assert.equal(first.statusCode,201);let t=first.json().data;
  const patch=await request('PATCH',`/api/v1/schools/${schoolA}/${f.base}/timetables/${t.id}`,{expectedVersion:t.version,entries:[f.entry]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(patch.statusCode,200,patch.body);t=patch.json().data;
  const published=await f.post(`${f.base}/timetables/${t.id}/publish`,{expectedSourceVersion:t.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);
  const other=await scheduleFixture(csrf),collision=await other.post(`${other.base}/timetables`,{...body,entries:[f.entry]});assert.equal(collision.statusCode,201);const conflict=await other.post(`${other.base}/timetables/${collision.json().data.id}/validate`,{expectedVersion:collision.json().data.version});assert.equal(conflict.statusCode,200,conflict.body);assert.equal(conflict.json().data.valid,false);assert.equal(conflict.json().data.conflicts.some(c=>c.kind==='TEACHER'),true);
  assert.equal((await other.post(`${other.base}/timetables/${collision.json().data.id}/publish`,{expectedSourceVersion:collision.json().data.dataVersion,expectedPublicationId:null})).statusCode,422);
  const revoked=await other.post(`assignments/${other.assignment.id}/revoke`,{expectedVersion:other.assignment.version,reason:'Thu hồi phân công trước công bố'});assert.equal(revoked.statusCode,200,revoked.body);
  const refresh=(await request('GET',`/api/v1/schools/${schoolA}/${other.base}/timetables/${collision.json().data.id}`)).json().data;
  const noAuthority=await other.post(`${other.base}/timetables/${refresh.id}/validate`,{expectedVersion:refresh.version});assert.equal(noAuthority.statusCode,200);assert.equal(noAuthority.json().data.conflicts.some(c=>c.kind==='ASSIGNMENT'),true);
  const changedTeacher=await other.post('assignments',{classId:other.classId,memberId:seedId('member:A:teacher-a'),subjectId:seedId('subject:A:math'),kind:'SUBJECT',startsOn:'2026-09-28',endsOn:'2027-06-01',reason:'Phân công người khác kiểm tra phòng'});assert.equal(changedTeacher.statusCode,201,changedTeacher.body);
  const roomCollision=await other.post(`${other.base}/timetables`,{...body,entries:[{...f.entry,memberId:seedId('member:A:teacher-a')}]});assert.equal(roomCollision.statusCode,201);
  const roomConflict=await other.post(`${other.base}/timetables/${roomCollision.json().data.id}/validate`,{expectedVersion:roomCollision.json().data.version});assert.equal(roomConflict.statusCode,200,roomConflict.body);assert.equal(roomConflict.json().data.conflicts.some(c=>c.kind==='ROOM'),true);
  const holiday=await other.post('calendar-events',{yearId:seedId('year:A'),classId:other.classId,title:'Ngày nghỉ lịch kiểm thử',kind:'HOLIDAY',startsOn:f.day,endsOn:nextDate(f.day,1)});assert.equal(holiday.statusCode,201);
  assert.equal((await other.post(`calendar-events/${holiday.json().data.id}/publish`,{expectedVersion:holiday.json().data.version})).statusCode,200);
  const latest=(await request('GET',`/api/v1/schools/${schoolA}/${other.base}/timetables/${refresh.id}`)).json().data,skipped=await other.post(`${other.base}/timetables/${latest.id}/validate`,{expectedVersion:latest.version});assert.equal(skipped.statusCode,200);assert.equal(skipped.json().data.valid,true,skipped.body);
});

test('B5 duties publish only individual tasks, reject foreign enrollment and retain immutable publication/withdraw history',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,day=nextDate(await schoolToday(),1),assignments=f.enrollments.map((e,i)=>({enrollmentId:e.id,dutyDate:day,task:`Nhiệm vụ riêng học sinh ${i}`,status:'ASSIGNED'}));
  const bad=await f.post(`${base}/duties`,{startsOn:day,endsOn:nextDate(day,1),assignments:[{...assignments[0],enrollmentId:seedId('enrollment:A:10A1:1')}]});assert.equal(bad.statusCode,422);
  const created=await f.post(`${base}/duties`,{startsOn:day,endsOn:nextDate(day,1),assignments});assert.equal(created.statusCode,201,created.body);let duty=created.json().data;
  const edited=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/duties/${duty.id}`,{expectedVersion:duty.version,assignments},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200,edited.body);duty=edited.json().data;
  const relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),access=await f.post('parent-access',{studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview','duties'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(access.statusCode,201);const context=await parentExchange(access.json().data.link);assert.equal((await parentGet('duties',context)).json().page.total,0);
  const published=await f.post(`${base}/duties/${duty.id}/publish`,{expectedSourceVersion:duty.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);const publication=published.json().data;
  const parent=await parentGet('duties',context);assert.equal(parent.statusCode,200,parent.body);assert.equal(parent.json().page.total,1);assert.equal(parent.json().data[0].task,assignments[0].task);assert.equal(parent.body.includes(assignments[1].task),false);assert.equal(Object.hasOwn(parent.json().data[0],'enrollmentId'),false);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/duties`)).statusCode,200);
  assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/publications/${publication.id}`)).statusCode,200);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.duty_assignments SET task='Viết lại nhiệm vụ đã công bố' WHERE school_id=$1 AND schedule_id=$2",[schoolA,duty.id]),{schoolId:schoolA}),e=>e.code==='23514');
  assert.equal((await f.post(`publications/${publication.id}/withdraw`,{expectedVersion:publication.version,reason:'Thu hồi trực nhật kiểm thử'})).statusCode,200);assert.equal((await parentGet('duties',context)).json().page.total,0);
});

test('B5 group duties expand the effective group at publication and retain the individual targets after later moves',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`classes/${f.classId}`,day=nextDate(await schoolToday(),1),task='Nhiệm vụ theo tổ được cố định khi công bố';
  const createdGroup=await f.post(`${base}/groups`,{name:'Tổ trực nhật giả',sortOrder:1});assert.equal(createdGroup.statusCode,201);const groupId=createdGroup.json().data.id;
  const move=async(enrollmentId,group)=>{const cls=(await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}`)).json().data;const response=await f.post(`${base}/groups/assign`,{groupId:group,enrollmentIds:[enrollmentId],effectiveOn:day,expectedClassVersion:cls.version});assert.equal(response.statusCode,200,response.body);};
  await move(f.enrollments[0].id,groupId);
  const created=await f.post(`${base}/duties`,{startsOn:day,endsOn:nextDate(day,1),assignments:[],groupAssignments:[{groupId,dutyDate:day,task}]});assert.equal(created.statusCode,201,created.body);let duty=created.json().data;assert.equal(duty.assignments.length,0);assert.equal(duty.groupAssignments.length,1);
  const relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),access=await f.post('parent-access',{studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview','duties'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(access.statusCode,201);const firstContext=await parentExchange(access.json().data.link);
  await move(f.enrollments[0].id,null);await move(f.enrollments[1].id,groupId);
  const published=await f.post(`${base}/duties/${duty.id}/publish`,{expectedSourceVersion:duty.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);const publication=published.json().data;assert.equal((await parentGet('duties',firstContext)).json().page.total,0);
  duty=(await request('GET',`/api/v1/schools/${schoolA}/${base}/duties`)).json().data.find(d=>d.id===duty.id);assert.equal(duty.assignments.length,1);assert.equal(duty.assignments[0].enrollmentId,f.enrollments[1].id);assert.equal(duty.dataVersion,publication.sourceVersion);
  const secondRelation=await parentRelationship(csrf,f.post,f.enrollments[1].studentId),secondAccess=await f.post('parent-access',{studentId:f.enrollments[1].studentId,yearId:seedId('year:A'),relationshipId:secondRelation.id,allowedSections:['overview','duties'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(secondAccess.statusCode,201);const secondContext=await parentExchange(secondAccess.json().data.link);assert.equal((await parentGet('duties',secondContext)).json().data[0].task,task);
  await move(f.enrollments[1].id,null);assert.equal((await parentGet('duties',secondContext)).json().data[0].task,task);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.duty_group_plans SET task='Đổi nguồn sau công bố' WHERE school_id=$1 AND schedule_id=$2",[schoolA,duty.id]),{schoolId:schoolA}),e=>e.code==='23514');
  const empty=await f.post(`${base}/duties`,{startsOn:day,endsOn:nextDate(day,1),assignments:[],groupAssignments:[{groupId,dutyDate:day,task:'Tổ rỗng không được công bố'}]});assert.equal(empty.statusCode,201);assert.equal((await f.post(`${base}/duties/${empty.json().data.id}/publish`,{expectedSourceVersion:empty.json().data.dataVersion,expectedPublicationId:publication.id})).statusCode,422);
  assert.equal((await parentGet('duties',secondContext)).json().data[0].task,task);
});

async function activityFixture(csrf,evidenceRequired=false){
  const f=await conductFixture(csrf),base=`classes/${f.classId}`,dueAt=new Date(Date.now()+2*86400000).toISOString();
  const response=await f.post(`${base}/activities`,{title:'Hoạt động thử nguồn thật',description:'Chỉ người được giao nhận tình trạng riêng',dueAt,evidenceRequired,enrollmentIds:[f.enrollments[0].id],illustration:'stem'});
  assert.equal(response.statusCode,201,response.body);const activity=response.json().data;
  const url=`/api/v1/schools/${schoolA}/${base}/activities/${activity.id}`;
  const get=async()=>{const r=await request('GET',url);assert.equal(r.statusCode,200,r.body);return r.json().data;};
  const participants=async()=>{const r=await request('GET',`${url}/participants`);assert.equal(r.statusCode,200,r.body);return r.json().data;};
  const patch=body=>request('PATCH',url,body,csrf,{'idempotency-key':crypto.randomUUID()});
  return {...f,base,activity,url,get,participants,patch};
}
async function activityParent(csrf,f,index=0,sections=['activities','documents'],allowDownload=true){
  const relation=await parentRelationship(csrf,f.post,f.enrollments[index].studentId);
  const issued=await f.post('parent-access',{studentId:f.enrollments[index].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:sections,allowDownload,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(issued.statusCode,201,issued.body);
  return parentExchange(issued.json().data.link);
}

test('B5 activities count only explicit participants, preserve published states and require current source/review authority',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await activityFixture(csrf);
  assert.equal(f.activity.participantCount,1);assert.equal(f.activity.approvedCount,0);
  const ctx=await activityParent(csrf,f);assert.equal((await parentGet('activities',ctx)).json().data.length,0);
  const foreign=await f.post(`${f.base}/activities`,{title:'Sai lớp không được ghi',description:'Không được lấy học sinh lớp khác',dueAt:f.activity.dueAt,evidenceRequired:false,enrollmentIds:[seedId('enrollment:A:10A1:1')]});assert.equal(foreign.statusCode,422,foreign.body);
  let activity=(await f.post(`${f.base}/activities/${f.activity.id}/assign`,{expectedVersion:f.activity.version})).json().data;assert.equal(activity.status,'ASSIGNED');
  let p=(await f.participants())[0];
  const reviewed=await f.post(`${f.base}/activities/${activity.id}/participants/${p.id}/status`,{expectedVersion:p.version,status:'APPROVED',reason:'Đã hoàn thành và được xác minh'});assert.equal(reviewed.statusCode,200,reviewed.body);p=reviewed.json().data;
  assert.equal((await parentGet('activities',ctx)).json().data.length,0);
  const noAuto=await db.transaction(tx=>tx.query("SELECT id FROM app.conduct_records WHERE school_id=$1 AND class_id=$2 AND source_kind='ACTIVITY'",[schoolA,f.classId]),{schoolId:schoolA});assert.equal(noAuto.rowCount,0);
  const stale=await f.post(`${f.base}/activities/${activity.id}/publish`,{expectedSourceVersion:activity.dataVersion});assert.equal(stale.statusCode,409);
  activity=await f.get();let pub=await f.post(`${f.base}/activities/${activity.id}/publish`,{expectedSourceVersion:activity.dataVersion,expectedPublicationId:null});assert.equal(pub.statusCode,200,pub.body);pub=pub.json().data;
  const publicView=await parentGet(`activities/${activity.id}`,ctx);assert.equal(publicView.statusCode,200,publicView.body);assert.equal(publicView.json().data.studentStatus,'APPROVED');
  for(const key of ['enrollmentId','participantId','reviewedBy','internalNote','participantCount'])assert.equal(Object.hasOwn(publicView.json().data,key),false);
  const other=await activityParent(csrf,f,1);assert.equal((await parentGet('activities',other)).json().data.length,0);assert.equal((await parentGet(`activities/${activity.id}`,other)).statusCode,404);
  const first=await activityParent(csrf,f);
  const changed=await f.post(`${f.base}/activities/${activity.id}/participants/${p.id}/status`,{expectedVersion:p.version,status:'NEEDS_REVISION',reason:'Cần bổ sung sản phẩm'});assert.equal(changed.statusCode,200,changed.body);
  assert.equal((await parentGet(`activities/${activity.id}`,first)).json().data.studentStatus,'APPROVED');
  activity=await f.get();const updated=await f.post(`${f.base}/activities/${activity.id}/publish`,{expectedSourceVersion:activity.dataVersion,expectedPublicationId:pub.id});assert.equal(updated.statusCode,200,updated.body);
  assert.equal((await parentGet(`activities/${activity.id}`,first)).json().data.studentStatus,'NEEDS_REVISION');
  const removed=await f.patch({expectedVersion:activity.version,enrollmentIds:[f.enrollments[1].id]});assert.equal(removed.statusCode,422);
  const closed=await f.patch({expectedVersion:activity.version,status:'CLOSED'});assert.equal(closed.statusCode,200,closed.body);p=(await f.participants())[0];assert.equal((await f.post(`${f.base}/activities/${activity.id}/participants/${p.id}/status`,{expectedVersion:p.version,status:'EXCUSED',reason:'Không sửa khi kết thúc'})).statusCode,409);
  const reopened=await f.patch({expectedVersion:closed.json().data.version,status:'ASSIGNED'});assert.equal(reopened.statusCode,200,reopened.body);
  const withdrawn=await f.post(`publications/${updated.json().data.id}/withdraw`,{expectedVersion:updated.json().data.version,reason:'Thu hồi tình trạng hoạt động'});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal((await parentGet('activities',first)).json().data.length,0);
  await login('teacher-b@example.invalid');assert.equal((await request('GET',f.url)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/classes/${f.classId}/activities/${activity.id}`)).statusCode,404);
});

test('B5 approved activity results are explicit conduct sources and locked approved facts protect their source history',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await activityFixture(csrf),aid=f.activity.id;
  const assigned=await f.post(`${f.base}/activities/${aid}/assign`,{expectedVersion:f.activity.version});assert.equal(assigned.statusCode,200,assigned.body);let p=(await f.participants())[0];
  const source=()=>({periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Đóng góp đã duyệt từ hoạt động',occurredAt:new Date().toISOString(),sourceKind:'ACTIVITY',sourceId:p.id,clientEventId:null});
  const unreviewed=await f.post(`${f.base}/conduct-records`,source());assert.equal(unreviewed.statusCode,422);
  const approval=await f.post(`${f.base}/activities/${aid}/participants/${p.id}/status`,{expectedVersion:p.version,status:'APPROVED',reason:'Hoàn thành qua xác minh trực tiếp'});assert.equal(approval.statusCode,200,approval.body);p=approval.json().data;
  const backdated=await f.post(`${f.base}/conduct-records`,{...source(),occurredAt:'2026-09-29T01:00:00Z'});assert.equal(backdated.statusCode,422);
  let record=await f.post(`${f.base}/conduct-records`,source());assert.equal(record.statusCode,201,record.body);record=record.json().data;
  const approved=await f.post(`${f.base}/conduct-records/${record.id}/approve`,{expectedVersion:record.version});assert.equal(approved.statusCode,200,approved.body);
  const review=await request('GET',`/api/v1/schools/${schoolA}/${f.base}/conduct-periods/${f.period.id}/review`);assert.equal(review.json().data.canLock,true);
  const locked=await f.post(`${f.base}/conduct-periods/${f.period.id}/lock`,{expectedVersion:review.json().data.period.version});assert.equal(locked.statusCode,200,locked.body);
  const reject=await f.post(`${f.base}/activities/${aid}/participants/${p.id}/status`,{expectedVersion:p.version,status:'NEEDS_REVISION',reason:'Không được viết lại nguồn kỳ khóa'});assert.equal(reject.statusCode,422,reject.body);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.activity_participants SET status='EXCUSED' WHERE school_id=$1 AND id=$2",[schoolA,p.id]),{schoolId:schoolA}),e=>e.code==='23514');
  assert.equal((await f.participants())[0].status,'APPROVED');
});

test('B5 evidence stays private until review and publication; parent documents remain child-bound and filter file availability',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await activityFixture(csrf,true),worker=new WorkerRunner();
  try{
    const assigned=await f.post(`${f.base}/activities/${f.activity.id}/assign`,{expectedVersion:f.activity.version});assert.equal(assigned.statusCode,200,assigned.body);let p=(await f.participants())[0];
    const noEvidence=await f.post(`${f.base}/activities/${f.activity.id}/participants/${p.id}/status`,{expectedVersion:p.version,status:'APPROVED',reason:'Chưa có minh chứng được duyệt'});assert.equal(noEvidence.statusCode,422);
    const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#224499'}}).png().toBuffer();
    const form=new FormData();form.append('purpose','EVIDENCE');form.append('classId',f.classId);form.append('file',new Blob([bytes],{type:'image/png'}),`minh-chung-${crypto.randomUUID()}.png`);const prepared=new Request(origin,{method:'POST',body:form});
    const upload=await server.inject({method:'POST',url:`/api/v1/schools/${schoolA}/files`,headers:{origin,cookie:cookies(),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':prepared.headers.get('content-type')},payload:Buffer.from(await prepared.arrayBuffer())});assert.equal(upload.statusCode,200,upload.body);let file=upload.json().data;
    const quarantine=await f.post(`${f.base}/evidence`,{participantId:p.id,fileId:file.id,shareWithGuardian:false});assert.equal(quarantine.statusCode,409);
    await drainSchool(worker);file=(await request('GET',`/api/v1/schools/${schoolA}/files/${file.id}`)).json().data;assert.equal(file.status,'READY');
    assert.equal((await f.post('file-links',{fileId:file.id,activityId:f.activity.id,shareWithGuardian:true})).statusCode,422);
    const earlyShare=await f.post(`${f.base}/evidence`,{participantId:p.id,fileId:file.id,shareWithGuardian:true});assert.equal(earlyShare.statusCode,422);
    let ev=await f.post(`${f.base}/evidence`,{participantId:p.id,fileId:file.id,caption:'Sản phẩm của riêng học sinh',shareWithGuardian:false});assert.equal(ev.statusCode,201,ev.body);ev=ev.json().data;assert.equal((await f.participants())[0].status,'SUBMITTED');
    const notice=await request('GET',`/api/v1/me/notifications?kind=task&q=${encodeURIComponent(f.activity.title)}`);assert.equal(notice.statusCode,200,notice.body);assert.equal(notice.json().data.filter(n=>n.targetId===f.activity.id).length,1);assert.equal(notice.json().data.find(n=>n.targetId===f.activity.id).accessible,true);
    assert.equal((await f.post(`${f.base}/evidence`,{participantId:p.id,fileId:file.id,shareWithGuardian:false})).statusCode,409);
    const ctx=await activityParent(csrf,f);assert.equal((await parentGet('documents',ctx)).json().data.length,0);
    const needReason=await f.post(`${f.base}/evidence/${ev.id}/review`,{expectedVersion:ev.version,decision:'APPROVED',shareWithGuardian:true});assert.equal(needReason.statusCode,422);
    const approved=await f.post(`${f.base}/evidence/${ev.id}/review`,{expectedVersion:ev.version,decision:'APPROVED',reason:'Minh chứng đã được kiểm tra',shareWithGuardian:true});assert.equal(approved.statusCode,200,approved.body);ev=approved.json().data;
    assert.equal((await parentGet('documents',ctx)).json().data.length,0);const a=await f.get();const published=await f.post(`${f.base}/activities/${a.id}/publish`,{expectedSourceVersion:a.dataVersion});assert.equal(published.statusCode,200,published.body);
    const parent=await parentGet(`activities/${a.id}`,ctx);assert.equal(parent.statusCode,200,parent.body);assert.equal(parent.json().data.documents.length,1);const doc=parent.json().data.documents[0];
    const download=await parentGet(`documents/${doc.id}/download`,ctx);assert.equal(download.statusCode,200,download.body);assert.equal(download.headers['content-type'],'image/png');
    const replay=await f.post(`${f.base}/activities/${a.id}/publish`,{expectedSourceVersion:a.dataVersion,expectedPublicationId:published.json().data.id});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().data.id,published.json().data.id);assert.equal((await parentGet('documents',ctx)).json().data.length,1);
    const other=await activityParent(csrf,f,1);assert.equal((await parentGet('documents',other)).json().data.length,0);assert.equal((await parentGet(`documents/${doc.id}/download`,other)).statusCode,404);
    const limited=await activityParent(csrf,f,0,['activities'],false);assert.equal((await parentGet(`activities/${a.id}`,limited)).json().data.documents.length,0);
    const noDownload=await activityParent(csrf,f,0,['activities','documents'],false);assert.equal((await parentGet(`activities/${a.id}`,noDownload)).json().data.documents[0].downloadAllowed,false);assert.equal((await parentGet(`documents/${doc.id}/download`,noDownload)).statusCode,403);
    const ctx2=await activityParent(csrf,f);const archive=await f.post(`files/${file.id}/archive`,{expectedVersion:file.version,reason:'Tệp minh chứng đã lưu trữ'});assert.equal(archive.statusCode,200,archive.body);
    assert.equal((await parentGet(`activities/${a.id}`,ctx2)).json().data.documents.length,0);assert.equal((await parentGet('documents',ctx2)).json().data.length,0);assert.equal((await parentGet(`documents/${doc.id}/download`,ctx2)).statusCode,404);
    const listing=await request('GET',`/api/v1/schools/${schoolA}/${f.base}/evidence?activityId=${a.id}`);assert.equal(listing.statusCode,200,listing.body);assert.equal(listing.json().data.length,1);
  }finally{await worker.close();}
});

async function announcementFixture(csrf,school=false,overrides={}){
  const f=await conductFixture(csrf),path=school?'announcements':`classes/${f.classId}/announcements`;await activateFixtureClass(f);
  const created=await f.post(path,{yearId:seedId('year:A'),title:'Thông báo kiểm thử phạm vi',summary:'Nội dung thông báo được lưu thật',sanitizedHtml:'<h2>Thông báo</h2><p>Nội dung đã soạn</p>',targets:school?[{kind:'SCHOOL'}]:[{kind:'CLASS',id:f.classId}],audience:'ALL',internalNote:'Ghi chú nội bộ không công bố',...overrides});assert.equal(created.statusCode,201,created.body);
  const a=created.json().data,get=async id=>{const r=await request('GET',`/api/v1/schools/${schoolA}/${path}/${id??a.id}`);assert.equal(r.statusCode,200,r.body);return r.json().data;},patch=(id,body)=>request('PATCH',`/api/v1/schools/${schoolA}/${path}/${id}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  return {...f,path,a,get,patch};
}
async function announcementParent(csrf,f,index=0,sections=['announcements','documents'],allowDownload=true){return activityParent(csrf,f,index,sections,allowDownload);}
async function activateFixtureClass(f){
  const email=`announcement-homeroom-${crypto.randomUUID()}@example.invalid`;
  const invitation=await f.post('invitations',{email,roleId:seedId('role:A:HOMEROOM'),classId:f.classId,validFrom:new Date().toISOString(),validUntil:'2027-06-01T00:00:00Z'});assert.equal(invitation.statusCode,201,invitation.body);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0].encrypted_payload;
  const token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token'),anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Chủ nhiệm thông báo kiểm thử',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const cls=await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}`);assert.equal(cls.statusCode,200,cls.body);
  const active=await f.post(`classes/${f.classId}/activate`,{expectedVersion:cls.json().data.version});assert.equal(active.statusCode,200,active.body);
  return {email};
}

test('B5 class announcements retain immutable publication across edits, bind one recipient and reject foreign class reads',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await announcementFixture(csrf);let a=f.a;
  const narrowed=await f.patch(a.id,{expectedVersion:a.version,targets:[{kind:'STUDENT',id:f.enrollments[0].studentId}],audience:'FAMILIES'});assert.equal(narrowed.statusCode,200,narrowed.body);a=narrowed.json().data;
  const ctx=await announcementParent(csrf,f);assert.equal((await parentGet('announcements',ctx)).json().data.length,0);
  const stale=await f.post(`${f.path}/${a.id}/publish`,{expectedSourceVersion:f.a.dataVersion});assert.equal(stale.statusCode,409,stale.body);
  let pub=await f.post(`${f.path}/${a.id}/publish`,{expectedSourceVersion:a.dataVersion,expectedPublicationId:null});assert.equal(pub.statusCode,200,pub.body);pub=pub.json().data;
  const publicView=await parentGet(`announcements/${a.rootId}`,ctx);assert.equal(publicView.statusCode,200,publicView.body);assert.equal(publicView.json().data.title,a.title);assert.equal(Object.hasOwn(publicView.json().data,'internalNote'),false);assert.equal(Object.hasOwn(publicView.json().data,'targets'),false);
  const other=await announcementParent(csrf,f,1);assert.equal((await parentGet('announcements',other)).json().data.length,0);assert.equal((await parentGet(`announcements/${a.rootId}`,other)).statusCode,404);
  const first=await announcementParent(csrf,f);a=await f.get();const draft=await f.patch(a.id,{expectedVersion:a.version,title:'Bản sửa chưa công bố',sanitizedHtml:'<p>Nội dung sửa đang nháp</p>'});assert.equal(draft.statusCode,200,draft.body);const revision=draft.json().data;assert.notEqual(revision.id,a.id);assert.equal(revision.rootId,a.rootId);assert.equal(revision.status,'DRAFT');
  assert.equal((await parentGet(`announcements/${a.rootId}`,first)).json().data.title,a.title);
  await assert.rejects(db.transaction(tx=>tx.query('UPDATE app.announcements SET title=$3 WHERE school_id=$1 AND id=$2',[schoolA,a.id,'Không được sửa nguồn đã công bố']),{schoolId:schoolA}),e=>e.code==='23514');
  const badCurrent=await f.post(`${f.path}/${revision.id}/publish`,{expectedSourceVersion:revision.dataVersion,expectedPublicationId:null});assert.equal(badCurrent.statusCode,409,badCurrent.body);
  const replacement=await f.post(`${f.path}/${revision.id}/publish`,{expectedSourceVersion:revision.dataVersion,expectedPublicationId:pub.id});assert.equal(replacement.statusCode,200,replacement.body);assert.equal((await parentGet(`announcements/${a.rootId}`,first)).json().data.title,revision.title);
  const wrongPublic=await f.post(f.path,{yearId:seedId('year:A'),title:'Không mở công khai lớp',sanitizedHtml:'<p>Không được</p>',targets:[{kind:'PUBLIC'}]});assert.equal(wrongPublic.statusCode,422,wrongPublic.body);
  const assignment=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:await schoolToday(),endsOn:'2027-06-01'});assert.equal(assignment.statusCode,201,assignment.body);
  const forbidden=await announcementFixture(csrf);const forbiddenPub=await forbidden.post(`${forbidden.path}/${forbidden.a.id}/publish`,{expectedSourceVersion:forbidden.a.dataVersion});assert.equal(forbiddenPub.statusCode,200,forbiddenPub.body);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login('teacher-b@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${f.path}/${revision.id}`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${forbidden.path}/${forbidden.a.id}`)).statusCode,404);jar.set('edu_staff',adminCookie);
  const withdrawn=await f.post(`${f.path}/${revision.id}/withdraw`,{expectedVersion:(await f.get(revision.id)).version,reason:'Thu hồi bản đã sửa'});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal((await parentGet('announcements',first)).json().data.length,0);
});

test('B5 public school announcements sanitize content and keep draft/private replacements out of the public projection',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await announcementFixture(csrf,true,{targets:[{kind:'PUBLIC'},{kind:'SCHOOL'}],sanitizedHtml:'<p onclick="run()">Nội dung công khai</p><script>run()</script><img src="https://track.invalid"><a href="javascript:run()">Liên kết</a>'});let a=f.a;
  assert.doesNotMatch(a.sanitizedHtml,/script|onclick|track.invalid|javascript:|<img|<a/);
  const publicPath=`/api/v1/public/schools/truong-thu-a/announcements/${a.rootId}`;assert.equal((await request('GET',publicPath)).statusCode,404);
  const pub=await f.post(`${f.path}/${a.id}/publish`,{expectedSourceVersion:a.dataVersion});assert.equal(pub.statusCode,200,pub.body);
  const view=await request('GET',publicPath);assert.equal(view.statusCode,200,view.body);assert.equal(view.json().data.sanitizedHtml,a.sanitizedHtml);for(const key of ['targets','fileIds','internalNote','createdBy','schoolId'])assert.equal(Object.hasOwn(view.json().data,key),false);
  const school=await request('GET','/api/v1/public/schools/truong-thu-a');assert.equal(school.statusCode,200,school.body);assert.equal(school.json().data.announcements.some(item=>item.id===a.rootId),true);
  a=await f.get();const draft=await f.patch(a.id,{expectedVersion:a.version,title:'Thông báo riêng thay công khai',targets:[{kind:'STUDENT',id:f.enrollments[0].studentId}],audience:'FAMILIES'});assert.equal(draft.statusCode,200,draft.body);const d=draft.json().data;assert.equal((await request('GET',publicPath)).json().data.title,a.title);
  const replace=await f.post(`${f.path}/${d.id}/publish`,{expectedSourceVersion:d.dataVersion,expectedPublicationId:pub.json().data.id});assert.equal(replace.statusCode,200,replace.body);assert.equal((await request('GET',publicPath)).statusCode,404);
  const ctx=await announcementParent(csrf,f),parentView=await parentGet(`announcements/${a.rootId}`,ctx);assert.equal(parentView.statusCode,200,parentView.body);assert.equal(parentView.json().data.title,d.title);
  const invalid=await f.post('announcements',{yearId:seedId('year:A'),title:'Không công khai dữ liệu riêng',sanitizedHtml:'<p>Không mở riêng công khai</p>',targets:[{kind:'PUBLIC'},{kind:'STUDENT',id:f.enrollments[0].studentId}]});assert.equal(invalid.statusCode,422,invalid.body);
  assert.equal((await request('GET',`/api/v1/public/schools/truong-thu-b/announcements/${a.rootId}`)).statusCode,404);
  const disposable=await announcementFixture(csrf);const discarded=await disposable.patch(disposable.a.id,{expectedVersion:disposable.a.version,discard:true});assert.equal(discarded.statusCode,200,discarded.body);assert.ok(discarded.json().data.discardedAt);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${disposable.path}/${disposable.a.id}`)).statusCode,404);
});

test('B5 scheduled announcements wait for their due time, publish once through a worker and safely replay after an acknowledgement loss',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await announcementFixture(csrf),worker=new WorkerRunner();
  try{
    const scheduledAt=new Date(Date.now()+600).toISOString(),scheduled=await f.post(`${f.path}/${f.a.id}/schedule`,{expectedVersion:f.a.version,scheduledAt});assert.equal(scheduled.statusCode,200,scheduled.body);assert.equal(scheduled.json().data.status,'SCHEDULED');assert.equal(scheduled.json().data.scheduleState,'PENDING');
    const ctx=await announcementParent(csrf,f);assert.equal((await parentGet('announcements',ctx)).json().data.length,0);
    assert.equal((await db.transaction(tx=>tx.query("SELECT id FROM app.outbox_events WHERE school_id=$1 AND kind='PUBLISH_ANNOUNCEMENT' AND payload->>'announcementId'=$2 AND run_after<=now()",[schoolA,f.a.id]),{schoolId:schoolA})).rowCount,0);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(scheduledAt).getTime()-Date.now()+20)));await drainSchool(worker);
    const job=(await db.transaction(tx=>tx.query("SELECT * FROM app.outbox_events WHERE school_id=$1 AND kind='PUBLISH_ANNOUNCEMENT' AND payload->>'announcementId'=$2",[schoolA,f.a.id]),{schoolId:schoolA})).rows[0];assert.equal(job.status,'DONE',JSON.stringify({status:job.status,error:job.last_error_code}));assert.equal((await f.get()).status,'PUBLISHED');assert.equal((await parentGet(`announcements/${f.a.rootId}`,ctx)).statusCode,200);
    const count=async()=>(await db.transaction(tx=>tx.query('SELECT count(*)::int AS n FROM app.publication_revisions WHERE school_id=$1 AND announcement_id=$2',[schoolA,f.a.id]),{schoolId:schoolA})).rows[0].n;assert.equal(await count(),1);
    // Simulate loss of the worker acknowledgement after committed side effects.
    await db.transaction(tx=>tx.query("UPDATE app.outbox_events SET status='PENDING',run_after=now(),processed_at=NULL WHERE school_id=$1 AND id=$2",[schoolA,job.id]),{schoolId:schoolA});await drainSchool(worker);assert.equal(await count(),1);
  }finally{await worker.close();}
});

test('B5 scheduled publication rechecks the creator grant and reports a failed queue without exposing a parent snapshot',async()=>{
  const adminCsrf=await login('admin-a@example.invalid'),f=await conductFixture(adminCsrf),post=f.post;await activateFixtureClass(f);
  const role=await post('roles',{code:`ann-${crypto.randomUUID()}`,label:'Quyền thông báo kiểm thử',permissions:['announcement.manage','announcement.publish','announcement.read'].map(action=>({action,scopes:['CLASS']}))});assert.equal(role.statusCode,201,role.body);
  const grant=await post('grants',{memberId:seedId('member:A:teacher-b'),roleId:role.json().data.id,scopeType:'CLASS',classId:f.classId,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(grant.statusCode,201,grant.body);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const teacherCsrf=await login('teacher-b@example.invalid'),path=`classes/${f.classId}/announcements`,teacherPost=(tail,body)=>request('POST',`/api/v1/schools/${schoolA}/${tail}`,body,teacherCsrf,{'idempotency-key':crypto.randomUUID()});
  const created=await teacherPost(path,{yearId:seedId('year:A'),title:'Thông báo chờ kiểm quyền',sanitizedHtml:'<p>Chỉ công bố khi còn quyền</p>',targets:[{kind:'CLASS',id:f.classId}]});assert.equal(created.statusCode,201,created.body);const a=created.json().data,at=new Date(Date.now()+600).toISOString();
  const scheduled=await teacherPost(`${path}/${a.id}/schedule`,{expectedVersion:a.version,scheduledAt:at});assert.equal(scheduled.statusCode,200,scheduled.body);jar.set('edu_staff',adminCookie);
  const revoked=await post(`grants/${grant.json().data.id}/revoke`,{expectedVersion:grant.json().data.version,reason:'Thu hồi trước giờ công bố'});assert.equal(revoked.statusCode,200,revoked.body);
  const ctx=await announcementParent(adminCsrf,f),worker=new WorkerRunner();
  try{await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(at).getTime()-Date.now()+20)));await drainSchool(worker);
    const detail=await request('GET',`/api/v1/schools/${schoolA}/${path}/${a.id}`);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.status,'SCHEDULED');assert.equal(detail.json().data.scheduleState,'FAILED');assert.equal(detail.json().data.scheduleErrorCode,'RESOURCE_NOT_FOUND');
    assert.equal((await parentGet('announcements',ctx)).json().data.length,0);assert.equal((await db.transaction(tx=>tx.query('SELECT id FROM app.publication_revisions WHERE school_id=$1 AND announcement_id=$2',[schoolA,a.id]),{schoolId:schoolA})).rowCount,0);
    const edited=await request('PATCH',`/api/v1/schools/${schoolA}/${path}/${a.id}`,{expectedVersion:detail.json().data.version,title:'Nhà trường sửa bản bị chặn'},adminCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200,edited.body);assert.equal(edited.json().data.status,'DRAFT');
    const queue=(await db.transaction(tx=>tx.query("SELECT status FROM app.outbox_events WHERE school_id=$1 AND kind='PUBLISH_ANNOUNCEMENT' AND payload->>'announcementId'=$2",[schoolA,a.id]),{schoolId:schoolA})).rows[0];assert.equal(queue.status,'CANCELLED');
  }finally{await worker.close();}
});

test('B5 announcement attachments remain private to one child, obey link download rights and disappear when archived or withdrawn',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await announcementFixture(csrf),worker=new WorkerRunner();
  try{
    const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#336699'}}).png().toBuffer(),form=new FormData();form.append('purpose','CLASS_DOCUMENT');form.append('classId',f.classId);form.append('file',new Blob([bytes],{type:'image/png'}),'tai-lieu-rieng.png');const prepared=new Request(origin,{method:'POST',body:form});
    const upload=await server.inject({method:'POST',url:`/api/v1/schools/${schoolA}/files`,headers:{origin,cookie:cookies(),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':prepared.headers.get('content-type')},payload:Buffer.from(await prepared.arrayBuffer())});assert.equal(upload.statusCode,200,upload.body);await drainSchool(worker);
    const file=(await request('GET',`/api/v1/schools/${schoolA}/files/${upload.json().data.id}`)).json().data;assert.equal(file.status,'READY');
    const link=await f.post('file-links',{fileId:file.id,studentId:f.enrollments[0].studentId,shareWithGuardian:false});assert.equal(link.statusCode,201,link.body);
    const both=await f.patch(f.a.id,{expectedVersion:f.a.version,fileIds:[file.id],targets:f.enrollments.map(e=>({kind:'STUDENT',id:e.studentId}))});assert.equal(both.statusCode,422,both.body);
    const patched=await f.patch(f.a.id,{expectedVersion:f.a.version,fileIds:[file.id],targets:[{kind:'STUDENT',id:f.enrollments[0].studentId}],audience:'FAMILIES'});assert.equal(patched.statusCode,200,patched.body);const a=patched.json().data;
    const ctx=await announcementParent(csrf,f);assert.equal((await parentGet('documents',ctx)).json().data.length,0);
    const pub=await f.post(`${f.path}/${a.id}/publish`,{expectedSourceVersion:a.dataVersion});assert.equal(pub.statusCode,200,pub.body);
    const detail=await parentGet(`announcements/${a.rootId}`,ctx);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.documents.length,1);const doc=detail.json().data.documents[0];assert.notEqual(doc.id,file.id);assert.equal((await parentGet(`documents/${doc.id}/download`,ctx)).statusCode,200);
    const other=await announcementParent(csrf,f,1);assert.equal((await parentGet('documents',other)).json().data.length,0);assert.equal((await parentGet(`documents/${doc.id}/download`,other)).statusCode,404);
    const hidden=await announcementParent(csrf,f,0,['announcements'],false);assert.equal((await parentGet(`announcements/${a.rootId}`,hidden)).json().data.documents.length,0);
    const restricted=await announcementParent(csrf,f,0,['announcements','documents'],false);assert.equal((await parentGet(`announcements/${a.rootId}`,restricted)).json().data.documents[0].downloadAllowed,false);assert.equal((await parentGet(`documents/${doc.id}/download`,restricted)).statusCode,403);
    assert.equal((await parentGet(`announcements/${a.rootId}`,ctx)).statusCode,409);const currentCtx=await announcementParent(csrf,f);
    const archived=await f.post(`files/${file.id}/archive`,{expectedVersion:file.version,reason:'Lưu trữ tài liệu thông báo'});assert.equal(archived.statusCode,200,archived.body);const afterArchive=await parentGet(`announcements/${a.rootId}`,currentCtx);assert.equal(afterArchive.statusCode,200,afterArchive.body);assert.equal(afterArchive.json().data.documents.length,0);assert.equal((await parentGet(`documents/${doc.id}/download`,currentCtx)).statusCode,404);
    const current=await f.get(),withdrawn=await f.post(`${f.path}/${a.id}/withdraw`,{expectedVersion:current.version,reason:'Thu hồi thông báo riêng'});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal((await parentGet(`announcements/${a.rootId}`,currentCtx)).statusCode,404);
  }finally{await worker.close();}
});

async function settingsFixture(csrf){
  const adminCookie=jar.get('edu_staff');
  const get=async()=>{const r=await request('GET',`/api/v1/schools/${schoolA}/settings`);assert.equal(r.statusCode,200,r.body);return r.json().data;},original=await get();
  const patch=(expectedVersion,body)=>request('PATCH',`/api/v1/schools/${schoolA}/settings`,{expectedVersion,...body},csrf,{'idempotency-key':crypto.randomUUID()});
  const restore=async()=>{jar.set('edu_staff',adminCookie);const values={...original};delete values.version;delete values.academicResultsEnabled;const r=await patch((await get()).version,values);assert.equal(r.statusCode,200,r.body);};
  return {get,patch,restore,original};
}

test('B5 school settings persist with version guards, affect only new link expiry and suppress work contacts without changing old link permissions',async()=>{
  const csrf=await login('admin-a@example.invalid'),settings=await settingsFixture(csrf),f=await conductFixture(csrf),base=`classes/${f.classId}`;
  try{
    const assignment=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:await schoolToday(),endsOn:'2027-06-01'});assert.equal(assignment.statusCode,201,assignment.body);
    const relation=await parentRelationship(csrf,f.post,f.enrollments[0].studentId),linkBody={studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview','teachers'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'};
    const old=await f.post('parent-access',linkBody);assert.equal(old.statusCode,201,old.body);const oldExpiry=old.json().data.access.expiresAt,ctx=await parentExchange(old.json().data.link);
    const contact=await parentGet('teachers',ctx);assert.equal(contact.statusCode,200,contact.body);assert.equal(contact.json().data.length,1);assert.ok(contact.json().data[0].workPhone);
    const oldRole=(await db.transaction(tx=>tx.query('SELECT status FROM app.roles WHERE school_id=$1 AND id=$2',[schoolA,seedId('role:A:SUBJECT_TEACHER')]),{schoolId:schoolA})).rows[0].status;
    try{await db.transaction(tx=>tx.query("UPDATE app.roles SET status='ARCHIVED' WHERE school_id=$1 AND id=$2",[schoolA,seedId('role:A:SUBJECT_TEACHER')]),{schoolId:schoolA});assert.equal((await parentGet('teachers',ctx)).json().data.length,0);}
    finally{await db.transaction(tx=>tx.query('UPDATE app.roles SET status=$3 WHERE school_id=$1 AND id=$2',[schoolA,seedId('role:A:SUBJECT_TEACHER'),oldRole]),{schoolId:schoolA});}
    const concurrent=await Promise.all([settings.patch(settings.original.version,{parentLinkTtlDays:7,shareTeacherPhone:false,shareTeacherEmail:false,reportHeader:'Báo cáo lớp giữ tiếng Việt'}),settings.patch(settings.original.version,{parentLinkTtlDays:7,shareTeacherPhone:false,shareTeacherEmail:false,reportHeader:'Báo cáo trường giữ tiếng Việt'})]);assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409]);
    let latest=await settings.get();assert.equal(latest.parentLinkTtlDays,7);assert.equal(latest.academicResultsEnabled,'OFF');const hours=await settings.patch(latest.version,{contactHours:'07:00–17:00, Thứ Hai đến Thứ Sáu'});assert.equal(hours.statusCode,200,hours.body);latest=hours.json().data;
    const oldDetail=await request('GET',`/api/v1/schools/${schoolA}/parent-access/${old.json().data.access.id}`);assert.equal(oldDetail.statusCode,200,oldDetail.body);assert.equal(oldDetail.json().data.expiresAt,oldExpiry);assert.deepEqual(oldDetail.json().data.allowedSections,linkBody.allowedSections);
    const suppressed=await parentGet('teachers',ctx);assert.equal(suppressed.statusCode,200,suppressed.body);assert.equal(Object.hasOwn(suppressed.json().data[0],'workPhone'),false);assert.equal(Object.hasOwn(suppressed.json().data[0],'workEmail'),false);
    const recent=await f.post('parent-access',linkBody);assert.equal(recent.statusCode,201,recent.body);const expiry=new Date(recent.json().data.access.expiresAt).getTime();assert.ok(expiry>Date.now()+6*86400000&&expiry<Date.now()+8*86400000);assert.ok(expiry<new Date(oldExpiry).getTime());
    assert.equal((await settings.patch(latest.version,{parentLinkTtlDays:181})).statusCode,422);assert.equal((await settings.patch(latest.version,{timezone:'Asia/Not_A_Zone'})).statusCode,422);assert.equal((await settings.patch(latest.version,{timezone:'UTC'})).statusCode,409);
    const audit=await request('GET',`/api/v1/schools/${schoolA}/audit?targetId=${schoolA}&limit=1`);assert.equal(audit.statusCode,200,audit.body);assert.equal(audit.json().data.length,1);assert.equal(audit.json().data[0].targetType,'school-settings');assert.equal(audit.json().data[0].actorId,seedId('user:admin-a'));assert.equal(Object.hasOwn(audit.json().data[0],'after'),false);assert.ok(audit.json().page.hasMore);
    const cursor=audit.json().page.nextCursor;assert.equal((await request('GET',`/api/v1/schools/${schoolB}/audit?targetId=${schoolA}&limit=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/audit?targetId=${f.classId}&limit=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,422);
    const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login('teacher-b@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${schoolA}/settings`)).statusCode,403);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/audit`)).statusCode,403);jar.set('edu_staff',adminCookie);
    assert.equal((await request('GET',`/api/v1/schools/${schoolA}/${base}/students`)).statusCode,200);
  }finally{await settings.restore();}
});

test('B5 disabling homeroom publication takes effect inside existing sessions and restores only after an explicit setting change',async()=>{
  const csrf=await login('admin-a@example.invalid'),settings=await settingsFixture(csrf),f=await conductFixture(csrf),homeroom=await activateFixtureClass(f),path=`classes/${f.classId}/announcements`;
  try{
    const created=await f.post(path,{yearId:seedId('year:A'),title:'Kiểm quyền công bố cấu hình',sanitizedHtml:'<p>GVCN phải còn quyền công bố</p>',targets:[{kind:'CLASS',id:f.classId}]});assert.equal(created.statusCode,201,created.body);const a=created.json().data;
    const disabled=await settings.patch(settings.original.version,{homeroomMayPublish:false});assert.equal(disabled.statusCode,200,disabled.body);
    const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const teacherCsrf=await login(homeroom.email),teacherCookie=jar.get('edu_staff');
    const publish=()=>request('POST',`/api/v1/schools/${schoolA}/${path}/${a.id}/publish`,{expectedSourceVersion:a.dataVersion},teacherCsrf,{'idempotency-key':crypto.randomUUID()});
    const denied=await publish();assert.equal(denied.statusCode,404,denied.body);jar.set('edu_staff',adminCookie);
    const enabled=await settings.patch(disabled.json().data.version,{homeroomMayPublish:true});assert.equal(enabled.statusCode,200,enabled.body);jar.set('edu_staff',teacherCookie);
    const accepted=await publish();assert.equal(accepted.statusCode,200,accepted.body);jar.set('edu_staff',adminCookie);
  }finally{await settings.restore();}
});

test('B3 configured second approval rejects self approval in API and SQL, while a different scoped approver permits atomic adjustment',async()=>{
  const csrf=await login('admin-a@example.invalid'),settings=await settingsFixture(csrf),f=await conductFixture(csrf),base=`classes/${f.classId}`,records=`${base}/conduct-records`,periods=`${base}/conduct-periods`,adjustments=`${base}/adjustments`;
  try{
    const event=await f.post(records,{periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Nguồn cho duyệt hai người',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()});assert.equal(event.statusCode,201,event.body);const fact=event.json().data;
    const approved=await f.post(`${records}/${fact.id}/approve`,{expectedVersion:fact.version});assert.equal(approved.statusCode,200,approved.body);const summary=(await request('GET',`/api/v1/schools/${schoolA}/${periods}/${f.period.id}/summary`)).json().data;
    const pub=await f.post(`${periods}/${f.period.id}/lock-and-publish`,{expectedSourceVersion:summary.period.dataVersion});assert.equal(pub.statusCode,200,pub.body);
    const proposal=await f.post(adjustments,{periodId:f.period.id,baselinePublicationId:pub.json().data.id,reason:'Xác minh qua người duyệt độc lập',proposedChanges:[{recordId:fact.id,action:'EXCLUDE'}]});assert.equal(proposal.statusCode,201,proposal.body);const a=proposal.json().data;
    const setting=await settings.patch(settings.original.version,{requireSecondApprovalForAdjustment:true});assert.equal(setting.statusCode,200,setting.body);
    const self=await f.post(`${adjustments}/${a.id}/approve`,{expectedVersion:a.version});assert.equal(self.statusCode,422,self.body);assert.equal(self.json().code,'SECOND_APPROVER_REQUIRED');
    await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.adjustment_requests SET status='APPROVED',decided_by=requested_by WHERE school_id=$1 AND id=$2",[schoolA,a.id]),{schoolId:schoolA}),e=>e.code==='23514');
    const role=await f.post('roles',{code:`second-${crypto.randomUUID()}`,label:'Người duyệt độc lập',permissions:[{action:'conduct.adjust.approve',scopes:['CLASS']}]});assert.equal(role.statusCode,201,role.body);
    const grant=await f.post('grants',{memberId:seedId('member:A:teacher-b'),roleId:role.json().data.id,scopeType:'CLASS',classId:f.classId,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(grant.statusCode,201,grant.body);
    const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const otherCsrf=await login('teacher-b@example.invalid');const other=await request('POST',`/api/v1/schools/${schoolA}/${adjustments}/${a.id}/approve`,{expectedVersion:a.version},otherCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(other.statusCode,200,other.body);jar.set('edu_staff',adminCookie);
    const applied=await f.post(`${adjustments}/${a.id}/apply-and-publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:pub.json().data.id});assert.equal(applied.statusCode,200,applied.body);assert.notEqual(applied.json().data.id,pub.json().data.id);
    const final=await request('GET',`/api/v1/schools/${schoolA}/${records}?periodId=${f.period.id}`);assert.equal(final.statusCode,200,final.body);assert.equal(final.json().data.find(r=>r.id===fact.id).status,'EXCLUDED');
  }finally{await settings.restore();}
});

test('B5 personal notifications paginate across actual memberships, deduplicate publication events and deny foreign recipients and cross-user cursors',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=`NOTICE-${crypto.randomUUID()}`,f=await announcementFixture(csrf,false,{title:`${prefix} A`});
  const assigned=await f.post('assignments',{classId:f.classId,memberId:seedId('member:A:multi'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:await schoolToday(),endsOn:'2027-06-01'});assert.equal(assigned.statusCode,201,assigned.body);
  const pubA=await f.post(`${f.path}/${f.a.id}/publish`,{expectedSourceVersion:f.a.dataVersion});assert.equal(pubA.statusCode,200,pubA.body);
  const replay=await f.post(`${f.path}/${f.a.id}/publish`,{expectedSourceVersion:f.a.dataVersion,expectedPublicationId:pubA.json().data.id});assert.equal(replay.statusCode,200,replay.body);
  const duplicates=(await db.transaction(tx=>tx.query('SELECT count(*)::int AS n FROM app.notifications WHERE school_id=$1 AND member_id=$2 AND source_key=$3',[schoolA,seedId('member:A:multi'),`publication:${pubA.json().data.id}`]),{schoolId:schoolA})).rows[0].n;assert.equal(duplicates,1);
  const foreign=(await db.transaction(tx=>tx.query('SELECT id,read_at FROM app.notifications WHERE school_id=$1 AND member_id=$2 AND source_key=$3',[schoolA,seedId('member:A:admin-a'),`publication:${pubA.json().data.id}`]),{schoolId:schoolA})).rows[0];assert.ok(foreign);
  const csrfB=await login('admin-b@example.invalid',resetPassword),postB=(tail,body)=>request('POST',`/api/v1/schools/${schoolB}/${tail}`,body,csrfB,{'idempotency-key':crypto.randomUUID()});
  const createdB=await postB('announcements',{yearId:seedId('year:B'),title:`${prefix} B`,sanitizedHtml:'<p>Thông báo trường thứ hai</p>',targets:[{kind:'SCHOOL'}],audience:'ALL'});assert.equal(createdB.statusCode,201,createdB.body);const aB=createdB.json().data;
  const pubB=await postB(`announcements/${aB.id}/publish`,{expectedSourceVersion:aB.dataVersion});assert.equal(pubB.statusCode,200,pubB.body);
  jar.delete('edu_staff');const multiCsrf=await login('multi@example.invalid'),multiCookie=jar.get('edu_staff'),query=`kind=announcement&q=${encodeURIComponent(prefix)}&limit=1`;
  const first=await request('GET',`/api/v1/me/notifications?${query}`);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().page.total,2);assert.equal(first.json().page.hasMore,true);assert.equal(first.json().data.length,1);const cursor=first.json().page.nextCursor;
  const second=await request('GET',`/api/v1/me/notifications?${query}&cursor=${encodeURIComponent(cursor)}`);assert.equal(second.statusCode,200,second.body);assert.equal(second.json().page.hasMore,false);const notices=[...first.json().data,...second.json().data];assert.equal(new Set(notices.map(n=>n.id)).size,2);assert.deepEqual(new Set(notices.map(n=>n.schoolId)),new Set([schoolA,schoolB]));assert.ok(notices.every(n=>n.accessible));
  const aNotice=notices.find(n=>n.schoolId===schoolA),bNotice=notices.find(n=>n.schoolId===schoolB);assert.equal(aNotice.classId,f.classId);assert.equal(aNotice.targetId,f.a.id);
  assert.equal((await request('GET',`/api/v1/me/notifications?${query}&schoolId=${schoolA}&cursor=${encodeURIComponent(cursor)}`)).statusCode,422);
  const mark=await request('POST',`/api/v1/me/notifications/${bNotice.id}/read`,undefined,multiCsrf);assert.equal(mark.statusCode,200,mark.body);assert.equal((await request('POST',`/api/v1/me/notifications/${bNotice.id}/read`,undefined,multiCsrf)).statusCode,200);
  const unread=await request('GET',`/api/v1/me/notifications?kind=announcement&q=${encodeURIComponent(prefix)}&unread=true`);assert.equal(unread.statusCode,200,unread.body);assert.equal(unread.json().page.total,1);assert.equal(unread.json().data[0].id,aNotice.id);
  assert.equal((await request('POST',`/api/v1/me/notifications/${foreign.id}/read`,undefined,multiCsrf)).statusCode,404);assert.equal((await db.transaction(tx=>tx.query('SELECT read_at FROM app.notifications WHERE school_id=$1 AND id=$2',[schoolA,foreign.id]),{schoolId:schoolA})).rows[0].read_at,foreign.read_at);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET',`/api/v1/me/notifications?${query}&cursor=${encodeURIComponent(cursor)}`)).statusCode,422);jar.set('edu_staff',multiCookie);
  assert.equal((await request('GET',`/api/v1/me/notifications?schoolId=${crypto.randomUUID()}`)).statusCode,404);
  // Revocation is an actual grant command; content and search are redacted in SQL.
  jar.delete('edu_staff');const adminCsrf=await login('admin-a@example.invalid');const grant=(await db.transaction(tx=>tx.query('SELECT g.* FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id WHERE a.school_id=$1 AND a.id=$2',[schoolA,assigned.json().data.id]),{schoolId:schoolA})).rows[0];
  const revoked=await request('POST',`/api/v1/schools/${schoolA}/grants/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Thu hồi phạm vi trước khi đọc thông báo'},adminCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',multiCookie);
  const hiddenSearch=await request('GET',`/api/v1/me/notifications?kind=announcement&q=${encodeURIComponent(prefix)}`);assert.equal(hiddenSearch.statusCode,200,hiddenSearch.body);assert.equal(hiddenSearch.json().page.total,1);assert.equal(hiddenSearch.json().data[0].id,bNotice.id);
  const redacted=await request('GET',`/api/v1/me/notifications?schoolId=${schoolA}&kind=announcement&limit=1`);assert.equal(redacted.statusCode,200,redacted.body);const hidden=redacted.json().data[0];assert.equal(hidden.id,aNotice.id);assert.equal(hidden.accessible,false);assert.equal(hidden.targetId,null);assert.equal(Object.hasOwn(hidden,'classId'),false);assert.equal(hidden.title.includes(prefix),false);assert.equal(hidden.body.includes(f.classId),false);
  assert.equal((await request('POST',`/api/v1/me/notifications/${aNotice.id}/read`,undefined,multiCsrf)).statusCode,200);
  try{await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolA]);const suspended=await request('GET',`/api/v1/me/notifications?schoolId=${schoolA}`);assert.equal(suspended.statusCode,404);const other=await request('GET',`/api/v1/me/notifications?kind=announcement&q=${encodeURIComponent(prefix)}`);assert.equal(other.statusCode,200,other.body);assert.equal(other.json().data[0].schoolId,schoolB);}
  finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolA]);}
});

test('B5 withdrawn announcements redact retained staff notifications instead of exposing a stale published target',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=`WITHDRAW-NOTICE-${crypto.randomUUID()}`,f=await announcementFixture(csrf,false,{title:prefix});
  const published=await f.post(`${f.path}/${f.a.id}/publish`,{expectedSourceVersion:f.a.dataVersion});assert.equal(published.statusCode,200,published.body);
  const initial=await request('GET',`/api/v1/me/notifications?kind=announcement&q=${encodeURIComponent(prefix)}`);assert.equal(initial.statusCode,200,initial.body);assert.equal(initial.json().data.length,1);assert.equal(initial.json().data[0].accessible,true);const id=initial.json().data[0].id;
  const current=await f.get(),withdrawn=await f.post(`${f.path}/${current.id}/withdraw`,{expectedVersion:current.version,reason:'Thu hồi thông báo có notification'});assert.equal(withdrawn.statusCode,200,withdrawn.body);
  const oldTitle=await request('GET',`/api/v1/me/notifications?kind=announcement&q=${encodeURIComponent(prefix)}`);assert.equal(oldTitle.statusCode,200,oldTitle.body);assert.equal(oldTitle.json().page.total,0);
  const history=await request('GET',`/api/v1/me/notifications?schoolId=${schoolA}&kind=announcement&limit=1`);assert.equal(history.statusCode,200,history.body);assert.equal(history.json().data[0].id,id);assert.equal(history.json().data[0].targetId,null);assert.equal(history.json().data[0].accessible,false);
});

test('B5 dashboards count real scoped rows, keep homeroom and subject tasks separate and immediately recheck revocation',async()=>{
  const csrf=await login('admin-a@example.invalid'),home=await conductFixture(csrf),teacher=await activateFixtureClass(home),subject=await conductFixture(csrf);await activateFixtureClass(subject);
  const member=(await db.transaction(tx=>tx.query('SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,teacher.email]),{schoolId:schoolA})).rows[0];
  const assigned=await home.post('assignments',{classId:subject.classId,memberId:member.id,subjectId:seedId('subject:A:math'),kind:'SUBJECT',startsOn:'2026-09-28',endsOn:'2027-06-01',reason:'Kiểm tra dashboard hai phạm vi'});assert.equal(assigned.statusCode,201,assigned.body);
  for(const f of [home,subject]){const record=await f.post(`classes/${f.classId}/conduct-records`,{periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Ghi nhận cần rà soát dashboard',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()});assert.equal(record.statusCode,201,record.body);}
  const school=await request('GET',`/api/v1/schools/${schoolA}/overview?yearId=${seedId('year:A')}`);assert.equal(school.statusCode,200,school.body);const expected=(await db.transaction(tx=>tx.query("SELECT count(*)::int AS n FROM app.classes WHERE school_id=$1 AND year_id=$2",[schoolA,seedId('year:A')]),{schoolId:schoolA})).rows[0].n;assert.equal(school.json().data.metrics.find(m=>m.key==='classes').value,expected);
  assert.equal((await request('GET',`/api/v1/schools/${schoolB}/overview`)).statusCode,404);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login(teacher.email);const teacherCookie=jar.get('edu_staff');
  const overview=await request('GET',`/api/v1/schools/${schoolA}/me/overview`);assert.equal(overview.statusCode,200,overview.body);const view=overview.json().data;assert.equal(view.yearId,seedId('year:A'));assert.equal(view.referenceDate,await schoolToday());assert.ok(Date.parse(view.asOf));assert.equal(view.metrics.find(m=>m.key==='classes').value,2);assert.equal(view.metrics.find(m=>m.key==='students').value,4);assert.equal(view.metrics.find(m=>m.key==='pendingConduct').value,1);assert.equal(view.metrics.some(m=>m.key==='staff'),false);
  const classes=await request('GET',`/api/v1/schools/${schoolA}/me/classes?yearId=${seedId('year:A')}`);assert.equal(classes.statusCode,200,classes.body);assert.equal(classes.json().page.total,2);assert.deepEqual(new Set(classes.json().data.map(c=>c.id)),new Set([home.classId,subject.classId]));assert.equal(classes.json().data.find(c=>c.id===home.classId).myAssignments[0].kind,'HOMEROOM');assert.equal(classes.json().data.find(c=>c.id===subject.classId).myAssignments[0].subjectId,seedId('subject:A:math'));assert.ok(classes.json().data.every(c=>c.studentCount===2));
  const subjectView=await request('GET',`/api/v1/schools/${schoolA}/classes/${subject.classId}/overview`);assert.equal(subjectView.statusCode,200,subjectView.body);assert.equal(subjectView.json().data.metrics.some(m=>['pendingConduct','attendanceAbsent','attendancePresent','parentLinks'].includes(m.key)),false);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}/overview`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/overview`)).statusCode,403);
  const base=`/api/v1/schools/${schoolA}/me/tasks`,conduct=await request('GET',`${base}?kind=conduct`);assert.equal(conduct.statusCode,200,conduct.body);assert.ok(conduct.json().data.some(t=>t.targetId===home.period.id));assert.ok(conduct.json().data.every(t=>t.classId===home.classId));
  const page=await request('GET',`${base}?limit=1`);assert.equal(page.statusCode,200,page.body);assert.ok(page.json().page.total>=2);const cursor=page.json().page.nextCursor;assert.ok(cursor);const next=await request('GET',`${base}?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(next.statusCode,200,next.body);assert.notEqual(next.json().data[0].id,page.json().data[0].id);assert.equal(next.json().page.total,page.json().page.total);assert.equal((await request('GET',`${base}?limit=1&kind=conduct&cursor=${encodeURIComponent(cursor)}`)).statusCode,422);assert.equal((await request('GET',`${base}?classId=${subject.classId}&kind=conduct`)).json().page.total,0);
  jar.set('edu_staff',adminCookie);const grant=(await db.transaction(tx=>tx.query('SELECT g.* FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id WHERE a.school_id=$1 AND a.id=$2',[schoolA,assigned.json().data.id]),{schoolId:schoolA})).rows[0];assert.equal((await home.post(`grants/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Thu hồi môn để kiểm tra dashboard'})).statusCode,200);jar.set('edu_staff',teacherCookie);
  const remaining=await request('GET',`/api/v1/schools/${schoolA}/me/classes`);assert.equal(remaining.statusCode,200,remaining.body);assert.equal(remaining.json().page.total,1);assert.equal(remaining.json().data[0].id,home.classId);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${subject.classId}/overview`)).statusCode,404);assert.equal((await request('GET',`${base}?limit=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,422);
});

test('B5 teacher schedule is own dated teaching and announcement feed reads only current publications across draft edits',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await scheduleFixture(csrf);await activateFixtureClass(f);
  const created=await f.post(`${f.base}/timetables`,{startsOn:f.day,endsOn:nextDate(f.day,1),entries:[f.entry]});assert.equal(created.statusCode,201,created.body);const timetable=created.json().data;assert.equal((await f.post(`${f.base}/timetables/${timetable.id}/publish`,{expectedSourceVersion:timetable.dataVersion})).statusCode,200);
  const title=`TEACHER-FEED-${crypto.randomUUID()}`,ann=await f.post(`${f.base}/announcements`,{yearId:seedId('year:A'),title,sanitizedHtml:'<p>Bản công bố dành cho giáo viên</p>',targets:[{kind:'CLASS',id:f.classId}],audience:'STAFF',internalNote:'Ghi chú riêng của người soạn'});assert.equal(ann.statusCode,201,ann.body);const a=ann.json().data;assert.equal((await f.post(`${f.base}/announcements/${a.id}/publish`,{expectedSourceVersion:a.dataVersion})).statusCode,200);
  const current=(await request('GET',`/api/v1/schools/${schoolA}/${f.base}/announcements/${a.id}`)).json().data,edited=await request('PATCH',`/api/v1/schools/${schoolA}/${f.base}/announcements/${a.id}`,{expectedVersion:current.version,title:`${title} nháp`,sanitizedHtml:'<p>Nội dung sửa chưa công bố</p>'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200,edited.body);const draft=edited.json().data;
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login('teacher-b@example.invalid');const teacherCookie=jar.get('edu_staff'),path=`/api/v1/schools/${schoolA}/me/schedule?classId=${f.classId}&from=${f.day}&to=${nextDate(f.day,1)}`;
  const schedule=await request('GET',path);assert.equal(schedule.statusCode,200,schedule.body);assert.equal(schedule.json().page.total,1);assert.equal(schedule.json().data[0].memberId,seedId('member:A:teacher-b'));assert.equal(schedule.json().data[0].className,'Lớp thi đua giả');assert.equal(schedule.json().data[0].subjectName,'Toán');assert.equal(Object.hasOwn(schedule.json().data[0],'workEmail'),false);assert.equal((await request('GET',`${path}&memberId=${seedId('member:A:teacher-a')}`)).statusCode,404);assert.equal((await request('GET',path.replace(`classId=${f.classId}`,`classId=${classA}`))).json().page.total,0);assert.equal((await request('GET',path.replace(`to=${nextDate(f.day,1)}`,`to=${f.day}`))).statusCode,422);
  const feedPath=`/api/v1/schools/${schoolA}/me/announcements?q=${encodeURIComponent(title)}`,feed=await request('GET',feedPath);assert.equal(feed.statusCode,200,feed.body);assert.equal(feed.json().page.total,1);assert.equal(feed.json().data[0].id,a.id);assert.equal(feed.json().data[0].title,title);assert.equal(Object.hasOwn(feed.json().data[0],'internalNote'),false);assert.equal(feed.body.includes('Nội dung sửa chưa công bố'),false);
  jar.set('edu_staff',adminCookie);assert.equal((await f.post(`${f.base}/announcements/${draft.id}/publish`,{expectedSourceVersion:draft.dataVersion})).statusCode,200);jar.set('edu_staff',teacherCookie);const replacement=await request('GET',feedPath);assert.equal(replacement.statusCode,200,replacement.body);assert.equal(replacement.json().page.total,1);assert.equal(replacement.json().data[0].id,draft.id);
  jar.set('edu_staff',adminCookie);const grant=(await db.transaction(tx=>tx.query('SELECT g.* FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id WHERE a.school_id=$1 AND a.id=$2',[schoolA,f.assignment.id]),{schoolId:schoolA})).rows[0];assert.equal((await f.post(`grants/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Thu hồi quyền trước khi đọc lịch cá nhân'})).statusCode,200);jar.set('edu_staff',teacherCookie);const revoked=await request('GET',path);assert.equal(revoked.statusCode,200,revoked.body);assert.equal(revoked.json().page.total,0);assert.equal((await request('GET',feedPath)).json().page.total,0);
});

test('B5 dashboard attendance counters and publication tasks follow persisted marks, publish/withdraw and current school policy',async()=>{
  const csrf=await login('admin-a@example.invalid'),settings=await settingsFixture(csrf),f=await conductFixture(csrf),teacher=await activateFixtureClass(f),base=`classes/${f.classId}/attendance`,created=await f.post(base,{date:await schoolToday(),granularity:'DAILY',slot:'MORNING'});assert.equal(created.statusCode,201,created.body);let session=created.json().data;
  const saved=await request('PATCH',`/api/v1/schools/${schoolA}/${base}/${session.id}/records`,{expectedVersion:session.version,records:session.records.map((r,i)=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:i?'EXCUSED':'LATE'}))},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(saved.statusCode,200,saved.body);session=saved.json().data;
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login(teacher.email);const teacherCookie=jar.get('edu_staff'),tasksPath=`/api/v1/schools/${schoolA}/me/tasks?classId=${f.classId}&kind=attendance`;
  const tasks=async()=>{const r=await request('GET',tasksPath);assert.equal(r.statusCode,200,r.body);return r.json().data;};
  try{
    const overview=await request('GET',`/api/v1/schools/${schoolA}/classes/${f.classId}/overview`);assert.equal(overview.statusCode,200,overview.body);const metrics=overview.json().data.metrics;assert.equal(metrics.find(m=>m.key==='attendancePresent').value,1);assert.equal(metrics.find(m=>m.key==='attendanceAbsent').value,1);assert.equal(metrics.find(m=>m.key==='attendanceUnmarked').value,0);assert.equal((await tasks()).some(t=>t.id===`attendance-publish:${session.id}`),true);
    jar.set('edu_staff',adminCookie);assert.equal((await settings.patch((await settings.get()).version,{homeroomMayPublish:false})).statusCode,200);jar.set('edu_staff',teacherCookie);assert.equal((await tasks()).some(t=>t.id===`attendance-publish:${session.id}`),false);
    jar.set('edu_staff',adminCookie);assert.equal((await settings.patch((await settings.get()).version,{homeroomMayPublish:true})).statusCode,200);const published=await f.post(`${base}/${session.id}/publish`,{expectedSourceVersion:session.dataVersion});assert.equal(published.statusCode,200,published.body);jar.set('edu_staff',teacherCookie);assert.equal((await tasks()).some(t=>t.id===`attendance-publish:${session.id}`),false);
    jar.set('edu_staff',adminCookie);const pub=published.json().data;assert.equal((await f.post(`publications/${pub.id}/withdraw`,{expectedVersion:pub.version,reason:'Thu hồi bản chuyên cần để kiểm tra hàng việc'})).statusCode,200);jar.set('edu_staff',teacherCookie);assert.equal((await tasks()).some(t=>t.id===`attendance-publish:${session.id}`),true);
    jar.set('edu_staff',adminCookie);const past=await unusedYearRange(schoolA,true),old=await f.post('academic-years',{code:`PAST-${crypto.randomUUID()}`,name:'Năm trước tham chiếu dashboard',...past});assert.equal(old.statusCode,201,old.body);const history=await request('GET',`/api/v1/schools/${schoolA}/overview?yearId=${old.json().data.id}`);assert.equal(history.statusCode,200,history.body);const expectedReference=new Date(`${past.endsOn}T00:00:00Z`);expectedReference.setUTCDate(expectedReference.getUTCDate()-1);assert.equal(history.json().data.referenceDate,expectedReference.toISOString().slice(0,10));assert.equal(history.json().data.metrics.find(m=>m.key==='classes').value,0);assert.deepEqual(history.json().data.tasks,[]);
  }finally{await settings.restore();}
});

test('B2 platform creates only metadata drafts, bootstraps admin roles/invitations and requires an active administrator for activation',async()=>{
  const csrf=await login('operator@example.invalid'),prefix=`PLATFORM-${crypto.randomUUID()}`,path='/api/v1/platform/schools',post=(url,body,key=crypto.randomUUID())=>request('POST',url,body,csrf,{'idempotency-key':key}),body={code:prefix,slug:`platform-${crypto.randomUUID()}`,name:'Trường vận hành kiểm thử',shortName:'Trường vận hành',province:'Khu vực kiểm thử',level:'THPT',publicAddress:'Địa chỉ giả cho kiểm thử'};
  assert.equal((await request('POST',path,body,csrf)).statusCode,422);assert.equal((await post(path,{...body,timezone:'Not/A_Timezone'})).statusCode,422);
  const key=crypto.randomUUID(),created=await post(path,body,key);assert.equal(created.statusCode,201,created.body);let school=created.json().data;assert.equal(school.status,'DRAFT');assert.equal(school.staffCount,0);assert.equal(school.classCount,0);assert.deepEqual(school.adminNames,[]);assert.equal(school.onboarding.profileDone,true);assert.equal(school.onboarding.adminAssigned,false);assert.equal(school.onboarding.teachersInvited,false);const url=`${path}/${school.id}`;
  const replay=await post(path,body,key);assert.equal(replay.statusCode,201,replay.body);assert.equal(replay.json().data.id,school.id);assert.equal((await post(path,{...body,name:'Tên khác cùng key'},key)).statusCode,409);
  const defaults=(await db.transaction(tx=>tx.query('SELECT count(*)::int AS n FROM app.roles WHERE school_id=$1 AND system_role',[school.id]),{schoolId:school.id})).rows[0].n;assert.equal(defaults,5);assert.equal((await post(`${url}/status`,{expectedVersion:school.version,status:'ACTIVE',reason:'Kích hoạt khi chưa có quản trị'})).statusCode,409);
  const updated=await request('PATCH',url,{expectedVersion:school.version,shortName:'Trường vận hành đã sửa',province:'Vùng đã sửa',motto:'Thông tin công khai kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(updated.statusCode,200,updated.body);school=updated.json().data;assert.equal(school.shortName,'Trường vận hành đã sửa');assert.equal((await request('PATCH',url,{expectedVersion:school.version-1,name:'Sai phiên bản'},csrf,{'idempotency-key':crypto.randomUUID()})).statusCode,409);
  const email=`platform-admin-${crypto.randomUUID()}@example.invalid`,inviteBody={email,roleId:null,validFrom:new Date().toISOString(),validUntil:'2027-06-01T00:00:00Z',workDisplayName:'Quản trị trường mới'},invite=await post(`${url}/admin-invitations`,inviteBody);assert.equal(invite.statusCode,201,invite.body);assert.equal(invite.json().data.deliveryState,'QUEUED');assert.equal(invite.body.includes('token='),false);assert.equal((await post(`${url}/admin-invitations`,{...inviteBody,email:`foreign-${email}`,roleId:seedId('role:A:SCHOOL_ADMIN')})).statusCode,422);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invite.json().data.id}`])).rows[0].encrypted_payload,mail=decryptMail(encrypted),token=new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token');assert.equal(mail.email,email);
  const anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken,accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:body.slug,token,displayName:'Quản trị mới kiểm thử',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const admins=await request('GET',`${url}/admins`);assert.equal(admins.statusCode,200,admins.body);assert.equal(admins.json().page.total,1);let firstAdmin=admins.json().data[0];assert.equal(firstAdmin.loginEmail,email);assert.equal(firstAdmin.workDisplayName,'Quản trị trường mới');assert.ok(firstAdmin.grants.every(g=>g.scopeType==='SCHOOL'));
  school=(await request('GET',url)).json().data;const active=await post(`${url}/status`,{expectedVersion:school.version,status:'ACTIVE',reason:'Quản trị đầu tiên đã nhận lời mời'});assert.equal(active.statusCode,200,active.body);school=active.json().data;assert.ok(school.activatedAt);assert.equal(school.onboarding.adminAssigned,true);assert.equal(school.onboarding.teachersInvited,false);
  const opCookie=jar.get('edu_staff');jar.delete('edu_staff');await login(email);const adminCookie=jar.get('edu_staff');assert.equal((await request('GET',`/api/v1/schools/${school.id}/overview`)).statusCode,200);assert.equal((await request('GET',path)).statusCode,403);jar.set('edu_staff',opCookie);
  const suspended=await post(`${url}/status`,{expectedVersion:school.version,status:'SUSPENDED',reason:'Tạm dừng để kiểm tra quyền hiện tại'});assert.equal(suspended.statusCode,200,suspended.body);school=suspended.json().data;jar.set('edu_staff',adminCookie);assert.equal((await request('GET',`/api/v1/schools/${school.id}/overview`)).statusCode,403);jar.set('edu_staff',opCookie);assert.equal((await request('GET',url)).statusCode,200);assert.equal((await request('GET',`/api/v1/schools/${school.id}/students`)).statusCode,404);const resumed=await post(`${url}/status`,{expectedVersion:school.version,status:'ACTIVE',reason:'Khôi phục trường sau kiểm thử tạm dừng'});assert.equal(resumed.statusCode,200,resumed.body);
  assert.equal((await post(`${url}/admins/${firstAdmin.id}/revoke`,{expectedVersion:firstAdmin.version,reason:'Không được để mất quản trị cuối'})).statusCode,409);
  // An existing identity accepts this school's bootstrap without a password reset.
  const secondInvite=await post(`${url}/admin-invitations`,{email:'admin-a@example.invalid',roleId:null,validFrom:new Date().toISOString(),validUntil:'2027-06-01T00:00:00Z'});assert.equal(secondInvite.statusCode,201,secondInvite.body);const secondMail=decryptMail((await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${secondInvite.json().data.id}`])).rows[0].encrypted_payload),secondToken=new URLSearchParams(new URL(secondMail.url).hash.slice(1)).get('token');jar.delete('edu_staff');await login('admin-a@example.invalid');const acceptCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;const existing=await request('POST','/api/v1/invitations/accept',{schoolSlug:body.slug,token:secondToken},acceptCsrf);assert.equal(existing.statusCode,200,existing.body);jar.set('edu_staff',opCookie);
  firstAdmin=(await request('GET',`${url}/admins`)).json().data.find(m=>m.id===firstAdmin.id);const revoked=await post(`${url}/admins/${firstAdmin.id}/revoke`,{expectedVersion:firstAdmin.version,reason:'Đã có quản trị thay thế được nhận lời mời'});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',adminCookie);assert.equal((await request('GET',`/api/v1/schools/${school.id}/overview`)).statusCode,403);jar.set('edu_staff',opCookie);const remaining=(await request('GET',url)).json().data;assert.equal(remaining.adminNames.length,1);
  const audit=await request('GET',`/api/v1/platform/audit?schoolId=${school.id}`);assert.equal(audit.statusCode,200,audit.body);assert.ok(audit.json().page.total>=6);assert.equal(audit.body.includes(email),false);assert.equal(audit.body.includes('token='),false);
  const filtered=await request('GET',`${path}?q=${encodeURIComponent(prefix)}&province=${encodeURIComponent('Vùng đã sửa')}`);assert.equal(filtered.statusCode,200,filtered.body);assert.equal(filtered.json().page.total,1);assert.equal(filtered.json().data[0].id,school.id);const overview=await request('GET','/api/v1/platform/overview');assert.equal(overview.statusCode,200,overview.body);assert.ok(overview.json().data.metrics.find(m=>m.key==='active').value>=3);assert.equal(Object.hasOwn(overview.json().data,'students'),false);
  await db.transaction(async tx=>{const before=(await tx.query('SELECT app.tenant_id() AS school')).rows[0].school;await tx.query('SELECT * FROM platform.operational_counts($1)',[schoolB]);assert.equal((await tx.query('SELECT app.tenant_id() AS school')).rows[0].school,before);},{schoolId:schoolA,userId:seedId('user:operator')});
  await db.transaction(async tx=>{await assert.rejects(tx.query('SELECT * FROM platform.operational_counts($1)',[schoolA]),{code:'42501'});},{userId:seedId('user:admin-a')});
});

test('B5 platform settings and operation records persist actual state, redact artifacts and reauthorize command replays',async()=>{
  const csrf=await login('operator@example.invalid'),settingsUrl='/api/v1/platform/settings',initial=await request('GET',settingsUrl);assert.equal(initial.statusCode,200,initial.body);const original=initial.json().data,patch=(body,key=crypto.randomUUID())=>request('PATCH',settingsUrl,body,csrf,{'idempotency-key':key});
  try{
    const saved=await patch({expectedVersion:original.version,brandName:'EduManage kiểm thử cấu hình',supportEmail:'support-fixture@example.invalid',publicSupportPhone:'Liên hệ hỗ trợ giả',footerNote:'Ghi chú chân trang được lưu thật'});assert.equal(saved.statusCode,200,saved.body);assert.equal((await request('GET',settingsUrl)).json().data.footerNote,'Ghi chú chân trang được lưu thật');assert.equal((await patch({expectedVersion:original.version,brandName:'Phiên bản cũ'})).statusCode,409);assert.equal((await patch({expectedVersion:saved.json().data.version,smtpPassword:'Không được nhập secret'})).statusCode,422);
  }finally{const current=(await request('GET',settingsUrl)).json().data,body={...original,expectedVersion:current.version};delete body.version;assert.equal((await patch(body)).statusCode,200);}
  const start=performance.now();assert.equal((await db.app.query('SELECT 1 AS ok')).rows[0].ok,1);const kind=`INTEGRATION-${crypto.randomUUID()}`;await db.app.query("INSERT INTO platform.operation_runs(kind,status,started_at,finished_at,summary,artifact_location_redacted) VALUES($1,'SUCCEEDED',now(),now(),$2,'private-storage-location')",[kind,{durationMs:performance.now()-start,rows:1,connectionString:'postgres://sensitive.invalid',nested:{secret:'hidden'}}]);const operations=await request('GET',`/api/v1/platform/operations?kind=${encodeURIComponent(kind)}&status=SUCCEEDED`);assert.equal(operations.statusCode,200,operations.body);assert.equal(operations.json().page.total,1);assert.equal(operations.json().data[0].summary.rows,1);assert.equal(operations.body.includes('sensitive.invalid'),false);assert.equal(operations.body.includes('private-storage-location'),false);
  const body={code:`REPLAY-${crypto.randomUUID()}`,slug:`replay-${crypto.randomUUID()}`,name:'Trường kiểm thử replay'},key=crypto.randomUUID(),url='/api/v1/platform/schools',created=await request('POST',url,body,csrf,{'idempotency-key':key});assert.equal(created.statusCode,201,created.body);
  const grantId=seedId('operator:platform.schools.manage');try{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[grantId]);assert.equal((await request('POST',url,body,csrf,{'idempotency-key':key})).statusCode,403);}finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=NULL WHERE id=$1',[grantId]);}
  const paging=await request('GET','/api/v1/platform/schools?limit=1');assert.equal(paging.statusCode,200,paging.body);const cursor=paging.json().page.nextCursor;assert.ok(cursor);const second=await request('GET',`/api/v1/platform/schools?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(second.statusCode,200,second.body);assert.notEqual(second.json().data[0].id,paging.json().data[0].id);
  jar.delete('edu_staff');await login('admin-a@example.invalid');for(const route of ['/api/v1/platform/overview','/api/v1/platform/audit','/api/v1/platform/operations',settingsUrl])assert.equal((await request('GET',route)).statusCode,403);assert.equal((await request('GET',`/api/v1/platform/schools?limit=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,403);
});

test('B1 platform admin invitations obey operator expiry ceilings and acceptance rolls back after authority expires',async()=>{
  const operatorId=crypto.randomUUID(),operatorEmail=`limited-operator-${crypto.randomUUID()}@example.invalid`,grantId=crypto.randomUUID(),until=new Date(Date.now()+120000),inviteUntil=new Date(Date.now()+60000);
  await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Operator có hạn kiểm thử',$3,'ACTIVE',now())",[operatorId,operatorEmail,await hashPassword(password)]);await db.app.query("INSERT INTO platform.operator_grants(id,user_id,action_code,valid_from,valid_until) VALUES($1,$2,'platform.admins.manage',now()-interval '1 hour',$3)",[grantId,operatorId,until]);jar.delete('edu_staff');const csrf=await login(operatorEmail),email=`limited-admin-${crypto.randomUUID()}@example.invalid`,path=`/api/v1/platform/schools/${schoolA}/admin-invitations`,post=body=>request('POST',path,body,csrf,{'idempotency-key':crypto.randomUUID()}),body={email,roleId:null,validFrom:new Date().toISOString()};
  try{
    assert.equal((await post(body)).statusCode,403);assert.equal((await post({...body,validUntil:new Date(until.getTime()+60000).toISOString()})).statusCode,403);const created=await post({...body,validUntil:inviteUntil.toISOString()});assert.equal(created.statusCode,201,created.body);const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${created.json().data.id}`])).rows[0].encrypted_payload,token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token');
    await db.app.query("UPDATE platform.operator_grants SET valid_until=now()-interval '1 millisecond' WHERE id=$1",[grantId]);const bootstrapCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Quản trị không còn người ủy quyền',newPassword:password},bootstrapCsrf);assert.equal(accepted.statusCode,422,accepted.body);assert.equal((await db.app.query('SELECT count(*)::int AS n FROM identity.users WHERE email_normalized=$1',[email])).rows[0].n,0);assert.equal((await post({...body,validUntil:inviteUntil.toISOString()})).statusCode,403);
  }finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[grantId]);}
});

test('B5 support tickets persist both sides, preserve queue states and exact timestamp pagination, and deny other schools',async()=>{
  const csrf=await login('admin-a@example.invalid'),prefix=`SUPPORT-${testTextNonce()}`,schoolPath=`/api/v1/schools/${schoolA}/support`,post=(path,body,key=crypto.randomUUID())=>request('POST',path,body,csrf,{'idempotency-key':key}),body={subject:prefix,description:'Nội dung kiểm thử hỗ trợ không chứa hồ sơ học sinh',priority:'LOW'},key=crypto.randomUUID(),created=await post(schoolPath,body,key);assert.equal(created.statusCode,201,created.body);let ticket=created.json().data;assert.equal(ticket.priority,'LOW');assert.equal(ticket.status,'OPEN');assert.ok(ticket.operatorChoices.some(o=>o.id===seedId('user:operator')));const url=`${schoolPath}/${ticket.id}`;
  assert.equal((await post(schoolPath,body,key)).json().data.id,ticket.id);assert.equal((await post(schoolPath,{...body,description:'Số điện thoại cá nhân 0912345678'})).statusCode,422);const list=await request('GET',`${schoolPath}?q=${encodeURIComponent(prefix)}&priority=LOW`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().page.total,1);const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const opCsrf=await login('operator@example.invalid'),opCookie=jar.get('edu_staff'),opPath=`/api/v1/platform/support/${ticket.id}`,patch=body=>request('PATCH',opPath,body,opCsrf,{'idempotency-key':crypto.randomUUID()}),opPost=(path,body,key=crypto.randomUUID())=>request('POST',path,body,opCsrf,{'idempotency-key':key});
  const global=await request('GET',`/api/v1/platform/support?schoolId=${schoolA}&q=${encodeURIComponent(prefix)}`);assert.equal(global.statusCode,200,global.body);assert.equal(global.json().page.total,1);assert.equal((await patch({expectedVersion:ticket.version,assigneeId:seedId('user:teacher-a')})).statusCode,422);const assigned=await patch({expectedVersion:ticket.version,status:'WAITING_SCHOOL',assigneeId:seedId('user:operator')});assert.equal(assigned.statusCode,200,assigned.body);ticket=assigned.json().data;assert.equal((await patch({expectedVersion:ticket.version-1,status:'RESOLVED'})).statusCode,409);
  const messageKey=crypto.randomUUID(),message=await opPost(`${opPath}/messages`,{body:'Operator đề nghị trường kiểm tra cấu hình'},messageKey);assert.equal(message.statusCode,201,message.body);assert.equal(message.json().data.side,'PLATFORM');assert.equal((await opPost(`${opPath}/messages`,{body:'Operator đề nghị trường kiểm tra cấu hình'},messageKey)).json().data.id,message.json().data.id);
  jar.set('edu_staff',adminCookie);const answer=await post(`${url}/messages`,{body:'Nhà trường đã kiểm tra và phản hồi qua API'});assert.equal(answer.statusCode,201,answer.body);assert.equal(answer.json().data.side,'SCHOOL');const current=await request('GET',url);assert.equal(current.statusCode,200,current.body);ticket=current.json().data;assert.equal(ticket.status,'IN_PROGRESS');
  const messages=await request('GET',`${url}/messages?limit=1`);assert.equal(messages.statusCode,200,messages.body);assert.equal(messages.json().page.total,2);assert.equal(messages.json().data[0].id,message.json().data.id);const cursor=messages.json().page.nextCursor;assert.ok(cursor);const next=await request('GET',`${url}/messages?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(next.statusCode,200,next.body);assert.equal(next.json().data[0].id,answer.json().data.id);assert.equal(next.json().page.hasMore,false);
  jar.delete('edu_staff');await login('admin-b@example.invalid',resetPassword);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/support/${ticket.id}`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/support/${ticket.id}/messages`)).statusCode,404);jar.set('edu_staff',opCookie);const opMessages=await request('GET',`${opPath}/messages`);assert.equal(opMessages.statusCode,200,opMessages.body);assert.equal(opMessages.json().page.total,2);assert.equal((await patch({expectedVersion:ticket.version,status:'RESOLVED'})).statusCode,200);assert.equal((await opPost(`${opPath}/messages`,{body:'Không gửi thêm khi đã hoàn tất'})).statusCode,409);jar.set('edu_staff',adminCookie);assert.equal((await post(`${url}/messages`,{body:'Không sửa yêu cầu đã hoàn tất'})).statusCode,409);
  try{await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolA]);assert.equal((await request('GET',schoolPath)).statusCode,200);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/students`)).statusCode,404);}finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolA]);}
});

test('B1 support requests require independent current school consent, retain immutable scope and bind tickets/classes/actions/time',async()=>{
  const csrf=await login('admin-a@example.invalid'),school=`/api/v1/schools/${schoolA}`,post=(path,body)=>request('POST',`${school}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()}),ticket=await post('support',{subject:`CONSENT-${testTextNonce()}`,description:'Đề nghị hỗ trợ cấu trúc lớp không truy cập học sinh',priority:'NORMAL'});assert.equal(ticket.statusCode,201,ticket.body);const ticketId=ticket.json().data.id,body={ticketId,operatorId:seedId('user:operator'),classId:classA,allowedActions:['class.read','assignment.read'],reason:'Kiểm tra cấu trúc và phân công theo phê duyệt',validFrom:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()};
  assert.equal((await post('support-access',{...body,allowedActions:['student.read']})).statusCode,422);assert.equal((await post('support-access',{...body,allowedActions:['class.read','class.read']})).statusCode,422);assert.equal((await post('support-access',{...body,classId:seedId('class:B:10A1')})).statusCode,404);assert.equal((await post('support-access',{...body,validUntil:new Date(Date.now()+15*86400000).toISOString()})).statusCode,422);assert.equal((await post('support-access',{...body,ticketId:crypto.randomUUID()})).statusCode,404);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const opCsrf=await login('operator@example.invalid'),opCookie=jar.get('edu_staff'),opPost=(path,body)=>request('POST',`${school}/${path}`,body,opCsrf,{'idempotency-key':crypto.randomUUID()}),created=await opPost('support-access',body);assert.equal(created.statusCode,201,created.body);let grant=created.json().data;assert.equal(grant.status,'REQUESTED');assert.equal(grant.effective,false);assert.equal(grant.requestedById,seedId('user:operator'));assert.equal((await opPost(`support-access/${grant.id}/approve`,{expectedVersion:grant.version})).statusCode,404);
  const queue=await request('GET',`/api/v1/platform/support-access?ticketId=${ticketId}`);assert.equal(queue.statusCode,200,queue.body);assert.equal(queue.json().page.total,1);jar.set('edu_staff',adminCookie);const listed=await request('GET',`${school}/support-access?ticketId=${ticketId}`);assert.equal(listed.statusCode,200,listed.body);assert.equal(listed.json().page.total,1);const approved=await post(`support-access/${grant.id}/approve`,{expectedVersion:grant.version});assert.equal(approved.statusCode,200,approved.body);grant=approved.json().data;assert.equal(grant.effective,true);assert.equal(grant.approvedById,seedId('user:admin-a'));assert.equal((await post(`support-access/${grant.id}/approve`,{expectedVersion:grant.version-1})).statusCode,409);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE platform.support_access SET allowed_actions=ARRAY['student.read'] WHERE school_id=$1 AND id=$2",[schoolA,grant.id]),{schoolId:schoolA,userId:seedId('user:admin-a')}),{code:'23514'});
  const revoked=await post(`support-access/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Nhà trường thu hồi quyền ngay sau kiểm thử'});assert.equal(revoked.statusCode,200,revoked.body);assert.equal(revoked.json().data.status,'REVOKED');assert.equal(revoked.json().data.effective,false);assert.ok(revoked.json().data.revokedAt);
  const rejected=await post('support-access',body);assert.equal(rejected.statusCode,201,rejected.body);const decline=await post(`support-access/${rejected.json().data.id}/revoke`,{expectedVersion:rejected.json().data.version,reason:'Nhà trường từ chối đề nghị hỗ trợ',decision:'REJECT'});assert.equal(decline.statusCode,200,decline.body);assert.equal(decline.json().data.status,'REJECTED');
  jar.set('edu_staff',opCookie);assert.equal((await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}`)).statusCode,404);jar.set('edu_staff',adminCookie);
});

test('B1 explicitly selected support grants authorize only scoped metadata GETs, audit the actual operator and force read-only SQL',async()=>{
  const csrf=await login('admin-a@example.invalid'),school=`/api/v1/schools/${schoolA}`,post=(path,body)=>request('POST',`${school}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()}),ticket=await post('support',{subject:`READ-SUPPORT-${testTextNonce()}`,description:'Phê duyệt đọc cấu trúc lớp cho kiểm thử quyền thực tế',priority:'NORMAL'});assert.equal(ticket.statusCode,201,ticket.body);
  const body={ticketId:ticket.json().data.id,operatorId:seedId('user:operator'),classId:classA,allowedActions:['class.read','assignment.read'],reason:'Đọc cấu trúc lớp qua grant đã chọn rõ ràng',validFrom:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()},created=await post('support-access',body);assert.equal(created.statusCode,201,created.body);let grant=created.json().data;
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const opCsrf=await login('operator@example.invalid'),opCookie=jar.get('edu_staff'),header={'x-support-access':grant.id};assert.equal((await request('GET',`${school}/classes/${classA}`,undefined,undefined,header)).statusCode,404);jar.set('edu_staff',adminCookie);const consent=await post(`support-access/${grant.id}/approve`,{expectedVersion:grant.version});assert.equal(consent.statusCode,200,consent.body);grant=consent.json().data;jar.set('edu_staff',opCookie);
  const detail=await request('GET',`${school}/classes/${classA}`,undefined,undefined,header);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.id,classA);assert.equal(Object.hasOwn(detail.json().data,'students'),false);const classes=await request('GET',`${school}/classes`,undefined,undefined,header);assert.equal(classes.statusCode,200,classes.body);assert.equal(classes.json().page.total,1);assert.equal(classes.json().data[0].id,classA);
  const assignments=await request('GET',`${school}/assignments`,undefined,undefined,header);assert.equal(assignments.statusCode,200,assignments.body);assert.ok(assignments.json().data.length);assert.ok(assignments.json().data.every(a=>a.classId===classA));assert.equal((await request('GET',`${school}/classes/${classB}`,undefined,undefined,header)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/classes`,undefined,undefined,header)).statusCode,404);assert.equal((await request('GET',`${school}/assignments?classId=${classB}`,undefined,undefined,header)).statusCode,404);
  for(const suffix of [`classes/${classA}/students`,'members','parent-access','imports','settings'])assert.equal((await request('GET',`${school}/${suffix}`,undefined,undefined,header)).statusCode,403);assert.equal((await request('PATCH',`${school}/classes/${classA}`,{expectedVersion:detail.json().data.version,name:'Không được sửa qua support'},opCsrf,{'idempotency-key':crypto.randomUUID(),...header})).statusCode,403);
  await assert.rejects(runSupportRead({grantId:grant.id,operatorId:seedId('user:operator'),schoolId:schoolA,classId:classA,allowedActions:grant.allowedActions},()=>db.transaction(tx=>tx.query('UPDATE platform.schools SET name=name WHERE id=$1',[schoolA]),{schoolId:schoolA})),{code:'25006'});
  const recorded=await db.transaction(tx=>tx.query('SELECT actor_user_id,actor_kind,support_access_id,request_id,redacted_after FROM app.audit_events WHERE school_id=$1 AND support_access_id=$2',[schoolA,grant.id]),{schoolId:schoolA});assert.ok(recorded.rows.some(a=>a.request_id===detail.json().requestId&&a.actor_user_id===seedId('user:operator')&&a.actor_kind==='SUPPORT'&&a.support_access_id===grant.id&&a.redacted_after.status===200));
  const clean=await db.transaction(tx=>tx.query("SELECT current_setting('app.support_access_id',true) AS support,app.tenant_id() AS school"),{schoolId:schoolB});assert.equal(clean.rows[0].support,'');assert.equal(clean.rows[0].school,schoolB);
  try{await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolA]);assert.equal((await request('GET',`${school}/classes/${classA}`,undefined,undefined,header)).statusCode,200);}finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolA]);}
  jar.set('edu_staff',adminCookie);const revoked=await post(`support-access/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Thu hồi grant đọc trong cùng phiên operator'});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',opCookie);assert.equal((await request('GET',`${school}/classes/${classA}`,undefined,undefined,header)).statusCode,404);assert.equal((await request('GET',`${school}/classes/${classA}`)).statusCode,404);
});

test('B1 school-wide support metadata never exposes import rows/downloads and expires without fallback to operator privileges',async()=>{
  const csrf=await login('admin-a@example.invalid'),school=`/api/v1/schools/${schoolA}`,post=(path,body)=>request('POST',`${school}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()}),ticket=await post('support',{subject:`CONFIG-SUPPORT-${testTextNonce()}`,description:'Đọc cấu hình, danh mục và trạng thái nhập dữ liệu',priority:'NORMAL'});assert.equal(ticket.statusCode,201,ticket.body);
  const created=await post('support-access',{ticketId:ticket.json().data.id,operatorId:seedId('user:operator'),allowedActions:['school.read','school.settings','year.read','dictionary.read','member.read','role.read','import.read'],reason:'Kiểm tra metadata cấu hình đã được trường cho phép',validFrom:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()});assert.equal(created.statusCode,201,created.body);const approved=await post(`support-access/${created.json().data.id}/approve`,{expectedVersion:created.json().data.version});assert.equal(approved.statusCode,200,approved.body);const grant=approved.json().data,adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login('operator@example.invalid');const opCookie=jar.get('edu_staff'),header={'x-support-access':grant.id};
  for(const suffix of ['profile','settings','academic-years','dictionaries/subjects','members','roles','imports']){const read=await request('GET',`${school}/${suffix}`,undefined,undefined,header);assert.equal(read.statusCode,200,`${suffix}: ${read.body}`);}
  const imports=await request('GET',`${school}/imports`,undefined,undefined,header);assert.ok(imports.json().data.length);const id=imports.json().data[0].id,metadata=await request('GET',`${school}/imports/${id}`,undefined,undefined,header);assert.equal(metadata.statusCode,200,metadata.body);assert.equal(Object.hasOwn(metadata.json().data,'rows'),false);for(const suffix of [`imports/${id}/rows`,`imports/${id}/errors-file`,'students','guardians'])assert.equal((await request('GET',`${school}/${suffix}`,undefined,undefined,header)).statusCode,403);
  const operatorGrant=seedId('operator:platform.support');try{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[operatorGrant]);assert.equal((await request('GET',`${school}/settings`,undefined,undefined,header)).statusCode,404);}finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=NULL WHERE id=$1',[operatorGrant]);}
  jar.set('edu_staff',adminCookie);const short=await post('support-access',{ticketId:ticket.json().data.id,operatorId:seedId('user:operator'),allowedActions:['school.read'],reason:'Kiểm tra hết hạn bằng thời gian PostgreSQL thực tế',validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3000).toISOString()});assert.equal(short.statusCode,201,short.body);const accepted=await post(`support-access/${short.json().data.id}/approve`,{expectedVersion:short.json().data.version});assert.equal(accepted.statusCode,200,accepted.body);jar.set('edu_staff',opCookie);const shortHeader={'x-support-access':short.json().data.id};assert.equal((await request('GET',`${school}/profile`,undefined,undefined,shortHeader)).statusCode,200);await new Promise(resolve=>setTimeout(resolve,3100));assert.equal((await request('GET',`${school}/profile`,undefined,undefined,shortHeader)).statusCode,404);jar.set('edu_staff',adminCookie);
});

test('B1 an operator who also has school-admin rights still cannot self-approve or combine selected support scope with ordinary rights',async()=>{
  const userId=crypto.randomUUID(),email=`mixed-support-${crypto.randomUUID()}@example.invalid`,opGrant=crypto.randomUUID();await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Operator kiêm quản trị kiểm thử',$3,'ACTIVE',now())",[userId,email,await hashPassword(password)]);
  const member=await db.transaction(async tx=>{const m=(await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status) VALUES($1,$2,'Quản trị kiêm operator kiểm thử','ACTIVE') RETURNING id",[schoolA,userId])).rows[0];await tx.query("INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,granted_by) VALUES($1,$2,$3,'SCHOOL',$4)",[schoolA,m.id,seedId('role:A:SCHOOL_ADMIN'),seedId('user:admin-a')]);return m;},{schoolId:schoolA});await db.app.query("INSERT INTO platform.operator_grants(id,user_id,action_code) VALUES($1,$2,'platform.support')",[opGrant,userId]);
  const csrf=await login('admin-a@example.invalid'),school=`/api/v1/schools/${schoolA}`,post=(path,body)=>request('POST',`${school}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()}),ticket=await post('support',{subject:`MIXED-SUPPORT-${testTextNonce()}`,description:'Kiểm tra người hỗ trợ không tự phê duyệt quyền mình',priority:'NORMAL'});assert.equal(ticket.statusCode,201,ticket.body);const created=await post('support-access',{ticketId:ticket.json().data.id,operatorId:userId,classId:classA,allowedActions:['class.read'],reason:'Quyền hỗ trợ tách khỏi quyền quản trị riêng',validFrom:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()});assert.equal(created.statusCode,201,created.body);let grant=created.json().data;const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');const mixedCsrf=await login(email),mixedCookie=jar.get('edu_staff'),header={'x-support-access':grant.id};
  try{
    const self=await request('POST',`${school}/support-access/${grant.id}/approve`,{expectedVersion:grant.version},mixedCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(self.statusCode,403,self.body);assert.equal(self.json().code,'SELF_SUPPORT_APPROVAL_FORBIDDEN');await assert.rejects(db.transaction(tx=>tx.query("UPDATE platform.support_access SET status='APPROVED',approved_by_user_id=$3 WHERE school_id=$1 AND id=$2",[schoolA,grant.id,userId]),{schoolId:schoolA,userId}),{code:'23514'});assert.equal((await request('GET',`${school}/classes/${classA}`,undefined,undefined,header)).statusCode,404);
    jar.set('edu_staff',adminCookie);const approved=await post(`support-access/${grant.id}/approve`,{expectedVersion:grant.version});assert.equal(approved.statusCode,200,approved.body);grant=approved.json().data;jar.set('edu_staff',mixedCookie);const detail=await request('GET',`${school}/classes/${classA}`,undefined,undefined,header);assert.equal(detail.statusCode,200,detail.body);assert.equal((await request('GET',`${school}/classes/${classB}`,undefined,undefined,header)).statusCode,404);assert.equal((await request('GET',`${school}/classes/${classB}`)).statusCode,200);assert.equal((await request('PATCH',`${school}/classes/${classA}`,{expectedVersion:detail.json().data.version,name:'Không trộn quyền quản trị vào support'},mixedCsrf,{'idempotency-key':crypto.randomUUID(),...header})).statusCode,403);
  }finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[opGrant]);await db.transaction(async tx=>{await tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND member_id=$2',[schoolA,member.id]);await tx.query("UPDATE app.memberships SET status='ENDED',ended_at=now() WHERE school_id=$1 AND id=$2",[schoolA,member.id]);},{schoolId:schoolA});jar.set('edu_staff',adminCookie);}
});

test('B5 signed native keysets cross a nullable sort boundary without dropping or repeating persisted schools',async()=>{
  const csrf=await login('operator@example.invalid'),prefix=`NULL-PAGE-${crypto.randomUUID()}`,ids=[];
  for(let i=0;i<3;i++){const r=await request('POST','/api/v1/platform/schools',{code:`${prefix}-${i}`,slug:`null-page-${crypto.randomUUID()}`,name:`Trường phân trang ${i}`,...(i===0?{level:'THPT'}:{})},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(r.statusCode,201,r.body);ids.push(r.json().data.id);}
  const path=`/api/v1/platform/schools?q=${encodeURIComponent(prefix)}&sort=level&limit=1`,seen=[];let cursor=null;
  do{const page=await request('GET',path+(cursor?`&cursor=${encodeURIComponent(cursor)}`:''));assert.equal(page.statusCode,200,page.body);assert.equal(page.json().page.total,3);assert.equal(page.json().data.length,1);seen.push(page.json().data[0].id);cursor=page.json().page.nextCursor;assert.ok(seen.length<=3);}while(cursor);
  assert.equal(seen[0],ids[0]);assert.equal(new Set(seen).size,3);assert.deepEqual(new Set(seen),new Set(ids));
});

async function reportFixture(){
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf);await activateFixtureClass(f);const base=`/api/v1/schools/${schoolA}`,day=(await db.transaction(tx=>tx.query("SELECT (now() AT TIME ZONE timezone)::date AS date FROM platform.schools WHERE id=$1",[schoolA]),{schoolId:schoolA})).rows[0].date;
  const next=new Date(Date.parse(day)+86400000).toISOString().slice(0,10),created=await f.post(`classes/${f.classId}/attendance`,{date:day,granularity:'DAILY',slot:'MORNING'});assert.equal(created.statusCode,201,created.body);let session=created.json().data;
  const edited=await request('PATCH',`${base}/classes/${f.classId}/attendance/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:f.enrollments[0].id,expectedVersion:session.records.find(r=>r.enrollmentId===f.enrollments[0].id).version,status:'PRESENT',internalNote:'PRIVATE REPORT INTERNAL NOTE'}]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edited.statusCode,200,edited.body);session=edited.json().data;
  const filters={yearId:seedId('year:A'),classId:f.classId,from:day,to:next},query=new URLSearchParams(filters).toString();return {...f,csrf,base,session,filters,query};
}
async function queueReport(f,format='CSV',overrides={},key=crypto.randomUUID()){
  const r=await request('POST',`${f.base}/exports`,{reportType:'attendance',format,...f.filters,...overrides},f.csrf,{'idempotency-key':key});assert.equal(r.statusCode,202,r.body);return r.json().data;
}
test('B5 report SQL uses real scoped counts and immutable CSV export content while live attendance changes',async()=>{
  const f=await reportFixture(),worker=new WorkerRunner();try{
    const path=`${f.base}/classes/${f.classId}/reports/attendance?${f.query}`,read=await request('GET',path);assert.equal(read.statusCode,200,read.body);let data=read.json().data;
    assert.equal(data.dataSource,'LIVE_INTERNAL');assert.equal(data.rows.length,2);assert.equal(data.metrics.find(m=>m.key==='total').value,2);assert.equal(data.metrics.find(m=>m.key==='present').value,1);assert.equal(data.metrics.find(m=>m.key==='unmarked').value,1);assert.equal(read.body.includes('PRIVATE REPORT INTERNAL NOTE'),false);assert.equal(read.body.includes('password'),false);
    const school=await request('GET',`${f.base}/reports/attendance?${f.query}`);assert.equal(school.statusCode,200,school.body);assert.equal(school.json().data.rows.length,1);assert.equal(school.json().data.rows[0].values.total,2);
    const key=crypto.randomUUID(),job=await queueReport(f,'CSV',{},key),replay=await queueReport(f,'CSV',{},key);assert.equal(replay.id,job.id);assert.equal(job.status,'QUEUED');assert.equal((await request('GET',`${f.base}/exports/${job.id}/download`)).statusCode,409);
    const r=f.session.records.find(r=>r.enrollmentId===f.enrollments[0].id),edit=await request('PATCH',`${f.base}/classes/${f.classId}/attendance/${f.session.id}/records`,{expectedVersion:f.session.version,records:[{enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'EXCUSED'}]},f.csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edit.statusCode,200,edit.body);
    data=(await request('GET',path)).json().data;assert.equal(data.metrics.find(m=>m.key==='present').value,0);assert.equal(data.metrics.find(m=>m.key==='excused').value,1);
    await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.export_jobs SET report_snapshot='{}' WHERE school_id=$1 AND id=$2",[schoolA,job.id]),{schoolId:schoolA}),e=>e.code==='23514');
    await drainSchool(worker);const saved=(await request('GET',`${f.base}/exports/${job.id}`)).json().data;assert.equal(saved.status,'COMPLETED');assert.equal(saved.contentHash,job.contentHash);assert.equal(saved.asOf,job.asOf);assert.ok(saved.fileId);
    const download=await request('GET',`${f.base}/exports/${job.id}/download`);assert.equal(download.statusCode,200,download.body);assert.match(download.headers['content-type'],/text\/csv/);assert.equal(download.headers['cache-control'],'no-store');const parsed=(await import('csv-parse/sync')).parse(download.body,{bom:true,columns:true});assert.equal(parsed.length,2);assert.equal(parsed.reduce((n,r)=>n+Number(r['Có mặt']),0),1);assert.equal(parsed.reduce((n,r)=>n+Number(r['Nghỉ có phép']),0),0);
    const metadata=await request('GET',`${f.base}/files/${saved.fileId}`);assert.equal(metadata.statusCode,200,metadata.body);assert.equal(metadata.json().data.scanStatus,'GENERATED');assert.equal(metadata.body.includes('objectKey'),false);
    const listed=await request('GET',`${f.base}/exports?classId=${f.classId}&limit=1`);assert.equal(listed.statusCode,200,listed.body);assert.equal(listed.json().page.total,1);assert.equal(listed.json().data[0].id,job.id);
    assert.equal((await request('GET',`${f.base}/classes/${f.classId}/reports/attendance?${f.query}&arbitrary=1`)).statusCode,422);assert.equal((await request('GET',`${f.base}/classes/${f.classId}/reports/attendance?${new URLSearchParams({...f.filters,from:f.filters.to}).toString()}`)).statusCode,422);
  }finally{await worker.close();}
});
test('B5 published report exports pin revisions across replacement and withdrawal without exposing drafts',async()=>{
  const f=await reportFixture(),worker=new WorkerRunner();try{
    const second=f.session.records.find(r=>r.enrollmentId===f.enrollments[1].id),marked=await request('PATCH',`${f.base}/classes/${f.classId}/attendance/${f.session.id}/records`,{expectedVersion:f.session.version,records:[{enrollmentId:second.enrollmentId,expectedVersion:second.version,status:'EXCUSED'}]},f.csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(marked.statusCode,200,marked.body);f.session=marked.json().data;
    let pub=await f.post(`classes/${f.classId}/attendance/${f.session.id}/publish`,{expectedSourceVersion:f.session.dataVersion,expectedPublicationId:null});assert.equal(pub.statusCode,200,pub.body);pub=pub.json().data;
    const path=`${f.base}/classes/${f.classId}/reports/attendance?${f.query}&dataSource=PUBLISHED_SNAPSHOT`,published=await request('GET',path);assert.equal(published.statusCode,200,published.body);assert.deepEqual(published.json().data.publicationIds,[pub.id]);assert.equal(published.json().data.rows.some(r=>r.values.status==='PRESENT'),true);
    const job=await queueReport(f,'CSV',{dataSource:'PUBLISHED_SNAPSHOT'}),reopened=await f.post(`classes/${f.classId}/attendance/${f.session.id}/reopen`,{expectedVersion:(await request('GET',`${f.base}/classes/${f.classId}/attendance/${f.session.id}`)).json().data.version,reason:'Sửa sau khi ghim bản xuất'});assert.equal(reopened.statusCode,200,reopened.body);let session=reopened.json().data,r=session.records.find(r=>r.enrollmentId===f.enrollments[0].id);
    const changed=await request('PATCH',`${f.base}/classes/${f.classId}/attendance/${session.id}/records`,{expectedVersion:session.version,records:[{enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'UNEXCUSED'}]},f.csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(changed.statusCode,200,changed.body);session=changed.json().data;
    assert.equal((await request('GET',path)).json().data.rows.some(r=>r.values.status==='PRESENT'),true);
    const replacement=await f.post(`classes/${f.classId}/attendance/${session.id}/publish`,{expectedSourceVersion:session.dataVersion,expectedPublicationId:pub.id});assert.equal(replacement.statusCode,200,replacement.body);
    assert.equal((await request('GET',path)).json().data.rows.some(r=>r.values.status==='UNEXCUSED'),true);await drainSchool(worker);
    const pinned=await request('GET',`${f.base}/exports/${job.id}/download`);assert.equal(pinned.statusCode,200,pinned.body);assert.match(pinned.body,/PRESENT/);assert.doesNotMatch(pinned.body,/UNEXCUSED/);
    const withdrawn=await f.post(`publications/${replacement.json().data.id}/withdraw`,{expectedVersion:replacement.json().data.version,reason:'Thu hồi bản báo cáo công bố'});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal((await request('GET',path)).json().data.rows.length,0);
    const conduct=await request('GET',`${f.base}/classes/${f.classId}/reports/conduct?yearId=${seedId('year:A')}&weekId=${seedId('week:A:5')}`);assert.equal(conduct.statusCode,200,conduct.body);assert.equal(conduct.json().data.rows.every(r=>r.values.finalPoints===null),true);
    const personal=await request('GET',`${f.base}/classes/${f.classId}/reports/student?${f.query}&studentId=${f.enrollments[0].studentId}`);assert.equal(personal.statusCode,200,personal.body);assert.equal(personal.json().data.rows.every(r=>r.studentId===f.enrollments[0].studentId),true);assert.equal(personal.body.includes('PRIVATE REPORT INTERNAL NOTE'),false);
  }finally{await worker.close();}
});
test('B5 export XLSX/PDF are actual files with literal formula text, Vietnamese font and private download authorization',async()=>{
  const f=await reportFixture(),worker=new WorkerRunner();try{
    await db.transaction(tx=>tx.query('UPDATE app.students SET full_name=$3 WHERE school_id=$1 AND id=$2',[schoolA,f.enrollments[0].studentId,'=HYPERLINK("https://example.invalid","giả")']),{schoolId:schoolA});
    const xlsx=await queueReport(f,'XLSX'),pdf=await queueReport(f,'PDF');await drainSchool(worker);
    const x=await request('GET',`${f.base}/exports/${xlsx.id}/download`);assert.equal(x.statusCode,200,x.body);assert.equal(x.rawPayload.subarray(0,2).toString(),'PK');const wb=new ExcelJS.Workbook();await wb.xlsx.load(x.rawPayload);const values=[];wb.worksheets[0].eachRow(row=>{for(const cell of row._cells){assert.notEqual(cell?.type,ExcelJS.ValueType.Formula);if(cell?.value)values.push(String(cell.value));}});assert.ok(values.some(v=>v.startsWith("'=HYPERLINK")));
    const p=await request('GET',`${f.base}/exports/${pdf.id}/download`);assert.equal(p.statusCode,200,p.body);assert.equal(p.rawPayload.subarray(0,5).toString(),'%PDF-');assert.match(p.rawPayload.toString('latin1'),/FontFile2/);assert.match(p.rawPayload.toString('latin1'),/NotoSans/);assert.equal((p.rawPayload.toString('latin1').match(/\/Type\s*\/Page\b/g)??[]).length,3,'wide table has three panels and no footer-only extra pages');
    const meta=(await request('GET',`${f.base}/exports/${pdf.id}`)).json().data;assert.equal((await request('POST',`${f.base}/file-links`,{fileId:meta.fileId,studentId:f.enrollments[0].studentId,shareWithGuardian:true},f.csrf,{'idempotency-key':crypto.randomUUID()})).statusCode,422);
    const auditPath=process.env.REPORT_QA_OUTPUT;if(auditPath){await fs.mkdir(auditPath,{recursive:true});await fs.writeFile(path.join(auditPath,'report-vietnamese.pdf'),p.rawPayload);}
    const anonymous=await server.inject({method:'GET',url:`${f.base}/exports/${pdf.id}/download`});assert.equal(anonymous.statusCode,401);
    await login('admin-b@example.invalid',resetPassword);assert.equal((await request('GET',`${f.base}/exports/${pdf.id}/download`)).statusCode,404);
    await login('teacher-a@example.invalid');assert.equal((await request('GET',`${f.base}/exports/${pdf.id}/download`)).statusCode,404);assert.equal((await request('GET',`${f.base}/files/${meta.fileId}/download`)).statusCode,404);
  }finally{await worker.close();}
});
test('B5 subject reports remain own lesson attendance and scoped activities without school/family/conduct/export access',async()=>{
  await login('teacher-a@example.invalid');const base=`/api/v1/schools/${schoolA}`,query=`yearId=${seedId('year:A')}&from=2026-09-28&to=2026-09-30`;
  const own=await request('GET',`${base}/classes/${classB}/reports/attendance?${query}`);assert.equal(own.statusCode,200,own.body);assert.ok(own.json().data.rows.length>0,'authorized own-lesson facts must be present, not an empty successful report');assert.equal(own.body.includes('internalNote'),false);assert.equal(own.json().data.rows.every(r=>r.classId===classB),true);
  assert.equal((await request('GET',`${base}/reports/attendance?${query}`)).statusCode,403);assert.equal((await request('GET',`${base}/classes/${classB}/reports/conduct?${query}`)).statusCode,404);assert.equal((await request('GET',`${base}/classes/${classB}/reports/parent-access?${query}`)).statusCode,404);
  assert.equal((await request('GET',`${base}/classes/${classB}/reports/activities?${query}`)).statusCode,200);const csrf=(await request('GET','/api/v1/me/context')).json().data.csrfToken;assert.equal((await request('POST',`${base}/exports`,{reportType:'attendance',format:'CSV',yearId:seedId('year:A'),classId:classB,from:'2026-09-28',to:'2026-09-30'},csrf,{'idempotency-key':crypto.randomUUID()})).statusCode,404);
});
test('B5 export workers and all file paths reauthorize revocation, expiry and cancellation, and replay completed work safely',async()=>{
  const f=await reportFixture(),worker=new WorkerRunner(),grant=seedId('grant:A:admin-a:admin');try{
    const queued=await queueReport(f);await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[schoolA,grant]),{schoolId:schoolA});await drainSchool(worker);
    await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=NULL WHERE school_id=$1 AND id=$2',[schoolA,grant]),{schoolId:schoolA});const failed=await request('GET',`${f.base}/exports/${queued.id}`);assert.equal(failed.statusCode,200,failed.body);assert.equal(failed.json().data.status,'FAILED');assert.equal(failed.json().data.fileId,undefined);assert.ok(failed.json().data.lastErrorCode);
    const cancel=await queueReport(f),cancelled=await request('POST',`${f.base}/exports/${cancel.id}/cancel`,{expectedVersion:cancel.version,reason:'Hủy bản xuất kiểm thử'},f.csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(cancelled.statusCode,200,cancelled.body);await drainSchool(worker);assert.equal((await request('GET',`${f.base}/exports/${cancel.id}`)).json().data.status,'CANCELLED');
    const ready=await queueReport(f);await drainSchool(worker);let saved=(await request('GET',`${f.base}/exports/${ready.id}`)).json().data;assert.equal(saved.status,'COMPLETED');const original=saved.fileId;
    await worker.db.transaction(tx=>tx.query("UPDATE app.outbox_events SET status='PENDING',attempts=0,processed_at=NULL WHERE school_id=$1 AND dedupe_key=$2",[schoolA,`export:${ready.id}`]),{schoolId:schoolA});await drainSchool(worker);saved=(await request('GET',`${f.base}/exports/${ready.id}`)).json().data;assert.equal(saved.fileId,original);assert.equal((await db.transaction(tx=>tx.query('SELECT count(*)::int AS n FROM app.files WHERE school_id=$1 AND id=$2',[schoolA,original]),{schoolId:schoolA})).rows[0].n,1);
    await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[schoolA,grant]),{schoolId:schoolA});for(const suffix of [`exports/${ready.id}/download`,`files/${original}/download`])assert.ok([403,404,409].includes((await request('GET',`${f.base}/${suffix}`)).statusCode));
    await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=NULL WHERE school_id=$1 AND id=$2',[schoolA,grant]),{schoolId:schoolA});await db.transaction(tx=>tx.query("UPDATE app.export_jobs SET expires_at=now()-interval '1 second' WHERE school_id=$1 AND id=$2",[schoolA,ready.id]),{schoolId:schoolA});assert.equal((await request('GET',`${f.base}/exports/${ready.id}`)).json().data.status,'EXPIRED');assert.equal((await request('GET',`${f.base}/exports/${ready.id}/download`)).statusCode,410);assert.equal((await request('GET',`${f.base}/files/${original}/download`)).statusCode,404);
  }finally{await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=NULL WHERE school_id=$1 AND id=$2',[schoolA,grant]),{schoolId:schoolA});await worker.close();}
});

test('B5 conduct/activity/progress/link reports use actual pinned scores, explicit participant denominators and anonymous link use',async()=>{
  const f=await reportFixture(),conductBase=`classes/${f.classId}/conduct-periods/${f.period.id}`,review=await request('GET',`${f.base}/${conductBase}/review`);assert.equal(review.statusCode,200,review.body);
  const locked=await f.post(`${conductBase}/lock`,{expectedVersion:review.json().data.period.version});assert.equal(locked.statusCode,200,locked.body);
  const query=`yearId=${seedId('year:A')}&weekId=${seedId('week:A:5')}`,classReport=await request('GET',`${f.base}/classes/${f.classId}/reports/conduct?${query}`);assert.equal(classReport.statusCode,200,classReport.body);assert.equal(classReport.json().data.rows.length,2);assert.equal(classReport.json().data.rows.every(r=>r.values.finalPoints==='80.10'),true);
  const schoolReport=await request('GET',`${f.base}/reports/conduct?${query}&classId=${f.classId}`);assert.equal(schoolReport.statusCode,200,schoolReport.body);assert.equal(schoolReport.json().data.rows.length,1);assert.equal(schoolReport.json().data.rows[0].values.students,2);assert.equal(schoolReport.json().data.rows[0].values.average,'80.10');assert.equal(schoolReport.json().data.rows[0].values.classifications['Đạt'],2);
  const published=await f.post(`${conductBase}/publish`,{expectedSourceVersion:locked.json().data.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);assert.deepEqual((await request('GET',`${f.base}/classes/${f.classId}/reports/conduct?${query}&dataSource=PUBLISHED_SNAPSHOT`)).json().data.publicationIds,[published.json().data.id]);
  const dueAt=new Date(Date.now()+86400000).toISOString(),activityPath=`classes/${f.classId}/activities`,created=await f.post(activityPath,{title:'Hoạt động báo cáo giả',description:'Chỉ một người được giao',dueAt,evidenceRequired:false,enrollmentIds:[f.enrollments[0].id]});assert.equal(created.statusCode,201,created.body);let activity=created.json().data;
  const assigned=await f.post(`${activityPath}/${activity.id}/assign`,{expectedVersion:activity.version});assert.equal(assigned.statusCode,200,assigned.body);activity=assigned.json().data;
  const participants=(await request('GET',`${f.base}/${activityPath}/${activity.id}/participants`)).json().data,p=participants[0];assert.equal(participants.length,1);assert.equal((await f.post(`${activityPath}/${activity.id}/participants/${p.id}/status`,{expectedVersion:p.version,status:'APPROVED',reason:'Đã xác minh sản phẩm kiểm thử'})).statusCode,200);
  const range=`yearId=${seedId('year:A')}&classId=${f.classId}&from=2026-09-01&to=2027-06-01`,activityReport=await request('GET',`${f.base}/reports/activities?${range}`);assert.equal(activityReport.statusCode,200,activityReport.body);assert.equal(activityReport.json().data.rows[0].values.assigned,1);assert.equal(activityReport.json().data.rows[0].values.approved,1);
  const detailed=await request('GET',`${f.base}/classes/${f.classId}/reports/activities?${range}`);assert.equal(detailed.statusCode,200,detailed.body);assert.equal(detailed.json().data.rows.length,1);assert.equal(detailed.json().data.rows[0].studentId,f.enrollments[0].studentId);
  const progress=await request('GET',`${f.base}/reports/class-progress?${range}`);assert.equal(progress.statusCode,200,progress.body);assert.equal(progress.json().data.rows[0].values.students,2);assert.equal(progress.json().data.rows[0].values.homeroom,true);
  const relation=await parentRelationship(f.csrf,f.post,f.enrollments[0].studentId),link=await f.post('parent-access',{studentId:f.enrollments[0].studentId,yearId:seedId('year:A'),relationshipId:relation.id,allowedSections:['overview'],allowDownload:false,expiresAt:'2027-05-31T00:00:00Z'});assert.equal(link.statusCode,201,link.body);await parentExchange(link.json().data.link);
  const links=await request('GET',`${f.base}/reports/parent-access?${range}`);assert.equal(links.statusCode,200,links.body);assert.equal(links.json().data.rows[0].values.links,1);assert.equal(links.json().data.rows[0].values.active,1);assert.equal(links.json().data.rows[0].values.opened,1);for(const key of ['tokenHash','phone','guardianId','relationshipId','ipDailyHash','deviceSummary'])assert.equal(links.body.includes(key),false);
});

test('B6 organization display fields persist with versions and tenant-safe references instead of being silently ignored',async()=>{
  jar.delete('edu_staff');let csrf=await login('admin-a@example.invalid');const base=`/api/v1/schools/${schoolA}`;
  const command=(method,path,body)=>request(method,`${base}/${path}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  let profile=(await request('GET',`${base}/profile`)).json().data;
  const original={shortName:profile.shortName,website:profile.website??null,accentColor:profile.accentColor,motto:profile.motto,publicIntro:profile.publicIntro};
  try{
    const saved=await command('PATCH','profile',{expectedVersion:profile.version,shortName:'Tên ngắn từ form',website:'https://example.invalid/edu',accentColor:'#123abc',motto:'Khẩu hiệu thật từ form',publicIntro:'Giới thiệu được lưu'});assert.equal(saved.statusCode,200,saved.body);profile=saved.json().data;assert.equal(profile.website,'https://example.invalid/edu');assert.equal(profile.shortName,'Tên ngắn từ form');assert.equal(profile.accentColor,'#123abc');
    const reread=await request('GET',`${base}/profile`);assert.deepEqual(reread.json().data,profile);
    const invalid=await command('PATCH','profile',{expectedVersion:profile.version,shortName:'Không được lưu',website:'javascript:alert(1)'});assert.equal(invalid.statusCode,422);assert.equal((await request('GET',`${base}/profile`)).json().data.version,profile.version);
  }finally{profile=(await request('GET',`${base}/profile`)).json().data;assert.equal((await command('PATCH','profile',{expectedVersion:profile.version,...original})).statusCode,200);}
  const code='M_'+crypto.randomUUID().replaceAll('-','').slice(0,10);
  const subject=await command('POST','dictionaries/subjects',{code,name:'Môn có màu kiểm thử',color:'#aabbcc'});assert.equal(subject.statusCode,201,subject.body);assert.equal(subject.json().data.color,'#aabbcc');
  const grade=await command('POST','dictionaries/grades',{code,name:'Khối kiểm thử',gradeLevel:6});assert.equal(grade.statusCode,201,grade.body);assert.equal(grade.json().data.gradeLevel,6);
  const wrong=await command('POST','dictionaries/rooms',{code:code+'X',name:'Sai kiểu danh mục',color:'#aabbcc'});assert.equal(wrong.statusCode,422);
  const room=await command('POST','dictionaries/rooms',{code,name:'Phòng kiểm thử',capacity:45});assert.equal(room.statusCode,201,room.body);
  const renamed=await command('PATCH',`dictionaries/subjects/${subject.json().data.id}`,{expectedVersion:subject.json().data.version,code:code+'R',color:'#112233'});assert.equal(renamed.statusCode,200,renamed.body);assert.equal(renamed.json().data.code,code+'R');assert.equal(renamed.json().data.color,'#112233');
  const before=(await request('GET',`${base}/classes/${classA}`)).json().data;
  jar.delete('edu_staff');const bCsrf=await login('admin-b@example.invalid',resetPassword),foreign=await request('POST',`/api/v1/schools/${schoolB}/dictionaries/rooms`,{code,name:'Phòng trường B',capacity:45},bCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(foreign.statusCode,201,foreign.body);
  jar.delete('edu_staff');csrf=await login('admin-a@example.invalid');const outside=await command('PATCH',`classes/${classA}`,{expectedVersion:before.version,roomId:foreign.json().data.id,motto:'Không được lưu ngoài trường'});assert.equal(outside.statusCode,404);assert.equal((await request('GET',`${base}/classes/${classA}`)).json().data.version,before.version);
  const updated=await command('PATCH',`classes/${classA}`,{expectedVersion:before.version,roomId:room.json().data.id,motto:'Lớp có khẩu hiệu'});assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().data.roomId,room.json().data.id);assert.equal(updated.json().data.motto,'Lớp có khẩu hiệu');
  const used=await request('GET',`${base}/dictionaries/rooms?q=${code}`);assert.equal(used.statusCode,200,used.body);assert.equal(used.json().data.find(r=>r.id===room.json().data.id).inUse,true);
  const cleared=await command('PATCH',`classes/${classA}`,{expectedVersion:updated.json().data.version,roomId:null,motto:null});assert.equal(cleared.statusCode,200,cleared.body);assert.equal(Object.hasOwn(cleared.json().data,'roomId'),false);assert.equal(cleared.json().data.motto,null);
  const termId=seedId('term:A'),term=(await request('GET',`${base}/terms/${termId}`)).json().data;
  const opening=await command('PATCH',`terms/${termId}`,{expectedVersion:term.version,openingDate:'2026-09-05'});assert.equal(opening.statusCode,200,opening.body);assert.equal(opening.json().data.openingDate,'2026-09-05');
  assert.equal((await command('PATCH',`terms/${termId}`,{expectedVersion:opening.json().data.version,openingDate:'2027-02-01'})).statusCode,422);
});

test('B6 year wizard creates bounded terms, weeks, published holidays and independent draft rules atomically and idempotently',async()=>{
  const csrf=await login('admin-a@example.invalid'),f=await conductFixture(csrf),base=`/api/v1/schools/${schoolA}`,range=await unusedYearRange(schoolA),number=Number(range.startsOn.slice(0,4)),code=`WIZ-${crypto.randomUUID()}`;
  const body={code,name:`${number}–${number+1}`,...range,terms:[
    {code:'T1',name:'Học kỳ một',startsOn:range.startsOn,endsOn:`${number+1}-01-20`,openingDate:`${number}-09-05`},
    {code:'T2',name:'Học kỳ hai',startsOn:`${number+1}-01-20`,endsOn:range.endsOn},
  ],holidays:[{title:'Ngày nghỉ giả',startsOn:`${number}-09-10`,endsOn:`${number}-09-11`}],copyRules:true};
  const post=(payload,key=crypto.randomUUID())=>request('POST',`${base}/academic-years`,payload,csrf,{'idempotency-key':key});
  const originalRules=await request('GET',`${base}/classes/${f.classId}/rules`);assert.equal(originalRules.statusCode,200,originalRules.body);
  for(const invalid of [
    {...body,terms:[...body.terms.slice(0,1),{...body.terms[1],startsOn:`${number+1}-01-19`}]},
    {...body,terms:[{...body.terms[0],openingDate:`${number+1}-01-20`},body.terms[1]]},
    {...body,holidays:[{...body.holidays[0],endsOn:`${number+2}-01-01`}]},
  ]){const rejected=await post(invalid);assert.equal(rejected.statusCode,422,rejected.body);const count=await db.transaction(tx=>tx.query('SELECT id FROM app.academic_years WHERE school_id=$1 AND code=$2',[schoolA,code]),{schoolId:schoolA});assert.equal(count.rowCount,0);}
  const key=crypto.randomUUID(),first=await post(body,key);assert.equal(first.statusCode,201,first.body);const created=first.json().data,replay=await post(body,key);assert.equal(replay.statusCode,201,replay.body);assert.deepEqual(replay.json().data,created);assert.equal(created.setup.termCount,2);assert.equal(created.setup.holidayCount,1);assert.ok(created.setup.copiedRuleSetId);
  const terms=await request('GET',`${base}/terms?yearId=${created.id}&sort=startsOn&limit=100`),weeks=await request('GET',`${base}/weeks?yearId=${created.id}&sort=weekNumber&limit=100`),holidays=await request('GET',`${base}/calendar-events?yearId=${created.id}&status=PUBLISHED`);
  assert.equal(terms.statusCode,200,terms.body);assert.equal(terms.json().data.length,2);assert.equal(terms.json().data[0].openingDate,`${number}-09-05`);assert.equal(weeks.statusCode,200,weeks.body);assert.equal(weeks.json().data.length,created.setup.weekCount);assert.equal(holidays.statusCode,200,holidays.body);assert.equal(holidays.json().data.length,1);
  let expectedNumber=1;
  for(const term of terms.json().data){const children=weeks.json().data.filter(w=>w.termId===term.id);assert.equal(children[0].startsOn,term.startsOn);assert.equal(children.at(-1).endsOn,term.endsOn);for(let index=0;index<children.length;index++){const week=children[index];assert.equal(week.weekNumber,expectedNumber++);assert.ok(week.startsOn>=term.startsOn&&week.endsOn<=term.endsOn);assert.ok(Date.parse(week.endsOn)-Date.parse(week.startsOn)<=7*86400000);assert.ok(week.inputDeadline);if(index)assert.equal(children[index-1].endsOn,week.startsOn);}}
  const copy=await request('GET',`${base}/conduct-rule-sets/${created.setup.copiedRuleSetId}`);assert.equal(copy.statusCode,200,copy.body);assert.equal(copy.json().data.status,'DRAFT');assert.equal(copy.json().data.basePoints,originalRules.json().data.basePoints);assert.equal(copy.json().data.rules.length,originalRules.json().data.rules.length);assert.equal(copy.json().data.thresholds.length,originalRules.json().data.thresholds.length);assert.notEqual(copy.json().data.rules[0].id,originalRules.json().data.rules[0].id);
  const stillOriginal=await request('GET',`${base}/classes/${f.classId}/rules`);assert.deepEqual(stillOriginal.json().data,originalRules.json().data);
  const overlapping=await post({...body,code:`OVER-${crypto.randomUUID()}`});assert.equal(overlapping.statusCode,422);assert.equal(overlapping.json().code,'YEAR_RANGE_OVERLAP');
  const holiday=holidays.json().data[0],withdrawn=await request('PATCH',`${base}/calendar-events/${holiday.id}`,{expectedVersion:holiday.version,status:'WITHDRAWN',reason:'Thu hồi ngày nghỉ kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal(withdrawn.json().data.status,'WITHDRAWN');assert.equal((await request('GET',`${base}/calendar-events?yearId=${created.id}&status=PUBLISHED`)).json().page.total,0);assert.equal((await request('GET',`${base}/calendar-events/${holiday.id}`)).json().data.status,'WITHDRAWN');
  const stale=await request('PATCH',`${base}/calendar-events/${holiday.id}`,{expectedVersion:holiday.version,title:'Không được ghi đè'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(stale.statusCode,409);
  const term=terms.json().data[0],edit=await request('PATCH',`${base}/terms/${term.id}`,{expectedVersion:term.version,name:'Học kỳ một sửa',openingDate:`${number}-09-06`},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edit.statusCode,200,edit.body);assert.equal(edit.json().data.openingDate,`${number}-09-06`);
  const week=weeks.json().data[0],deadlineDay=week.endsOn,deadline=await request('PATCH',`${base}/weeks/${week.id}`,{expectedVersion:week.version,inputDeadlineDay:deadlineDay},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(deadline.statusCode,200,deadline.body);const savedWeek=await request('GET',`${base}/weeks/${week.id}`);assert.equal(savedWeek.statusCode,200,savedWeek.body);assert.equal(savedWeek.json().data.inputDeadlineDay,deadlineDay);assert.equal(savedWeek.json().data.locked,false);
  const localHour=await db.transaction(tx=>tx.query("SELECT to_char(w.input_deadline AT TIME ZONE s.timezone,'HH24:MI:SS.MS') AS hour FROM app.school_weeks w JOIN platform.schools s ON s.id=w.school_id WHERE w.school_id=$1 AND w.id=$2",[schoolA,week.id]),{schoolId:schoolA});assert.equal(localHour.rows[0].hour,'23:59:59.999');
  const added=await request('POST',`${base}/calendar-events`,{yearId:created.id,title:'Ngày nghỉ thêm giả',kind:'HOLIDAY',startsOn:`${number}-09-12`,endsOn:`${number}-09-13`,status:'PUBLISHED'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(added.statusCode,201,added.body);assert.equal(added.json().data.status,'PUBLISHED');assert.equal((await request('GET',`${base}/calendar-events?yearId=${created.id}&status=PUBLISHED`)).json().page.total,1);
  const detail=await request('GET',`${base}/academic-years/${created.id}`);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.terms.reduce((total,t)=>total+t.weekCount,0),created.setup.weekCount);
  const onDate=await request('GET',`${base}/weeks?yearId=${created.id}&onDate=${range.startsOn}`);assert.equal(onDate.statusCode,200,onDate.body);assert.equal(onDate.json().page.total,1);assert.equal(onDate.json().data[0].id,week.id);assert.equal((await request('GET',`${base}/weeks?yearId=${created.id}&onDate=${range.endsOn}`)).json().page.total,0);assert.equal((await request('GET',`${base}/weeks?yearId=${created.id}&onDate=2026-02-30`)).statusCode,422);
});

test('B6 class form assigns homeroom atomically, denies foreign/backdated inputs, requires handover and preserves archived history',async()=>{
  const csrf=await login('admin-a@example.invalid'),base=`/api/v1/schools/${schoolA}`,code=`FORM-${crypto.randomUUID()}`;
  // A fresh invited identity respects the one-current-homeroom-per-teacher rule
  // even when this retained test database has previous FORM assignments.
  const post=(suffix,payload)=>request('POST',`${base}/${suffix}`,payload,csrf,{'idempotency-key':crypto.randomUUID()});
  const role=await post('roles',{code:`form-staff-${crypto.randomUUID()}`,label:'Nhân sự form giả',permissions:[{action:'school.read',scopes:['SCHOOL']}]});assert.equal(role.statusCode,201,role.body);
  const email=`form-staff-${crypto.randomUUID()}@example.invalid`,invite=await post('invitations',{email,roleId:role.json().data.id,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(invite.statusCode,201,invite.body);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invite.json().data.id}`])).rows[0].encrypted_payload,token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token'),anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Nhân sự form lớp giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const member=await db.transaction(tx=>tx.query('SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA});
  const body={yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code,name:'Lớp form giả',capacity:40,homeroomMemberId:member.rows[0].id};
  const create=(payload,key=crypto.randomUUID())=>request('POST',`${base}/classes`,payload,csrf,{'idempotency-key':key});
  for(const [invalid,status] of [[{...body,homeroomMemberId:seedId('member:B:admin-b')},404],[{...body,homeroomStartsOn:'2026-09-01'},422]]){const rejected=await create(invalid);assert.equal(rejected.statusCode,status,rejected.body);assert.equal((await db.transaction(tx=>tx.query('SELECT id FROM app.classes WHERE school_id=$1 AND code=$2',[schoolA,code]),{schoolId:schoolA})).rowCount,0);}
  const key=crypto.randomUUID(),first=await create(body,key);assert.equal(first.statusCode,201,first.body);let cls=first.json().data;assert.equal((await create(body,key)).json().data.id,cls.id);
  const assignments=await request('GET',`${base}/assignments?classId=${cls.id}`);assert.equal(assignments.statusCode,200,assignments.body);assert.equal(assignments.json().data.length,1);assert.equal(assignments.json().data[0].memberId,body.homeroomMemberId);
  const patch=(payload)=>request('PATCH',`${base}/classes/${cls.id}`,payload,csrf,{'idempotency-key':crypto.randomUUID()});
  const handover=await patch({expectedVersion:cls.version,name:'Không được lưu',homeroomMemberId:seedId('member:A:teacher-b')});assert.equal(handover.statusCode,409,handover.body);assert.equal(handover.json().code,'HANDOVER_REQUIRED');assert.equal((await request('GET',`${base}/classes/${cls.id}`)).json().data.name,body.name);
  const activated=await request('POST',`${base}/classes/${cls.id}/activate`,{expectedVersion:cls.version},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(activated.statusCode,200,activated.body);cls=activated.json().data;
  const draft=await patch({expectedVersion:cls.version,status:'DRAFT'});assert.equal(draft.statusCode,200,draft.body);assert.equal(draft.json().data.status,'DRAFT');
  const yearRange=await unusedYearRange(schoolA),year=await request('POST',`${base}/academic-years`,{code:`ARCH-${crypto.randomUUID()}`,name:'Năm lưu trữ giả',...yearRange},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(year.statusCode,201,year.body);
  const archivedClass=await create({...body,code:`ARCH-${crypto.randomUUID()}`,yearId:year.json().data.id});assert.equal(archivedClass.statusCode,201,archivedClass.body);
  const archived=await request('POST',`${base}/academic-years/${year.json().data.id}/archive`,{expectedVersion:year.json().data.version,reason:'Lưu trữ năm học kiểm thử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(archived.statusCode,200,archived.body);const retained=await request('GET',`${base}/classes/${archivedClass.json().data.id}`);assert.equal(retained.statusCode,200);assert.equal(retained.json().data.status,'ARCHIVED');
  const blocked=await request('PATCH',`${base}/classes/${archivedClass.json().data.id}`,{expectedVersion:retained.json().data.version,name:'Không sửa lịch sử'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(blocked.statusCode,409);assert.equal(blocked.json().code,'CLASS_ARCHIVED');
});

test('B6 organization projections scope counts in SQL and a year-only grant cannot copy or publish rules',async()=>{
  const csrf=await login('admin-a@example.invalid'),base=`/api/v1/schools/${schoolA}`,yearId=seedId('year:A');
  const year=await request('GET',`${base}/academic-years/${yearId}`);assert.equal(year.statusCode,200,year.body);assert.ok(year.json().data.terms.length);assert.equal(typeof year.json().data.classCount,'number');assert.equal(typeof year.json().data.studentCount,'number');
  const expected=await db.transaction(tx=>tx.query("SELECT count(DISTINCT student_id)::int AS count FROM app.enrollments WHERE school_id=$1 AND year_id=$2 AND status<>'CANCELLED'",[schoolA,yearId]),{schoolId:schoolA});assert.equal(year.json().data.studentCount,expected.rows[0].count);
  const classes=await request('GET',`${base}/classes?yearId=${yearId}&limit=2&sort=studentCount&dir=desc`);assert.equal(classes.statusCode,200,classes.body);assert.equal(classes.json().data.length,2);for(const row of classes.json().data){assert.equal(typeof row.studentCount,'number');assert.equal(row.yearName,year.json().data.name);assert.equal(typeof row.gradeName,'string');assert.equal(typeof row.hasTimetable,'boolean');}
  const missing=await request('GET',`${base}/classes?yearId=${yearId}&homeroom=none&limit=2`);assert.equal(missing.statusCode,200,missing.body);for(const row of missing.json().data)assert.equal(row.homeroomMemberId,undefined);
  const post=(suffix,body)=>request('POST',`${base}/${suffix}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const role=await post('roles',{code:`year-only-${crypto.randomUUID()}`,label:'Chỉ quản lý năm học giả',permissions:['year.manage','year.read'].map(action=>({action,scopes:['SCHOOL']}))});assert.equal(role.statusCode,201,role.body);
  const grant=await post('grants',{memberId:seedId('member:A:teacher-b'),roleId:role.json().data.id,scopeType:'SCHOOL',validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(grant.statusCode,201,grant.body);
  const adminCookie=jar.get('edu_staff');
  try{
  jar.delete('edu_staff');const teacherCsrf=await login('teacher-b@example.invalid'),range=await unusedYearRange(schoolA),n=Number(range.startsOn.slice(0,4)),body={code:`RIGHT-${crypto.randomUUID()}`,name:'Năm quyền hạn giả',...range,terms:[{code:'T1',name:'Học kỳ giả',...range}],holidays:[],copyRules:true};
  const denied=await request('POST',`${base}/academic-years`,body,teacherCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(denied.statusCode,403,denied.body);assert.equal((await db.transaction(tx=>tx.query('SELECT id FROM app.academic_years WHERE school_id=$1 AND code=$2',[schoolA,body.code]),{schoolId:schoolA})).rowCount,0);
  const allowed=await request('POST',`${base}/academic-years`,{...body,copyRules:false},teacherCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(allowed.statusCode,201,allowed.body);assert.ok(allowed.json().data.setup.weekCount>0);assert.equal(allowed.json().data.setup.copiedRuleSetId,undefined);assert.equal(allowed.json().data.startsOn,`${n}-09-01`);
  const noCount=await request('GET',`${base}/academic-years/${yearId}`);assert.equal(noCount.statusCode,200,noCount.body);assert.equal(noCount.json().data.studentCount,null);assert.equal(noCount.json().data.classCount,null);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const subject=await request('GET',`${base}/classes/${classB}`);assert.equal(subject.statusCode,200,subject.body);assert.equal(subject.json().data.studentCount,null);assert.equal(subject.json().data.yearName,year.json().data.name);assert.equal(Object.hasOwn(subject.json().data,'guardians'),false);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/academic-years/${seedId('year:B')}`)).statusCode,404);
  }finally{jar.set('edu_staff',adminCookie);const revoked=await post(`grants/${grant.json().data.id}/revoke`,{expectedVersion:grant.json().data.version,reason:'Kết thúc kiểm thử quyền năm học'});assert.equal(revoked.statusCode,200,revoked.body);}
});

test('B6 purpose-bound form pickers use current write authority, exclude contacts/roles/counts and deny normal directory access',async()=>{
  const csrf=await login('admin-a@example.invalid'),base=`/api/v1/schools/${schoolA}`,prefix=crypto.randomUUID(),post=(suffix,body)=>request('POST',`${base}/${suffix}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const role=await post('roles',{code:`picker-${prefix}`,label:'Chỉ tạo lớp và phân công giả',permissions:['class.manage','assignment.manage'].map(action=>({action,scopes:['SCHOOL']}))});assert.equal(role.statusCode,201,role.body);
  const email=`picker-${prefix}@example.invalid`,invite=await post('invitations',{email,roleId:role.json().data.id,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(invite.statusCode,201,invite.body);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invite.json().data.id}`])).rows[0].encrypted_payload,token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token'),anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:`Nhân sự bộ chọn giả ${prefix}`,newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const member=await db.transaction(tx=>tx.query('SELECT m.id,m.version FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA});
  const updated=await request('PATCH',`${base}/members/${member.rows[0].id}`,{expectedVersion:member.rows[0].version,workEmail:`work-${prefix}@example.invalid`,workPhone:'0904443333',department:'Tổ thử bộ chọn'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(updated.statusCode,200,updated.body);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login(email);
  const context=await request('GET','/api/v1/me/context');assert.equal(context.statusCode,200,context.body);const grant=context.json().data.memberships.find(m=>m.schoolId===schoolA).grants[0];
  try{
    for(const suffix of ['members','dictionaries/grades','academic-years','classes'])assert.equal((await request('GET',`${base}/${suffix}`)).statusCode,403,suffix);
    const members=await request('GET',`${base}/members?purpose=assignment-picker&q=${prefix}`);assert.equal(members.statusCode,200,members.body);assert.equal(members.json().page.total,1);const person=members.json().data[0];assert.equal(person.id,member.rows[0].id);assert.equal(person.department,'Tổ thử bộ chọn');assert.deepEqual(person.homeroomOf,[]);
    for(const forbidden of ['workEmail','workPhone','loginEmail','grants','email','phone'])assert.equal(Object.hasOwn(person,forbidden),false,forbidden);
    const years=await request('GET',`${base}/academic-years?purpose=class-picker&limit=2`);assert.equal(years.statusCode,200,years.body);for(const year of years.json().data){assert.notEqual(year.status,'ARCHIVED');for(const field of ['studentCount','classCount','terms'])assert.equal(Object.hasOwn(year,field),false);}
    const classes=await request('GET',`${base}/classes?purpose=assignment-picker&limit=2`);assert.equal(classes.statusCode,200,classes.body);for(const cls of classes.json().data){assert.notEqual(cls.status,'ARCHIVED');for(const field of ['studentCount','homeroomName','homeroomUserId'])assert.equal(Object.hasOwn(cls,field),false);}
    for(const dictionary of ['grades','rooms']){const result=await request('GET',`${base}/dictionaries/${dictionary}?purpose=class-picker&limit=2`);assert.equal(result.statusCode,200,result.body);for(const item of result.json().data){assert.equal(item.status,'ACTIVE');assert.equal(Object.hasOwn(item,'inUse'),false);}}
    const subjects=await request('GET',`${base}/dictionaries/subjects?purpose=assignment-picker&limit=2`);assert.equal(subjects.statusCode,200,subjects.body);for(const subject of subjects.json().data)assert.ok(!['CHAOCO','SHL'].includes(subject.code.toUpperCase()));
    assert.equal((await request('GET',`${base}/dictionaries/subjects?purpose=class-picker`)).statusCode,422);assert.equal((await request('GET',`${base}/members?purpose=wrong-purpose`)).statusCode,422);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/members?purpose=assignment-picker`)).statusCode,404);
    jar.set('edu_staff',adminCookie);const revoked=await post(`grants/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Thu hồi quyền bộ chọn kiểm thử'});assert.equal(revoked.statusCode,200,revoked.body);jar.delete('edu_staff');await login(email);assert.equal((await request('GET',`${base}/members?purpose=assignment-picker`)).statusCode,403);
  }finally{jar.set('edu_staff',adminCookie);}
});

test('B6 rollover preview uses exact end-year enrollment, minimal workflow authority and immediate revocation',async()=>{
  const csrf=await login('admin-a@example.invalid'),base=`/api/v1/schools/${schoolA}`,prefix=crypto.randomUUID(),post=(suffix,body)=>request('POST',`${base}/${suffix}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const createYear=async()=>{const r=await post('academic-years',{code:`ROLL-${crypto.randomUUID()}`,name:'Năm chuyển tiếp giả',...await unusedYearRange(schoolA)});assert.equal(r.statusCode,201,r.body);return r.json().data;};
  const source=await createYear(),target=await createYear(),archivedYear=await createYear();
  const createClass=async(yearId)=>{const r=await post('classes',{yearId,gradeLevelId:seedId('grade:A'),code:`ROLL-${crypto.randomUUID()}`,name:'Lớp chuyển năm giả',capacity:10});assert.equal(r.statusCode,201,r.body);return r.json().data;};
  const from=await createClass(source.id),other=await createClass(source.id),to=await createClass(target.id),archived=await createClass(target.id);
  const archivedClass=await post(`classes/${archived.id}/archive`,{expectedVersion:archived.version,reason:'Lưu trữ lớp đích kiểm thử'});assert.equal(archivedClass.statusCode,200,archivedClass.body);
  assert.equal((await post(`academic-years/${archivedYear.id}/archive`,{expectedVersion:archivedYear.version,reason:'Lưu trữ năm đích kiểm thử'})).statusCode,200);
  const createStudent=async(cls,startsOn)=>{const r=await post('students',{studentCode:`ROLL-${crypto.randomUUID()}`,fullName:`Học sinh cuối năm giả ${crypto.randomUUID()}`,dateOfBirth:'2010-01-01',preferredName:'Nhãn hồ sơ riêng',initialClassId:cls.id,startsOn});assert.equal(r.statusCode,201,r.body);return r.json().data;};
  const staying=await createStudent(from,source.startsOn),moved=await createStudent(from,source.startsOn),existing=await createStudent(to,target.startsOn);
  const enrollment=(await request('GET',`${base}/students/${moved.id}/enrollments`)).json().data[0],effectiveOn=source.startsOn.slice(0,4)+'-10-01';
  const transfer=await post('transfers',{studentId:moved.id,fromEnrollmentId:enrollment.id,toClassId:other.id,effectiveOn,reason:'Chuyển lớp trước cuối năm giả'});assert.equal(transfer.statusCode,201,transfer.body);
  const applied=await post(`transfers/${transfer.json().data.id}/approve`,{expectedVersion:transfer.json().data.version});assert.equal(applied.statusCode,200,applied.body);
  const role=await post('roles',{code:`roll-role-${prefix}`,label:'Chỉ chuyển năm giả',permissions:[{action:'year.manage',scopes:['SCHOOL']}]});assert.equal(role.statusCode,201,role.body);
  const email=`rollover-${prefix}@example.invalid`,invitation=await post('invitations',{email,roleId:role.json().data.id,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(invitation.statusCode,201,invitation.body);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0].encrypted_payload,token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token'),anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Người chuẩn bị năm học giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const adminCookie=jar.get('edu_staff');jar.delete('edu_staff');await login(email);const readerCookie=jar.get('edu_staff');
  try{
    for(const suffix of ['students','classes','members','academic-years'])assert.equal((await request('GET',`${base}/${suffix}`)).statusCode,403,suffix);
    const read=await request('GET',`${base}/academic-years/${source.id}/rollover-preview`);assert.equal(read.statusCode,200,read.body);const data=read.json().data;
    assert.equal(data.source.id,source.id);assert.equal(data.referenceDate,source.endsOn.slice(0,4)+'-05-31');assert.equal(Object.hasOwn(data.source,'studentCount'),false);
    assert.deepEqual(data.sourceClasses.find(c=>c.id===from.id).students.map(s=>s.id),[staying.id]);assert.deepEqual(data.sourceClasses.find(c=>c.id===other.id).students.map(s=>s.id),[moved.id]);
    for(const cls of data.sourceClasses)for(const s of cls.students)assert.deepEqual(Object.keys(s).sort(),['fullName','id','status','studentCode']);
    assert.equal(data.targets.some(t=>t.year.id===archivedYear.id),false);const receiving=data.targets.find(t=>t.year.id===target.id);assert.ok(receiving);assert.equal(receiving.classes.some(c=>c.id===archived.id),false);assert.equal(receiving.classes.find(c=>c.id===to.id).studentCount,1);assert.equal(data.sourceClasses.some(c=>c.students.some(s=>s.id===existing.id)),false);
    assert.equal((await request('GET',`/api/v1/schools/${schoolB}/academic-years/${seedId('year:B')}/rollover-preview`)).statusCode,404);
    const own=(await request('GET','/api/v1/me/context')).json().data.memberships.find(m=>m.schoolId===schoolA).grants[0];jar.set('edu_staff',adminCookie);
    const revoked=await post(`grants/${own.id}/revoke`,{expectedVersion:own.version,reason:'Kết thúc quyền chuyển năm giả'});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',readerCookie);
    assert.equal((await request('GET',`${base}/academic-years/${source.id}/rollover-preview`)).statusCode,403);
    jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET',`${base}/academic-years/${source.id}/rollover-preview`)).statusCode,403);
  }finally{jar.set('edu_staff',adminCookie);}
});

test('B6 platform school wizard creates its optional admin invitation atomically and redacts form metadata',async()=>{
  jar.delete('edu_staff');const csrf=await login('operator@example.invalid'),base='/api/v1/platform',code=`PU${crypto.randomBytes(5).toString('hex').toUpperCase()}`,slug=`pui-${crypto.randomUUID()}`,email=`pui-${crypto.randomUUID()}@example.invalid`,key=crypto.randomUUID();
  const body={code,slug,name:'Trường wizard giả',province:'Tỉnh wizard giả',firstAdmin:{email,roleId:null,workDisplayName:'Quản trị wizard giả',expiresInDays:7}},post=(url,data,id=crypto.randomUUID())=>request('POST',url,data,csrf,{'idempotency-key':id});
  const created=await post(`${base}/schools`,body,key);assert.equal(created.statusCode,201,created.body);const school=created.json().data;assert.equal(school.status,'DRAFT');assert.equal(school.onboarding.adminAssigned,false);
  assert.equal((await post(`${base}/schools`,body,key)).json().data.id,school.id);
  const choices=await request('GET',`${base}/school-options`);assert.equal(choices.statusCode,200,choices.body);assert.ok(choices.json().data.provinces.includes(body.province));assert.deepEqual(Object.keys(choices.json().data),['provinces']);
  const identity=await request('GET',`${base}/school-identity?code=${code}&slug=${slug}`);assert.equal(identity.statusCode,200,identity.body);assert.deepEqual(identity.json().data,{codeTaken:true,slugTaken:true});
  const list=await request('GET',`${base}/schools/${school.id}/admin-invitations`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().page.total,1);const invitation=list.json().data[0];assert.equal(invitation.email,email);assert.equal(invitation.workDisplayName,body.firstAdmin.workDisplayName);assert.ok(Math.abs(Date.parse(invitation.expiresAt)-Date.now()-7*86400000)<30000);
  assert.deepEqual(Object.keys(invitation).sort(),['createdAt','email','expiresAt','id','status','updatedAt','version','workDisplayName']);
  assert.equal((await db.app.query('SELECT count(*)::int AS n FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.id}`])).rows[0].n,1);
  const proposal=(await db.transaction(tx=>tx.query('SELECT proposed_assignments FROM app.staff_invitations WHERE school_id=$1 AND id=$2',[school.id,invitation.id]),{schoolId:school.id})).rows[0].proposed_assignments[0];assert.ok(Math.abs(Date.parse(proposal.validFrom)-Date.now())<30000);assert.equal(proposal.scopeType,'SCHOOL');
  assert.equal((await post(`${base}/schools/${schoolB}/admin-invitations/${invitation.id}/revoke`,{expectedVersion:invitation.version,reason:'Sai trường giả'})).statusCode,404);
  const revoked=await post(`${base}/schools/${school.id}/admin-invitations/${invitation.id}/revoke`,{expectedVersion:invitation.version,reason:'Thu hồi lời mời wizard giả'});assert.equal(revoked.statusCode,200,revoked.body);assert.equal(revoked.json().data.status,'REVOKED');
  assert.equal((await post(`${base}/schools/${school.id}/admin-invitations/${invitation.id}/revoke`,{expectedVersion:invitation.version,reason:'Phiên bản cũ giả'})).statusCode,409);
  const badCode=`PU${crypto.randomBytes(5).toString('hex').toUpperCase()}`,failed=await post(`${base}/schools`,{...body,code:badCode,slug:`pui-${crypto.randomUUID()}`,firstAdmin:{...body.firstAdmin,validUntil:new Date(Date.now()-3600000).toISOString()}});assert.equal(failed.statusCode,422,failed.body);
  assert.equal((await db.app.query('SELECT count(*)::int AS n FROM platform.schools WHERE code=$1',[badCode])).rows[0].n,0);
  for(const sort of ['classCount','staffCount']){const sorted=await request('GET',`${base}/schools?sort=${sort}&dir=desc&limit=2`);assert.equal(sorted.statusCode,200,sorted.body);assert.ok(sorted.json().data[0][sort]>=sorted.json().data[1][sort]);}
  const operatorCookie=jar.get('edu_staff');jar.delete('edu_staff');const staffCsrf=await login('admin-a@example.invalid'),ordinaryRole=(await db.transaction(tx=>tx.query("SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_LEADERSHIP'",[schoolA]),{schoolId:schoolA})).rows[0].id;
  const ordinaryEmail=`pui-staff-${crypto.randomUUID()}@example.invalid`,ordinary=await request('POST',`/api/v1/schools/${schoolA}/invitations`,{email:ordinaryEmail,roleId:ordinaryRole,validFrom:new Date().toISOString()},staffCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(ordinary.statusCode,201,ordinary.body);jar.set('edu_staff',operatorCookie);
  const ordinaryList=await request('GET',`${base}/schools/${schoolA}/admin-invitations?q=${encodeURIComponent(ordinaryEmail)}`);assert.equal(ordinaryList.statusCode,200,ordinaryList.body);assert.equal(ordinaryList.json().page.total,0);
  assert.equal((await post(`${base}/schools/${schoolA}/admin-invitations/${ordinary.json().data.id}/revoke`,{expectedVersion:ordinary.json().data.version,reason:'Không được thu hồi lời mời nhân sự'})).statusCode,404);
  const adminGrant=seedId('operator:platform.admins.manage');try{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[adminGrant]);assert.equal((await post(`${base}/schools`,body,key)).statusCode,403);assert.equal((await request('GET',`${base}/schools/${school.id}/admin-invitations`)).statusCode,403);}finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=NULL WHERE id=$1',[adminGrant]);}
});

test('B6 platform school form readers never lend admin or read authority to a create-only operator',async()=>{
  const uid=crypto.randomUUID(),email=`pui-writer-${crypto.randomUUID()}@example.invalid`,grantId=crypto.randomUUID();
  await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Người tạo trường giả',$3,'ACTIVE',now())",[uid,email,await hashPassword(password)]);
  await db.app.query("INSERT INTO platform.operator_grants(id,user_id,action_code,valid_from) VALUES($1,$2,'platform.schools.manage',now()-interval '1 second')",[grantId,uid]);jar.delete('edu_staff');const csrf=await login(email),base='/api/v1/platform',code=`PU${crypto.randomBytes(5).toString('hex').toUpperCase()}`,body={code,slug:`pui-${crypto.randomUUID()}`,name:'Trường chỉ quyền tạo giả'},post=data=>request('POST',`${base}/schools`,data,csrf,{'idempotency-key':crypto.randomUUID()});
  const identity=await request('GET',`${base}/school-identity?code=${code}`);assert.equal(identity.statusCode,200,identity.body);assert.deepEqual(identity.json().data,{codeTaken:false,slugTaken:false});assert.equal((await request('GET',`${base}/school-options`)).statusCode,403);
  const failed=await post({...body,firstAdmin:{email:`pui-admin-${crypto.randomUUID()}@example.invalid`,roleId:null,validFrom:new Date().toISOString()}});assert.equal(failed.statusCode,403,failed.body);assert.equal((await db.app.query('SELECT count(*)::int AS n FROM platform.schools WHERE code=$1',[code])).rows[0].n,0);
  const created=await post(body);assert.equal(created.statusCode,201,created.body);assert.equal((await request('GET',`${base}/schools/${created.json().data.id}/admin-invitations`)).statusCode,403);
  await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[grantId]);assert.equal((await request('GET',`${base}/school-identity?code=${code}`)).statusCode,403);
  jar.delete('edu_staff');await login('admin-a@example.invalid');for(const path of [`${base}/school-options`,`${base}/school-identity?code=${code}`,`${base}/schools/${schoolA}/admin-invitations`])assert.equal((await request('GET',path)).statusCode,403);
});

test('B6 school overview keeps current scoped totals, actual setup and publication metadata without lending school-wide reads',async()=>{
  const csrf=await login('admin-a@example.invalid'),base=`/api/v1/schools/${schoolA}`,yearId=seedId('year:A'),post=(suffix,body)=>request('POST',`${base}/${suffix}`,body,csrf,{'idempotency-key':crypto.randomUUID()});
  const read=await request('GET',`${base}/overview?yearId=${yearId}`);assert.equal(read.statusCode,200,read.body);const data=read.json().data.schoolOverview;assert.ok(data);assert.equal(data.year.id,yearId);assert.equal(data.setup.length,8);
  const expected=await db.transaction(async tx=>{
    const classes=(await tx.query("SELECT count(*) FILTER(WHERE status='ACTIVE')::int AS active,count(*) FILTER(WHERE status='DRAFT')::int AS draft FROM app.classes WHERE school_id=$1 AND year_id=$2",[schoolA,yearId])).rows[0];
    const students=(await tx.query("SELECT count(DISTINCT e.student_id)::int AS n FROM app.enrollments e JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id WHERE e.school_id=$1 AND e.year_id=$2 AND c.status IN ('ACTIVE','ARCHIVED') AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3)",[schoolA,yearId,read.json().data.referenceDate])).rows[0].n;
    const staff=(await tx.query("SELECT count(*)::int AS n FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL",[schoolA])).rows[0].n;
    const links=(await tx.query("SELECT count(*)::int AS active,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM app.parent_access_events e WHERE e.school_id=l.school_id AND e.access_link_id=l.id AND e.event_kind IN ('EXCHANGED','READ')))::int AS opened FROM app.parent_access_links l JOIN app.guardian_relationships g ON g.school_id=l.school_id AND g.id=l.relationship_id AND g.student_id=l.student_id WHERE l.school_id=$1 AND l.year_id=$2 AND l.revoked_at IS NULL AND l.expires_at>now() AND g.status='VERIFIED' AND g.can_receive_info AND g.revoked_at IS NULL",[schoolA,yearId])).rows[0];
    return {classes,students,staff,links};
  },{schoolId:schoolA,readOnly:true});
  assert.equal(data.kpi.activeClasses,expected.classes.active);assert.equal(data.kpi.draftClasses,expected.classes.draft);assert.equal(data.kpi.students,expected.students);assert.equal(data.kpi.staffActive,expected.staff);assert.equal(data.kpi.linksActive,expected.links.active);assert.equal(data.kpi.linksOpened,expected.links.opened);
  assert.ok(data.classesNeedingAction.length<=6);assert.ok(data.classesNeedingActionTotal>=data.classesNeedingAction.length);assert.equal(Number.isInteger(data.classesNeedingActionTotal),true);
  for(const step of data.setup){assert.equal(typeof step.done,'boolean');assert.ok(step.href.startsWith(`/school/${schoolA}/`));}for(const c of data.classesNeedingAction){assert.equal(c.yearId,yearId);assert.ok(c.tasks.length||c.status==='DRAFT');assert.ok(['blocked','attention'].includes(c.severity));assert.equal(typeof c.studentCount,'number');}
  assert.ok(data.announcements.length<=4);for(const a of data.announcements){assert.deepEqual(Object.keys(a).sort(),['createdAt','id','publishedAt','scheduledAt','status','summary','title']);assert.ok(['PUBLISHED','SCHEDULED'].includes(a.status));if(a.status==='PUBLISHED')assert.ok(a.publishedAt);}
  const role=await post('roles',{code:`overview-read-${crypto.randomUUID()}`,label:'Chỉ xem trang trường và một lớp giả',permissions:[{action:'school.read',scopes:['SCHOOL']},{action:'student.read',scopes:['CLASS']}]});assert.equal(role.statusCode,201,role.body);
  const email=`overview-read-${crypto.randomUUID()}@example.invalid`,invitation=await post('invitations',{email,roleId:role.json().data.id,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(invitation.statusCode,201,invitation.body);
  const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.json().data.id}`])).rows[0].encrypted_payload,token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token'),anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Người đọc tổng quan có giới hạn giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
  const member=await db.transaction(tx=>tx.query('SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA});
  const scoped=await post('grants',{memberId:member.rows[0].id,roleId:role.json().data.id,scopeType:'CLASS',classId:classA,validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(scoped.statusCode,201,scoped.body);const adminCookie=jar.get('edu_staff');
  try{
    jar.delete('edu_staff');await login(email);const restricted=await request('GET',`${base}/overview?yearId=${yearId}`);assert.equal(restricted.statusCode,200,restricted.body);const value=restricted.json().data.schoolOverview;
    for(const [key,count] of Object.entries(value.kpi))assert.equal(count,null,key);assert.equal(value.classesNeedingAction,null);assert.equal(value.classesNeedingActionTotal,null);assert.equal(value.todayItems,null);assert.equal(value.announcements,null);for(const step of value.setup)assert.equal(step.done,null,step.key);
    assert.equal((await request('GET',`/api/v1/schools/${schoolB}/overview?yearId=${seedId('year:B')}`)).statusCode,404);
    const grant=(await request('GET','/api/v1/me/context')).json().data.memberships.find(m=>m.schoolId===schoolA).grants.find(g=>g.scopeType==='SCHOOL');
    const readerCookie=jar.get('edu_staff');jar.set('edu_staff',adminCookie);const revoked=await post(`grants/${grant.id}/revoke`,{expectedVersion:grant.version,reason:'Kết thúc quyền xem trang trường giả'});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',readerCookie);assert.equal((await request('GET',`${base}/overview?yearId=${yearId}`)).statusCode,403);
  }finally{jar.set('edu_staff',adminCookie);}
});

test('B6 support choices/counts are scoped SQL metadata, ticket message/status save atomically and an operator only relinquishes its own grant',async()=>{
  jar.delete('edu_staff');const staffCsrf=await login('admin-a@example.invalid'),school=`/api/v1/schools/${schoolA}`,created=await request('POST',`${school}/support`,{subject:`SUPPORT-UI-${testTextNonce()}`,description:'Hỗ trợ metadata giả không có hồ sơ học sinh',priority:'HIGH'},staffCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(created.statusCode,201,created.body);let ticket=created.json().data;const adminCookie=jar.get('edu_staff');
  jar.delete('edu_staff');const csrf=await login('operator@example.invalid'),operatorCookie=jar.get('edu_staff'),base='/api/v1/platform',post=(url,body,key=crypto.randomUUID())=>request('POST',url,body,csrf,{'idempotency-key':key}),patch=(body,key=crypto.randomUUID())=>request('PATCH',`${base}/support/${ticket.id}`,body,csrf,{'idempotency-key':key});
  const options=await request('GET',`${base}/support-options?schoolId=${schoolA}`);assert.equal(options.statusCode,200,options.body);const metadata=options.json().data;
  for(const value of metadata.operators)assert.deepEqual(Object.keys(value).sort(),['id','name']);for(const value of metadata.schools){assert.equal(value.id,schoolA);assert.deepEqual(Object.keys(value).sort(),['id','name','status']);}for(const value of metadata.tickets){assert.equal(value.schoolId,schoolA);assert.deepEqual(Object.keys(value).sort(),['id','schoolId','title']);}
  const totals=(await db.app.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE priority='HIGH' AND status NOT IN ('RESOLVED','CLOSED'))::int AS high FROM platform.support_tickets WHERE school_id=$1",[schoolA])).rows[0];assert.equal(metadata.queue.total,totals.total);assert.equal(metadata.queue.high,totals.high);
  const active=await request('GET',`${base}/support-access?schoolId=${schoolA}&viewStatus=active&effective=true`);assert.equal(active.statusCode,200,active.body);assert.equal(active.json().page.total,metadata.grants.active);for(const grant of active.json().data){assert.equal(grant.viewStatus,'active');assert.equal(grant.effective,true);}
  const saveKey=crypto.randomUUID(),saveBody={expectedVersion:ticket.version,status:'WAITING_SCHOOL',message:'Một cập nhật nguyên tử giả'};const saved=await patch(saveBody,saveKey);assert.equal(saved.statusCode,200,saved.body);ticket=saved.json().data;assert.equal(ticket.messageCount,1);assert.equal(ticket.schoolStatus,'ACTIVE');assert.equal(ticket.requesterId,seedId('user:admin-a'));assert.equal(ticket.status,'WAITING_SCHOOL');
  assert.equal((await patch(saveBody,saveKey)).json().data.version,ticket.version);assert.equal((await db.app.query('SELECT count(*)::int AS n FROM platform.support_messages WHERE ticket_id=$1',[ticket.id])).rows[0].n,1);
  const invalid=await patch({expectedVersion:ticket.version,status:'RESOLVED',message:'Không ghi số cá nhân 0912345678'});assert.equal(invalid.statusCode,422,invalid.body);assert.equal((await request('GET',`${base}/support/${ticket.id}`)).json().data.version,ticket.version);
  const requestBody={ticketId:ticket.id,allowedActions:['school.read','year.read'],reason:'Kiểm tra metadata nguyên tử giả',durationDays:7},requestKey=crypto.randomUUID(),requested=await post(`${base}/schools/${schoolA}/support-access`,requestBody,requestKey);assert.equal(requested.statusCode,201,requested.body);let grant=requested.json().data;assert.equal(grant.operatorId,seedId('user:operator'));assert.equal(grant.viewStatus,'requested');assert.equal(grant.effective,false);assert.ok(Math.abs(Date.parse(grant.validFrom)-Date.now())<30000);assert.equal(Date.parse(grant.validUntil)-Date.parse(grant.validFrom),7*86400000);
  assert.equal((await post(`${base}/schools/${schoolA}/support-access`,requestBody,requestKey)).json().data.id,grant.id);assert.equal((await post(`${base}/schools/${schoolB}/support-access`,requestBody)).statusCode,404);assert.equal((await post(`${base}/schools/${schoolA}/support-access`,{...requestBody,operatorId:seedId('user:admin-a')})).statusCode,422);assert.equal((await post(`${base}/schools/${schoolA}/support-access`,{...requestBody,allowedActions:['student.read']})).statusCode,422);
  const otherId=crypto.randomUUID(),otherEmail=`support-ui-${crypto.randomUUID()}@example.invalid`;await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Operator hỗ trợ khác giả',$3,'ACTIVE',now())",[otherId,otherEmail,await hashPassword(password)]);await db.app.query("INSERT INTO platform.operator_grants(user_id,action_code,valid_from) VALUES($1,'platform.support',now()-interval '1 second')",[otherId]);
  jar.delete('edu_staff');const otherCsrf=await login(otherEmail);const foreign=await request('POST',`${base}/support-access/${grant.id}/relinquish`,{expectedVersion:grant.version,reason:'Không sở hữu quyền này'},otherCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(foreign.statusCode,404,foreign.body);
  jar.set('edu_staff',adminCookie);const approved=await request('POST',`${school}/support-access/${grant.id}/approve`,{expectedVersion:grant.version},staffCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(approved.statusCode,200,approved.body);grant=approved.json().data;assert.equal(grant.viewStatus,'active');assert.equal(grant.effective,true);
  jar.set('edu_staff',operatorCookie);const header={'x-support-access':grant.id};assert.equal((await request('GET',`${school}/profile`,undefined,undefined,header)).statusCode,200);
  const reason='Operator trả lại quyền hỗ trợ giả',giveBack={expectedVersion:grant.version,reason},giveBackKey=crypto.randomUUID(),returned=await post(`${base}/support-access/${grant.id}/relinquish`,giveBack,giveBackKey);assert.equal(returned.statusCode,200,returned.body);assert.equal(returned.json().data.viewStatus,'revoked');assert.equal(returned.json().data.effective,false);assert.equal((await post(`${base}/support-access/${grant.id}/relinquish`,giveBack,giveBackKey)).json().data.version,returned.json().data.version);
  assert.equal((await request('GET',`${school}/profile`,undefined,undefined,header)).statusCode,404);const history=await request('GET',`${base}/audit?action=relinquishPlatformSupportAccess`);assert.equal(history.statusCode,200,history.body);assert.ok(history.json().data.some(event=>event.targetId===grant.id&&event.reason===reason));
  const closed=await patch({expectedVersion:ticket.version,status:'RESOLVED',message:'Hoàn tất cùng cập nhật thứ hai'});assert.equal(closed.statusCode,200,closed.body);ticket=closed.json().data;assert.equal(ticket.messageCount,2);assert.equal((await patch({expectedVersion:ticket.version,message:'Không ghi vào yêu cầu hoàn tất'})).statusCode,409);
  const supportGrant=seedId('operator:platform.support');try{await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[supportGrant]);assert.equal((await request('GET',`${base}/support-options`)).statusCode,403);assert.equal((await post(`${base}/support-access/${grant.id}/relinquish`,giveBack,giveBackKey)).statusCode,403);}finally{await db.app.query('UPDATE platform.operator_grants SET revoked_at=NULL WHERE id=$1',[supportGrant]);jar.set('edu_staff',adminCookie);}
});

test('B6 platform audit filters exact actors and whole local date boundaries before pagination and denies school-only staff',async()=>{
  jar.delete('edu_staff');await login('operator@example.invalid');const cookie=jar.get('edu_staff'),action=`AUDIT-UI-${crypto.randomUUID()}`,actor=seedId('user:operator'),ids=[];
  for(const at of ['2031-01-04T17:00:00Z','2031-01-05T16:59:59.999Z','2031-01-05T17:00:00Z']){const id=crypto.randomUUID();ids.push(id);await db.app.query('INSERT INTO platform.audit_events(id,actor_id,school_id,action,target_type,target_id,created_at,redacted_diff,request_id) VALUES($1,$2,$3,$4,\'school\',$3,$5,$6,$7)',[id,actor,schoolA,action,at,{status:'ACTIVE',privateUnknown:'must-not-project'},crypto.randomUUID()]);}
  const options=await request('GET','/api/v1/platform/audit-options');assert.equal(options.statusCode,200,options.body);assert.ok(options.json().data.actors.some(value=>value.id===actor));for(const value of options.json().data.actors)assert.deepEqual(Object.keys(value).sort(),['id','name']);
  const url=`/api/v1/platform/audit?action=${action}&actorId=${actor}&from=2031-01-05&to=2031-01-05&sort=createdAt&dir=asc&limit=1`,first=await request('GET',url);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().page.total,2);assert.equal(first.json().data[0].id,ids[0]);assert.equal(first.json().data[0].actorId,actor);assert.equal(first.body.includes('must-not-project'),false);
  const cursor=encodeURIComponent(first.json().page.nextCursor),next=await request('GET',`${url}&cursor=${cursor}`);assert.equal(next.statusCode,200,next.body);assert.equal(next.json().data[0].id,ids[1]);assert.equal(next.json().page.hasMore,false);
  assert.equal((await request('GET',`${url.replace('from=2031-01-05','from=2031-01-04')}&cursor=${cursor}`)).statusCode,422);assert.equal((await request('GET','/api/v1/platform/audit?from=2031-01-06&to=2031-01-05')).statusCode,422);assert.equal((await request('GET','/api/v1/platform/audit?actorId=wrong-id')).statusCode,422);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET','/api/v1/platform/audit-options')).statusCode,403);assert.equal((await request('GET',url)).statusCode,403);jar.set('edu_staff',cookie);
});

test('B6 school support metadata does not borrow consent authority, counts in SQL and rechecks permission before replay',async()=>{
  const schoolId=await operationalUiSchool();jar.delete('edu_staff');const adminCsrf=await login('admin-a@example.invalid'),adminCookie=jar.get('edu_staff'),base=`/api/v1/schools/${schoolId}`,post=(path,body,csrf=adminCsrf,key=crypto.randomUUID())=>request('POST',`${base}/${path}`,body,csrf,{'idempotency-key':key});
  const role=await post('roles',{code:`support-reader-${crypto.randomUUID()}`,label:'Người trao đổi hỗ trợ giả',permissions:[{action:'support.manage',scopes:['SCHOOL']},{action:'audit.read',scopes:['SCHOOL']}]});assert.equal(role.statusCode,201,role.body);
  const userId=crypto.randomUUID(),email=`school-support-${crypto.randomUUID()}@example.invalid`;await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Người hỗ trợ trường giả',$3,'ACTIVE',now())",[userId,email,await hashPassword(password)]);
  const member=await db.transaction(async tx=>(await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status) VALUES($1,$2,'Người hỗ trợ trường giả','ACTIVE') RETURNING id",[schoolId,userId])).rows[0],{schoolId:schoolId});
  const roleGrant=await post('grants',{memberId:member.id,roleId:role.json().data.id,scopeType:'SCHOOL',validFrom:new Date(Date.now()-1000).toISOString()});assert.equal(roleGrant.statusCode,201,roleGrant.body);
  jar.delete('edu_staff');const csrf=await login(email),readerCookie=jar.get('edu_staff'),key=crypto.randomUUID(),body={subject:'Yêu cầu hỗ trợ giả phía trường',description:'Mô tả cấu hình và thao tác giả phía trường',priority:'LOW'},created=await post('support',body,csrf,key);assert.equal(created.statusCode,201,created.body);let ticket=created.json().data;assert.equal(ticket.requesterId,userId);
  const summary=await request('GET',`${base}/support-summary`);assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.canApprove,false);assert.equal(summary.json().data.grants,null);const total=(await db.app.query('SELECT count(*)::int AS n FROM platform.support_tickets WHERE school_id=$1',[schoolId])).rows[0].n;assert.equal(summary.json().data.queue.total,total);
  assert.equal((await request('GET',`${base}/support-access`)).statusCode,403);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/support-summary`)).statusCode,404);
  const choices=await request('GET',`${base}/audit-options`);assert.equal(choices.statusCode,200,choices.body);assert.ok(choices.json().data.actors.some(actor=>actor.id===userId));for(const actor of choices.json().data.actors)assert.deepEqual(Object.keys(actor).sort(),['id','name']);
  jar.delete('edu_staff');const operatorCsrf=await login('operator@example.invalid'),operatorCookie=jar.get('edu_staff');const updated=await request('PATCH',`/api/v1/platform/support/${ticket.id}`,{expectedVersion:ticket.version,status:'WAITING_SCHOOL'},operatorCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(updated.statusCode,200,updated.body);ticket=updated.json().data;
  const requested=await request('POST',`/api/v1/platform/schools/${schoolId}/support-access`,{ticketId:ticket.id,allowedActions:['school.read'],reason:'Chỉ xem cấu hình giả',durationDays:1},operatorCsrf,{'idempotency-key':crypto.randomUUID()});assert.equal(requested.statusCode,201,requested.body);const grant=requested.json().data;
  jar.set('edu_staff',readerCookie);const denied=await post(`support-access/${grant.id}/approve`,{expectedVersion:grant.version},csrf);assert.equal(denied.statusCode,403,denied.body);
  const messageKey=crypto.randomUUID(),messageBody={body:'Nhà trường cung cấp cập nhật giả'},message=await post(`support/${ticket.id}/messages`,messageBody,csrf,messageKey);assert.equal(message.statusCode,201,message.body);assert.equal(message.json().data.authorId,userId);assert.equal(message.json().data.side,'SCHOOL');assert.equal((await post(`support/${ticket.id}/messages`,messageBody,csrf,messageKey)).json().data.id,message.json().data.id);const current=await request('GET',`${base}/support/${ticket.id}`);assert.equal(current.json().data.status,'IN_PROGRESS');assert.equal(current.json().data.messageCount,1);
  await db.app.query("UPDATE platform.schools SET status='SUSPENDED' WHERE id=$1",[schoolId]);try{assert.equal((await request('GET',`${base}/support-summary`)).statusCode,200);assert.equal((await request('GET',`${base}/audit-options`)).statusCode,403);}finally{await db.app.query("UPDATE platform.schools SET status='ACTIVE' WHERE id=$1",[schoolId]);}
  jar.set('edu_staff',adminCookie);assert.equal((await request('GET',`${base}/support-summary`)).json().data.canApprove,true);const rejectBody={expectedVersion:grant.version,decision:'REJECT',reason:'Không cần xem cấu hình này'},rejectKey=crypto.randomUUID(),rejected=await post(`support-access/${grant.id}/revoke`,rejectBody,adminCsrf,rejectKey);assert.equal(rejected.statusCode,200,rejected.body);assert.equal(rejected.json().data.viewStatus,'declined');assert.equal((await post(`support-access/${grant.id}/revoke`,rejectBody,adminCsrf,rejectKey)).json().data.version,rejected.json().data.version);
  const audit=await request('GET',`${base}/audit?targetType=support-access&targetId=${grant.id}`);assert.equal(audit.statusCode,200,audit.body);assert.ok(audit.json().data.some(event=>event.reason===rejectBody.reason));
  const revoked=await post(`grants/${roleGrant.json().data.id}/revoke`,{expectedVersion:roleGrant.json().data.version,reason:'Thu hồi quyền trao đổi giả'});assert.equal(revoked.statusCode,200,revoked.body);jar.set('edu_staff',readerCookie);assert.equal((await post('support',body,csrf,key)).statusCode,403);assert.equal((await request('GET',`${base}/support-summary`)).statusCode,403);assert.equal((await request('GET',`${base}/audit-options`)).statusCode,403);jar.set('edu_staff',operatorCookie);
});

test('B6 school audit uses the school timezone and exact SQL filters with tenant-safe history options',async()=>{
  const schoolId=await operationalUiSchool('Asia/Tokyo');jar.delete('edu_staff');await login('admin-a@example.invalid');const base=`/api/v1/schools/${schoolId}`,actor=seedId('user:admin-a'),type=`audit-ui-${crypto.randomUUID()}`,ids=[];
  for(const [targetSchoolId,at]of [[schoolId,'2041-01-04T15:00:00Z'],[schoolId,'2041-01-05T14:59:59.999Z'],[schoolId,'2041-01-05T15:00:00Z'],[schoolB,'2041-01-04T15:00:00Z']]){
    const id=crypto.randomUUID();ids.push(id);await db.transaction(tx=>tx.query('INSERT INTO app.audit_events(id,school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_before,redacted_after,created_at) VALUES($1,$2,$3,\'STAFF\',\'AUDIT-UI\',$4,$1,$5,$6,$7,$8)',[id,targetSchoolId,actor,type,crypto.randomUUID(),{}, {status:'ACTIVE',privateUnknown:'hidden-school-history'},at]),{schoolId:targetSchoolId});
  }
  {
    const url=`${base}/audit?targetType=${type}&actorId=${actor}&from=2041-01-05&to=2041-01-05&sort=createdAt&dir=asc&limit=1`,first=await request('GET',url);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().page.total,2);assert.equal(first.json().data[0].id,ids[0]);assert.equal(first.json().data[0].actorId,actor);assert.equal(first.body.includes('hidden-school-history'),false);const cursor=encodeURIComponent(first.json().page.nextCursor),second=await request('GET',`${url}&cursor=${cursor}`);assert.equal(second.statusCode,200,second.body);assert.equal(second.json().data[0].id,ids[1]);assert.equal(second.json().page.hasMore,false);
    assert.equal((await request('GET',`${url.replace('from=2041-01-05','from=2041-01-04')}&cursor=${cursor}`)).statusCode,422);assert.equal((await request('GET',`${base}/audit?from=2041-01-06&to=2041-01-05`)).statusCode,422);assert.equal((await request('GET',`${base}/audit?actorId=wrong-id`)).statusCode,422);const options=await request('GET',`${base}/audit-options`);assert.equal(options.statusCode,200,options.body);assert.ok(options.json().data.entityTypes.includes(type));
    jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET',`${base}/audit-options`)).statusCode,403);assert.equal((await request('GET',`${base}/audit`)).statusCode,403);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/audit-options`)).statusCode,404);
  }
});

test('B6 operational probes use worker-only cycle evidence, actual backup records and purpose-bound aggregate authority',async()=>{
  const userId=crypto.randomUUID(),email=`operations-only-${crypto.randomUUID()}@example.invalid`,grantId=crypto.randomUUID();await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at) VALUES($1,$2,'Người vận hành giả',$3,'ACTIVE',now())",[userId,email,await hashPassword(password)]);await db.app.query("INSERT INTO platform.operator_grants(id,user_id,action_code) VALUES($1,$2,'platform.operations')",[grantId,userId]);
  jar.delete('edu_staff');await login(email);const worker=new WorkerRunner();try{
    const id=crypto.randomUUID(),row=(await db.app.query("INSERT INTO platform.operation_runs(id,kind,status,started_at,finished_at,summary,artifact_location_redacted) VALUES($1,'BACKUP','FAILED',now(),now(),$2,'private://hidden-artifact-location') RETURNING created_at",[id,{rows:3,errorCode:'BACKUP_FAILED',privatePassword:'hidden-operation-secret',checksum:'private://hidden-checksum'}])).rows[0];
    const deniedWrite=await assert.rejects(db.app.query("INSERT INTO platform.runtime_heartbeats(worker_id,started_at,last_healthy_at,processed_jobs) VALUES($1,now(),now(),0)",[crypto.randomUUID()]),error=>error.code==='42501');assert.equal(deniedWrite,undefined);await assert.rejects(db.parent.query('SELECT * FROM platform.runtime_heartbeats'),error=>error.code==='42501');
    await assert.rejects(db.transaction(tx=>tx.query('SELECT * FROM platform.operations_school_totals()'),{schoolId:schoolA,userId:seedId('user:teacher-a')}),error=>error.code==='42501');
    await db.transaction(async tx=>{const before=(await tx.query("SELECT current_setting('app.school_id') AS id")).rows[0].id;const counts=(await tx.query('SELECT * FROM platform.operations_school_totals()')).rows[0];assert.ok(counts.active_without_admin>=0);assert.equal((await tx.query("SELECT current_setting('app.school_id') AS id")).rows[0].id,before);},{schoolId:schoolA,userId});
    await worker.processOnce();const heartbeat=(await worker.db.app.query('SELECT last_healthy_at FROM platform.runtime_heartbeats WHERE worker_id=$1',[worker.owner])).rows[0].last_healthy_at;
    const url='/api/v1/platform/operations-overview',result=await request('GET',url);assert.equal(result.statusCode,200,result.body);const view=result.json().data;assert.equal(view.services.find(s=>s.key==='worker').state,'operational');assert.equal(view.services.find(s=>s.key==='database').state,'operational');assert.equal(view.services.find(s=>s.key==='storage').state,'operational');assert.notEqual(view.services.find(s=>s.key==='mail').state,'operational');const installed=await verifyInstallation(pool);assert.equal(view.store.schema,installed.schemaRevision);assert.equal(view.store.migrations,installed.migrations);assert.ok(view.storageFreeBytes>0);const backup=view.backups.find(b=>b.id===id);assert.ok(backup);assert.equal(backup.status,'FAILED');assert.equal(backup.createdAt,row.created_at.toISOString());assert.deepEqual(backup.summary,{rows:3,errorCode:'BACKUP_FAILED'});assert.equal(result.body.includes('hidden-artifact-location'),false);assert.equal(result.body.includes('hidden-operation-secret'),false);assert.equal(result.body.includes('hidden-checksum'),false);
    const backupCount=(await db.app.query("SELECT count(*)::int AS n FROM platform.operation_runs WHERE kind='BACKUP'")).rows[0].n;assert.equal(view.backupTotal,backupCount);assert.equal((await request('GET','/api/v1/platform/operations?kind=BACKUP&status=FAILED')).statusCode,200);assert.equal((await request('GET','/api/v1/platform/school-options')).statusCode,403);assert.equal((await request('GET','/api/v1/platform/support-options')).statusCode,403);assert.equal((await request('GET',`/api/v1/platform/schools/${schoolA}/admin-invitations`)).statusCode,403);
    const original=worker.db.app.query;worker.db.app.query=async()=>{throw new Error('Synthetic failed dependency');};try{await assert.rejects(worker.processOnce(),/Synthetic failed dependency/);}finally{worker.db.app.query=original;}assert.equal((await worker.db.app.query('SELECT last_healthy_at FROM platform.runtime_heartbeats WHERE worker_id=$1',[worker.owner])).rows[0].last_healthy_at.toISOString(),heartbeat.toISOString());
    const old=(await worker.db.app.query('SELECT worker_id,last_healthy_at FROM platform.runtime_heartbeats')).rows;try{await worker.db.app.query("UPDATE platform.runtime_heartbeats SET last_healthy_at=now()-interval '120 seconds'");const stale=await request('GET',url);assert.equal(stale.statusCode,200,stale.body);assert.equal(stale.json().data.services.find(s=>s.key==='worker').state,'degraded');}finally{for(const record of old)await worker.db.app.query('UPDATE platform.runtime_heartbeats SET last_healthy_at=$2 WHERE worker_id=$1',[record.worker_id,record.last_healthy_at]);}
    await db.app.query('UPDATE platform.operator_grants SET revoked_at=now() WHERE id=$1',[grantId]);assert.equal((await request('GET',url)).statusCode,403);assert.equal((await request('GET','/api/v1/platform/operations')).statusCode,403);
  }finally{await worker.close();}
});

async function staffUiFixture(timezone='Asia/Ho_Chi_Minh'){
  const schoolId=await operationalUiSchool(timezone);jar.delete('edu_staff');let csrf=await login('admin-a@example.invalid');
  const values=await db.transaction(async tx=>{
    const today=(await tx.query("SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM platform.schools WHERE id=$1",[schoolId])).rows[0].today,y=Number(today.slice(0,4));
    const target=(await tx.query('SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2',[schoolId,seedId('user:teacher-a')])).rows[0].id;
    const other=(await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status,joined_at) VALUES($1,$2,'Nhân sự đích thứ hai giả','ACTIVE',now()) RETURNING id",[schoolId,seedId('user:teacher-b')])).rows[0].id;
    const admin=(await tx.query('SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2',[schoolId,seedId('user:admin-a')])).rows[0].id;
    const year=(await tx.query("INSERT INTO app.academic_years(school_id,code,name,starts_on,ends_on,status) VALUES($1,'STAFF','Năm phân quyền giả',$2,$3,'ACTIVE') RETURNING id",[schoolId,`${y}-01-01`,`${y+1}-01-01`])).rows[0].id;
    const grade=(await tx.query("INSERT INTO app.grade_levels(school_id,code,name,grade_level) VALUES($1,'10','Khối giả',10) RETURNING id",[schoolId])).rows[0].id;
    const classId=(await tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity,status) VALUES($1,$2,$3,'STAFF','Lớp phân quyền giả',10,'ACTIVE') RETURNING id",[schoolId,year,grade])).rows[0].id;
    const adminRole=(await tx.query("SELECT id FROM app.roles WHERE school_id=$1 AND code='SCHOOL_ADMIN'",[schoolId])).rows[0].id;
    return {target,other,admin,adminRole,classId,today,endsOn:`${y+1}-01-01`};
  },{schoolId});
  const post=(path,body,key=crypto.randomUUID())=>request('POST',`/api/v1/schools/${schoolId}/${path}`,body,csrf,{'idempotency-key':key});
  const member=async id=>{const response=await request('GET',`/api/v1/schools/${schoolId}/members/${id}`);assert.equal(response.statusCode,200,response.body);return response.json().data;};
  const role=async permissions=>{const response=await post('roles',{code:`staff-${crypto.randomUUID()}`,label:'Vai trò kiểm thử giả',permissions});assert.equal(response.statusCode,201,response.body);return response.json().data;};
  const grant=async(memberId,roleId,options={})=>{const response=await post('grants',{memberId,roleId,scopeType:'SCHOOL',validFrom:new Date(Date.now()-1000).toISOString(),...options});assert.equal(response.statusCode,201,response.body);return response.json().data;};
  return {schoolId,...values,post,member,role,grant,setCsrf:value=>{csrf=value;}};
}

test('B6 atomic school-role replacement retains expiry/class scopes, detects independent grants and rolls back all failures',async()=>{
  const f=await staffUiFixture(),read=await f.role([{action:'school.read',scopes:['SCHOOL']}]),directory=await f.role([{action:'member.read',scopes:['SCHOOL']}]),classRole=await f.role([{action:'guardian.read',scopes:['CLASS']}]);
  const classGrant=await f.grant(f.target,classRole.id,{scopeType:'CLASS',classId:f.classId,validUntil:new Date(Date.now()+86400000).toISOString()}),before=await f.member(f.target),until=new Date(Date.now()+86400000).toISOString(),key=crypto.randomUUID();
  const body={expectedVersion:before.version,roleIds:[read.id,directory.id],reason:'Thay vai trò nguyên tử giả',validUntil:until};
  const changed=await f.post(`members/${f.target}/school-roles`,body,key);assert.equal(changed.statusCode,200,changed.body);const current=changed.json().data;
  assert.ok(current.version>before.version);assert.equal(current.schoolRoleGrants.length,2);assert.ok((await f.member(f.target)).grants.some(g=>g.id===classGrant.id));
  for(const key of ['workPhone','workEmail','department','userId','grants'])assert.equal(key in current,false);
  const replay=await f.post(`members/${f.target}/school-roles`,body,key);assert.equal(replay.statusCode,200);assert.deepEqual(replay.json().data,current);
  const kept=await f.post(`members/${f.target}/school-roles`,{...body,expectedVersion:current.version,validUntil:null});assert.equal(kept.statusCode,200,kept.body);
  assert.deepEqual(kept.json().data.schoolRoleGrants.map(g=>[g.id,g.validUntil]),current.schoolRoleGrants.map(g=>[g.id,g.validUntil]));
  const latest=kept.json().data,invalid=await f.post(`members/${f.target}/school-roles`,{...body,expectedVersion:latest.version,roleIds:[read.id,seedId('role:B:SCHOOL_ADMIN')]});assert.equal(invalid.statusCode,422,invalid.body);assert.deepEqual((await f.member(f.target)).schoolRoleGrants,latest.schoolRoleGrants);
  const newRole=await f.role([{action:'year.read',scopes:['SCHOOL']}]);await f.grant(f.target,newRole.id,{validUntil:until});
  assert.ok((await f.member(f.target)).version>latest.version);const stale=await f.post(`members/${f.target}/school-roles`,{...body,expectedVersion:latest.version,roleIds:[]});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'VERSION_CONFLICT');
  assert.equal((await f.member(f.target)).schoolRoleGrants.length,3);
  const foreign=await f.post(`members/${seedId('member:B:teacher-a')}/school-roles`,{...body,expectedVersion:1});assert.equal(foreign.statusCode,404);
  const versions=(await db.transaction(tx=>tx.query('SELECT version FROM app.memberships WHERE school_id=$1 AND id=$2',[f.schoolId,f.target]),{schoolId:f.schoolId})).rows[0].version;
  const schoolGrant=(await f.member(f.target)).schoolRoleGrants.find(g=>g.roleId===newRole.id);const revoked=await f.post(`grants/${schoolGrant.id}/revoke`,{expectedVersion:schoolGrant.version,reason:'Thu hồi grant riêng giả'});assert.equal(revoked.statusCode,200);assert.ok((await f.member(f.target)).version>versions);
});

test('B6 school-role replacement prevents self edits, last-admin removal, ceiling/expiry breaches and unauthorized cached replay',async()=>{
  const f=await staffUiFixture(),manager=await f.role([{action:'role.manage',scopes:['SCHOOL']},{action:'member.manage',scopes:['SCHOOL']},{action:'school.read',scopes:['SCHOOL']}]),read=await f.role([{action:'school.read',scopes:['SCHOOL']}]);
  const managerGrant=await f.grant(f.target,manager.id,{validUntil:new Date(Date.now()+3600000).toISOString()}),admin=await f.member(f.admin),target=await f.member(f.target),other=await f.member(f.other);
  assert.equal((await f.post(`members/${f.admin}/school-roles`,{expectedVersion:admin.version,roleIds:[],reason:'Không được tự đổi giả'})).statusCode,403);
  jar.delete('edu_staff');f.setCsrf(await login('teacher-a@example.invalid'));
  const last=await f.post(`members/${f.admin}/school-roles`,{expectedVersion:admin.version,roleIds:[],reason:'Không được bỏ admin cuối giả'});assert.equal(last.statusCode,409);assert.equal(last.json().code,'LAST_ADMIN_REQUIRED');
  assert.equal((await f.post(`members/${f.admin}/end`,{expectedVersion:admin.version,reason:'Không được kết thúc admin cuối giả'})).json().code,'LAST_ADMIN_REQUIRED');
  assert.equal((await f.post(`members/${f.target}/school-roles`,{expectedVersion:target.version,roleIds:[],reason:'Không được tự đổi giả'})).statusCode,403);
  const ceiling=await f.post(`members/${f.other}/school-roles`,{expectedVersion:other.version,roleIds:[f.adminRole],reason:'Không được vượt trần giả'});assert.equal(ceiling.statusCode,403);
  const expiry=await f.post(`members/${f.other}/school-roles`,{expectedVersion:other.version,roleIds:[read.id],reason:'Không được cấp vô thời hạn giả'});assert.equal(expiry.statusCode,403);assert.equal(expiry.json().code,'DELEGATION_EXPIRY_CEILING');
  const key=crypto.randomUUID(),body={expectedVersion:other.version,roleIds:[read.id],reason:'Cấp quyền hữu hạn giả',validUntil:new Date(Date.now()+1800000).toISOString()},ok=await f.post(`members/${f.other}/school-roles`,body,key);assert.equal(ok.statusCode,200,ok.body);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,managerGrant.id]),{schoolId:f.schoolId});
  assert.equal((await f.post(`members/${f.other}/school-roles`,body,key)).statusCode,403);
});

test('B6 ending a membership revokes all current/future grants and assignments without deleting history or other schools',async()=>{
  const f=await staffUiFixture(),read=await f.role([{action:'school.read',scopes:['SCHOOL']}]);await f.grant(f.target,read.id,{validFrom:new Date(Date.now()+86400000).toISOString()});
  const assignment=await f.post('assignments',{classId:f.classId,memberId:f.target,kind:'HOMEROOM',startsOn:f.today,endsOn:f.endsOn});assert.equal(assignment.statusCode,201,assignment.body);const row=assignment.json().data,target=await f.member(f.target);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const cookie=cookies();assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/classes/${f.classId}`)).statusCode,200);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const stale=await f.post(`members/${f.target}/end`,{expectedVersion:target.version-1,reason:'Phiên bản cũ giả'});assert.equal(stale.statusCode,409);
  const key=crypto.randomUUID(),body={expectedVersion:target.version,reason:'Kết thúc công tác kiểm thử giả'},ended=await f.post(`members/${f.target}/end`,body,key);assert.equal(ended.statusCode,200,ended.body);const data=ended.json().data;assert.equal(data.status,'ENDED');assert.ok(data.endedAt);assert.equal(data.statusReason,body.reason);assert.equal(data.grants.length,0);assert.equal(data.schoolRoleGrants.length,0);assert.ok(data.version>target.version);
  const dbState=await db.transaction(async tx=>({grants:(await tx.query('SELECT revoked_at FROM app.role_grants WHERE school_id=$1 AND member_id=$2',[f.schoolId,f.target])).rows,assignment:(await tx.query('SELECT revoked_at,starts_on,ends_on FROM app.teaching_assignments WHERE school_id=$1 AND id=$2',[f.schoolId,row.id])).rows[0],otherSchool:(await tx.query('SELECT status FROM app.memberships WHERE school_id=$1 AND id=$2',[schoolA,seedId('member:A:teacher-a')])).rows[0]}),{schoolId:f.schoolId});
  assert.ok(dbState.grants.every(g=>g.revoked_at));assert.ok(dbState.assignment.revoked_at);assert.equal(dbState.assignment.starts_on,row.startsOn);assert.equal(dbState.assignment.ends_on,row.endsOn);
  // Cross-school rows are unavailable under this tenant context, not a fake empty history.
  assert.equal(dbState.otherSchool,undefined);assert.equal((await db.transaction(tx=>tx.query('SELECT status FROM app.memberships WHERE school_id=$1 AND id=$2',[schoolA,seedId('member:A:teacher-a')]),{schoolId:schoolA})).rows[0].status,'ACTIVE');
  assert.equal((await server.inject({method:'GET',url:`/api/v1/schools/${f.schoolId}/classes/${f.classId}`,headers:{cookie}})).statusCode,404);
  assert.equal((await f.post(`members/${f.target}/end`,body,key)).statusCode,200);const reopen=await f.post(`members/${f.target}/reactivate`,{expectedVersion:data.version,reason:'Nhận lại thành viên nhưng không phục hồi grant giả'});assert.equal(reopen.statusCode,200,reopen.body);assert.equal(reopen.json().data.grants.length,0);assert.equal(reopen.json().data.schoolRoleGrants.length,0);
});

test('B6 native school invitations persist all roles/profile, replay once and accept multiple or zero grants atomically',async()=>{
  const f=await staffUiFixture(),read=await f.role([{action:'school.read',scopes:['SCHOOL']}]),directory=await f.role([{action:'member.read',scopes:['SCHOOL']}]);
  const body={email:`staff-ui-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Họ tên công tác thật trong fixture',proposedDuty:'Giáo viên chưa phân công lớp',roleIds:[read.id,directory.id],expiresInDays:30},key=crypto.randomUUID(),created=await f.post('staff-invitations',body,key);assert.equal(created.statusCode,201,created.body);const invitation=created.json().data;
  assert.equal(invitation.workDisplayName,body.workDisplayName);assert.equal(invitation.proposedDuty,body.proposedDuty);assert.deepEqual(invitation.roleIds,body.roleIds);assert.ok(!('token' in invitation)&&!('url' in invitation));assert.ok((Date.parse(invitation.expiresAt)-Date.now())/86400000>29.9);
  assert.deepEqual((await f.post('staff-invitations',body,key)).json().data,invitation);assert.equal((await f.post('staff-invitations',body)).statusCode,422);
  const badEmail=`bad-ui-${crypto.randomUUID()}@example.invalid`,bad=await f.post('staff-invitations',{...body,email:badEmail,roleIds:[read.id,seedId('role:B:SCHOOL_ADMIN')]});assert.equal(bad.statusCode,422);
  assert.equal((await db.transaction(tx=>tx.query('SELECT count(*)::int AS total FROM app.staff_invitations WHERE school_id=$1 AND email_normalized=$2',[f.schoolId,badEmail]),{schoolId:f.schoolId})).rows[0].total,0);
  const accept=async(invite,email)=>{
    const mails=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invite.id}`])).rows;assert.equal(mails.length,1);
    const content=decryptMail(mails[0].encrypted_payload),url=new URL(content.url),fragment=new URLSearchParams(url.hash.slice(1));
    const bootstrap=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken,response=await request('POST','/api/v1/invitations/accept',{schoolSlug:fragment.get('school'),token:fragment.get('token'),displayName:'Danh tính fixture riêng',newPassword:password},bootstrap);assert.equal(response.statusCode,200,response.body);
    return (await db.transaction(tx=>tx.query('SELECT m.id,u.display_name,m.work_display_name FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[f.schoolId,email]),{schoolId:f.schoolId})).rows[0];
  };
  const member=await accept(invitation,body.email);assert.equal(member.work_display_name,body.workDisplayName);assert.equal(member.display_name,'Danh tính fixture riêng');assert.equal((await db.transaction(tx=>tx.query('SELECT count(*)::int AS total FROM app.role_grants WHERE school_id=$1 AND member_id=$2',[f.schoolId,member.id]),{schoolId:f.schoolId})).rows[0].total,2);
  const emptyBody={...body,email:`empty-ui-${crypto.randomUUID()}@example.invalid`,roleIds:[],expiresInDays:2},empty=await f.post('staff-invitations',emptyBody);assert.equal(empty.statusCode,201,empty.body);const emptyMember=await accept(empty.json().data,emptyBody.email);assert.equal((await db.transaction(tx=>tx.query('SELECT count(*)::int AS total FROM app.role_grants WHERE school_id=$1 AND member_id=$2',[f.schoolId,emptyMember.id]),{schoolId:f.schoolId})).rows[0].total,0);
  const listed=await request('GET',`/api/v1/schools/${f.schoolId}/invitations?q=${encodeURIComponent(body.email)}`);assert.equal(listed.statusCode,200,listed.body);assert.equal(listed.json().page.total,1);assert.equal(listed.json().data[0].inviterName,'Quản trị UI giả');assert.equal(listed.json().data[0].workDisplayName,body.workDisplayName);
});

test('B6 zero-role invitation still rechecks current inviter membership and mail authority before acceptance',async()=>{
  const f=await staffUiFixture(),body={email:`zero-permission-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Nhân sự chưa phân công giả',roleIds:[],expiresInDays:2},created=await f.post('staff-invitations',body);assert.equal(created.statusCode,201,created.body);
  const mail=(await db.app.query('SELECT id,encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${created.json().data.id}`])).rows[0],content=decryptMail(mail.encrypted_payload),url=new URL(content.url),fragment=new URLSearchParams(url.hash.slice(1));
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND member_id=$2',[f.schoolId,f.admin]),{schoolId:f.schoolId});
  const allowed=await db.transaction(tx=>tx.query('SELECT identity.mail_delivery_allowed($1) AS allowed',[mail.id]),{schoolId:f.schoolId});assert.equal(allowed.rows[0].allowed,false);
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken,response=await request('POST','/api/v1/invitations/accept',{schoolSlug:fragment.get('school'),token:fragment.get('token'),displayName:'Không được tạo danh tính giả',newPassword:password},csrf);assert.equal(response.statusCode,422);assert.equal(response.json().code,'INVITATION_UNAVAILABLE');assert.equal((await db.app.query('SELECT count(*)::int AS total FROM identity.users WHERE email_normalized=$1',[body.email])).rows[0].total,0);
});


test('B6 expired staff invitations cannot be revoked as pending or delivered, and preserve their history',async()=>{
  const f=await staffUiFixture(),body={email:`expired-staff-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Nhân sự hết hạn giả',roleIds:[],expiresInDays:1},created=await f.post('staff-invitations',body);assert.equal(created.statusCode,201,created.body);const id=created.json().data.id;
  const expired=(await db.transaction(tx=>tx.query("UPDATE app.staff_invitations SET expires_at=now()-interval '1 second' WHERE school_id=$1 AND id=$2 RETURNING version,status",[f.schoolId,id]),{schoolId:f.schoolId})).rows[0];
  const response=await f.post(`invitations/${id}/revoke`,{expectedVersion:expired.version,reason:'Không thể thu hồi lời mời hết hạn giả'});assert.equal(response.statusCode,409);assert.equal(response.json().code,'INVITATION_UNAVAILABLE');
  const persisted=(await db.transaction(tx=>tx.query('SELECT version,status FROM app.staff_invitations WHERE school_id=$1 AND id=$2',[f.schoolId,id]),{schoolId:f.schoolId})).rows[0];assert.deepEqual(persisted,expired);
  const mail=(await db.app.query('SELECT id,status FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${id}`])).rows[0];assert.equal(mail.status,'PENDING');assert.equal((await db.transaction(tx=>tx.query('SELECT identity.mail_delivery_allowed($1) AS allowed',[mail.id]),{schoolId:f.schoolId})).rows[0].allowed,false);
});


test('B6 staff directory combines authorized pending invitations in SQL, searches folded work data and counts before keysets',async()=>{
  const f=await staffUiFixture();await db.transaction(async tx=>{
    await tx.query("UPDATE app.memberships SET work_display_name='Nguyễn Hoàng Bình',department='Bộ môn Toán',work_email='binh-work@example.invalid' WHERE school_id=$1 AND id=$2",[f.schoolId,f.target]);
    await tx.query("UPDATE app.memberships SET work_display_name='Trần Minh An',department='Bộ môn Văn',status='SUSPENDED' WHERE school_id=$1 AND id=$2",[f.schoolId,f.other]);
    await tx.query("UPDATE app.memberships SET work_display_name='Quản trị Dũng' WHERE school_id=$1 AND id=$2",[f.schoolId,f.admin]);
  },{schoolId:f.schoolId});
  const assignment=await f.post('assignments',{classId:f.classId,memberId:f.target,kind:'HOMEROOM',startsOn:f.today,endsOn:f.endsOn});assert.equal(assignment.statusCode,201,assignment.body);
  const invited=await f.post('staff-invitations',{email:`directory-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Lê Thị Ánh',proposedDuty:'Bộ môn Sinh',roleIds:[],expiresInDays:2});assert.equal(invited.statusCode,201,invited.body);
  const expired=await f.post('staff-invitations',{email:`expired-directory-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Lời mời hết hạn ẩn',roleIds:[],expiresInDays:1});assert.equal(expired.statusCode,201,expired.body);await db.transaction(tx=>tx.query("UPDATE app.staff_invitations SET expires_at=now()-interval '1 second' WHERE school_id=$1 AND id=$2",[f.schoolId,expired.json().data.id]),{schoolId:f.schoolId});
  const url=`/api/v1/schools/${f.schoolId}/staff-directory`,first=await request('GET',url+'?limit=2');assert.equal(first.statusCode,200,first.body);assert.equal(first.json().page.total,4);assert.equal(first.json().page.hasMore,true);assert.deepEqual(first.json().data.map(r=>r.fullName),['Trần Minh An','Lê Thị Ánh']);
  const second=await request('GET',url+'?limit=2&cursor='+encodeURIComponent(first.json().page.nextCursor));assert.equal(second.statusCode,200,second.body);assert.equal(second.json().page.total,4);assert.deepEqual(second.json().data.map(r=>r.fullName),['Nguyễn Hoàng Bình','Quản trị Dũng']);assert.equal(second.json().page.hasMore,false);
  const invitation=first.json().data.find(r=>r.kind==='INVITATION');assert.equal(invitation.memberId,null);assert.equal(invitation.userId,null);assert.equal(invitation.status,null);assert.equal(invitation.accessActive,false);
  const filtered=await request('GET',url+'?q=nguyen%20hoang%20binh&department='+encodeURIComponent('Bộ môn Toán')+'&role=GVCN');assert.equal(filtered.statusCode,200,filtered.body);assert.equal(filtered.json().page.total,1);assert.equal(filtered.json().data[0].email,'binh-work@example.invalid');assert.deepEqual(filtered.json().data[0].dutyLabels,['Chủ nhiệm Lớp phân quyền giả']);
  assert.equal((await request('GET',url+'?q=teacher-a%40example.invalid')).json().page.total,0);assert.equal((await request('GET',url+'?q=bo%20mon%20sinh')).json().page.total,1);
  for(const text of ['Bình binh-work','%','_']){const response=await request('GET',url+'?q='+encodeURIComponent(text));assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,0,text);}
  const changed=await request('GET',url+'?limit=2&role=GVCN&cursor='+encodeURIComponent(first.json().page.nextCursor));assert.equal(changed.statusCode,422);assert.equal(changed.json().code,'INVALID_CURSOR');
  const metadata=await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory-summary`);assert.equal(metadata.statusCode,200,metadata.body);assert.deepEqual(metadata.json().data.kpi,{total:3,active:2,suspended:1,pendingInvites:1});assert.deepEqual(metadata.json().data.departments,['Bộ môn Toán','Bộ môn Văn']);assert.equal(metadata.json().data.canViewInvitations,true);
  for(const response of [first,second,metadata])for(const privateField of ['loginEmail','workPhone','token_hash','token','proposed_assignments','rolePermissions'])assert.equal(response.body.includes('"'+privateField+'"'),false);
});

test('B6 directory read does not lend invitation, role catalog, assignment or export authority and revocation invalidates opaque scope cursors',async()=>{
  const f=await staffUiFixture(),reader=await f.role([{action:'member.read',scopes:['SCHOOL']}]),readerGrant=await f.grant(f.target,reader.id),manager=await f.role([{action:'member.manage',scopes:['SCHOOL']}]),managerGrant=await f.grant(f.target,manager.id);
  const invitation=await f.post('staff-invitations',{email:`private-directory-${crypto.randomUUID()}@example.invalid`,workDisplayName:'Lời mời riêng thật',roleIds:[],expiresInDays:2});assert.equal(invitation.statusCode,201,invitation.body);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=`/api/v1/schools/${f.schoolId}/staff-directory`,first=await request('GET',url+'?limit=1');assert.equal(first.statusCode,200,first.body);assert.equal(first.json().page.total,4);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,managerGrant.id]),{schoolId:f.schoolId});
  const summary=await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory-summary`);assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.kpi.pendingInvites,null);assert.equal(summary.json().data.canInvite,false);assert.equal(summary.json().data.canAssign,false);assert.equal(summary.json().data.canExport,false);
  const members=await request('GET',url);assert.equal(members.statusCode,200,members.body);assert.equal(members.json().page.total,3);assert.ok(members.json().data.every(r=>r.kind==='MEMBER'));assert.equal(members.body.includes(invitation.json().data.email),false);
  for(const path of ['/invitations','/roles','/assignments','/staff-directory?status=PENDING_INVITATION','/staff-directory?purpose=export'])assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}`+path)).statusCode,403,path);
  const oldCursor=await request('GET',url+'?limit=1&cursor='+encodeURIComponent(first.json().page.nextCursor));assert.equal(oldCursor.statusCode,422);assert.equal(oldCursor.json().code,'INVALID_CURSOR');
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,readerGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory-summary`)).statusCode,403);
});

test('B6 Vietnamese composite keysets preserve given/full-name order, case/diacritic ties and nullable departments in both directions',async()=>{
  const f=await staffUiFixture(),names=['Đặng Thị An','đặng thị an','Lê Quốc Ánh','Trần Đức Bình','Nguyễn Minh Bình','Lê Văn Đạt','Nguyễn Anh','Phạm Văn Dũng'];
  await db.transaction(async tx=>{
    for(let i=0;i<names.length;i++){
      const user=(await tx.query("INSERT INTO identity.users(email_normalized,display_name,status) VALUES($1,$2,'INVITED') RETURNING id",[`sort-staff-${crypto.randomUUID()}@example.invalid`,names[i]])).rows[0].id;
      await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,department,status) VALUES($1,$2,$3,$4,'INVITED')",[f.schoolId,user,names[i],i%2?'Bộ môn Toán':null]);
    }
  },{schoolId:f.schoolId});
  const all=(await db.transaction(tx=>tx.query('SELECT id,work_display_name AS name,department FROM app.memberships WHERE school_id=$1',[f.schoolId]),{schoolId:f.schoolId})).rows;
  const cmp=(a,b)=>a.name.trim().split(/\s+/).at(-1).localeCompare(b.name.trim().split(/\s+/).at(-1),'vi',{sensitivity:'base'})||a.name.localeCompare(b.name,'vi',{sensitivity:'base'})||a.id.localeCompare(b.id);
  for(const dir of ['asc','desc']){
    const output=[];let cursor;
    do{const response=await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory?limit=2&dir=${dir}`+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,all.length);output.push(...response.json().data);cursor=response.json().page.nextCursor;}while(cursor);
    assert.deepEqual(output.map(r=>r.id),[...all].sort(cmp).map(r=>r.id)[dir==='asc'?'slice':'reverse']());assert.equal(new Set(output.map(r=>r.id)).size,all.length);
    const departmentRows=[];cursor=undefined;
    do{const response=await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory?limit=2&sort=department&dir=${dir}`+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.statusCode,200,response.body);departmentRows.push(...response.json().data);cursor=response.json().page.nextCursor;}while(cursor);
    assert.equal(new Set(departmentRows.map(r=>r.id)).size,all.length);const firstNull=departmentRows.findIndex(r=>r.department===null);assert.ok(firstNull>=0);assert.ok(departmentRows.slice(firstNull).every(r=>r.department===null));
  }
  assert.equal((await verifyInstallation(pool)).migrations,36);
});

test('B6 locked identities keep their directory lifecycle but have no effective grants, and active KPI does not fabricate access',async()=>{
  const f=await staffUiFixture(),read=await f.role([{action:'school.read',scopes:['SCHOOL']}]);
  const created=await db.transaction(async tx=>{const user=(await tx.query("INSERT INTO identity.users(email_normalized,display_name,status) VALUES($1,'Danh tính khóa giả','LOCKED') RETURNING id",[`locked-staff-${crypto.randomUUID()}@example.invalid`])).rows[0].id;const member=(await tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,status) VALUES($1,$2,'Danh tính khóa giả','ACTIVE') RETURNING id",[f.schoolId,user])).rows[0].id;await tx.query("INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,granted_by) VALUES($1,$2,$3,'SCHOOL',$4)",[f.schoolId,member,read.id,seedId('user:admin-a')]);return {user,member};},{schoolId:f.schoolId});
  const grants=await db.transaction(tx=>policy.grants(tx,created.user,f.schoolId),{schoolId:f.schoolId});assert.deepEqual(grants,[]);assert.deepEqual((await f.member(created.member)).grants,[]);
  const row=(await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory?q=`+encodeURIComponent('Danh tính khóa giả'))).json().data[0];assert.equal(row.status,'ACTIVE');assert.equal(row.accessActive,false);
  const summary=(await request('GET',`/api/v1/schools/${f.schoolId}/staff-directory-summary`)).json().data;assert.equal(summary.kpi.total,4);assert.equal(summary.kpi.active,3);
});

test('B6 member details return real coarse other-school counts and work contacts without opening another tenant',async()=>{
  const f=await staffUiFixture(),foreign=await operationalUiSchool(),userId=crypto.randomUUID();
  await db.app.query("INSERT INTO identity.users(id,email_normalized,display_name,status) VALUES($1,$2,'Danh tính riêng giả','ACTIVE')",[userId,`hidden-profile-${crypto.randomUUID()}@example.invalid`]);
  const memberId=(await db.transaction(tx=>tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,work_email,work_phone,status,joined_at) VALUES($1,$2,'Tên tại trường thật',NULL,NULL,'ACTIVE','2041-01-04T18:00:00Z') RETURNING id",[f.schoolId,userId]),{schoolId:f.schoolId})).rows[0].id;
  const foreignMember=(await db.transaction(tx=>tx.query("INSERT INTO app.memberships(school_id,user_id,work_display_name,department,status,ended_at) VALUES($1,$2,'Tên trường khác kín','Bộ môn trường khác kín','ENDED',now()) RETURNING id",[foreign,userId]),{schoolId:foreign})).rows[0].id;
  jar.delete('edu_staff');await login('admin-a@example.invalid');
  const url=`/api/v1/schools/${f.schoolId}/members/${memberId}/details`,response=await request('GET',url);assert.equal(response.statusCode,200,response.body);const data=response.json().data;
  assert.equal(data.otherSchools,1);assert.equal(data.member.workDisplayName,'Tên tại trường thật');assert.equal(data.member.workEmail,null);assert.equal(data.member.workPhone,null);assert.equal(data.joinedOn,'2041-01-05');assert.equal(data.accessActive,true);assert.deepEqual(data.assignments,[]);assert.equal(data.isSelf,false);assert.equal(data.canViewHistory,true);
  for(const hidden of [foreign,foreignMember,'Tên trường khác kín','Bộ môn trường khác kín','hidden-profile-','otherSchoolIds','otherSchoolNames'])assert.equal(response.body.includes(hidden),false,hidden);
  assert.equal((await request('GET',url.replace(memberId,foreignMember))).statusCode,404);
  await db.transaction(async tx=>{const before=(await tx.query("SELECT current_setting('app.school_id') AS id")).rows[0].id;assert.equal((await tx.query('SELECT app.member_other_school_count($1) AS count',[memberId])).rows[0].count,1);assert.equal((await tx.query("SELECT current_setting('app.school_id') AS id")).rows[0].id,before);assert.equal((await tx.query('SELECT id FROM app.memberships WHERE id=$1',[foreignMember])).rowCount,0);},{schoolId:f.schoolId,userId:seedId('user:admin-a')});
  assert.equal((await db.app.query("SELECT coalesce(current_setting('app.school_id',true),'') AS id")).rows[0].id,'');
});

test('B6 member aggregate checks current school authority, target membership and SQL role before returning any count',async()=>{
  const f=await staffUiFixture(),reader=await f.role([{action:'member.read',scopes:['SCHOOL']}]),grant=await f.grant(f.target,reader.id),actor=seedId('user:teacher-a');
  const invoke=context=>db.transaction(tx=>tx.query('SELECT app.member_other_school_count($1)',[f.other]),context);
  for(const context of [{},{schoolId:f.schoolId},{schoolId:f.schoolId,userId:seedId('user:teacher-b')},{schoolId:schoolB,userId:actor},
    {schoolId:f.schoolId,userId:actor,parentSessionId:crypto.randomUUID()}])await assert.rejects(invoke(context),error=>error.code==='42501');
  await assert.rejects(db.parent.query('SELECT app.member_other_school_count($1)',[f.other]),error=>error.code==='42501');
  const worker=new Pool(databaseConfig('worker'));try{await assert.rejects(worker.query('SELECT app.member_other_school_count($1)',[f.other]),error=>error.code==='42501');}finally{await worker.end();}
  const selected={grantId:crypto.randomUUID(),operatorId:actor,schoolId:f.schoolId,classId:null,allowedActions:['member.read']};await assert.rejects(runSupportRead(selected,()=>invoke({schoolId:f.schoolId,userId:actor})),error=>error.code==='42501');
  await assert.rejects(db.transaction(tx=>tx.query('SELECT app.member_other_school_count($1)',[seedId('member:teacher-b:school-b')]),{schoolId:f.schoolId,userId:actor}),error=>error.code==='42501');
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=`/api/v1/schools/${f.schoolId}/members/${f.other}/details`,view=await request('GET',url);assert.equal(view.statusCode,200,view.body);assert.equal(view.json().data.assignments,null);assert.equal(view.json().data.roleChoices,null);assert.equal(view.json().data.canViewHistory,false);assert.equal(view.json().data.canAssign,false);assert.equal(view.json().data.canRole,false);assert.equal((await request('GET',url.replace('/details','/history'))).statusCode,403);
  for(const sql of ["UPDATE app.role_grants SET valid_from=now()+interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_until=NULL,revoked_at=now() WHERE school_id=$1 AND id=$2"]){await db.transaction(tx=>tx.query(sql,[f.schoolId,grant.id]),{schoolId:f.schoolId});await assert.rejects(invoke({schoolId:f.schoolId,userId:actor}),error=>error.code==='42501');assert.equal((await request('GET',url)).statusCode,403);}
});

test('B6 member effective permissions and assignment history follow native grant time, membership, identity and assignment dates',async()=>{
  const f=await staffUiFixture(),role=await f.role([{action:'school.read',scopes:['SCHOOL']}]),current=await f.grant(f.target,role.id),future=await f.grant(f.target,role.id,{validFrom:new Date(Date.now()+3600000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString()});
  const tomorrow=new Date(f.today+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const next=tomorrow.toISOString().slice(0,10);
  const a=await f.post('assignments',{classId:f.classId,memberId:f.target,kind:'HOMEROOM',startsOn:f.today,endsOn:next});assert.equal(a.statusCode,201,a.body);
  const b=await f.post('assignments',{classId:f.classId,memberId:f.other,kind:'HOMEROOM',startsOn:next,endsOn:f.endsOn});assert.equal(b.statusCode,201,b.body);
  const get=async id=>{const response=await request('GET',`/api/v1/schools/${f.schoolId}/members/${id}/details`);assert.equal(response.statusCode,200,response.body);return response.json().data;};
  const active=await get(f.target);assert.ok(active.member.grants.some(g=>g.id===current.id));assert.ok(!active.member.grants.some(g=>g.id===future.id));assert.ok(active.member.schoolRoleGrants.some(g=>g.id===future.id));assert.equal(active.assignments[0].live,true);assert.equal(active.assignments[0].createdBy,seedId('user:admin-a'));assert.equal(active.assignments[0].createdByName,'Quản trị UI giả');assert.equal(active.assignments[0].className,'Lớp phân quyền giả');
  const nextDuty=await get(f.other);assert.equal(nextDuty.assignments[0].live,false);assert.ok(!nextDuty.member.grants.some(g=>g.roleCode==='HOMEROOM'));
  const revoked=await f.post(`assignments/${a.json().data.id}/revoke`,{expectedVersion:a.json().data.version,reason:'Thu hồi phân công kiểm thử'});assert.equal(revoked.statusCode,200,revoked.body);const history=await get(f.target);assert.equal(history.assignments[0].live,false);assert.ok(history.assignments[0].revokedAt);assert.ok(history.assignments[0].grantRevokedAt);
  await db.transaction(tx=>tx.query("UPDATE identity.users SET status='LOCKED' WHERE id=$1",[seedId('user:teacher-a')]),{schoolId:f.schoolId});try{const locked=await get(f.target);assert.equal(locked.member.status,'ACTIVE');assert.equal(locked.accessActive,false);assert.deepEqual(locked.member.grants,[]);assert.equal(locked.member.schoolRoleGrants.length,2);}finally{await db.app.query("UPDATE identity.users SET status='ACTIVE' WHERE id=$1",[seedId('user:teacher-a')]);}
});

test('B6 member role choices respect action-specific delegation expiry without borrowing a role catalog',async()=>{
  const f=await staffUiFixture(),schoolRead=await f.role([{action:'school.read',scopes:['SCHOOL']}]),reader=await f.role([{action:'member.read',scopes:['SCHOOL']}]),manager=await f.role([{action:'role.manage',scopes:['SCHOOL']}]);
  const short=new Date(Date.now()+1800000).toISOString(),long=new Date(Date.now()+3600000).toISOString();await f.grant(f.target,reader.id);const readGrant=await f.grant(f.target,schoolRead.id,{validUntil:long});await f.grant(f.target,manager.id,{validUntil:short});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=`/api/v1/schools/${f.schoolId}/members/${f.other}/details`,response=await request('GET',url);assert.equal(response.statusCode,200,response.body);const data=response.json().data,choice=data.roleChoices.find(r=>r.id===schoolRead.id);
  assert.equal(data.canRole,true);assert.equal(choice.canDelegate,true);assert.equal(choice.delegationUntil,short);assert.equal(data.roleChoices.find(r=>r.id===f.adminRole).canDelegate,false);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/roles`)).statusCode,403);for(const row of data.roleChoices){assert.ok(!Object.hasOwn(row,'permissions'));assert.ok(!Object.hasOwn(row,'actions'));}
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,readGrant.id]),{schoolId:f.schoolId});const changed=await request('GET',url);assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().data.roleChoices.find(r=>r.id===schoolRead.id).canDelegate,false);
});

test('B6 member history filters member, assignment and grant events before counting/keysets, with independent audit authority',async()=>{
  const f=await staffUiFixture(),reader=await f.role([{action:'member.read',scopes:['SCHOOL']}]),auditor=await f.role([{action:'audit.read',scopes:['SCHOOL']}]);await f.grant(f.target,reader.id);const auditGrant=await f.grant(f.target,auditor.id);
  const assignment=await f.post('assignments',{classId:f.classId,memberId:f.other,kind:'HOMEROOM',startsOn:f.today,endsOn:f.endsOn});assert.equal(assignment.statusCode,201,assignment.body);const a=assignment.json().data,ids=[];
  await db.transaction(async tx=>{for(const [type,target]of [['member',f.other],['assignment',a.id],['grant',a.roleGrantId],['member',f.target],['student',f.other]]){const id=crypto.randomUUID();ids.push(id);await tx.query("INSERT INTO app.audit_events(id,school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,reason,redacted_before,redacted_after,created_at) VALUES($1,$2,$3,'STAFF','PROFILE-HISTORY',$4,$5,$6,'Lý do thật',$7,$8,'2041-01-04T18:00:00.123456Z')",[id,f.schoolId,seedId('user:admin-a'),type,target,crypto.randomUUID(),{status:'ACTIVE'},{status:'SUSPENDED',privateUnknown:'hidden-profile-history'}]);}},{schoolId:f.schoolId});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=`/api/v1/schools/${f.schoolId}/members/${f.other}/history`,out=[];let cursor,total;
  do{const response=await request('GET',url+'?limit=1&sort=createdAt&dir=desc'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.statusCode,200,response.body);total??=response.json().page.total;assert.equal(response.json().page.total,total);assert.equal(response.body.includes('hidden-profile-history'),false);out.push(...response.json().data);cursor=response.json().page.nextCursor;}while(cursor);
  assert.equal(total,4);assert.equal(new Set(out.map(e=>e.id)).size,total);for(const id of ids.slice(0,3))assert.ok(out.some(e=>e.id===id));for(const id of ids.slice(3))assert.ok(!out.some(e=>e.id===id));assert.deepEqual(out.find(e=>e.id===ids[0]).changes,[{field:'status',before:'ACTIVE',after:'SUSPENDED'}]);
  const first=await request('GET',url+'?limit=1');assert.equal((await request('GET',url.replace(f.other,f.target)+'?limit=1&cursor='+encodeURIComponent(first.json().page.nextCursor))).statusCode,422);assert.equal((await request('GET',url+'?targetId='+f.target)).statusCode,422);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,auditGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);const profile=await request('GET',url.replace('/history','/details'));assert.equal(profile.statusCode,200,profile.body);assert.equal(profile.json().data.canViewHistory,false);
});

test('B6 personal notifications traverse more than 100 real own memberships without truncating global totals or opaque pages',async()=>{
  const userId=seedId('user:admin-a'),memberships=()=>db.transaction(tx=>tx.query("SELECT m.id,m.school_id FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id WHERE m.user_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE' ORDER BY m.school_id",[userId]),{userId});
  let all=(await memberships()).rows;while(all.length<=100){await operationalUiSchool();all=(await memberships()).rows;}
  assert.ok(all.length>100);const prefix=`MANY-SCHOOLS-${crypto.randomUUID()}`,ids=[],last=all.at(-1);
  for(const [m,count]of [[all[0],2],[last,3]])await db.transaction(async tx=>{
    const role=(await tx.query("INSERT INTO app.roles(school_id,code,label) VALUES($1,$2,'Đọc thông báo kiểm thử giả') RETURNING id",[m.school_id,`notice-${crypto.randomUUID()}`])).rows[0].id;
    await tx.query("INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes) VALUES($1,$2,'school.read',ARRAY['SCHOOL'])",[m.school_id,role]);
    await tx.query("INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,granted_by) VALUES($1,$2,$3,'SCHOOL',$4)",[m.school_id,m.id,role,userId]);
    for(let i=0;i<count;i++){const id=crypto.randomUUID();ids.push(id);await tx.query("INSERT INTO app.notifications(id,school_id,member_id,kind,title,target_kind,required_action,source_key,created_at) VALUES($1::uuid,$2,$3,'permission',$4,'none','school.read',$1::uuid::text,'2041-01-04T18:00:00.123456Z')",[id,m.school_id,m.id,prefix]);}
  },{schoolId:m.school_id});
  jar.delete('edu_staff');const csrf=await login('admin-a@example.invalid'),url=`/api/v1/me/notifications?kind=permission&q=${encodeURIComponent(prefix)}&limit=2`,out=[];let cursor;
  do{const response=await request('GET',url+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,5);out.push(...response.json().data);cursor=response.json().page.nextCursor;}while(cursor);
  assert.deepEqual(out.map(n=>n.id),[...ids].sort().reverse());assert.ok(out.every(n=>n.accessible));const lastId=ids.at(-1),mark=await request('POST',`/api/v1/me/notifications/${lastId}/read`,undefined,csrf);assert.equal(mark.statusCode,200,mark.body);
  const filtered=await request('GET',url+`&schoolId=${last.school_id}&unread=true`);assert.equal(filtered.statusCode,200,filtered.body);assert.equal(filtered.json().page.total,2);assert.ok(filtered.json().data.every(n=>n.schoolId===last.school_id));assert.equal((await request('GET',url+'&schoolId=invalid')).statusCode,404);
});

test('B6 assignment preview is read-only, uses school-local instants and preserves displayed source versions before saving',async()=>{
  const f=await staffUiFixture('Asia/Tokyo'),member=await f.member(f.target),classVersion=(await db.transaction(tx=>tx.query('SELECT version FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId]),{schoolId:f.schoolId})).rows[0].version;
  const counts=async()=>(await db.transaction(tx=>tx.query('SELECT (SELECT count(*)::int FROM app.role_grants) AS grants,(SELECT count(*)::int FROM app.teaching_assignments) AS assignments,(SELECT count(*)::int FROM app.audit_events) AS audit,(SELECT count(*)::int FROM app.idempotency_keys) AS keys'),{schoolId:f.schoolId})).rows[0];
  const before=await counts(),body={memberId:f.target,classId:f.classId,kind:'HOMEROOM',startsOn:f.today,expectedMemberVersion:member.version,expectedClassVersion:classVersion};
  const response=await f.post('assignments/preview',body);assert.equal(response.statusCode,200,response.body);const p=response.json().data;assert.deepEqual(await counts(),before);assert.equal(p.memberVersion,member.version);assert.equal(p.classVersion,classVersion);assert.equal(p.referenceDate,f.today);assert.equal(p.endsOn,f.endsOn);assert.equal(p.grantStartsAt,new Date(f.today+'T00:00:00+09:00').toISOString());assert.equal(p.grantEndsAt,new Date(f.endsOn+'T00:00:00+09:00').toISOString());assert.ok(p.added.includes('guardian.manage'));assert.deepEqual(p.kept,[]);assert.equal(p.scopeName,'Lớp phân quyền giả');
  await db.transaction(tx=>tx.query("UPDATE app.classes SET name='Tên lớp vừa đổi giả' WHERE school_id=$1 AND id=$2",[f.schoolId,f.classId]),{schoolId:f.schoolId});const stale=await f.post('assignments',body);assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().code,'VERSION_CONFLICT');assert.deepEqual(await counts(),before);
  const currentVersion=(await db.transaction(tx=>tx.query('SELECT version FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId]),{schoolId:f.schoolId})).rows[0].version;
  const saved=await f.post('assignments',{...body,expectedClassVersion:currentVersion});assert.equal(saved.statusCode,201,saved.body);assert.equal(saved.json().data.endsOn,f.endsOn);
  const revoke=await f.post(`assignments/${saved.json().data.id}/revoke`,{expectedVersion:saved.json().data.version,reason:'Thu hồi giữ nguyên lịch sử ngày'});assert.equal(revoke.statusCode,200,revoke.body);assert.equal(revoke.json().data.startsOn,f.today);assert.equal(revoke.json().data.endsOn,f.endsOn);assert.ok(revoke.json().data.revokedAt);
});

test('B6 assignment preview compares exact subject scopes, rejects overlapping windows and rechecks expired delegation on repeated POST',async()=>{
  const f=await staffUiFixture(),subjects=await db.transaction(async tx=>{const result=[];for(const name of ['Toán giả','Văn giả'])result.push((await tx.query("INSERT INTO app.subjects(school_id,code,name,status) VALUES($1,$2,$3,'ACTIVE') RETURNING id",[f.schoolId,crypto.randomUUID(),name])).rows[0].id);return result;},{schoolId:f.schoolId});
  const assigned=await f.post('assignments',{memberId:f.target,classId:f.classId,kind:'SUBJECT',subjectId:subjects[0],startsOn:f.today,endsOn:f.endsOn});assert.equal(assigned.statusCode,201,assigned.body);
  const body={memberId:f.target,classId:f.classId,kind:'SUBJECT',subjectId:subjects[1],startsOn:f.today,endsOn:f.endsOn},initial=await f.post('assignments/preview',body);assert.equal(initial.statusCode,200,initial.body);assert.ok(initial.json().data.added.includes('student.read'));assert.deepEqual(initial.json().data.kept,[]);assert.ok(initial.json().data.notIncluded.includes('guardian.manage'));
  const classReader=await f.role([{action:'student.read',scopes:['CLASS']}]);await f.grant(f.target,classReader.id,{scopeType:'CLASS',classId:f.classId});const withClass=await f.post('assignments/preview',body);assert.equal(withClass.statusCode,200,withClass.body);assert.ok(withClass.json().data.kept.includes('student.read'));
  const duplicate=await f.post('assignments/preview',{...body,subjectId:subjects[0]});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().code,'SCHEDULE_CONFLICT');
  const actions=[...new Set([...initial.json().data.added,...initial.json().data.kept,'assignment.manage'])],manager=await f.role(actions.map(action=>({action,scopes:['SCHOOL']}))),grant=await f.grant(f.other,manager.id);
  jar.delete('edu_staff');f.setCsrf(await login('teacher-b@example.invalid'));const key=crypto.randomUUID(),good=await f.post('assignments/preview',body,key);assert.equal(good.statusCode,200,good.body);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/roles`)).statusCode,403);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/members/${f.target}`)).statusCode,403);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_until=now()+interval '1 hour' WHERE school_id=$1 AND id=$2",[f.schoolId,grant.id]),{schoolId:f.schoolId});const expiredCeiling=await f.post('assignments/preview',body,key);assert.equal(expiredCeiling.statusCode,403,expiredCeiling.body);assert.equal(expiredCeiling.json().code,'DELEGATION_EXPIRY_CEILING');
});

test('B6 assignment preview detects source member changes, rejects malformed/foreign proposals and advertises future/configured publication timing',async()=>{
  const f=await staffUiFixture(),member=await f.member(f.target),tomorrow=new Date(f.today+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const next=tomorrow.toISOString().slice(0,10),body={memberId:f.target,classId:f.classId,kind:'HOMEROOM',startsOn:next};
  await db.transaction(tx=>tx.query("UPDATE platform.schools SET settings=jsonb_set(settings,'{homeroomMayPublish}','false'::jsonb) WHERE id=$1",[f.schoolId]),{schoolId:f.schoolId});const future=await f.post('assignments/preview',body);assert.equal(future.statusCode,200,future.body);assert.equal(future.json().data.warnings.length,2);
  await db.transaction(tx=>tx.query("UPDATE app.memberships SET department='Thông tin mới giả' WHERE school_id=$1 AND id=$2",[f.schoolId,f.target]),{schoolId:f.schoolId});const stale=await f.post('assignments',{...body,expectedMemberVersion:member.version});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'VERSION_CONFLICT');
  assert.equal((await f.post('assignments/preview',{...body,subjectId:crypto.randomUUID()})).statusCode,422);assert.equal((await f.post('assignments/preview',{...body,kind:'SUBJECT'})).statusCode,422);const foreignClass=(await db.transaction(tx=>tx.query('SELECT id FROM app.classes WHERE school_id=$1 ORDER BY id LIMIT 1',[schoolB]),{schoolId:schoolB})).rows[0].id;assert.equal((await f.post('assignments/preview',{...body,classId:foreignClass})).statusCode,404);
  const yesterday=new Date(f.today+'T00:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);assert.equal((await f.post('assignments/preview',{...body,startsOn:yesterday.toISOString().slice(0,10)})).statusCode,422);
  const csrfFree=await request('POST',`/api/v1/schools/${f.schoolId}/assignments/preview`,body);assert.equal(csrfFree.statusCode,403);
});

test('B6 assignment matrix returns actual nullable cells and minimal work names under independent assignment-read authority',async()=>{
  const f=await staffUiFixture(),subject=(await db.transaction(tx=>tx.query("INSERT INTO app.subjects(school_id,code,name,status,color) VALUES($1,'NATIVE','Môn thực giả','ACTIVE','#334455') RETURNING id",[f.schoolId]),{schoolId:f.schoolId})).rows[0].id;
  const hr=await f.post('assignments',{memberId:f.target,classId:f.classId,kind:'HOMEROOM',startsOn:f.today,endsOn:f.endsOn});assert.equal(hr.statusCode,201,hr.body);await db.transaction(tx=>tx.query("UPDATE app.memberships SET status='SUSPENDED',work_email='hidden-matrix-work@example.invalid' WHERE school_id=$1 AND id=$2",[f.schoolId,f.target]),{schoolId:f.schoolId});
  const reader=await f.role([{action:'assignment.read',scopes:['SCHOOL']}]),grant=await f.grant(f.other,reader.id);jar.delete('edu_staff');await login('teacher-b@example.invalid');const url=`/api/v1/schools/${f.schoolId}/assignment-matrix`,response=await request('GET',url);assert.equal(response.statusCode,200,response.body);const d=response.json().data;
  assert.equal(d.year.id,(await db.transaction(tx=>tx.query('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId]),{schoolId:f.schoolId})).rows[0].year_id);assert.equal(d.rows.length,1);assert.equal(d.rows[0].homeroom.assignmentId,hr.json().data.id);assert.equal(d.rows[0].homeroom.version,hr.json().data.version);assert.equal(d.rows[0].homeroom.memberStatus,'SUSPENDED');assert.equal(d.rows[0].homeroom.accessActive,false);assert.equal(d.rows[0].bySubject[subject],null);assert.ok(d.rows[0].conflicts.some(v=>v.includes('đang bị khóa')));assert.equal(d.canAssign,false);assert.equal(d.canViewMembers,false);assert.equal(d.subjects.find(s=>s.id===subject).color,'#334455');
  for(const value of ['workEmail','workPhone','studentCount','students','rolePermissions','hidden-matrix-work@example.invalid'])assert.equal(response.body.includes(value),false,value);
  for(const path of [`/members/${f.target}`,'/academic-years','/roles','/dictionaries/subjects'])assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}`+path)).statusCode,403,path);
  assert.equal((await request('GET',url+'?yearId='+seedId('year:B'))).statusCode,404);assert.equal((await request('GET',url+'?q=private')).statusCode,422);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);
});

test('B6 assignment matrix keeps an unconfigured year explicit and archived display reference separate from authority',async()=>{
  const empty=await operationalUiSchool();jar.delete('edu_staff');await login('admin-a@example.invalid');const unconfigured=await request('GET',`/api/v1/schools/${empty}/assignment-matrix`);assert.equal(unconfigured.statusCode,200,unconfigured.body);assert.equal(unconfigured.json().data.year,null);assert.deepEqual(unconfigured.json().data.rows,[]);
  const f=await staffUiFixture(),year=(await db.transaction(tx=>tx.query('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId]),{schoolId:f.schoolId})).rows[0].year_id;
  await db.transaction(tx=>tx.query("UPDATE app.academic_years SET status='ARCHIVED' WHERE school_id=$1 AND id=$2",[f.schoolId,year]),{schoolId:f.schoolId});const archived=await request('GET',`/api/v1/schools/${f.schoolId}/assignment-matrix?yearId=${year}`);assert.equal(archived.statusCode,200,archived.body);assert.equal(archived.json().data.canAssign,false);assert.equal(archived.json().data.year.status,'ARCHIVED');const ref=new Date(f.endsOn+'T00:00:00Z');ref.setUTCDate(ref.getUTCDate()-63);assert.equal(archived.json().data.referenceDate,ref.toISOString().slice(0,10));assert.ok(archived.json().data.rows[0].conflicts.includes('Thiếu giáo viên chủ nhiệm'));
});

test('B6 role metadata keeps native scopes and real counts without lending member/audit access or treating custom class grants as assignments',async()=>{
  const f=await staffUiFixture(),r=await f.role([{action:'student.read',scopes:['CLASS','SUBJECT']}]);await f.grant(f.target,r.id,{scopeType:'CLASS',classId:f.classId});
  const hr=await f.post('assignments',{memberId:f.target,classId:f.classId,kind:'HOMEROOM',startsOn:f.today,endsOn:f.endsOn});assert.equal(hr.statusCode,201,hr.body);
  const reader=await f.role([{action:'role.read',scopes:['SCHOOL']}]),g=await f.grant(f.other,reader.id);jar.delete('edu_staff');await login('teacher-b@example.invalid');
  const url=`/api/v1/schools/${f.schoolId}/roles/${r.id}/details`,response=await request('GET',url);assert.equal(response.statusCode,200,response.body);const d=response.json().data;
  assert.deepEqual(d.role.permissions,[{action:'student.read',scopes:['CLASS','SUBJECT']}]);assert.deepEqual(d.role.scopes,['CLASS','SUBJECT']);assert.equal(d.role.memberCount,0);assert.equal(d.role.assignmentCount,0);assert.equal(d.members,null);assert.equal(d.history,null);assert.equal(d.canEdit,false);assert.equal(d.canViewMembers,false);assert.equal(d.canViewHistory,false);assert.equal(d.actions.find(a=>a.action==='student.read').canGrant,false);assert.ok(d.actions.every(a=>!a.action.startsWith('platform.')));
  const list=await request('GET',`/api/v1/schools/${f.schoolId}/roles?limit=100`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().data.find(v=>v.code==='HOMEROOM').assignmentCount,1);assert.equal(list.json().data.find(v=>v.id===reader.id).memberCount,1);
  for(const text of ['workEmail','workPhone','loginEmail','studentCode'])assert.equal(response.body.includes(text),false);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/members/${f.target}`)).statusCode,403);assert.equal((await request('GET',url+'?private=1')).statusCode,422);
  const foreign=(await db.transaction(tx=>tx.query('SELECT id FROM app.roles WHERE school_id=$1 ORDER BY id LIMIT 1',[schoolB]),{schoolId:schoolB})).rows[0].id;assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/roles/${foreign}/details`)).statusCode,404);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,g.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);
});

test('B6 role details show only independently authorized holders/history and save scoped deltas with a displayed version',async()=>{
  const f=await staffUiFixture(),r=await f.role([{action:'student.read',scopes:['CLASS','SUBJECT']}]),g=await f.grant(f.target,r.id,{scopeType:'CLASS',classId:f.classId});
  const permissions=[{action:'student.read',scopes:['CLASS']},{action:'student.manage',scopes:['CLASS']}],url=`/api/v1/schools/${f.schoolId}/roles/${r.id}`;
  const saved=await request('PATCH',url,{expectedVersion:r.version,reason:'Điều chỉnh phạm vi giả',permissions},(await request('GET','/api/v1/me/context')).json().data.csrfToken,{'idempotency-key':crypto.randomUUID()});assert.equal(saved.statusCode,200,saved.body);assert.ok(saved.json().data.version>r.version);assert.deepEqual(saved.json().data.permissions,permissions.slice().sort((a,b)=>a.action.localeCompare(b.action)));
  const details=await request('GET',url+'/details');assert.equal(details.statusCode,200,details.body);const d=details.json().data;assert.equal(d.canEdit,true);assert.equal(d.canViewMembers,true);assert.equal(d.canViewHistory,true);assert.equal(d.members.length,1);assert.equal(d.members[0].grantId,g.id);assert.equal(d.members[0].memberId,f.target);assert.equal(d.members[0].classId,f.classId);assert.equal(d.members[0].subjectId,null);assert.equal(d.members[0].validUntil,null);
  const event=d.history.find(e=>e.action==='updateRole');assert.equal(event.reason,'Điều chỉnh phạm vi giả');assert.ok(event.changes.some(v=>v.field==='addedActions'&&v.after==='student.manage'));assert.ok(event.changes.some(v=>v.field==='changedScopes'&&v.after==='student.read: CLASS'));assert.ok(d.history.every(e=>e.targetId===r.id&&e.targetType==='role'));
  const stale=await request('PATCH',url,{expectedVersion:r.version,reason:'Phiên bản cũ giả',permissions},(await request('GET','/api/v1/me/context')).json().data.csrfToken,{'idempotency-key':crypto.randomUUID()});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'VERSION_CONFLICT');
});

test('B6 future held roles and immutable system templates cannot be edited by their holder',async()=>{
  const f=await staffUiFixture(),r=await f.role([{action:'student.read',scopes:['SCHOOL']}]);await f.grant(f.other,r.id,{validFrom:new Date(Date.now()+86400000).toISOString(),validUntil:new Date(Date.now()+172800000).toISOString()});
  const manager=await f.role(['role.read','role.manage','student.read'].map(action=>({action,scopes:['SCHOOL']})));await f.grant(f.other,manager.id);jar.delete('edu_staff');const csrf=await login('teacher-b@example.invalid');
  const url=`/api/v1/schools/${f.schoolId}/roles/${r.id}`,details=await request('GET',url+'/details');assert.equal(details.statusCode,200,details.body);assert.equal(details.json().data.ownRole,true);assert.equal(details.json().data.canEdit,false);
  const own=await request('PATCH',url,{expectedVersion:r.version,reason:'Không tự sửa giả',permissions:r.permissions},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(own.statusCode,403);assert.equal(own.json().code,'OWN_ROLE_EDIT_FORBIDDEN');
  const system=await request('GET',`/api/v1/schools/${f.schoolId}/roles/${f.adminRole}/details`);assert.equal(system.statusCode,200,system.body);assert.equal(system.json().data.ownRole,false);assert.equal(system.json().data.systemRole,true);assert.equal(system.json().data.canEdit,false);
  const blocked=await request('PATCH',`/api/v1/schools/${f.schoolId}/roles/${f.adminRole}`,{expectedVersion:system.json().data.role.version,reason:'Không sửa hệ thống giả',permissions:[]},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(blocked.statusCode,409);assert.equal(blocked.json().code,'SYSTEM_ROLE_IMMUTABLE');
});

test('B6 editing live roles cannot expand permissions beyond the current editor expiry ceiling',async()=>{
  const f=await staffUiFixture(),r=await f.role([{action:'student.read',scopes:['SCHOOL']}]),recipient=await f.grant(f.target,r.id),manager=await f.role(['role.read','role.manage','student.read','student.manage'].map(action=>({action,scopes:['SCHOOL']})));
  await f.grant(f.other,manager.id,{validUntil:new Date(Date.now()+3600000).toISOString()});jar.delete('edu_staff');const csrf=await login('teacher-b@example.invalid'),url=`/api/v1/schools/${f.schoolId}/roles/${r.id}`,body={expectedVersion:r.version,reason:'Thêm quyền có trần giả',permissions:[...r.permissions,{action:'student.manage',scopes:['SCHOOL']}]},key=crypto.randomUUID();
  const denied=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(denied.statusCode,403,denied.body);assert.equal(denied.json().code,'DELEGATION_EXPIRY_CEILING');const unchanged=await request('GET',url);assert.equal(unchanged.json().data.version,r.version);assert.deepEqual(unchanged.json().data.permissions,r.permissions);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_until=now()+interval '30 minutes' WHERE school_id=$1 AND id=$2",[f.schoolId,recipient.id]),{schoolId:f.schoolId});const saved=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(saved.statusCode,200,saved.body);assert.ok(saved.json().data.permissions.some(p=>p.action==='student.manage'));
});

async function handoverUiFixture(timezone='Asia/Ho_Chi_Minh'){
  const f=await staffUiFixture(timezone),prior=new Date(f.today+'T00:00:00Z');prior.setUTCDate(prior.getUTCDate()-1);
  const source=await f.post('assignments',{memberId:f.target,classId:f.classId,kind:'HOMEROOM',startsOn:prior.toISOString().slice(0,10),endsOn:f.endsOn,reason:'Khởi tạo nguồn lịch sử giả'});assert.equal(source.statusCode,201,source.body);
  const url=`/api/v1/schools/${f.schoolId}/classes/${f.classId}/handover-preview`,preview=async()=>{const result=await request('GET',url+`?effectiveOn=${f.today}&toMemberId=${f.other}`);assert.equal(result.statusCode,200,result.body);return result.json().data;};
  const proposal=view=>({classId:f.classId,fromAssignmentId:source.json().data.id,toMemberId:f.other,effectiveOn:f.today,reason:'Bàn giao dữ liệu giả',clientRequestId:crypto.randomUUID(),previewHash:view.previewHash,expectedFromAssignmentVersion:view.current.version,expectedClassVersion:view.classVersion,expectedToMemberVersion:view.toMemberVersion});
  return {...f,source:source.json().data,url,preview,proposal};
}

test('B6 handover preview reads real current source/counts under purpose authority without member, family or role catalog access',async()=>{
  const f=await handoverUiFixture();await db.transaction(async tx=>{
    await tx.query("UPDATE app.memberships SET status='SUSPENDED',work_email='hidden-handover@example.invalid' WHERE school_id=$1 AND id=$2",[f.schoolId,f.target]);
    const year=(await tx.query('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId])).rows[0].year_id,id=crypto.randomUUID();
    await tx.query("INSERT INTO app.announcements(id,school_id,year_id,class_id,title,sanitized_html,status,created_by,root_id) VALUES($1,$2,$3,$4,'Nháp giả','<p>Chỉ đếm</p>','DRAFT',$5,$1)",[id,f.schoolId,year,f.classId,seedId('user:admin-a')]);
  },{schoolId:f.schoolId});
  const role=await f.role([{action:'assignment.manage',scopes:['SCHOOL']}]),grant=await f.grant(f.other,role.id);jar.delete('edu_staff');await login('teacher-b@example.invalid');const response=await request('GET',f.url);assert.equal(response.statusCode,200,response.body);const d=response.json().data;
  assert.equal(d.current.assignmentId,f.source.id);assert.equal(d.current.memberStatus,'SUSPENDED');assert.equal(d.current.accessActive,false);assert.equal(d.previewHash,null);assert.equal(d.toMemberVersion,null);assert.deepEqual(d.openItems,{pendingConduct:0,openWeeks:0,pendingAdjustments:0,pendingEvidence:0,draftAnnouncements:1,activeLinks:0});
  for(const text of ['workEmail','workPhone','hidden-handover@example.invalid','sourceState','token','studentCode','rolePermissions'])assert.equal(response.body.includes(text),false,text);
  for(const path of [`members/${f.target}`,'roles','guardians'])assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/${path}`)).statusCode,403,path);
  assert.equal((await request('GET',f.url+'?private=1')).statusCode,422);assert.equal((await request('GET',f.url+'?effectiveOn=2026-02-30')).statusCode,422);
  const foreign=(await db.transaction(tx=>tx.query('SELECT id FROM app.classes WHERE school_id=$1 ORDER BY id LIMIT 1',[schoolB]),{schoolId:schoolB})).rows[0].id;assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/classes/${foreign}/handover-preview`)).statusCode,404);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',f.url)).statusCode,403);
});

test('B6 handover applies exactly once with school-local cutoffs, durable receipts, own-actor recovery and preserved source authorship',async()=>{
  const f=await handoverUiFixture('Asia/Tokyo'),view=await f.preview(),body=f.proposal(view),first=await f.post('handovers',body);assert.equal(first.statusCode,201,first.body);const row=first.json().data;
  assert.equal(row.status,'SUBMITTED');assert.equal(row.appliedAssignment,null);assert.equal(row.previewHash,view.previewHash);assert.equal(row.clientRequestId,body.clientRequestId);assert.equal(first.body.includes('sourceState'),false);
  const duplicate=await f.post('handovers',body);assert.equal(duplicate.statusCode,201,duplicate.body);assert.equal(duplicate.json().data.id,row.id);const changed=await f.post('handovers',{...body,reason:'Ý định khác giả'});assert.equal(changed.statusCode,409);assert.equal(changed.json().code,'IDEMPOTENCY_CONFLICT');
  const applied=await f.post(`handovers/${row.id}/approve`,{expectedVersion:row.version,previewHash:view.previewHash});assert.equal(applied.statusCode,200,applied.body);const saved=applied.json().data;assert.equal(saved.status,'APPLIED');assert.equal(saved.appliedAssignment.id,saved.appliedAssignmentId);assert.equal(saved.appliedAssignment.startsOn,f.today);assert.equal(saved.appliedAssignment.memberId,f.other);assert.ok(saved.appliedAt);
  const recovered=await request('GET',`/api/v1/schools/${f.schoolId}/handovers/requests/${body.clientRequestId}`);assert.equal(recovered.statusCode,200,recovered.body);assert.equal(recovered.json().data.appliedAssignmentId,saved.appliedAssignmentId);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/handovers/${row.id}`)).statusCode,200);
  const stored=await db.transaction(async tx=>({a:(await tx.query('SELECT ends_on FROM app.teaching_assignments WHERE school_id=$1 AND id=$2',[f.schoolId,f.source.id])).rows[0],g:(await tx.query('SELECT valid_until FROM app.role_grants WHERE school_id=$1 AND id=$2',[f.schoolId,f.source.roleGrantId])).rows[0],cutoff:(await tx.query('SELECT $1::date::timestamp AT TIME ZONE timezone AS end FROM platform.schools WHERE id=$2',[f.today,f.schoolId])).rows[0],count:(await tx.query('SELECT count(*)::int AS n FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2',[f.schoolId,f.classId])).rows[0].n,notices:(await tx.query("SELECT count(*)::int AS n FROM app.notifications WHERE school_id=$1 AND source_key LIKE $2",[f.schoolId,`handover:${row.id}:%`])).rows[0].n}),{schoolId:f.schoolId});assert.equal(stored.a.ends_on,f.today);assert.equal(stored.g.valid_until.toISOString(),stored.cutoff.end.toISOString());assert.equal(stored.count,2);assert.equal(stored.notices,2);
  const replay=await f.post('handovers',body);assert.equal(replay.statusCode,201);assert.equal(replay.json().data.status,'APPLIED');assert.equal(replay.json().data.appliedAssignmentId,saved.appliedAssignmentId);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/classes/${f.classId}`)).statusCode,404);
  jar.delete('edu_staff');await login('teacher-b@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/classes/${f.classId}`)).statusCode,200);assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/handovers/requests/${body.clientRequestId}`)).statusCode,403);
});

test('B6 changed handover sources fail before submission or application and require an explicit review of the same pending receipt',async()=>{
  const f=await handoverUiFixture(),firstView=await f.preview(),body=f.proposal(firstView);
  await db.transaction(tx=>tx.query("UPDATE app.classes SET name='Tên nguồn mới giả' WHERE school_id=$1 AND id=$2",[f.schoolId,f.classId]),{schoolId:f.schoolId});const stale=await f.post('handovers',body);assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'VERSION_CONFLICT');
  const view=await f.preview(),fresh=f.proposal(view),created=await f.post('handovers',fresh);assert.equal(created.statusCode,201,created.body);const receipt=created.json().data;
  await db.transaction(tx=>tx.query("UPDATE app.memberships SET department='Nguồn nhận thay đổi giả' WHERE school_id=$1 AND id=$2",[f.schoolId,f.other]),{schoolId:f.schoolId});const blocked=await f.post(`handovers/${receipt.id}/approve`,{expectedVersion:receipt.version,previewHash:view.previewHash});assert.equal(blocked.statusCode,409,blocked.body);assert.equal(blocked.json().code,'STALE_PREVIEW');
  const before=await db.transaction(tx=>tx.query('SELECT ends_on FROM app.teaching_assignments WHERE school_id=$1 AND id=$2',[f.schoolId,f.source.id]),{schoolId:f.schoolId});assert.equal(before.rows[0].ends_on,f.endsOn);
  const next=await f.preview(),reviewed=await f.post(`handovers/${receipt.id}/review`,{expectedVersion:receipt.version,previewHash:next.previewHash,expectedClassVersion:next.classVersion,expectedFromAssignmentVersion:next.current.version,expectedToMemberVersion:next.toMemberVersion});assert.equal(reviewed.statusCode,200,reviewed.body);assert.ok(reviewed.json().data.version>receipt.version);assert.equal(reviewed.json().data.previewHash,next.previewHash);
  const applied=await f.post(`handovers/${receipt.id}/approve`,{expectedVersion:reviewed.json().data.version,previewHash:next.previewHash});assert.equal(applied.statusCode,200,applied.body);assert.equal(applied.json().data.status,'APPLIED');
});

test('B6 open-item changes invalidate handover review and linked source grants are never extended at the cutoff',async()=>{
  const f=await handoverUiFixture(),view=await f.preview(),body=f.proposal(view),created=await f.post('handovers',body);assert.equal(created.statusCode,201,created.body);const row=created.json().data;
  await db.transaction(async tx=>{const year=(await tx.query('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId])).rows[0].year_id,id=crypto.randomUUID();await tx.query("INSERT INTO app.announcements(id,school_id,year_id,class_id,title,sanitized_html,status,created_by,root_id) VALUES($1,$2,$3,$4,'Nguồn việc mở giả','<p>Chờ xử lý</p>','DRAFT',$5,$1)",[id,f.schoolId,year,f.classId,seedId('user:teacher-a')]);}, {schoolId:f.schoolId});
  const stale=await f.post(`handovers/${row.id}/approve`,{expectedVersion:row.version,previewHash:view.previewHash});assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().code,'STALE_PREVIEW');
  const midnight=new Date(view.referenceDate+'T00:00:00Z');midnight.setUTCDate(midnight.getUTCDate()-1);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[f.schoolId,f.source.roleGrantId,midnight.toISOString()]),{schoolId:f.schoolId});
  const next=await f.preview();assert.equal(next.current.accessActive,false);assert.equal(next.openItems.draftAnnouncements,1);
  const review=await f.post(`handovers/${row.id}/review`,{expectedVersion:row.version,previewHash:next.previewHash,expectedClassVersion:next.classVersion,expectedFromAssignmentVersion:next.current.version,expectedToMemberVersion:next.toMemberVersion});assert.equal(review.statusCode,200,review.body);const applied=await f.post(`handovers/${row.id}/approve`,{expectedVersion:review.json().data.version,previewHash:next.previewHash});assert.equal(applied.statusCode,200,applied.body);
  const source=await db.transaction(tx=>tx.query('SELECT valid_until FROM app.role_grants WHERE school_id=$1 AND id=$2',[f.schoolId,f.source.roleGrantId]),{schoolId:f.schoolId});assert.equal(source.rows[0].valid_until.toISOString(),midnight.toISOString());
  const author=await db.transaction(tx=>tx.query('SELECT created_by,status FROM app.announcements WHERE school_id=$1 AND class_id=$2',[f.schoolId,f.classId]),{schoolId:f.schoolId});assert.equal(author.rows[0].created_by,seedId('user:teacher-a'));assert.equal(author.rows[0].status,'DRAFT');
});

test('B6 handover receipts remain actor/school bound, recheck delegation and deny immutable-source replacement',async()=>{
  const f=await handoverUiFixture(),view=await f.preview(),body=f.proposal(view),created=await f.post('handovers',body);assert.equal(created.statusCode,201,created.body);const receipt=created.json().data,reader=await f.role([{action:'assignment.manage',scopes:['SCHOOL']}]);await f.grant(f.other,reader.id);
  jar.delete('edu_staff');const csrf=await login('teacher-b@example.invalid');assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/handovers/requests/${body.clientRequestId}`)).statusCode,404);
  // This identity has no membership in seeded school B; conceal the school/resource.
  const foreignSchool=await request('GET',`/api/v1/schools/${schoolB}/handovers/${receipt.id}`);assert.equal(foreignSchool.statusCode,404,foreignSchool.body);assert.equal(foreignSchool.json().code,'RESOURCE_NOT_FOUND');
  const foreign=(await db.transaction(tx=>tx.query('SELECT id FROM app.handover_requests WHERE school_id=$1 ORDER BY id LIMIT 1',[schoolA]),{schoolId:schoolA})).rows[0].id;assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/handovers/${foreign}`)).statusCode,404);
  const visible=await request('GET',`/api/v1/schools/${f.schoolId}/handovers/${receipt.id}`);assert.equal(visible.statusCode,200,visible.body);
  // Managing requests alone does not supply the class actions of the new grant.
  const approve=await request('POST',`/api/v1/schools/${f.schoolId}/handovers/${receipt.id}/approve`,{expectedVersion:receipt.version,previewHash:view.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(approve.statusCode,404,approve.body);assert.equal(approve.json().code,'RESOURCE_NOT_FOUND');
  const unchanged=await request('GET',`/api/v1/schools/${f.schoolId}/handovers/${receipt.id}`);assert.equal(unchanged.statusCode,200,unchanged.body);assert.equal(unchanged.json().data.status,'SUBMITTED');assert.equal(unchanged.json().data.version,receipt.version);assert.equal(unchanged.json().data.appliedAssignmentId,null);
  const list=await request('GET',`/api/v1/schools/${f.schoolId}/handovers?classId=${f.classId}&status=SUBMITTED&sort=effectiveOn&dir=asc&limit=1`);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().page.total,1);assert.equal(list.json().data[0].id,receipt.id);assert.equal(list.body.includes('sourceState'),false);
  assert.equal((await request('GET',`/api/v1/schools/${f.schoolId}/handovers?sort=sourceState`)).statusCode,422);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const malformed=await f.post(`handovers/${receipt.id}/review`,{expectedVersion:receipt.version,previewHash:view.previewHash,expectedClassVersion:view.classVersion,expectedFromAssignmentVersion:view.current.version,expectedToMemberVersion:view.toMemberVersion,toMemberId:f.target});assert.equal(malformed.statusCode,422);
});

test('B6 student creation allocates actual codes and atomically retains enrollment, gender and a separate unverified guardian',async()=>{
  const f=await staffUiFixture(),body={fullName:'  Học   sinh form giả  ',dateOfBirth:'2011-09-30',gender:'Nữ',initialClassId:f.classId,startsOn:f.today,initialGuardian:{fullName:'Giám hộ form giả',relationshipLabel:'Mẹ',phone:'0912222222'}},key=crypto.randomUUID();
  const created=await f.post('students',body,key);assert.equal(created.statusCode,201,created.body);const s=created.json().data;assert.equal(s.fullName,'Học sinh form giả');assert.equal(s.gender,'Nữ');assert.equal(s.studentCode,'HS'+f.today.slice(2,4)+'001');assert.equal(s.initialEnrollment.classId,f.classId);assert.equal(s.initialRelationship.status,'UNVERIFIED');assert.equal(s.initialRelationship.canReceiveInfo,false);assert.equal(s.initialGuardian.id,s.initialRelationship.guardianId);
  const replay=await f.post('students',body,key);assert.equal(replay.statusCode,201,replay.body);assert.deepEqual(replay.json().data,s);
  const parallel=await Promise.all([f.post('students',{...body,fullName:'Học sinh form thứ hai'}),f.post('students',{...body,fullName:'Học sinh form thứ ba'})]);for(const r of parallel)assert.equal(r.statusCode,201,r.body);assert.equal(new Set([s.studentCode,...parallel.map(r=>r.json().data.studentCode)]).size,3);assert.notEqual(parallel[0].json().data.initialGuardian.id,parallel[1].json().data.initialGuardian.id);
  const stored=await db.transaction(async tx=>({students:(await tx.query('SELECT student_code,gender,date_of_birth FROM app.students WHERE school_id=$1',[f.schoolId])).rows,enrollments:(await tx.query('SELECT count(*)::int AS n FROM app.enrollments WHERE school_id=$1',[f.schoolId])).rows[0].n,guardians:(await tx.query('SELECT count(*)::int AS n FROM app.guardians WHERE school_id=$1',[f.schoolId])).rows[0].n,links:(await tx.query('SELECT count(*)::int AS n FROM app.parent_access_links WHERE school_id=$1',[f.schoolId])).rows[0].n}),{schoolId:f.schoolId});assert.equal(stored.students.length,3);assert.equal(stored.enrollments,3);assert.equal(stored.guardians,3);assert.equal(stored.links,0);for(const row of stored.students){assert.equal(row.gender,'Nữ');assert.equal(row.date_of_birth,'2011-09-30');}
});

test('B6 student form failures roll back every row and optional contacts require independent current authority on replay',async()=>{
  const f=await staffUiFixture(),role=await f.role([{action:'student.manage',scopes:['SCHOOL']}]),contactRole=await f.role([{action:'guardian.manage',scopes:['SCHOOL']}]);await f.grant(f.other,role.id);const contactGrant=await f.grant(f.other,contactRole.id);
  jar.delete('edu_staff');f.setCsrf(await login('teacher-b@example.invalid'));const body={fullName:'Học sinh quyền giả',dateOfBirth:'2011-09-30',gender:'Nam',initialClassId:f.classId,startsOn:f.today,initialGuardian:{fullName:'Giám hộ quyền giả',relationshipLabel:'Bố',phone:'0912222222'}},key=crypto.randomUUID(),created=await f.post('students',body,key);assert.equal(created.statusCode,201,created.body);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,contactGrant.id]),{schoolId:f.schoolId});const replay=await f.post('students',body,key);assert.equal(replay.statusCode,404,replay.body);assert.equal(replay.json().code,'RESOURCE_NOT_FOUND');assert.equal(replay.body.includes('0912222222'),false);const denied=await f.post('students',{...body,fullName:'Không tạo được giả'});assert.equal(denied.statusCode,404,denied.body);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const invalid=await f.post('students',{...body,initialGuardian:{...body.initialGuardian,phone:'bad'}});assert.equal(invalid.statusCode,422,invalid.body);const future=await f.post('students',{...body,dateOfBirth:nextDate(f.today,1)});assert.equal(future.statusCode,422);const foreign=await f.post('students',{...body,initialClassId:classA});assert.equal(foreign.statusCode,404,foreign.body);
  const counts=await db.transaction(tx=>tx.query("SELECT (SELECT count(*)::int FROM app.students WHERE school_id=$1) AS students,(SELECT count(*)::int FROM app.guardians WHERE school_id=$1) AS guardians,(SELECT count(*)::int FROM app.enrollments WHERE school_id=$1) AS enrollments,(SELECT count(*)::int FROM app.idempotency_keys WHERE school_id=$1 AND operation_id='createStudent') AS receipts",[f.schoolId]),{schoolId:f.schoolId});assert.deepEqual(counts.rows[0],{students:1,guardians:1,enrollments:1,receipts:1});
});

test('B6 student edits retain displayed versions and never replay internal notes after private profile authority is revoked',async()=>{
  const f=await staffUiFixture(),created=await f.post('students',{fullName:'Học sinh sửa giả',studentCode:'EDIT',dateOfBirth:'2011-09-30',gender:'Nam',initialClassId:f.classId,startsOn:f.today});assert.equal(created.statusCode,201,created.body);const s=created.json().data;
  const manage=await f.role([{action:'student.manage',scopes:['SCHOOL']},{action:'student.read',scopes:['SCHOOL']}]),privateRole=await f.role([{action:'guardian.read',scopes:['SCHOOL']}]);await f.grant(f.other,manage.id);const privateGrant=await f.grant(f.other,privateRole.id);
  jar.delete('edu_staff');const csrf=await login('teacher-b@example.invalid'),url=`/api/v1/schools/${f.schoolId}/students/${s.id}`,body={expectedVersion:s.version,fullName:'Học sinh đã sửa giả',dateOfBirth:'2010-01-01',gender:'Nữ',internalNote:'Ghi chú nội bộ không công bố'},key=crypto.randomUUID();const saved=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(saved.statusCode,200,saved.body);const actual=saved.json().data;assert.ok(actual.version>s.version);assert.equal(actual.gender,'Nữ');assert.equal(actual.internalNote,body.internalNote);
  const stale=await request('PATCH',url,{...body,fullName:'Không ghi đè nguồn'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().code,'VERSION_CONFLICT');
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,privateGrant.id]),{schoolId:f.schoolId});const denied=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(denied.statusCode,403,denied.body);assert.equal(denied.body.includes(body.internalNote),false);
  const detail=await request('GET',url);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.student.gender,'Nữ');assert.equal(Object.hasOwn(detail.json().data.student,'dateOfBirth'),false);assert.equal(Object.hasOwn(detail.json().data,'internalNote'),false);assert.equal(Object.hasOwn(detail.json().data,'guardians'),false);
  const edit=await request('PATCH',url,{expectedVersion:actual.version,gender:'Nam'},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(edit.statusCode,200,edit.body);assert.equal(Object.hasOwn(edit.json().data,'internalNote'),false);const source=await db.transaction(tx=>tx.query('SELECT full_name,gender,internal_note FROM app.students WHERE school_id=$1 AND id=$2',[f.schoolId,s.id]),{schoolId:f.schoolId});assert.deepEqual(source.rows[0],{full_name:body.fullName,gender:'Nam',internal_note:body.internalNote});
});

test('B6 student unknown historic gender remains null and invalid gender/guardian state cannot be fabricated',async()=>{
  const f=await staffUiFixture(),body={fullName:'Học sinh nguồn cũ giả',studentCode:'UNKNOWN',initialClassId:f.classId,startsOn:f.today},created=await f.post('students',body);assert.equal(created.statusCode,201,created.body);const s=created.json().data;assert.equal(s.gender,null);assert.equal(s.dateOfBirth,null);
  const invalid=await f.post('students',{...body,studentCode:'INVALID',gender:'UNKNOWN'});assert.equal(invalid.statusCode,422);const spoofed=await f.post('students',{...body,studentCode:'SPOOF',initialGuardian:{fullName:'Giám hộ giả',relationshipLabel:'Mẹ',status:'VERIFIED',canReceiveInfo:true}});assert.equal(spoofed.statusCode,422);
  const row=await request('GET',`/api/v1/schools/${f.schoolId}/students/${s.id}`);assert.equal(row.statusCode,200,row.body);assert.equal(row.json().data.student.gender,null);assert.equal(row.json().data.internalNote,null);
  await assert.rejects(db.transaction(tx=>tx.query("UPDATE app.students SET gender='invented' WHERE school_id=$1 AND id=$2",[f.schoolId,s.id]),{schoolId:f.schoolId}),error=>error.code==='23514');
});

test('B6 real CSV gender mapping normalizes supported values, preserves unmapped sources and retains invalid rows',async()=>{
  const csrf=await login('admin-a@example.invalid'),worker=new WorkerRunner(),prefix=crypto.randomUUID();
  try{
    const cls=await request('POST',`/api/v1/schools/${schoolA}/classes`,{yearId:seedId('year:A'),gradeLevelId:seedId('grade:A'),code:`gender-${prefix}`,name:'Lớp giới tính import giả',capacity:5},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(cls.statusCode,201,cls.body);const classId=cls.json().data.id,mapping=['studentCode','fullName','dateOfBirth','gender'].map(name=>({sourceColumn:name,targetField:name})),code=`G-${prefix}`;
    let job=await importCsv(csrf,worker,`studentCode,fullName,dateOfBirth,gender\n${code},Học sinh import giới tính giả,2011-09-30,NỮ\n`,'STUDENTS',classId);job=await validateCsv(csrf,worker,job,mapping);job=await commitCsv(csrf,worker,job);assert.equal(job.status,'COMPLETED');
    const read=()=>db.transaction(tx=>tx.query('SELECT gender,full_name FROM app.students WHERE school_id=$1 AND student_code=$2',[schoolA,code]),{schoolId:schoolA});assert.equal((await read()).rows[0].gender,'Nữ');
    let update=await importCsv(csrf,worker,`studentCode,fullName,dateOfBirth\n${code},Tên import mới giả,2011-09-30\n`,'STUDENTS',classId);update=await validateCsv(csrf,worker,update,mapping.filter(m=>m.targetField!=='gender'),'UPSERT_VERIFIED_CODE');update=await commitCsv(csrf,worker,update);assert.equal(update.status,'COMPLETED');assert.deepEqual((await read()).rows[0],{gender:'Nữ',full_name:'Tên import mới giả'});
    let invalid=await importCsv(csrf,worker,`studentCode,fullName,dateOfBirth,gender\nBAD-${prefix},Giới tính không rõ giả,2011-09-30,other\n`,'STUDENTS',classId);invalid=await validateCsv(csrf,worker,invalid,mapping);assert.equal(invalid.summary.invalid,1);const rows=await request('GET',`/api/v1/schools/${schoolA}/imports/${invalid.id}/rows`);assert.equal(rows.statusCode,200,rows.body);assert.equal(rows.json().data[0].errors[0].field,'gender');const blocked=await request('POST',`/api/v1/schools/${schoolA}/imports/${invalid.id}/commit`,{expectedVersion:invalid.version,previewHash:invalid.previewHash},csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(blocked.statusCode,422,blocked.body);
  }finally{await worker.close();}
});

async function nativePupil(f,body={}){
  const reply=await f.post('students',{fullName:'Học sinh thư mục giả',initialClassId:f.classId,startsOn:f.today,...body});assert.equal(reply.statusCode,201,reply.body);return reply.json().data;
}
test('B6 native student directory applies Vietnamese keysets, exact SQL filters and minimal selected identifiers',async()=>{
  const f=await staffUiFixture(),names=['Đặng Thị An','đặng thị an','Lê Quốc Ánh','Trần Đức Bình','Nguyễn Minh Bình','Lê Văn Đạt','Nguyễn Anh','Tên %_ giả'],students=[];
  for(const name of names)students.push(await nativePupil(f,{fullName:name,...(name===names[0]?{initialGuardian:{fullName:'Giám hộ thư mục giả',relationshipLabel:'Mẹ',phone:'0912222222'}}:{})}));
  const root=`/api/v1/schools/${f.schoolId}/student-directory`,summary=await request('GET',root+'-summary');assert.equal(summary.statusCode,200,summary.body);const view=summary.json().data;
  assert.equal(view.kpi.students,8);assert.equal(view.kpi.unverified,8);assert.equal(view.kpi.activeLinks,0);assert.equal(view.classes[0].id,f.classId);assert.equal(view.today,f.today);
  for(const dir of ['asc','desc']){const ids=[];let cursor;do{const result=await request('GET',`${root}?sort=fullName&dir=${dir}&limit=2${cursor?'&cursor='+encodeURIComponent(cursor):''}`);assert.equal(result.statusCode,200,result.body);const page=result.json();assert.equal(page.page.total,8);ids.push(...page.data.map(r=>r.id));cursor=page.page.nextCursor;}while(cursor);assert.equal(new Set(ids).size,8);assert.deepEqual(new Set(ids),new Set(students.map(s=>s.id)));}
  const folded=await request('GET',root+'?q=dang');assert.equal(folded.statusCode,200,folded.body);assert.equal(folded.json().page.total,2);assert.equal(folded.json().data.find(s=>s.id===students[0].id).guardianCount,1);
  const literal=await request('GET',root+'?q='+encodeURIComponent('%_'));assert.equal(literal.statusCode,200,literal.body);assert.equal(literal.json().page.total,1);assert.equal(literal.json().data[0].fullName,names.at(-1));
  const ids=await request('GET',root+'/ids?q=dang&guardian=unverified');assert.equal(ids.statusCode,200,ids.body);assert.equal(ids.json().page.total,2);for(const row of ids.json().data)assert.deepEqual(Object.keys(row),['id']);
  const first=await request('GET',root+'?limit=1'),cursor=first.json().page.nextCursor;assert.ok(cursor);assert.equal((await request('GET',root+'?limit=1&q=dang&cursor='+encodeURIComponent(cursor))).statusCode,422);
  assert.equal((await request('GET',root+'?classId='+classA)).statusCode,404);assert.equal((await request('GET',root+'?yearId='+seedId('year:A'))).statusCode,404);assert.equal((await request('GET',root+'?sort=phone')).statusCode,422);
});

test('B6 native student projections separate school roster authority from family, note and link authority in the same session',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{dateOfBirth:'2011-09-30',gender:'Nữ',initialGuardian:{fullName:'Liên hệ riêng giả',relationshipLabel:'Mẹ',phone:'0912222222'}});
  await db.transaction(tx=>tx.query("UPDATE app.students SET internal_note='Ghi chú riêng của gia đình giả' WHERE school_id=$1 AND id=$2",[f.schoolId,p.id]),{schoolId:f.schoolId});
  const read=await f.role([{action:'student.read',scopes:['SCHOOL']}]);await f.grant(f.target,read.id);const privateRole=await f.role([{action:'guardian.read',scopes:['SCHOOL']}]),linkRole=await f.role([{action:'parent_access.manage',scopes:['SCHOOL']}]);
  const privateGrant=await f.grant(f.target,privateRole.id),linkGrant=await f.grant(f.target,linkRole.id);jar.delete('edu_staff');await login('teacher-a@example.invalid');
  const root=`/api/v1/schools/${f.schoolId}`,url=root+`/students/${p.id}/details`;let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.relationships[0].guardian.phone,'0912222222');assert.equal(response.json().data.internalNote,'Ghi chú riêng của gia đình giả');assert.deepEqual(response.json().data.links,[]);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=ANY($2::uuid[])',[f.schoolId,[privateGrant.id,linkGrant.id]]),{schoolId:f.schoolId});
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);const v=response.json().data;assert.equal(v.student.dateOfBirth,'2011-09-30');assert.equal(v.perms.seeBirthDate,true);assert.equal(v.relationships,null);assert.equal(v.links,null);assert.equal(v.accessLog,null);assert.equal(v.internalNote,null);assert.equal(v.perms.seeInternalNote,false);assert.equal(response.body.includes('Liên hệ riêng giả'),false);assert.equal(response.body.includes('0912222222'),false);
  response=await request('GET',root+'/student-directory');assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data[0].guardianCount,null);assert.equal(response.json().data[0].activeLinks,null);
  const summary=await request('GET',root+'/student-directory-summary');assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.kpi.unverified,null);assert.equal(summary.json().data.kpi.activeLinks,null);
  assert.equal((await request('GET',root+'/student-directory?guardian=unverified')).statusCode,403);assert.equal((await request('GET',root+'/student-directory/ids?guardian=unverified')).statusCode,403);
  assert.equal((await request('GET',root+`/students/${seedId('student:A:1')}/details`)).statusCode,404);
});

test('B6 archived student history uses an explicit included date and stored group, position and teacher sources',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f),y=Number(f.today.slice(0,4)),lo=`${y-2}-01-01`,hi=`${y-1}-01-01`;
  const past=await db.transaction(async tx=>{
    await tx.query("UPDATE app.memberships SET work_display_name='Giáo viên lịch sử nguồn giả' WHERE school_id=$1 AND id=$2",[f.schoolId,f.target]);
    const year=(await tx.query("INSERT INTO app.academic_years(school_id,code,name,starts_on,ends_on,status) VALUES($1,'PAST','Năm nguồn lưu trữ giả',$2,$3,'ARCHIVED') RETURNING id",[f.schoolId,lo,hi])).rows[0].id;
    const grade=(await tx.query('SELECT grade_level_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId])).rows[0].grade_level_id;
    const cls=(await tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,status) VALUES($1,$2,$3,'PAST','Lớp lịch sử nguồn giả','ARCHIVED') RETURNING id",[f.schoolId,year,grade])).rows[0].id;
    const enrollment=(await tx.query("INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on,ends_on,status) VALUES($1,$2,$3,$4,$5,$6,'ENDED') RETURNING id",[f.schoolId,p.id,cls,year,lo,hi])).rows[0].id;
    const group=(await tx.query("INSERT INTO app.class_groups(school_id,class_id,name) VALUES($1,$2,'Tổ lịch sử nguồn giả') RETURNING id",[f.schoolId,cls])).rows[0].id;
    await tx.query('INSERT INTO app.group_memberships(school_id,class_id,group_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)',[f.schoolId,cls,group,enrollment,lo,hi]);
    const position=(await tx.query("INSERT INTO app.class_positions(school_id,class_id,code,name) VALUES($1,$2,'PAST','Lớp trưởng lịch sử giả') RETURNING id",[f.schoolId,cls])).rows[0].id;
    await tx.query('INSERT INTO app.position_assignments(school_id,class_id,position_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)',[f.schoolId,cls,position,enrollment,lo,hi]);
    await tx.query('UPDATE app.class_groups SET sort_order=2 WHERE school_id=$1 AND id=$2',[f.schoolId,group]);
    await tx.query("UPDATE app.class_positions SET name='Lớp trưởng lịch sử đã đổi tên giả' WHERE school_id=$1 AND id=$2",[f.schoolId,position]);
    const role=(await tx.query("SELECT id FROM app.roles WHERE school_id=$1 AND code='HOMEROOM'",[f.schoolId])).rows[0].id;
    const grant=(await tx.query("INSERT INTO app.role_grants(school_id,member_id,role_id,scope_type,class_id,valid_from,valid_until,granted_by) VALUES($1,$2,$3,'CLASS',$4,$5,$6,$7) RETURNING id",[f.schoolId,f.target,role,cls,lo+'T00:00:00Z',hi+'T00:00:00Z',seedId('user:admin-a')])).rows[0].id;
    await tx.query("INSERT INTO app.teaching_assignments(school_id,member_id,class_id,role_grant_id,kind,starts_on,ends_on) VALUES($1,$2,$3,$4,'HOMEROOM',$5,$6)",[f.schoolId,f.target,cls,grant,lo,hi]);
    return {year,cls,enrollment,group,position};
  },{schoolId:f.schoolId});
  const root=`/api/v1/schools/${f.schoolId}`,reference=nextDate(hi,-1),list=await request('GET',root+'/student-directory?yearId='+past.year);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().page.total,1);assert.equal(list.json().data[0].classId,past.cls);assert.equal(list.json().data[0].enrollmentInEffect,true);
  const response=await request('GET',root+`/students/${p.id}/details?yearId=${past.year}`);assert.equal(response.statusCode,200,response.body);const v=response.json().data;assert.equal(v.referenceDate,reference);assert.equal(v.selectedEnrollment.id,past.enrollment);assert.equal(v.selectedEnrollment.inEffect,true);assert.equal(v.group.id,past.group);assert.equal(v.positions[0].id,past.position);assert.equal(v.selectedEnrollment.homeroomName,'Giáo viên lịch sử nguồn giả');assert.equal(v.history.length,2);assert.equal(v.student.gender,null);
  const summary=await request('GET',root+'/student-directory-summary?yearId='+past.year);assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.referenceDate,reference);assert.equal(summary.json().data.classes[0].status,'ARCHIVED');
  const byClass=await request('GET',root+`/students/${p.id}/details?classId=${past.cls}`);assert.equal(byClass.statusCode,200,byClass.body);assert.equal(byClass.json().data.year.id,past.year);assert.equal(byClass.json().data.referenceDate,reference);assert.equal(byClass.json().data.group.version,2);assert.equal(byClass.json().data.group.assignmentVersion,1);assert.equal(byClass.json().data.positions[0].version,2);assert.equal(byClass.json().data.positions[0].assignmentVersion,1);
  jar.delete('edu_staff');await login('teacher-a@example.invalid');assert.equal((await request('GET',root+`/students/${p.id}/details?classId=${past.cls}&yearId=${past.year}`)).statusCode,403);
});

test('B6 subject pupil projection remains minimal and class history cannot retain family access after enrollment ends',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{startsOn:nextDate(f.today,-1),dateOfBirth:'2011-09-30',gender:'Nam',initialGuardian:{fullName:'Liên hệ lớp cũ giả',relationshipLabel:'Mẹ',phone:'0912222222'}}),future=await nativePupil(f,{startsOn:nextDate(f.today,1),fullName:'Học sinh chưa đến lớp giả'});
  const subject=(await db.transaction(tx=>tx.query("INSERT INTO app.subjects(school_id,code,name) VALUES($1,'MINIMAL','Môn đọc tối thiểu giả') RETURNING id",[f.schoolId]),{schoolId:f.schoolId})).rows[0].id;
  const reader=await f.role([{action:'student.read',scopes:['SUBJECT']}]);await f.grant(f.target,reader.id,{scopeType:'SUBJECT',classId:f.classId,subjectId:subject});
  const classReader=await f.role([{action:'student.read',scopes:['CLASS']},{action:'guardian.read',scopes:['CLASS']}]);await f.grant(f.other,classReader.id,{scopeType:'CLASS',classId:f.classId});
  const root=`/api/v1/schools/${f.schoolId}`,url=root+`/students/${p.id}/details?classId=${f.classId}`;jar.delete('edu_staff');await login('teacher-a@example.invalid');let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let v=response.json().data;assert.equal(v.level,'SUBJECT_MINIMAL');assert.equal(v.student.dateOfBirth,null);assert.equal(v.student.gender,'Nam');assert.equal(v.relationships,null);assert.equal(v.positions,null);assert.equal(v.internalNote,null);assert.equal(response.body.includes('0912222222'),false);
  assert.equal((await request('GET',root+'/student-directory')).statusCode,403);assert.equal((await request('GET',root+`/students/${future.id}/details?classId=${f.classId}`)).statusCode,404);
  jar.delete('edu_staff');await login('teacher-b@example.invalid');response=await request('GET',url);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.relationships[0].guardian.fullName,'Liên hệ lớp cũ giả');
  await db.transaction(async tx=>{await tx.query('UPDATE app.enrollments SET ends_on=$3,status=\'ENDED\' WHERE school_id=$1 AND id=$2',[f.schoolId,p.initialEnrollment.id,f.today]);await tx.query("UPDATE app.students SET internal_note='Ghi chú sau khi chuyển lớp giả' WHERE school_id=$1 AND id=$2",[f.schoolId,p.id]);},{schoolId:f.schoolId});
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);v=response.json().data;assert.equal(v.level,'FULL');assert.equal(v.selectedEnrollment.inEffect,false);assert.equal(v.relationships,null);assert.equal(v.student.dateOfBirth,null);assert.equal(v.perms.seeGuardians,false);assert.equal(v.internalNote,null);assert.equal(response.body.includes('Liên hệ lớp cũ giả'),false);
});

test('B6 pupil link metadata reflects real events, bounded recent history and revocation without returning reusable secrets',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{initialGuardian:{fullName:'Giám hộ mở link giả',relationshipLabel:'Mẹ',phone:'0912222222'}}),rel=p.initialRelationship;
  const verified=await f.post(`relationships/${rel.id}/verify`,{expectedVersion:rel.version,canReceiveInfo:true,verificationNote:'Đã xác minh quan hệ của fixture giả'});assert.equal(verified.statusCode,200,verified.body);
  const issued=await f.post('parent-access',{studentId:p.id,yearId:p.initialEnrollment.yearId,relationshipId:rel.id,allowedSections:['overview','teachers'],allowDownload:false,expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(issued.statusCode,201,issued.body);const access=issued.json().data.access,token=issued.json().data.link.split('#token=')[1];assert.ok(token);
  await db.transaction(async tx=>{for(let i=0;i<103;i++)await tx.query("INSERT INTO app.parent_access_events(school_id,access_link_id,event_kind,request_id,device_summary,created_at) VALUES($1,$2,$3,$4,'Thiết bị tổng hợp giả',now()-($5::text||' seconds')::interval)",[f.schoolId,access.id,i===0?'STAFF_PREVIEW':i===1?'EXCHANGED':'READ',crypto.randomUUID(),i]);},{schoolId:f.schoolId});
  const root=`/api/v1/schools/${f.schoolId}`,url=root+`/students/${p.id}/details`;let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let v=response.json().data;assert.equal(v.links[0].opens,102);assert.ok(v.links[0].lastOpenedAt);assert.equal(v.links[0].status,'ACTIVE');assert.equal(v.accessLog.length,100);assert.equal(v.accessLogHasMore,true);assert.equal(v.accessLog[0].eventKind,'STAFF_PREVIEW');assert.equal(response.body.includes(token),false);for(const key of ['tokenHash','token','link','ipDailyHash','requestId'])assert.equal(Object.hasOwn(v.links[0],key),false);
  let summary=await request('GET',root+'/student-directory-summary');assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.kpi.activeLinks,1);assert.equal(summary.json().data.kpi.unverified,0);
  const revoked=await f.post(`parent-access/${access.id}/revoke`,{expectedVersion:access.version,reason:'Thu hồi link giả để kiểm tra hồ sơ'});assert.equal(revoked.statusCode,200,revoked.body);
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);v=response.json().data;assert.equal(v.links[0].status,'REVOKED');assert.equal(v.links[0].opens,102);assert.ok(v.links[0].revokedAt);assert.equal(v.links[0].revokeReason,'Thu hồi link giả để kiểm tra hồ sơ');summary=await request('GET',root+'/student-directory-summary');assert.equal(summary.json().data.kpi.activeLinks,0);
});

test('B6 an unconfigured school directory returns actual null year context without fabricated class or student data',async()=>{
  const schoolId=await operationalUiSchool();jar.delete('edu_staff');await login('admin-a@example.invalid');const root=`/api/v1/schools/${schoolId}/student-directory`;
  const summary=await request('GET',root+'-summary');assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.year,null);assert.equal(summary.json().data.referenceDate,null);assert.deepEqual(summary.json().data.years,[]);assert.deepEqual(summary.json().data.classes,[]);assert.deepEqual(summary.json().data.kpi,{students:0,studying:0,unverified:0,activeLinks:0});
  for(const path of [root,root+'/ids']){const response=await request('GET',path);assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().data,[]);assert.equal(response.json().page.total,0);}
});

test('B6 verified family counters remain verified when receiving permission is explicitly disabled',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{initialGuardian:{fullName:'Giám hộ không nhận thông tin giả',relationshipLabel:'Mẹ',phone:'0912222222'}}),relationship=p.initialRelationship;
  const verified=await f.post(`relationships/${relationship.id}/verify`,{expectedVersion:relationship.version,canReceiveInfo:false,verificationNote:'Đã xác minh nhưng không cho nhận thông tin'});assert.equal(verified.statusCode,200,verified.body);assert.equal(verified.json().data.status,'VERIFIED');assert.equal(verified.json().data.canReceiveInfo,false);
  const root=`/api/v1/schools/${f.schoolId}/student-directory`,response=await request('GET',root);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data[0].verifiedGuardians,1);assert.equal(response.json().data[0].activeLinks,0);
  const unverified=await request('GET',root+'?guardian=unverified');assert.equal(unverified.statusCode,200,unverified.body);assert.equal(unverified.json().page.total,0);const summary=await request('GET',root+'-summary');assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().data.kpi.unverified,0);assert.equal(summary.json().data.kpi.activeLinks,0);
});

async function guardianFixture(){
  const f=await staffUiFixture(),p=await nativePupil(f,{fullName:'Học sinh lớp thứ nhất giả',startsOn:nextDate(f.today,-1),dateOfBirth:'2011-09-30',initialGuardian:{fullName:'Đặng Giám hộ chung giả',relationshipLabel:'Mẹ',phone:'0912222222'}});
  const secondClass=(await db.transaction(tx=>tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity,status) SELECT school_id,year_id,grade_level_id,'OTHER','Lớp thứ hai giả',10,'ACTIVE' FROM app.classes WHERE school_id=$1 AND id=$2 RETURNING id",[f.schoolId,f.classId]),{schoolId:f.schoolId})).rows[0].id;
  const second=await nativePupil(f,{fullName:'Học sinh bí mật lớp thứ hai giả',studentCode:'OTHER-PRIVATE',initialClassId:secondClass}),related=await f.post('relationships',{studentId:second.id,guardianId:p.initialGuardian.id,relationshipLabel:'Mẹ',isPrimary:false});assert.equal(related.statusCode,201,related.body);
  return {...f,p,second,secondClass,secondRelationship:related.json().data,guardianId:p.initialGuardian.id,root:`/api/v1/schools/${f.schoolId}`};
}

async function guardianFormFor(f,studentId,relationshipId){
  const response=await request('GET',`/api/v1/schools/${f.schoolId}/students/${studentId}/guardian-form`+(relationshipId?`?relationshipId=${relationshipId}`:''));assert.equal(response.statusCode,200,response.body);return response.json().data;
}
function guardianSaveInput(form,patch={}){
  return {expectedStudentVersion:form.student.version,expectedPrimaryContacts:form.primaryContacts,fullName:form.target?.guardian.fullName??'Giám hộ mới giả',relationshipLabel:form.target?.relationship.relationshipLabel??'Bố',email:form.target?.guardian.email??null,isPrimary:true,
    ...(form.target?{guardianId:form.target.guardian.id,relationshipId:form.target.relationship.id,expectedGuardianVersion:form.target.guardian.version,expectedRelationshipVersion:form.target.relationship.version}:{phone:'0915555555'}),...patch};
}
test('B6 atomic guardian save creates unverified contacts, replays one receipt and prevents duplicate new commands',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f),form=await guardianFormFor(f,p.id),path=`students/${p.id}/guardians/save`,body=guardianSaveInput(form),key=crypto.randomUUID();
  const response=await f.post(path,body,key);assert.equal(response.statusCode,201,response.body);const saved=response.json().data;assert.equal(saved.relationship.status,'UNVERIFIED');assert.equal(saved.relationship.canReceiveInfo,false);assert.equal(saved.guardian.phone,body.phone);assert.equal(saved.studentVersion,form.student.version+1);
  const replay=await f.post(path,body,key);assert.equal(replay.statusCode,201,replay.body);assert.deepEqual(replay.json().data,saved);
  const duplicate=await f.post(path,body);assert.equal(duplicate.statusCode,409,duplicate.body);assert.equal(duplicate.json().code,'VERSION_CONFLICT');
  const fresh=await guardianFormFor(f,p.id),samePhone=await f.post(path,guardianSaveInput(fresh,{fullName:'Liên hệ cùng số khác giả'}));assert.equal(samePhone.statusCode,201,samePhone.body);assert.notEqual(samePhone.json().data.guardian.id,saved.guardian.id);
  const rows=(await db.transaction(tx=>tx.query('SELECT guardian_id,is_primary,status,can_receive_info FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2',[f.schoolId,p.id]),{schoolId:f.schoolId})).rows;assert.equal(rows.length,2);assert.equal(rows.filter(row=>row.is_primary).length,1);assert.ok(rows.every(row=>row.status==='UNVERIFIED'&&!row.can_receive_info));
});
test('B6 atomic guardian save serializes competing displayed student versions',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f),form=await guardianFormFor(f,p.id),path=`students/${p.id}/guardians/save`,body=guardianSaveInput(form);
  const responses=await Promise.all([f.post(path,body),f.post(path,{...body,fullName:'Giám hộ cạnh tranh giả'})]);assert.deepEqual(responses.map(row=>row.statusCode).sort(),[201,409]);
  const actual=(await db.transaction(tx=>tx.query('SELECT count(*)::int AS count FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2',[f.schoolId,p.id]),{schoolId:f.schoolId})).rows[0];assert.equal(actual.count,1);
});
test('B6 guardian form grants class family authority without student read or unscoped sibling data',async()=>{
  const f=await guardianFixture(),role=await f.role([{action:'guardian.read',scopes:['CLASS']},{action:'guardian.manage',scopes:['CLASS']}]),grant=await f.grant(f.target,role.id,{scopeType:'CLASS',classId:f.classId});
  jar.delete('edu_staff');f.setCsrf(await login('teacher-a@example.invalid'));const form=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id);assert.equal(form.target.canEditContact,false);assert.deepEqual(Object.keys(form.student).sort(),['code','id','name','version']);assert.equal(JSON.stringify(form).includes(f.second.id),false);
  const path=`students/${f.p.id}/guardians/save`,body=guardianSaveInput(form,{relationshipLabel:'Người giám hộ'}),key=crypto.randomUUID();let response=await f.post(path,body,key);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.guardian.version,form.target.guardian.version);assert.equal(response.json().data.relationship.status,'UNVERIFIED');
  assert.equal((await request('GET',f.root+`/students/${f.p.id}/details`)).statusCode,403);assert.equal((await request('GET',f.root+`/students/${f.p.id}/guardian-form?relationshipId=${f.secondRelationship.id}`)).statusCode,404);
  const updated=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id);response=await f.post(path,guardianSaveInput(updated,{fullName:'Tên liên hệ dùng chung đã đổi giả'}));assert.equal(response.statusCode,403,response.body);assert.equal(response.json().code,'SHARED_GUARDIAN_SCOPE');
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id]),{schoolId:f.schoolId});response=await f.post(path,body,key);assert.equal(response.statusCode,403,response.body);
});
test('B6 atomic guardian edits preserve verified receiving choices and reject stale contact versions without partial priority changes',async()=>{
  const f=await guardianFixture(),rel=f.p.initialRelationship;const verified=await f.post(`relationships/${rel.id}/verify`,{expectedVersion:rel.version,canReceiveInfo:false,verificationNote:'Đã đối chiếu nguồn giả'});assert.equal(verified.statusCode,200,verified.body);
  const form=await guardianFormFor(f,f.p.id,rel.id),path=`students/${f.p.id}/guardians/save`,saved=await f.post(path,guardianSaveInput(form,{fullName:'Tên liên hệ cập nhật giả',phone:'0916666666',email:'guardian@example.invalid',relationshipLabel:'Người giám hộ',isPrimary:false}));assert.equal(saved.statusCode,200,saved.body);const actual=saved.json().data;assert.equal(actual.relationship.status,'VERIFIED');assert.equal(actual.relationship.canReceiveInfo,false);assert.equal(actual.relationship.verifiedAt,form.target.relationship.verifiedAt);assert.equal(actual.guardian.version,form.target.guardian.version+1);
  const fresh=await guardianFormFor(f,f.p.id,rel.id),body=guardianSaveInput(fresh,{expectedGuardianVersion:form.target.guardian.version,phone:'0917777777'}),failed=await f.post(path,body);assert.equal(failed.statusCode,409,failed.body);const after=await guardianFormFor(f,f.p.id,rel.id);assert.deepEqual(after,fresh);
});
test('B6 guardian save detects independently changed primary references and preserves every row on failure',async()=>{
  const f=await guardianFixture(),form=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id),other=await f.post('guardians',{fullName:'Liên hệ ưu tiên khác giả',phone:'0918888888'});assert.equal(other.statusCode,201,other.body);
  const primary=await f.post('relationships',{studentId:f.p.id,guardianId:other.json().data.id,relationshipLabel:'Bố',isPrimary:true});assert.equal(primary.statusCode,201,primary.body);const before=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id);assert.equal(before.student.version,form.student.version);assert.deepEqual(before.primaryContacts,[{id:primary.json().data.id,version:primary.json().data.version}]);assert.equal(before.target.relationship.version,form.target.relationship.version+1);assert.equal(before.target.relationship.isPrimary,false);
  const failed=await f.post(`students/${f.p.id}/guardians/save`,guardianSaveInput(form,{phone:'0917777777'}));assert.equal(failed.statusCode,409,failed.body);assert.equal(failed.json().code,'GUARDIAN_PRIMARY_CHANGED');assert.deepEqual(await guardianFormFor(f,f.p.id,f.p.initialRelationship.id),before);
});
test('B6 guardian save rejects masked phones, foreign pairings and mutation of archived contacts',async()=>{
  const f=await guardianFixture(),form=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id),path=`students/${f.p.id}/guardians/save`,body=guardianSaveInput(form);
  for(const patch of [{phone:'0912 *** 222'},{expectedGuardianVersion:undefined},{actorId:f.target},{canReceiveInfo:true}]){const failed=await f.post(path,{...body,...patch});assert.equal(failed.statusCode,422,failed.body);}
  const foreign=await f.post(path,{...body,relationshipId:f.secondRelationship.id});assert.equal(foreign.statusCode,404,foreign.body);assert.deepEqual(await guardianFormFor(f,f.p.id,f.p.initialRelationship.id),form);
  await db.transaction(tx=>tx.query("UPDATE app.guardians SET status='ARCHIVED' WHERE school_id=$1 AND id=$2",[f.schoolId,f.guardianId]),{schoolId:f.schoolId});const archived=await f.post(path,body);assert.equal(archived.statusCode,409,archived.body);assert.equal(archived.json().code,'GUARDIAN_ARCHIVED');
});
test('B6 guardian form and cached saves recheck enrollment end and grant expiry in the same session',async()=>{
  const f=await guardianFixture(),role=await f.role([{action:'guardian.read',scopes:['CLASS']},{action:'guardian.manage',scopes:['CLASS']}]),grant=await f.grant(f.target,role.id,{scopeType:'CLASS',classId:f.classId});jar.delete('edu_staff');f.setCsrf(await login('teacher-a@example.invalid'));
  const form=await guardianFormFor(f,f.p.id,f.p.initialRelationship.id),path=`students/${f.p.id}/guardians/save`,body=guardianSaveInput(form),key=crypto.randomUUID(),saved=await f.post(path,body,key);assert.equal(saved.statusCode,200,saved.body);
  await db.transaction(tx=>tx.query("UPDATE app.enrollments SET ends_on=$3,status='ENDED' WHERE school_id=$1 AND id=$2",[f.schoolId,f.p.initialEnrollment.id,f.today]),{schoolId:f.schoolId});assert.equal((await request('GET',f.root+`/students/${f.p.id}/guardian-form`)).statusCode,404);assert.equal((await f.post(path,body,key)).statusCode,404);
  await db.transaction(async tx=>{await tx.query("UPDATE app.enrollments SET ends_on=NULL,status='ACTIVE' WHERE school_id=$1 AND id=$2",[f.schoolId,f.p.initialEnrollment.id]);await tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id,new Date(Date.now()-1).toISOString()]);},{schoolId:f.schoolId});assert.equal((await request('GET',f.root+`/students/${f.p.id}/guardian-form`)).statusCode,403);assert.equal((await f.post(path,body,key)).statusCode,403);
});
test('B6 atomic guardian save rolls back contacts, relationships, primary changes, audit and receipt after a real SQL fault',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{initialGuardian:{fullName:'Liên hệ ưu tiên nguồn giả',relationshipLabel:'Mẹ',phone:'0912222222'}}),form=await guardianFormFor(f,p.id),body=guardianSaveInput(form),path=`students/${p.id}/guardians/save`,key=crypto.randomUUID();
  const snapshot=()=>db.transaction(async tx=>{const result={};for(const table of ['guardians','guardian_relationships','students','audit_events','idempotency_keys'])result[table]=(await tx.query(`SELECT count(*)::int AS count FROM app.${table} WHERE school_id=$1`,[f.schoolId])).rows[0].count;return result;},{schoolId:f.schoolId}),before=await snapshot(),original=db.transaction;let injected=false;
  db.transaction=function(fn,context){return original.call(this,async tx=>{const query=tx.query;tx.query=function(sql,...args){if(typeof sql==='string'&&sql.startsWith('UPDATE app.students SET updated_at=now()')&&args[0]?.[0]===f.schoolId&&args[0]?.[1]===p.id){injected=true;return query.call(this,'SELECT $1::uuid',['injected-invalid-uuid']);}return query.call(this,sql,...args);};try{return await fn(tx);}finally{tx.query=query;}},context);};
  try{const failed=await f.post(path,body,key);assert.equal(failed.statusCode,422,failed.body);assert.equal(failed.json().code,'VALIDATION_ERROR');assert.equal(injected,true);}finally{db.transaction=original;}
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await guardianFormFor(f,p.id),form);const retry=await f.post(path,body,key);assert.equal(retry.statusCode,201,retry.body);assert.equal(retry.json().data.relationship.status,'UNVERIFIED');
});

test('B6 school guardian directory uses SQL folded search, literal wildcards, signed keysets and independent link counters',async()=>{
  const f=await guardianFixture();await nativePupil(f,{fullName:'Học sinh có dấu phần trăm giả',initialGuardian:{fullName:'Tên %_ giám hộ giả',relationshipLabel:'Bố',phone:'0913333333'}});
  const reader=await f.role([{action:'guardian.read',scopes:['SCHOOL']}]);await f.grant(f.target,reader.id);jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=f.root+'/guardian-directory';
  let response=await request('GET',url+'?limit=1&sort=fullName');assert.equal(response.statusCode,200,response.body);const first=response.json();assert.equal(first.page.total,2);assert.ok(first.page.nextCursor);assert.equal(first.data[0].activeLinks,null);
  const second=await request('GET',url+'?limit=1&sort=fullName&cursor='+encodeURIComponent(first.page.nextCursor));assert.equal(second.statusCode,200,second.body);assert.notEqual(second.json().data[0].id,first.data[0].id);
  const changed=await request('GET',url+'?q=other&cursor='+encodeURIComponent(first.page.nextCursor));assert.equal(changed.statusCode,422,changed.body);
  for(const q of ['dang','OTHER-PRIVATE','Học sinh bí mật lớp thứ hai giả']){response=await request('GET',url+'?q='+encodeURIComponent(q));assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,1);assert.equal(response.json().data[0].id,f.guardianId);assert.equal(response.json().data[0].students.length,2);for(const row of response.json().data[0].students)assert.equal(Object.hasOwn(row,'dateOfBirth'),false);}
  response=await request('GET',url+'?q='+encodeURIComponent('%_'));assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,1);assert.equal(response.json().data[0].fullName,'Tên %_ giám hộ giả');
  const summary=await request('GET',f.root+'/guardian-directory-summary');assert.equal(summary.statusCode,200,summary.body);assert.deepEqual(summary.json().data,{guardians:2,verified:0,unverified:3,revoked:0,activeLinks:null,canSeeLinks:false,canManage:false,canVerify:false});assert.equal((await request('GET',f.root+'/student-directory')).statusCode,403);
  response=await request('GET',f.root+`/guardians/${f.guardianId}/details`);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.relationships.length,2);assert.equal(response.json().data.history,null);assert.equal(response.json().data.canEditContact,false);assert.equal((await request('GET',f.root+`/guardians/${seedId('guardian:A:1')}/details`)).statusCode,404);
});

test('B6 class guardian reads exclude all unscoped sibling relationships and immediately lose access after enrollment or grant ends',async()=>{
  const f=await guardianFixture(),reader=await f.role([{action:'guardian.read',scopes:['CLASS']}]),grant=await f.grant(f.target,reader.id,{scopeType:'CLASS',classId:f.classId});jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=f.root+`/guardians/${f.guardianId}/details`;
  let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let view=response.json().data;assert.equal(view.relationships.length,1);assert.equal(view.relationships[0].studentId,f.p.id);assert.equal(view.relationships[0].student.classId,f.classId);assert.equal(view.relationships[0].links,null);assert.equal(response.body.includes(f.second.id),false);assert.equal(response.body.includes('OTHER-PRIVATE'),false);assert.equal(view.history,null);
  assert.equal((await request('GET',f.root+'/guardian-directory?q=OTHER-PRIVATE')).statusCode,403);assert.equal((await request('GET',f.root+'/guardian-directory-summary')).statusCode,403);
  await db.transaction(tx=>tx.query('UPDATE app.enrollments SET ends_on=$3,status=\'ENDED\' WHERE school_id=$1 AND id=$2',[f.schoolId,f.p.initialEnrollment.id,f.today]),{schoolId:f.schoolId});response=await request('GET',url);assert.equal(response.statusCode,404,response.body);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id]),{schoolId:f.schoolId});response=await request('GET',url);assert.equal(response.statusCode,403,response.body);
});

test('B6 shared guardian contact edits require management of every affected class and current read authority even for a replay',async()=>{
  const f=await guardianFixture(),role=await f.role([{action:'guardian.read',scopes:['CLASS']},{action:'guardian.manage',scopes:['CLASS']}]);await f.grant(f.target,role.id,{scopeType:'CLASS',classId:f.classId});
  jar.delete('edu_staff');let csrf=await login('teacher-a@example.invalid');const url=f.root+`/guardians/${f.guardianId}`,body={expectedVersion:f.p.initialGuardian.version,phone:'0914444444'};let response=await request('PATCH',url,body,csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(response.statusCode,403,response.body);assert.equal(response.json().code,'SHARED_GUARDIAN_SCOPE');
  let actual=(await db.transaction(tx=>tx.query('SELECT phone,version FROM app.guardians WHERE school_id=$1 AND id=$2',[f.schoolId,f.guardianId]),{schoolId:f.schoolId})).rows[0];assert.deepEqual(actual,{phone:'0912222222',version:body.expectedVersion});
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const allClasses=await f.grant(f.target,role.id,{scopeType:'CLASS',classId:f.secondClass});assert.ok(allClasses.id);
  jar.delete('edu_staff');csrf=await login('teacher-a@example.invalid');response=await request('GET',url+'/details');assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.canEditContact,true);response=await request('PATCH',url,body,csrf,{'idempotency-key':crypto.randomUUID()});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.phone,body.phone);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const manage=await f.role([{action:'guardian.manage',scopes:['SCHOOL']}]),read=await f.role([{action:'guardian.read',scopes:['SCHOOL']}]);await f.grant(f.other,manage.id);const readGrant=await f.grant(f.other,read.id);
  jar.delete('edu_staff');csrf=await login('teacher-b@example.invalid');actual=(await request('GET',url)).json().data;const update={expectedVersion:actual.version,fullName:'Liên hệ trường đã sửa giả'},key=crypto.randomUUID();response=await request('PATCH',url,update,csrf,{'idempotency-key':key});assert.equal(response.statusCode,200,response.body);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,readGrant.id]),{schoolId:f.schoolId});response=await request('PATCH',url,update,csrf,{'idempotency-key':key});assert.equal(response.statusCode,403,response.body);assert.equal(response.body.includes(body.phone),false);
});

test('B6 guardian profile exposes real verification and revocation metadata but removes link and audit panels when their separate rights end',async()=>{
  const f=await guardianFixture(),rel=f.p.initialRelationship,note='Đã đối chiếu hồ sơ giám hộ giả',verified=await f.post(`relationships/${rel.id}/verify`,{expectedVersion:rel.version,canReceiveInfo:true,verificationNote:note});assert.equal(verified.statusCode,200,verified.body);
  const issued=await f.post('parent-access',{studentId:f.p.id,yearId:f.p.initialEnrollment.yearId,relationshipId:rel.id,allowedSections:['overview'],allowDownload:false,expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(issued.statusCode,201,issued.body);const link=issued.json().data.access,token=issued.json().data.link.split('#token=')[1];
  await db.transaction(tx=>tx.query("INSERT INTO app.parent_access_events(school_id,access_link_id,event_kind,request_id) VALUES($1,$2,'READ',$3)",[f.schoolId,link.id,crypto.randomUUID()]),{schoolId:f.schoolId});
  const reader=await f.role([{action:'guardian.read',scopes:['SCHOOL']}]),extras=await f.role([{action:'parent_access.manage',scopes:['SCHOOL']},{action:'audit.read',scopes:['SCHOOL']}]);await f.grant(f.target,reader.id);const extraGrant=await f.grant(f.target,extras.id);jar.delete('edu_staff');await login('teacher-a@example.invalid');const url=f.root+`/guardians/${f.guardianId}/details`;let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let view=response.json().data,relationship=view.relationships.find(r=>r.id===rel.id);assert.equal(relationship.verificationNote,note);assert.equal(relationship.verifiedByName,'Quản trị UI giả');assert.equal(relationship.version,verified.json().data.version);assert.equal(relationship.links[0].opens,1);assert.equal(view.canViewHistory,true);assert.ok(view.history.some(e=>e.targetId===rel.id&&e.action==='verifyRelationship'));assert.equal(response.body.includes(token),false);for(const row of view.history)for(const key of ['before','after','redactedAfter','requestId'])assert.equal(Object.hasOwn(row,key),false);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,extraGrant.id]),{schoolId:f.schoolId});response=await request('GET',url);assert.equal(response.statusCode,200,response.body);view=response.json().data;assert.equal(view.canViewHistory,false);assert.equal(view.history,null);assert.equal(view.historyHasMore,null);for(const r of view.relationships){assert.equal(r.links,null);assert.equal(r.canSeeLinks,false);}assert.equal(response.body.includes(link.id),false);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const reason='Thu hồi quan hệ có căn cứ giả',revoked=await f.post(`relationships/${rel.id}/revoke`,{expectedVersion:verified.json().data.version,reason});assert.equal(revoked.statusCode,200,revoked.body);response=await request('GET',url);assert.equal(response.statusCode,200,response.body);relationship=response.json().data.relationships.find(r=>r.id===rel.id);assert.equal(relationship.status,'REVOKED');assert.equal(relationship.revokedReason,reason);assert.equal(relationship.verificationNote,note);assert.equal(relationship.links[0].status,'REVOKED');const summary=await request('GET',f.root+'/guardian-directory-summary');assert.equal(summary.json().data.revoked,1);assert.equal(summary.json().data.activeLinks,0);
});

test('B6 partial student write acknowledgements redact unsubmitted protected fields including stored old receipts',async()=>{
  const f=await staffUiFixture(),p=await nativePupil(f,{dateOfBirth:'2011-09-30',preferredName:'Tên thường gọi riêng giả'}),role=await f.role([{action:'student.manage',scopes:['SCHOOL']}]);await f.grant(f.target,role.id);jar.delete('edu_staff');const csrf=await login('teacher-a@example.invalid'),url=`/api/v1/schools/${f.schoolId}/students/${p.id}`,body={expectedVersion:p.version,gender:'Nữ'},key=crypto.randomUUID();
  let response=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(response.statusCode,200,response.body);for(const field of ['dateOfBirth','preferredName'])assert.equal(Object.hasOwn(response.json().data,field),false);
  await db.transaction(tx=>tx.query("UPDATE app.idempotency_keys SET response_metadata=jsonb_set(jsonb_set(response_metadata,'{data,dateOfBirth}',to_jsonb('2011-09-30'::text)),'{data,preferredName}',to_jsonb('Tên thường gọi riêng giả'::text)) WHERE school_id=$1 AND actor_user_id=$2 AND operation_id='updateStudent'",[f.schoolId,seedId('user:teacher-a')]),{schoolId:f.schoolId});
  response=await request('PATCH',url,body,csrf,{'idempotency-key':key});assert.equal(response.statusCode,200,response.body);for(const field of ['dateOfBirth','preferredName'])assert.equal(Object.hasOwn(response.json().data,field),false);assert.equal(response.body.includes('Tên thường gọi riêng giả'),false);const actual=(await db.transaction(tx=>tx.query('SELECT date_of_birth,preferred_name,version FROM app.students WHERE school_id=$1 AND id=$2',[f.schoolId,p.id]),{schoolId:f.schoolId})).rows[0];assert.equal(actual.date_of_birth,'2011-09-30');assert.equal(actual.preferred_name,'Tên thường gọi riêng giả');assert.equal(actual.version,response.json().data.version);
});

test('B6 bounded school class overview preserves query results, local JIT preference and the five-second runtime timeout',async()=>{
  const f=await staffUiFixture(),service=new DashboardsService(db,policy),c={operation:operations.find(o=>o.id==='getSchoolOverview'),principal:{userId:seedId('user:admin-a')},params:{schoolId:f.schoolId},query:{}};
  await db.transaction(async tx=>{
    const context=await service.context(tx,c);await tx.query("SET LOCAL jit='on'");const before=await schoolClassOverview(tx,context);assert.equal((await tx.query('SHOW jit')).rows[0].jit,'on');assert.equal((await tx.query('SHOW statement_timeout')).rows[0].statement_timeout,'5s');assert.equal(before.stats.total,1);assert.equal(before.preview[0].id,f.classId);
    await tx.query("SET LOCAL jit='off'");assert.deepEqual(await schoolClassOverview(tx,context),before);assert.equal((await tx.query('SHOW jit')).rows[0].jit,'off');
  },{schoolId:f.schoolId,userId:c.principal.userId,readOnly:true});
  await assert.rejects(db.transaction(async tx=>{const context=await service.context(tx,c);await tx.query("SET LOCAL jit='on'");await schoolClassOverview(tx,{...context,year:{...context.year,id:'invalid-uuid'}});},{schoolId:f.schoolId,userId:c.principal.userId,readOnly:true}),error=>error.code==='22P02');
  const actual=await db.app.query('SHOW jit');assert.equal(actual.rows[0].jit,'on');
});


test('B6 native invitation choices require current invitation authority, preserve delegation ceilings and never borrow a role catalog',async()=>{
  const f=await staffUiFixture(),inviter=await f.role([{action:'member.manage',scopes:['SCHOOL']}]),reader=await f.role([{action:'school.read',scopes:['SCHOOL']}]),manager=await f.role([{action:'role.manage',scopes:['SCHOOL']}]),classOnly=await f.role([{action:'student.read',scopes:['CLASS']}]);
  const short=new Date(Date.now()+1800000).toISOString(),long=new Date(Date.now()+3600000).toISOString();
  const inviteGrant=await f.grant(f.target,inviter.id);await f.grant(f.target,reader.id,{validUntil:long});const manageGrant=await f.grant(f.target,manager.id,{validFrom:new Date(Date.now()+60000).toISOString(),validUntil:short});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const base=`/api/v1/schools/${f.schoolId}`,url=`${base}/staff-invitation-options`;
  let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let choices=response.json().data.roles;
  assert.ok(choices.length);assert.ok(choices.every(r=>r.canDelegate===false));assert.ok(!choices.some(r=>r.id===classOnly.id));
  for(const row of choices)assert.deepEqual(Object.keys(row).sort(),['id','version','label','code','systemRole','canDelegate','delegationUntil'].sort());
  assert.equal((await request('GET',`${base}/roles`)).statusCode,403);assert.equal((await request('GET',`${base}/members/${f.other}/details`)).statusCode,403);assert.equal((await request('GET',`${url}?purpose=role-catalog`)).statusCode,422);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/staff-invitation-options`)).statusCode,404);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_from=now()-interval '1 minute' WHERE school_id=$1 AND id=$2",[f.schoolId,manageGrant.id]),{schoolId:f.schoolId});
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);choices=response.json().data.roles;const choice=choices.find(r=>r.id===reader.id);assert.equal(choice.canDelegate,true);assert.equal(choice.delegationUntil,short);assert.equal(choices.find(r=>r.id===f.adminRole).canDelegate,false);
  for(const sql of ["UPDATE app.role_grants SET valid_from=now()+interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_until=NULL,revoked_at=now() WHERE school_id=$1 AND id=$2"]){await db.transaction(tx=>tx.query(sql,[f.schoolId,inviteGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);}
});

test('B6 native staff activity is SQL-bounded to staff targets, rechecks audit authority and keeps foreign and family records out',async()=>{
  const f=await staffUiFixture(),auditRole=await f.role([{action:'audit.read',scopes:['SCHOOL']}]),grant=await f.grant(f.target,auditRole.id),action=`staff-activity-${crypto.randomUUID()}`,ids=[];
  for(const [schoolId,targetType]of [[f.schoolId,'member'],[f.schoolId,'student'],[schoolB,'member']]){
    const id=crypto.randomUUID();ids.push(id);await db.transaction(tx=>tx.query("INSERT INTO app.audit_events(id,school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_after) VALUES($1,$2,$3,'STAFF',$4,$5,$1,$6,$7)",[id,schoolId,seedId('user:admin-a'),action,targetType,crypto.randomUUID(),{status:'ACTIVE',unknownPrivate:'must-not-expose'}]),{schoolId});
  }
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const base=`/api/v1/schools/${f.schoolId}`,url=`${base}/staff-activity?action=${encodeURIComponent(action)}&limit=1`;
  const response=await request('GET',url);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,1);assert.deepEqual(response.json().data.map(r=>r.id),[ids[0]]);assert.equal(response.body.includes('must-not-expose'),false);assert.equal(response.json().page.hasMore,false);
  assert.equal((await request('GET',`${base}/members/${f.other}/details`)).statusCode,403);assert.equal((await request('GET',`${url}&targetType=student`)).statusCode,422);assert.equal((await request('GET',`${url}&actorId=${seedId('user:admin-a')}`)).statusCode,422);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/staff-activity`)).statusCode,404);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,grant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);
});

test('B6 student-create choices use current class write authority without borrowing roster, year or class readers',async()=>{
  const f=await staffUiFixture(),write=await f.role([{action:'student.manage',scopes:['CLASS']}]),family=await f.role([{action:'guardian.manage',scopes:['CLASS']}]);
  const studentGrant=await f.grant(f.target,write.id,{scopeType:'CLASS',classId:f.classId}),guardianGrant=await f.grant(f.target,family.id,{scopeType:'CLASS',classId:f.classId,validFrom:new Date(Date.now()+60000).toISOString()});
  const schoolWrite=await f.role([{action:'student.manage',scopes:['SCHOOL']}]),schoolGrant=await f.grant(f.target,schoolWrite.id,{validFrom:new Date(Date.now()+60000).toISOString()});
  const extra=await db.transaction(async tx=>{
    const row=(await tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity,status) SELECT school_id,year_id,grade_level_id,'OTHER','Lớp ngoài phạm vi giả',10,'ACTIVE' FROM app.classes WHERE school_id=$1 AND id=$2 RETURNING id",[f.schoolId,f.classId])).rows[0];
    return row.id;
  },{schoolId:f.schoolId});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');const base=`/api/v1/schools/${f.schoolId}`,url=`${base}/student-create-options`;
  let response=await request('GET',url);assert.equal(response.statusCode,200,response.body);let view=response.json().data;
  assert.equal(view.today,f.today);assert.deepEqual(view.classes.map(c=>c.id),[f.classId]);assert.equal(view.classes[0].canAddGuardian,false);assert.ok(!view.classes.some(c=>c.id===extra));
  assert.deepEqual(Object.keys(view.classes[0]).sort(),['id','version','name','status','yearId','yearName','yearStartsOn','yearEndsOn','canAddGuardian'].sort());
  assert.equal((await request('GET',`${base}/classes`)).statusCode,403);assert.equal((await request('GET',`${base}/student-directory-summary`)).statusCode,403);assert.equal((await request('GET',`${base}/academic-years`)).statusCode,403);
  assert.equal((await request('GET',`${url}?classId=${extra}`)).statusCode,422);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/student-create-options`)).statusCode,404);
  response=await request('GET',`${url}?yearId=${view.classes[0].yearId}`);assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().data.classes.map(c=>c.id),[f.classId]);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_from=now()-interval '1 minute' WHERE school_id=$1 AND id=$2",[f.schoolId,guardianGrant.id]),{schoolId:f.schoolId});
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);view=response.json().data;assert.equal(view.classes[0].canAddGuardian,true);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_from=now()-interval '1 minute' WHERE school_id=$1 AND id=$2",[f.schoolId,schoolGrant.id]),{schoolId:f.schoolId});
  response=await request('GET',url);assert.equal(response.statusCode,200,response.body);view=response.json().data;assert.deepEqual(new Set(view.classes.map(c=>c.id)),new Set([f.classId,extra]));assert.equal(view.classes.find(c=>c.id===f.classId).canAddGuardian,true);assert.equal(view.classes.find(c=>c.id===extra).canAddGuardian,false);
  assert.equal((await request('GET',`${base}/classes`)).statusCode,403);assert.equal((await request('GET',`${base}/student-directory-summary`)).statusCode,403);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,schoolGrant.id]),{schoolId:f.schoolId});
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,guardianGrant.id]),{schoolId:f.schoolId});response=await request('GET',url);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.classes[0].canAddGuardian,false);
  for(const sql of ["UPDATE app.role_grants SET valid_from=now()+interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_until=NULL,revoked_at=now() WHERE school_id=$1 AND id=$2"]){await db.transaction(tx=>tx.query(sql,[f.schoolId,studentGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',url)).statusCode,403);}
});

async function parentIssueUiFixture(timezone='America/Los_Angeles'){
  const f=await staffUiFixture(timezone);
  const rows=await db.transaction(async tx=>{
    const yearId=(await tx.query('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId])).rows[0].year_id;
    const student=(await tx.query("INSERT INTO app.students(school_id,student_code,full_name,internal_note) VALUES($1,'ISSUE-ONE','Học sinh cấp link giả','private-student-note') RETURNING id",[f.schoolId])).rows[0];
    const enrollment=(await tx.query('INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on) VALUES($1,$2,$3,$4,$5) RETURNING id',[f.schoolId,student.id,f.classId,yearId,f.today])).rows[0];
    return {yearId,studentId:student.id,enrollmentId:enrollment.id};
  },{schoolId:f.schoolId});
  const relation=await parentRelationship(null,f.post,rows.studentId);
  const issueRole=await f.role([{action:'parent_access.issue',scopes:['CLASS']}]);
  const issueGrant=await f.grant(f.target,issueRole.id,{scopeType:'CLASS',classId:f.classId});
  const base=`/api/v1/schools/${f.schoolId}`;
  const source=async()=>{const response=await request('GET',`${base}/students/${rows.studentId}/parent-access-issue-source?yearId=${rows.yearId}`);assert.equal(response.statusCode,200,response.body);return response.json().data;};
  return {...f,...rows,relation,issueGrant,base,source};
}
function reviewedParentBody(source,relationshipId){
  const relationship=source.relationships.find(r=>r.id===relationshipId);
  return {studentId:source.student.id,yearId:source.context.year.id,relationshipId,allowedSections:['overview','documents'],allowDownload:false,expiresOn:source.context.today,
    reviewedSource:{schoolVersion:source.context.schoolVersion,yearVersion:source.context.year.version,studentVersion:source.student.version,enrollmentId:source.enrollment.id,enrollmentVersion:source.enrollment.version,classVersion:source.class.version,relationshipVersion:relationship.version,guardianVersion:relationship.guardianVersion}};
}

test('B6 parent-issue purpose readers paginate over 1000 pupils, keep current class/time authority and expose no contact or token',async()=>{
  const f=await parentIssueUiFixture();
  const outside=await db.transaction(async tx=>{
    await tx.query('UPDATE app.classes SET capacity=2000 WHERE school_id=$1 AND id=$2',[f.schoolId,f.classId]);
    await tx.query("WITH s AS(INSERT INTO app.students(school_id,student_code,full_name) SELECT $1,'ISSUE-'||lpad(n::text,4,'0'),'Học sinh số '||n FROM generate_series(1,1001)n RETURNING id) INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on) SELECT $1,id,$2,$3,$4 FROM s",[f.schoolId,f.classId,f.yearId,f.today]);
    const cl=(await tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity,status) SELECT school_id,year_id,grade_level_id,'ISSUE-OUT','Lớp ngoài cấp link giả',10,'ACTIVE' FROM app.classes WHERE school_id=$1 AND id=$2 RETURNING id",[f.schoolId,f.classId])).rows[0];
    const s=(await tx.query("INSERT INTO app.students(school_id,student_code,full_name) VALUES($1,'ISSUE-OUT','Học sinh ngoài lớp giả') RETURNING id",[f.schoolId])).rows[0];
    await tx.query('INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on) VALUES($1,$2,$3,$4,$5)',[f.schoolId,s.id,cl.id,f.yearId,f.today]);return s.id;
  },{schoolId:f.schoolId});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');
  const context=await request('GET',`${f.base}/parent-access/issue-context`);assert.equal(context.statusCode,200,context.body);assert.equal(context.json().data.year.id,f.yearId);assert.equal(context.json().data.timezone,'America/Los_Angeles');
  let page=await request('GET',`${f.base}/parent-access/issue-students?limit=100`);assert.equal(page.statusCode,200,page.body);assert.equal(page.json().page.total,1002);assert.equal(page.json().data.length,100);assert.equal(page.json().page.hasMore,true);
  const next=await request('GET',`${f.base}/parent-access/issue-students?limit=100&cursor=${encodeURIComponent(page.json().page.nextCursor)}`);assert.equal(next.statusCode,200,next.body);assert.equal(new Set([...page.json().data,...next.json().data].map(r=>r.id)).size,200);
  assert.equal((await request('GET',`${f.base}/parent-access/issue-students?limit=100&q=changed&cursor=${encodeURIComponent(page.json().page.nextCursor)}`)).statusCode,422);
  const filtered=await request('GET',`${f.base}/parent-access/issue-students?q=ISSUE-ONE`);assert.equal(filtered.statusCode,200,filtered.body);assert.deepEqual(filtered.json().data.map(r=>r.id),[f.studentId]);
  for(const row of page.json().data)assert.deepEqual(Object.keys(row).sort(),['id','version','fullName','studentCode','classId','className'].sort());
  const source=await f.source();assert.equal(source.context.today,f.today);assert.equal(source.enrollment.inEffect,true);assert.equal(source.relationships[0].canIssue,true);assert.equal(source.relationships[0].guardianName.startsWith('Giám hộ giả'),true);
  for(const secret of ['0901234567','private-student-note','token_hash','tokenHash','email','dateOfBirth'])assert.equal(JSON.stringify(source).includes(secret),false,secret);
  for(const path of ['classes','academic-years','student-directory-summary','guardian-directory-summary','settings','parent-access'])assert.equal((await request('GET',`${f.base}/${path}`)).statusCode,403,path);
  assert.equal((await request('GET',`${f.base}/students/${outside}/parent-access-issue-source`)).statusCode,404);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/parent-access/issue-context`)).statusCode,404);
  await db.transaction(tx=>tx.query("UPDATE app.enrollments SET ends_on=$3::date,status='ENDED',starts_on=$3::date-1 WHERE school_id=$1 AND id=$2",[f.schoolId,f.enrollmentId,f.today]),{schoolId:f.schoolId});
  assert.equal((await request('GET',`${f.base}/students/${f.studentId}/parent-access-issue-source`)).statusCode,404);page=await request('GET',`${f.base}/parent-access/issue-students?limit=100`);assert.equal(page.json().page.total,1001);
  for(const sql of ["UPDATE app.role_grants SET valid_from=now()+interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_until=NULL,revoked_at=now() WHERE school_id=$1 AND id=$2"]){await db.transaction(tx=>tx.query(sql,[f.schoolId,f.issueGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',`${f.base}/parent-access/issue-context`)).statusCode,403);}
});

test('B6 reviewed parent issuance rejects stale sources, rotates atomically, converts local dates and never replays secrets',async()=>{
  const f=await parentIssueUiFixture();jar.delete('edu_staff');const csrf=await login('teacher-a@example.invalid');f.setCsrf(csrf);
  let source=await f.source(),body=reviewedParentBody(source,f.relation.id);
  const post=(data,key=crypto.randomUUID())=>f.post('parent-access/reviewed-issue',data,key);
  for(const key of ['schoolVersion','yearVersion','studentVersion','enrollmentVersion','classVersion','relationshipVersion','guardianVersion']){const stale=structuredClone(body);stale.reviewedSource[key]++;const response=await post(stale);assert.equal(response.statusCode,409,response.body);assert.equal(response.json().code,'PARENT_ISSUE_SOURCE_CHANGED');}
  assert.equal((await post({...body,reviewedSource:{...body.reviewedSource,enrollmentId:crypto.randomUUID()}})).statusCode,409);
  assert.equal((await post({...body,allowedSections:['overview'],allowDownload:true})).statusCode,422);
  const expected=(await db.transaction(tx=>tx.query('SELECT ($1::date+1)::timestamp AT TIME ZONE $2 AS at',[f.today,source.context.timezone]),{schoolId:f.schoolId})).rows[0].at.toISOString();
  const key=crypto.randomUUID(),issued=await post(body,key);assert.equal(issued.statusCode,201,issued.body);let receipt=issued.json().data;
  assert.equal(receipt.access.expiresAt,expected);assert.equal(receipt.displayOnce,true);assert.match(receipt.link,/#token=[A-Za-z0-9_-]{43}$/);assert.equal(new URL(receipt.link).search,'');
  const replay=await post(body,key);assert.equal(replay.statusCode,409,replay.body);assert.equal(replay.json().code,'LINK_ALREADY_ISSUED');assert.equal(replay.json().resultId,receipt.access.id);assert.equal(replay.body.includes('#token='),false);
  const metadata=(await db.transaction(tx=>tx.query("SELECT response_metadata FROM app.idempotency_keys WHERE school_id=$1 AND operation_id='issueReviewedParentAccess'",[f.schoolId]),{schoolId:f.schoolId})).rows.map(r=>r.response_metadata);assert.deepEqual(metadata,[{issued:true,resultId:receipt.access.id}]);
  const token=new URL(receipt.link).hash.slice(7),parentCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const parent=await request('POST',`/api/v1/parent/${source.context.schoolSlug}/access/exchange`,{token},parentCsrf);assert.equal(parent.statusCode,200,parent.body);const parentView=parent.json().data;
  const original=receipt.access,replace={accessId:original.id,expectedVersion:original.version};
  const wrong=await post({...body,replace:{...replace,expectedVersion:replace.expectedVersion+1},reason:'Cấp lại có kiểm tra giả'});assert.equal(wrong.statusCode,409);assert.equal(wrong.json().code,'VERSION_CONFLICT');
  const rollback=await post({...body,replace,reason:'Cấp lại nhưng tải không hợp lệ',allowedSections:['overview'],allowDownload:true});assert.equal(rollback.statusCode,422);
  let old=(await db.transaction(tx=>tx.query('SELECT revoked_at FROM app.parent_access_links WHERE school_id=$1 AND id=$2',[f.schoolId,original.id]),{schoolId:f.schoolId})).rows[0];assert.equal(old.revoked_at,null);
  source=await f.source();body=reviewedParentBody(source,f.relation.id);
  const rotated=await post({...body,replace,reason:'Cấp lại sau khi xác nhận nguồn',allowedSections:['overview','attendance'],allowDownload:false});assert.equal(rotated.statusCode,200,rotated.body);receipt=rotated.json().data;assert.notEqual(receipt.access.id,original.id);assert.deepEqual(receipt.access.allowedSections,['overview','attendance']);
  old=(await db.transaction(tx=>tx.query('SELECT revoked_at FROM app.parent_access_links WHERE school_id=$1 AND id=$2',[f.schoolId,original.id]),{schoolId:f.schoolId})).rows[0];assert.ok(old.revoked_at);
  assert.equal((await request('GET',`/api/v1/parent/${source.context.schoolSlug}/context`,undefined,undefined,{'x-parent-view':parentView.viewId})).statusCode,401);
  assert.equal((await request('POST',`/api/v1/parent/${source.context.schoolSlug}/access/exchange`,{token},parentCsrf)).statusCode,401);
  await db.transaction(tx=>tx.query('UPDATE app.guardian_relationships SET can_receive_info=false WHERE school_id=$1 AND id=$2',[f.schoolId,f.relation.id]),{schoolId:f.schoolId});
  const stale=await post(body);assert.equal(stale.statusCode,409);source=await f.source();assert.equal(source.relationships[0].canIssue,false);assert.deepEqual(source.relationships[0].activeLinkIds,[]);assert.equal((await post(reviewedParentBody(source,f.relation.id))).statusCode,422);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,f.issueGrant.id]),{schoolId:f.schoolId});assert.equal((await post(body,key)).statusCode,403);
});

async function parentLinkForUi(f,extra={}){
  const response=await f.post('parent-access',{studentId:f.studentId,yearId:f.yearId,relationshipId:f.relation.id,allowedSections:['overview','documents'],allowDownload:false,expiresAt:new Date(Date.now()+86400000).toISOString(),...extra});
  assert.equal(response.statusCode,201,response.body);return response.json().data;
}
test('B6 parent metadata directory keeps manage scope, current capabilities, real counts and no borrowed contact/catalog data',async()=>{
  const f=await parentIssueUiFixture(),manage=await f.role([{action:'parent_access.manage',scopes:['CLASS']}]),readGrant=await f.grant(f.target,manage.id,{scopeType:'CLASS',classId:f.classId});
  const active=await parentLinkForUi(f),expired=await parentLinkForUi(f),revoked=await parentLinkForUi(f);
  const deniedStudent=await db.transaction(async tx=>{
    const cl=(await tx.query("INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity,status) SELECT school_id,year_id,grade_level_id,'META-OUT','Lớp metadata ngoài giả',10,'ACTIVE' FROM app.classes WHERE school_id=$1 AND id=$2 RETURNING id",[f.schoolId,f.classId])).rows[0];
    const student=(await tx.query("INSERT INTO app.students(school_id,student_code,full_name) VALUES($1,'META-OUT','Học sinh metadata ngoài giả') RETURNING id",[f.schoolId])).rows[0];
    await tx.query('INSERT INTO app.enrollments(school_id,student_id,class_id,year_id,starts_on) VALUES($1,$2,$3,$4,$5)',[f.schoolId,student.id,cl.id,f.yearId,f.today]);
    await tx.query("UPDATE app.parent_access_links SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE school_id=$1 AND id=$2",[f.schoolId,expired.access.id]);
    await tx.query("INSERT INTO app.parent_access_events(school_id,access_link_id,event_kind,request_id,device_summary,ip_daily_hash,section) SELECT $1,$2,kind,gen_random_uuid()::text,'Trình duyệt giả','private-ip-hash','overview' FROM unnest(ARRAY['EXCHANGED','READ','BLOCKED'])kind",[f.schoolId,active.access.id]);
    return {id:student.id,classId:cl.id};
  },{schoolId:f.schoolId});
  const rel=await parentRelationship(null,f.post,deniedStudent.id),outside=await parentLinkForUi(f,{studentId:deniedStudent.id,relationshipId:rel.id});
  assert.equal((await f.post(`parent-access/${revoked.access.id}/revoke`,{expectedVersion:revoked.access.version,reason:'Thu hồi link metadata giả'})).statusCode,200);
  await db.transaction(tx=>tx.query('UPDATE app.role_grants SET revoked_at=now() WHERE school_id=$1 AND id=$2',[f.schoolId,f.issueGrant.id]),{schoolId:f.schoolId});
  jar.delete('edu_staff');await login('teacher-a@example.invalid');
  let summary=await request('GET',`${f.base}/parent-access-directory-summary`);assert.equal(summary.statusCode,200,summary.body);assert.deepEqual(summary.json().data.kpi,{total:3,active:1,expired:1,revoked:1});assert.equal(summary.json().data.canIssue,false);assert.deepEqual(summary.json().data.classes.map(r=>r.id),[f.classId]);
  const ids=[],firstUrl=`${f.base}/parent-access-directory?limit=1`;let url=firstUrl,firstCursor;
  for(let n=0;n<3;n++){const page=await request('GET',url);assert.equal(page.statusCode,200,page.body);assert.equal(page.json().page.total,3);ids.push(...page.json().data.map(r=>r.id));for(const row of page.json().data){assert.equal(row.canIssue,false);assert.equal(row.canRevoke,false);assert.equal(row.canPreview,false);}if(n===0)firstCursor=page.json().page.nextCursor;url=`${firstUrl}&cursor=${encodeURIComponent(page.json().page.nextCursor)}`;}
  assert.deepEqual(new Set(ids),new Set([active.access.id,expired.access.id,revoked.access.id]));assert.equal((await request('GET',`${firstUrl}&status=ACTIVE&cursor=${encodeURIComponent(firstCursor)}`)).statusCode,422);
  for(const [state,id]of [['ACTIVE',active.access.id],['EXPIRED',expired.access.id],['REVOKED',revoked.access.id]]){const page=await request('GET',`${f.base}/parent-access-directory?status=${state}`);assert.equal(page.statusCode,200,page.body);assert.deepEqual(page.json().data.map(r=>r.id),[id]);}
  let detail=await request('GET',`${f.base}/parent-access/${active.access.id}/details`);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.access.opens,2);assert.equal(detail.json().data.canViewContact,false);assert.equal(detail.json().data.phoneMasked,null);assert.equal(detail.json().data.siblings.total,2);assert.equal(detail.json().data.replacedById,null);
  for(const secret of ['0901234567','private-student-note','private-ip-hash','tokenHash','token_hash','#token='])assert.equal(detail.body.includes(secret),false,secret);
  for(const path of ['classes','academic-years','student-directory-summary','guardian-directory-summary','settings','parent-access/issue-context'])assert.equal((await request('GET',`${f.base}/${path}`)).statusCode,403,path);
  assert.equal((await request('GET',`${f.base}/parent-access/${outside.access.id}/details`)).statusCode,404);assert.equal((await request('GET',`${f.base}/parent-access-directory?classId=${deniedStudent.classId}`)).json().page.total,0);assert.equal((await request('GET',`/api/v1/schools/${schoolB}/parent-access-directory`)).statusCode,404);
  await db.transaction(tx=>tx.query('UPDATE app.guardian_relationships SET can_receive_info=false WHERE school_id=$1 AND id=$2',[f.schoolId,f.relation.id]),{schoolId:f.schoolId});
  summary=await request('GET',`${f.base}/parent-access-directory-summary`);assert.deepEqual(summary.json().data.kpi,{total:3,active:0,expired:0,revoked:3});detail=await request('GET',`${f.base}/parent-access/${active.access.id}/details`);assert.equal(detail.json().data.access.status,'REVOKED');
  for(const sql of ["UPDATE app.role_grants SET valid_from=now()+interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE school_id=$1 AND id=$2","UPDATE app.role_grants SET valid_until=NULL,revoked_at=now() WHERE school_id=$1 AND id=$2"]){await db.transaction(tx=>tx.query(sql,[f.schoolId,readGrant.id]),{schoolId:f.schoolId});assert.equal((await request('GET',`${f.base}/parent-access-directory`)).statusCode,403);}
});

test('B6 parent metadata masks independently authorized contact, paginates anonymous history and tracks only actual replacement facts',async()=>{
  const f=await parentIssueUiFixture(),manage=await f.role([{action:'parent_access.manage',scopes:['CLASS']}]),family=await f.role([{action:'guardian.read',scopes:['CLASS']}]);
  await f.grant(f.target,manage.id,{scopeType:'CLASS',classId:f.classId});const contactGrant=await f.grant(f.target,family.id,{scopeType:'CLASS',classId:f.classId,validFrom:new Date(Date.now()+60000).toISOString()}),original=await parentLinkForUi(f);
  await db.transaction(tx=>tx.query("INSERT INTO app.parent_access_events(school_id,access_link_id,event_kind,request_id,device_summary,ip_daily_hash,section,created_at) SELECT $1,$2,'READ',gen_random_uuid()::text,NULL,'private-ip-hash',NULL,now()-n*interval '1 millisecond' FROM generate_series(1,160)n",[f.schoolId,original.access.id]),{schoolId:f.schoolId});
  jar.delete('edu_staff');f.setCsrf(await login('teacher-a@example.invalid'));const detailUrl=`${f.base}/parent-access/${original.access.id}/details`;
  let detail=await request('GET',detailUrl);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.access.canIssue,true);assert.equal(detail.json().data.access.canRevoke,false);assert.equal(detail.json().data.canViewContact,false);assert.equal(detail.json().data.phoneMasked,null);
  await db.transaction(tx=>tx.query("UPDATE app.role_grants SET valid_from=now()-interval '1 minute' WHERE school_id=$1 AND id=$2",[f.schoolId,contactGrant.id]),{schoolId:f.schoolId});detail=await request('GET',detailUrl);assert.equal(detail.json().data.canViewContact,true);assert.equal(detail.json().data.phoneMasked,'0901 *** 567');assert.equal(detail.body.includes('0901234567'),false);
  let cursor,seen=new Set(),lastAt=Infinity;const history=`${f.base}/parent-access/${original.access.id}/history`;
  do{const response=await request('GET',`${history}?limit=17${cursor?'&cursor='+encodeURIComponent(cursor):''}`);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().page.total,160);for(const event of response.json().data){assert.equal(event.accessLinkId,original.access.id);assert.equal(event.deviceSummary,null);assert.equal(event.section,null);assert.ok(Date.parse(event.occurredAt)<=lastAt);lastAt=Date.parse(event.occurredAt);assert.equal(seen.has(event.id),false);seen.add(event.id);}assert.equal(response.body.includes('private-ip-hash'),false);cursor=response.json().page.nextCursor;}while(cursor);assert.equal(seen.size,160);assert.equal(detail.json().data.access.opens,160);
  const source=await f.source(),body=reviewedParentBody(source,f.relation.id);const replaced=await f.post('parent-access/reviewed-issue',{...body,replace:{accessId:original.access.id,expectedVersion:original.access.version},reason:'Cấp lại từ nguồn đã xem giả'});assert.equal(replaced.statusCode,200,replaced.body);const newId=replaced.json().data.access.id;
  detail=await request('GET',detailUrl);assert.equal(detail.json().data.replacedById,newId);assert.ok(detail.json().data.revokedByName);assert.equal(detail.json().data.access.revokeReason,'Cấp lại từ nguồn đã xem giả');assert.equal(detail.json().data.access.canRevoke,false);
  await parentLinkForUi(f);detail=await request('GET',detailUrl);assert.equal(detail.json().data.replacedById,newId);
  for(let n=0;n<20;n++)await parentLinkForUi(f);detail=await request('GET',detailUrl);assert.equal(detail.json().data.siblings.items.length,20);assert.equal(detail.json().data.siblings.hasMore,true);assert.equal(detail.json().data.siblings.total,22);
  const first=await request('GET',`${history}?limit=17`),otherHistory=`${f.base}/parent-access/${newId}/history?limit=17&cursor=${encodeURIComponent(first.json().page.nextCursor)}`;assert.equal((await request('GET',otherHistory)).statusCode,422);
  await db.transaction(tx=>tx.query("UPDATE app.enrollments SET starts_on=$3::date-1,ends_on=$3::date,status='ENDED' WHERE school_id=$1 AND id=$2",[f.schoolId,f.enrollmentId,f.today]),{schoolId:f.schoolId});assert.equal((await request('GET',detailUrl)).statusCode,404);assert.equal((await request('GET',history)).statusCode,404);
  jar.delete('edu_staff');f.setCsrf(await login('admin-a@example.invalid'));const schoolRead=await f.role([{action:'parent_access.manage',scopes:['SCHOOL']}]);await f.grant(f.target,schoolRead.id);jar.delete('edu_staff');await login('teacher-a@example.invalid');
  detail=await request('GET',detailUrl);assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().data.access.enrollmentInEffect,false);assert.equal(detail.json().data.access.canIssue,false);assert.equal(detail.json().data.canViewContact,false);assert.equal(detail.json().data.phoneMasked,null);
});
