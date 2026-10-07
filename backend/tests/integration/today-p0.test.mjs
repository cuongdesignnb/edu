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
import {WorkerRunner} from '../../dist/workers/runner.js';

let app,server,raw,db,csrf;
const password='Aa1-'+crypto.randomBytes(24).toString('base64url'),jar=new Map(),school=seedId('school:A'),other=seedId('school:B'),url=`/api/v1/platform/schools/${school}/admins`;
const body=(patch={})=>({displayName:'Quản trị trực tiếp kiểm thử',email:`direct-${crypto.randomUUID()}@example.invalid`,password,mustChangePassword:false,validFrom:null,validUntil:null,...patch});
async function req(method,target,input,write=false,headers={}){
 const r=await server.inject({method,url:target,headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(write?{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()}:{}),...headers},...(input===undefined?{}:{payload:input})});for(const c of r.cookies)jar.set(c.name,c.value);return r;
}
async function login(email='operator@example.invalid',secret=password){jar.clear();const c=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken,r=await req('POST','/api/v1/auth/login',{email,password:secret},false,{'x-csrf-token':c});assert.equal(r.statusCode,200,r.body);csrf=r.json().data.csrfToken;return r.json().data;}
before(async()=>{assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');await migrate();await seedLocal(password,true);raw=new Pool(databaseConfig('migrator'));await raw.query('UPDATE identity.users SET password_hash=$1,must_change_password=false WHERE id=ANY($2)',[await hashPassword(password),['operator','admin-a','teacher-a'].map(n=>seedId('user:'+n))]);await raw.query('UPDATE platform.mail_settings SET enabled=false WHERE singleton');await raw.query('DELETE FROM platform.public_class_portals WHERE school_id=$1',[school]);db=new Database();app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();});
after(async()=>{await app?.close();await raw?.end();await db?.onApplicationShutdown();});
beforeEach(async()=>{await raw.query('DELETE FROM identity.rate_limit_buckets');await login("admin-a@example.invalid");});

const cls=seedId('class:A:10A1'),yr=seedId('year:A'),otherClass=seedId('class:B:10A1');
async function tx(fn){return db.transaction(fn,{schoolId:school,userId:seedId('user:admin-a')});}
async function teacherRole(){return (await tx(t=>t.query("SELECT id FROM app.roles WHERE code='TEACHER'"))).rows[0].id;}
const directUrl=`/api/v1/schools/${school}/staff-accounts`,portalUrl=`/api/v1/schools/${school}/classes/${cls}/public-portal`;
const portalBody=patch=>({expectedVersion:0,publicPortalEnabled:true,publicStudentConductEnabled:false,publicStudentAttendanceEnabled:false,publicStudentActivitiesEnabled:false,publicRankingEnabled:false,publicSeatingEnabled:false,rotateSlug:false,...patch});
test('school admin creates staff without SMTP; hashing, no mail/invite, normalized email and replay',async()=>{
 const roleId=await teacherRole(),b=body({roleId,validFrom:undefined,validUntil:undefined}),key=crypto.randomUUID();
 const before=(await tx(t=>t.query('SELECT (SELECT count(*) FROM identity.mail_outbox)::int AS mail,(SELECT count(*) FROM app.staff_invitations)::int AS invites'))).rows[0];
 const r=await req('POST',directUrl,b,true,{'idempotency-key':key});assert.equal(r.statusCode,201,r.body);
 const dto=r.json().data,user=(await raw.query('SELECT password_hash FROM identity.users WHERE id=$1',[dto.userId])).rows[0];assert.ok(await verifyPassword(user.password_hash,password));assert.ok(!r.body.includes(password));
 const after=(await tx(t=>t.query('SELECT (SELECT count(*) FROM identity.mail_outbox)::int AS mail,(SELECT count(*) FROM app.staff_invitations)::int AS invites'))).rows[0];assert.deepEqual(before,after);
 assert.equal((await req('POST',directUrl,b,true,{'idempotency-key':key})).json().data.id,dto.id);
});
test('teacher and foreign-school admin cannot create identities or modify a portal',async()=>{
 const roleId=await teacherRole();await login('teacher-a@example.invalid');assert.equal((await req('POST',directUrl,body({roleId,validFrom:undefined,validUntil:undefined}),true)).statusCode,403);
 const newAccount=body({roleId,validFrom:undefined,validUntil:undefined});await login('admin-a@example.invalid');assert.equal((await req('POST',directUrl,newAccount,true)).statusCode,201);await login(newAccount.email);assert.ok([403,404].includes((await req('POST',portalUrl,portalBody({}),true)).statusCode));
 await login('admin-a@example.invalid');assert.ok([403,404].includes((await req('POST',`/api/v1/schools/${other}/staff-accounts`,body({roleId,validFrom:undefined,validUntil:undefined}),true)).statusCode));
});
test('existing identity requires explicit assignment and password never changes',async()=>{
 const email=`teacher-${crypto.randomUUID()}@example.invalid`,hash=await hashPassword(password),id=(await raw.query("INSERT INTO identity.users(email_normalized,display_name,password_hash,status) VALUES($1,'Existing teacher',$2,'ACTIVE') RETURNING id",[email,hash])).rows[0].id,roleId=await teacherRole();
 assert.equal((await req('POST',directUrl,body({email,roleId,validFrom:undefined,validUntil:undefined}),true)).json().code,'IDENTITY_EXISTS_USE_ASSIGN');
 const r=await req('POST',directUrl+'/assign-existing',{displayName:'Giáo viên đang có',email,roleId},true);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().data.userId,id);assert.equal((await raw.query('SELECT password_hash FROM identity.users WHERE id=$1',[id])).rows[0].password_hash,hash);
});
test('invalid optional assignment rolls back new identity and membership',async()=>{
 const b=body({roleId:await teacherRole(),validFrom:undefined,validUntil:undefined,assignment:{kind:'HOMEROOM',classId:otherClass,startsOn:'2026-10-06'}}),r=await req('POST',directUrl,b,true);assert.ok([403,404,422].includes(r.statusCode),r.body);assert.equal((await raw.query('SELECT count(*)::int AS n FROM identity.users WHERE email_normalized=$1',[b.email])).rows[0].n,0);
});
test('public portal opt-in, privacy gates, current roster, rotate and disable revoke old QR URL',async()=>{
 let current=(await req('GET',portalUrl)).json().data;assert.equal(current.publicPortalEnabled,false);
 let saved=await req('POST',portalUrl,portalBody({expectedVersion:current.version}),true);assert.equal(saved.statusCode,200,saved.body);let value=saved.json().data;
 let pub=await server.inject({method:'GET',url:`/api/v1/public/classes/${value.slug}`});assert.equal(pub.statusCode,200,pub.body);assert.ok(pub.json().data.students.length>0);for(const privateField of ['internalNote','dateOfBirth','phone','guardian','password','token'])assert.ok(!pub.body.includes(privateField));
 const id=pub.json().data.students[0].id,detail=await server.inject({method:'GET',url:`/api/v1/public/classes/${value.slug}/students/${id}`});assert.equal(detail.statusCode,200,detail.body);assert.deepEqual(detail.json().data.conduct,[]);
 assert.equal((await server.inject({method:'GET',url:`/api/v1/public/classes/${value.slug}/students/${seedId('student:B:10A1:1')}`})).statusCode,404);
 const old=value.slug;saved=await req('POST',portalUrl,portalBody({expectedVersion:value.version,rotateSlug:true}),true);value=saved.json().data;assert.notEqual(value.slug,old);assert.equal((await server.inject({method:'GET',url:`/api/v1/public/classes/${old}`})).statusCode,404);
 saved=await req('POST',portalUrl,portalBody({expectedVersion:value.version,publicPortalEnabled:false}),true);assert.equal(saved.statusCode,200,saved.body);assert.equal((await server.inject({method:'GET',url:`/api/v1/public/classes/${value.slug}`})).statusCode,404);
});
test('server tour progress persists skipped then completed by user and school',async()=>{
 const account=body({roleId:await teacherRole(),validFrom:undefined,validUntil:undefined});assert.equal((await req('POST',directUrl,account,true)).statusCode,201);await login(account.email);
 const r=await req('PUT','/api/v1/me/onboarding/school-overview',{schoolId:school,tourVersion:1,status:'skipped'},true);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.status,'skipped',r.body);
 const saved=await req('GET',`/api/v1/me/onboarding?schoolId=${school}`);assert.equal(saved.statusCode,200,saved.body);assert.ok(saved.json().data.progress.some(p=>p.tourKey==='school-overview'&&p.status==='skipped'),saved.body);
 assert.equal((await req('PUT','/api/v1/me/onboarding/school-overview',{schoolId:school,tourVersion:1,status:'completed'},true)).json().data.status,'completed');
 assert.equal((await req('PUT','/api/v1/me/onboarding/school-overview',{schoolId:school,tourVersion:1,status:'skipped'},true)).json().data.status,'completed');
 assert.equal((await req('PUT','/api/v1/me/onboarding/teacher-overview',{schoolId:school,tourVersion:1,status:'skipped'},true)).statusCode,200);
});
test('schedule import settings round trip and cross-tenant aliases rejected',async()=>{
 const url=`/api/v1/schools/${school}/schedule-import-settings`,get=await req('GET',url);assert.equal(get.statusCode,200,get.body);const v=get.json().data;
 const r=await req('POST',url,{expectedVersion:v.version,aliases:{subjects:{to:seedId('subject:A:math')},teachers:{anh:seedId('member:A:teacher-a')}},periodTimes:{'morning:1':{start:'07:00',end:'07:45'}}},true);assert.equal(r.statusCode,200,r.body);
 const bad=await req('POST',url,{expectedVersion:r.json().data.version,aliases:{subjects:{to:seedId('subject:B:math')},teachers:{}},periodTimes:{}},true);assert.equal(bad.statusCode,422,bad.body);
});

test('optional teaching assignment is atomic and temporary password blocks usage until changed',async()=>{
 const subjectId=crypto.randomUUID();await tx(t=>t.query("INSERT INTO app.subjects(id,school_id,code,name) VALUES($1,$2,$3,'Môn kiểm thử mới')",[subjectId,school,'TEST_'+subjectId]));
 const b=body({roleId:await teacherRole(),validFrom:undefined,validUntil:undefined,mustChangePassword:true,assignment:{kind:'SUBJECT',classId:cls,subjectId,startsOn:'2026-10-06',endsOn:'2027-06-01',reason:'Kiểm thử phân công lùi ngày'}}),r=await req('POST',directUrl,b,true);assert.equal(r.statusCode,201,r.body);
 const assignments=(await tx(t=>t.query('SELECT id FROM app.teaching_assignments WHERE member_id=$1',[r.json().data.id]))).rows;assert.equal(assignments.length,1);
 const auth=await login(b.email);assert.equal(auth.user.mustChangePassword,true);assert.equal((await req('GET',`/api/v1/schools/${school}/profile`)).json().code,'PASSWORD_CHANGE_REQUIRED');
});
test('published conduct is visible only after opt-in; parent PDF single/class uses pinned projections',async()=>{
 const base=`/api/v1/schools/${school}/classes/${cls}`,weekId=seedId('week:A:3');
 const catalog=await req('GET',`/api/v1/schools/${school}/academic-years/${yr}/classes/${cls}/report-catalog`);assert.equal(catalog.statusCode,200,catalog.body);assert.ok(catalog.json().data.reports.some(r=>r.type==='parent-conduct'));
 let p=(await req('GET',base+'/conduct-periods')).json().data.find(p=>p.weekId===weekId);
 if(!p){const create=await req('POST',base+'/conduct-periods',{weekId},true);assert.equal(create.statusCode,201,create.body);p=create.json().data;}
 if(p.status!=='LOCKED'){const lock=await req('POST',base+`/conduct-periods/${p.id}/lock`,{expectedVersion:p.version},true);assert.equal(lock.statusCode,200,lock.body);p=lock.json().data;}
 const publish=await req('POST',base+`/conduct-periods/${p.id}/publish`,{expectedSourceVersion:p.dataVersion},true);assert.equal(publish.statusCode,200,publish.body);
 const cfg=(await req('GET',portalUrl)).json().data,set=await req('POST',portalUrl,portalBody({expectedVersion:cfg.version,publicStudentConductEnabled:true}),true);assert.equal(set.statusCode,200,set.body);const slug=set.json().data.slug;
 const detail=await server.inject({method:'GET',url:`/api/v1/public/classes/${slug}/students/${seedId('student:A:10A1:1')}`});assert.equal(detail.statusCode,200,detail.body);assert.ok(detail.json().data.conduct.length>0);
 const report=await req('GET',base+'/reports/parent-conduct?from=2026-09-01&to=2026-10-01');assert.equal(report.statusCode,200,report.body);assert.equal(report.json().data.dataSource,'PUBLISHED_SNAPSHOT');assert.ok(report.json().data.rows.length>=5);assert.ok(report.json().data.publicationIds.includes(publish.json().data.id));
 const single=await req('GET',base+`/reports/parent-conduct?from=2026-09-01&to=2026-10-01&studentId=${seedId('student:A:10A1:1')}`);assert.equal(single.statusCode,200,single.body);assert.equal(single.json().data.rows.length,1);
 for(const data of [single.json().data,report.json().data]){const render=await import('../../dist/modules/reports/report-render.js');const target=`/data/uploads/today-p0-${data.rows.length}.pdf`;if(fs.existsSync(target))fs.unlinkSync(target);await render.renderReport(target,'PDF',data);assert.ok(fs.statSync(target).size>10000);}
});
test('timetable draft, validate, publish feeds the public portal from database',async()=>{
 const base=`/api/v1/schools/${school}/classes/${cls}`,b={startsOn:'2026-11-02',endsOn:'2026-11-09',entries:[{weekday:1,periodNumber:1,subjectId:seedId('subject:A:math'),memberId:seedId('member:A:teacher-b'),roomId:null,startsAtLocal:'07:00',endsAtLocal:'07:45'}]},draft=await req('POST',base+'/timetables',b,true);assert.equal(draft.statusCode,201,draft.body);
 let source=draft.json().data;const validated=await req('POST',base+`/timetables/${source.id}/validate`,{expectedVersion:source.version},true);assert.equal(validated.statusCode,200,validated.body);assert.equal(validated.json().data.valid,true,validated.body);
 source=(await req('GET',base+`/timetables/${source.id}`)).json().data;const published=await req('POST',base+`/timetables/${source.id}/publish`,{expectedSourceVersion:source.dataVersion},true);assert.equal(published.statusCode,200,published.body);
 const cfg=(await req('GET',portalUrl)).json().data,pub=await server.inject({method:'GET',url:`/api/v1/public/classes/${cfg.slug}`});assert.equal(pub.statusCode,200,pub.body);assert.ok(pub.json().data.timetable.some(l=>l.subjectName==='Toán'));
});

test('published attendance requires its own portal opt-in and excludes internal notes',async()=>{
 const base=`/api/v1/schools/${school}/classes/${cls}/attendance`,date='2026-09-22';
 const list=await req('GET',base+'?from='+date+'&to=2026-09-23');assert.equal(list.statusCode,200,list.body);
 let session=list.json().data.find(s=>s.date===date&&s.slot==='AFTERNOON');
 if(!session){const created=await req('POST',base,{date,granularity:'DAILY',slot:'AFTERNOON'},true);assert.equal(created.statusCode,201,created.body);session=created.json().data;}
 else session=(await req('GET',base+'/'+session.id)).json().data;
 if(session.status!=='LOCKED'){const saved=await req('PATCH',base+'/'+session.id+'/records',{expectedVersion:session.version,records:session.records.map(r=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'PRESENT',internalNote:'PRIVATE_P0_NOTE'}))},true);assert.equal(saved.statusCode,200,saved.body);session=saved.json().data;}
 const published=await req('POST',base+'/'+session.id+'/publish',{expectedSourceVersion:session.dataVersion},true);assert.equal(published.statusCode,200,published.body);
 let cfg=(await req('GET',portalUrl)).json().data;let saved=await req('POST',portalUrl,portalBody({expectedVersion:cfg.version,publicStudentConductEnabled:true}),true);assert.equal(saved.statusCode,200,saved.body);cfg=saved.json().data;
 const path=`/api/v1/public/classes/${cfg.slug}/students/${seedId('student:A:10A1:1')}`;assert.deepEqual((await server.inject({method:'GET',url:path})).json().data.attendance,[]);
 saved=await req('POST',portalUrl,portalBody({expectedVersion:cfg.version,publicStudentConductEnabled:true,publicStudentAttendanceEnabled:true}),true);assert.equal(saved.statusCode,200,saved.body);
 const detail=await server.inject({method:'GET',url:path});assert.equal(detail.statusCode,200,detail.body);assert.ok(detail.json().data.attendance.some(a=>a.date===date&&a.status==='PRESENT'));assert.ok(!detail.body.includes('PRIVATE_P0_NOTE')&&!detail.body.includes('internalNote'));
});

test('single and class parent PDFs pass native queued worker and authorized download',async()=>{
 const ids=[];for(const studentId of [seedId('student:A:10A1:1'),undefined]){const queued=await req('POST',`/api/v1/schools/${school}/exports`,{reportType:'parent-conduct',format:'PDF',scope:'CLASS',classId:cls,yearId:yr,from:'2026-09-01',to:'2026-10-01',dataSource:'PUBLISHED_SNAPSHOT',...(studentId?{studentId}:{})},true);assert.equal(queued.statusCode,202,queued.body);ids.push(queued.json().data.id);}
 const worker=new WorkerRunner();try{for(let i=0;i<20;i++){const job=await worker.claim(school);if(!job)break;await worker.run(job);}}finally{await worker.close();}
 for(const id of ids){const status=await req('GET',`/api/v1/schools/${school}/exports/${id}`);assert.equal(status.json().data.status,'COMPLETED',status.body);const file=await req('GET',`/api/v1/schools/${school}/exports/${id}/download`);assert.equal(file.statusCode,200,file.body);assert.equal(file.headers['content-type'],'application/pdf');assert.ok(file.rawPayload.subarray(0,5).toString()==='%PDF-');}
});
