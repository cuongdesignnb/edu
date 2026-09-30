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

let app,server,db,policy;
const password=crypto.randomBytes(24).toString('base64url');
const pool=new Pool({...databaseConfig('app'),max:1});
const schoolA=seedId('school:A'),schoolB=seedId('school:B'),classA=seedId('class:A:10A1'),classB=seedId('class:A:10A2');
const origin=process.env.APP_URL;
const jar=new Map();
function cookies(){return [...jar].map(([key,value])=>`${key}=${value}`).join('; ');}
async function request(method,url,body,csrf,extra={}){
  const response=await server.inject({method,url,headers:{origin,cookie:cookies(),...(csrf?{'x-csrf-token':csrf}:{}),...extra},
    ...(body!==undefined?{payload:body}:{})});
  for(const cookie of response.cookies)jar.set(cookie.name,cookie.value);
  return response;
}
async function login(email){
  const csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const result=await request('POST','/api/v1/auth/login',{email,password},csrf);
  assert.equal(result.statusCode,200,'valid fixture login must succeed');
  return result.json().data.csrfToken;
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
  assert.equal(rows.length,1);assert.equal(rows[0].user_id,user);assert.equal(rows[0].school_id,schoolA);
  const noUser=await db.transaction(async tx=>(await tx.query('SELECT id FROM app.memberships')).rows);assert.equal(noUser.length,0);
  const tenant=await db.transaction(async tx=>(await tx.query('SELECT school_id FROM app.memberships')).rows,{schoolId:schoolB,userId:user});
  assert.equal(tenant.every(row=>row.school_id===schoolB),true);
});
test('BE05 HOMEROOM A plus SUBJECT B cannot authorize seating or guardians in B',async()=>{
  await login('teacher-a@example.invalid');
  const context=(await request('GET','/api/v1/me/context')).json().data;
  assert.equal(context.mode,'connected');assert.equal(context.memberships.length,1);
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
test('BE21 parent runtime role cannot select raw student rows',async()=>{
  await assert.rejects(db.parent.query('SELECT id FROM app.students'),error=>error.code==='42501');
  assert.equal((await db.parent.query('SELECT id FROM app.parent_publication_items')).rowCount,0);
});
test('B0 health ready checks actual migrations, database and private storage',async()=>{
  const ready=await request('GET','/api/v1/health/ready');assert.equal(ready.statusCode,200);assert.equal(ready.json().data.status,'ok');
  const live=await request('GET','/api/v1/health/live');assert.equal(live.statusCode,200);
  assert.equal(ready.headers['cache-control'],'no-store');
});
test('B2 class lists use SQL scope and cross-school details deny before serialization',async()=>{
  await login('teacher-a@example.invalid');
  const classes=await request('GET',`/api/v1/schools/${schoolA}/classes?q=10A`);
  assert.equal(classes.statusCode,200);
  assert.deepEqual(new Set(classes.json().data.map(row=>row.id)),new Set([classA,classB]));
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
  const body={code,name:'Năm kiểm thử idempotency',startsOn:'2028-09-01',endsOn:'2029-06-01'};
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
  await login('teacher-b@example.invalid');csrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
  const inspect=await request('POST','/api/v1/invitations/inspect',{schoolSlug:'truong-thu-b',token},csrf);assert.equal(inspect.statusCode,200);
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
  const reset=await request('POST','/api/v1/auth/password/reset',{token,password:'Synthetic-reset-password-2026'},csrf);assert.equal(reset.statusCode,200);
  const again=await request('POST','/api/v1/auth/password/reset',{token,password:'Synthetic-reset-password-2026'},csrf);assert.equal(again.statusCode,422);
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

  const year=await post('academic-years',{code:`NEXT-${crypto.randomUUID()}`,name:'Năm mới giả',startsOn:'2027-09-01',endsOn:'2028-06-01'});assert.equal(year.statusCode,201);
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
  assert.equal((await parentGet('conduct',context)).json().data.length,0);
  assert.equal((await request('GET','/api/v1/parent/truong-thu-a/context')).statusCode,409);
  assert.equal((await request('GET','/api/v1/parent/truong-thu-b/context',undefined,undefined,{'x-parent-view':context.viewId})).statusCode,401);
  const event={periodId:f.period.id,enrollmentId:f.enrollments[0].id,ruleId:f.fixed,publicReason:'Nội dung được công bố cho con',internalNote:'Không được lộ cho phụ huynh',occurredAt:'2026-09-29T01:00:00Z',sourceKind:'MANUAL',clientEventId:crypto.randomUUID()};
  const recorded=await f.post(`${base}/conduct-records`,event);assert.equal(recorded.statusCode,201);assert.equal((await f.post(`${base}/conduct-records/${recorded.json().data.id}/approve`,{expectedVersion:recorded.json().data.version})).statusCode,200);
  const summary=(await request('GET',`/api/v1/schools/${schoolA}/${base}/conduct-periods/${f.period.id}/summary`)).json().data;
  const locked=await f.post(`${base}/conduct-periods/${f.period.id}/lock`,{expectedVersion:summary.period.version});assert.equal(locked.statusCode,200);assert.equal((await parentGet('conduct',context)).json().data.length,0);
  const published=await f.post(`${base}/conduct-periods/${f.period.id}/publish`,{expectedSourceVersion:summary.period.dataVersion,expectedPublicationId:null});assert.equal(published.statusCode,200,published.body);
  const child=await parentGet(`conduct/${f.period.id}`,context);assert.equal(child.statusCode,200,child.body);assert.equal(child.json().data.finalPoints,'80.30');assert.equal(child.json().data.publishedAt,published.json().data.publishedAt);assert.equal(child.body.includes('Không được lộ cho phụ huynh'),false);assert.equal(Object.hasOwn(child.json().data,'students'),false);assert.equal(child.headers['cache-control'],'no-store');assert.equal(child.headers['referrer-policy'],'no-referrer');assert.match(child.headers['x-robots-tag'],/noindex/);
  const overview=await parentGet('overview',context);assert.equal(overview.statusCode,200,overview.body);assert.equal(overview.json().data.latestConduct.periodId,f.period.id);
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
