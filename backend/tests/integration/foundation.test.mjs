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
  const classes=await request('GET',`/api/v1/schools/${schoolA}/classes`);
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
  const assignmentBody={classId:cls.json().data.id,memberId:seedId('member:A:teacher-b'),kind:'SUBJECT',subjectId:seedId('subject:A:math'),startsOn:'2026-09-01',endsOn:'2027-06-01'};
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
  const assignment=await post('assignments',{classId:handoverClass.id,memberId:people[0].memberId,kind:'HOMEROOM',startsOn:'2026-09-01',endsOn:'2027-06-01'});assert.equal(assignment.statusCode,201);
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
  const key=crypto.randomUUID(),imageResponse=await upload(image,'../../ảnh.png','image/png','CLASS_DOCUMENT',classA,key);
  assert.equal(imageResponse.statusCode,200);let file=imageResponse.json().data;assert.equal(file.status,'QUARANTINED');assert.equal(file.originalName.includes('/'),false);
  for(const secret of ['objectKey','schoolId','purpose','uploadClassId'])assert.equal(Object.hasOwn(file,secret),false);
  const replay=await upload(image,'../../ảnh.png','image/png','CLASS_DOCUMENT',classA,key);assert.equal(replay.statusCode,200);assert.equal(replay.json().data.id,file.id);
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
    const classDocs=await request('GET',`/api/v1/schools/${schoolA}/classes/${classA}/files`);assert.equal(classDocs.statusCode,200);assert.equal(classDocs.json().data.some(f=>f.id===file.id),true);
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
    const encrypted=(await db.app.query('SELECT encrypted_payload FROM identity.mail_outbox WHERE dedupe_key=$1',[`invitation:${invitation.id}`])).rows[0].encrypted_payload;
    const token=new URLSearchParams(new URL(decryptMail(encrypted).url).hash.slice(1)).get('token');
    const anonymousCsrf=(await request('GET','/api/v1/auth/csrf')).json().data.csrfToken;
    const accepted=await request('POST','/api/v1/invitations/accept',{schoolSlug:'truong-thu-a',token,displayName:'Danh tính import giả',newPassword:password},anonymousCsrf);assert.equal(accepted.statusCode,200,accepted.body);
    const member=(await db.transaction(tx=>tx.query('SELECT m.staff_code,m.work_display_name FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[schoolA,email]),{schoolId:schoolA})).rows[0];assert.equal(member.staff_code,`T-${prefix}`);assert.equal(member.work_display_name,'Nhân sự import giả');
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
