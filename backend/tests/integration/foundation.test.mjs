import test,{before,after} from 'node:test';
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
  ]);}finally{await fixturePool.end();}
  app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();
  db=app.get(Database);policy=app.get(Permissions);
});
after(async()=>{await app?.close();await pool.end();});

test('BE01 migration replay is a no-op, mismatch fails and metadata remains intact',async()=>{
  const result=await migrate();assert.deepEqual(result.applied,[]);assert.equal(result.total,5);
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
    assert.equal((await tx.query('SELECT id FROM app.students')).rowCount,12);await tx.query('COMMIT');
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
