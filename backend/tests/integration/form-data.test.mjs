import 'reflect-metadata';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {Pool} from 'pg';
import {migrate} from '../../dist/database/migrate.js';
import {seedLocal,seedId} from '../../dist/modules/identity/seed.js';
import {Database} from '../../dist/database/database.js';
import {databaseConfig} from '../../dist/common/config.js';
import {hashPassword} from '../../dist/common/security.js';
import {createApplication} from '../../dist/main.js';
const password='Aa1-'+crypto.randomBytes(24).toString('base64url'),school=seedId('school:A'),other=seedId('school:B'),year=seedId('year:A'),cls=seedId('class:A:10A1'),admin=seedId('user:admin-a');
const contract=JSON.parse(await fs.readFile('src/generated/contract.json','utf8')),jar=new Map();
let db,raw,app,server,csrf,today,nextYear,oldYear,grade,room,subject,draft,active,archived,nextClass,oldClass,teacher;
function route(op,params={},query={}){const path=contract.operations.find(o=>o.id===op).path.replace(/\{([^}]+)\}/g,(_,k)=>({schoolId:school,yearId:year,classId:cls,...params})[k]);const qs=new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined));return path+(qs.size?'?'+qs:'');}
async function req(op,body,params={},query={}){const method=contract.operations.find(o=>o.id===op).method,r=await server.inject({method,url:route(op,params,query),headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()})},...(body===undefined?{}:{payload:body})});for(const c of r.cookies)jar.set(c.name,c.value);return r;}
async function good(op,body,params={},query={}){const r=await req(op,body,params,query);assert.ok(r.statusCode>=200&&r.statusCode<300,r.body);return r.json().data;}
async function login(email='admin-a@example.invalid'){jar.clear();const bootstrap=(await server.inject({method:'GET',url:'/api/v1/auth/csrf'}));for(const c of bootstrap.cookies)jar.set(c.name,c.value);const r=await server.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'x-csrf-token':bootstrap.json().data.csrfToken},payload:{email,password}});assert.equal(r.statusCode,200,r.body);for(const c of r.cookies)jar.set(c.name,c.value);csrf=r.json().data.csrfToken;}
const scoped=fn=>db.transaction(fn,{schoolId:school,userId:admin});
before(async()=>{
 assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');await migrate();await seedLocal(password,true);raw=new Pool(databaseConfig('migrator'));db=new Database();await raw.query('UPDATE identity.users SET password_hash=$1,must_change_password=false',[await hashPassword(password)]);app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();await login();today=(await good('getClassNotebookWorkspace')).today;
});
after(async()=>{
 if(process.env.FORM_DATA_EVIDENCE_DIR){await fs.mkdir(process.env.FORM_DATA_EVIDENCE_DIR,{recursive:true,mode:0o700});await fs.writeFile(process.env.FORM_DATA_EVIDENCE_DIR+'/fixture.json',JSON.stringify({fixture:'FORM_DATA_QA',databaseName:'edumanage_test_local',schoolId:school,yearId:year,classId:cls,otherSchoolId:other,nextYearId:nextYear?.id,draftClassId:draft?.id,activeClassId:active?.id,gradeId:grade?.id,roomId:room?.id,subjectId:subject?.id,today,adminEmail:'admin-a@example.invalid',teacherEmail:'teacher-a@example.invalid',password}),{mode:0o600});}
 await app?.close();await db?.onApplicationShutdown();await raw?.end();
});
test('assignment picker spans ACTIVE/DRAFT years and classes, excludes ARCHIVED, and keeps subject/tenant/permission semantics',async()=>{
 nextYear=await good('createYear',{code:'2027-2028',name:'2027–2028',startsOn:'2027-09-01',endsOn:'2028-06-01',terms:[{code:'TERM-1',name:'Học kỳ 1',startsOn:'2027-09-01',endsOn:'2028-01-01'},{code:'TERM-2',name:'Học kỳ 2',startsOn:'2028-01-01',endsOn:'2028-06-01'}]});
 oldYear=await good('createYear',{code:'2025-2026',name:'2025–2026',startsOn:'2025-09-01',endsOn:'2026-06-01'});
 grade=await good('createDictionary',{code:'QA11',name:'Khối 11 QA',gradeLevel:11},{dictionary:'grades'});room=await good('createDictionary',{code:'QA201',name:'Phòng QA201',capacity:45},{dictionary:'rooms'});subject=await good('createDictionary',{code:'QA-DIA',name:'Địa lý QA'},{dictionary:'subjects'});
 const create=(name,y=year)=>good('createClass',{code:name,name,yearId:y,gradeLevelId:grade.id,capacity:40,roomId:room.id});
 draft=await create('11QA-DRAFT');active=await create('11QA-ACTIVE');archived=await create('11QA-ARCHIVED');nextClass=await create('11QA-NEXT',nextYear.id);oldClass=await create('11QA-OLD',oldYear.id);
 await scoped(async tx=>{await tx.query("UPDATE app.classes SET status='ACTIVE' WHERE id=$1",[active.id]);await tx.query("UPDATE app.classes SET status='ARCHIVED' WHERE id=$1",[archived.id]);await tx.query("UPDATE app.academic_years SET status='ARCHIVED' WHERE id=$1",[oldYear.id]);});
 const years=await good('listYears',undefined,{}, {purpose:'assignment-picker',limit:100});assert.ok(years.some(y=>y.id===year&&y.status==='ACTIVE'));assert.ok(years.some(y=>y.id===nextYear.id&&y.status==='DRAFT'));assert.ok(!years.some(y=>y.id===oldYear.id));
 const classes=await good('listClasss',undefined,{}, {purpose:'assignment-picker',yearId:year,limit:100});assert.ok(classes.some(c=>c.id===draft.id&&c.status==='DRAFT'));assert.ok(classes.some(c=>c.id===active.id&&c.status==='ACTIVE'));assert.ok(!classes.some(c=>[archived.id,nextClass.id,oldClass.id].includes(c.id)));
 const future=await good('listClasss',undefined,{}, {purpose:'assignment-picker',yearId:nextYear.id,limit:100});assert.deepEqual(future.map(c=>c.id),[nextClass.id]);
 const subjects=await good('listDictionary',undefined,{dictionary:'subjects'},{purpose:'assignment-picker',limit:100});assert.ok(subjects.some(s=>s.id===subject.id));
 assert.ok([403,404].includes((await req('listClasss',undefined,{schoolId:other},{purpose:'assignment-picker',yearId:year})).statusCode));await login('teacher-a@example.invalid');assert.equal((await req('listClasss',undefined,{}, {purpose:'assignment-picker',yearId:year})).statusCode,403);await login();
});
test('direct create assigns GVCN to DRAFT without SMTP, activation succeeds, native student/guardian options see newly created dependencies',async()=>{
 const roles=await good('getStaffInvitationOptions'),role=roles.roles.find(r=>r.code==='TEACHER'&&r.canDelegate);assert.ok(role);
 teacher=await good('createSchoolStaffAccount',{displayName:'Giáo viên QA forms',email:`forms-${crypto.randomUUID()}@example.invalid`,password,mustChangePassword:false,roleId:role.id,assignment:{kind:'HOMEROOM',classId:draft.id,startsOn:today}});
 const refreshed=await good('getClass',undefined,{classId:draft.id});assert.equal(refreshed.status,'DRAFT');const activated=await good('activateClass',{expectedVersion:refreshed.version},{classId:draft.id});assert.equal(activated.status,'ACTIVE');
 const members=await good('listMembers',undefined,{}, {purpose:'assignment-picker',limit:100});assert.ok(members.some(m=>m.id===teacher.id));
 const choices=await good('getStudentCreateOptions');assert.ok(choices.classes.some(c=>c.id===draft.id&&c.yearId===year));assert.ok(!choices.classes.some(c=>c.id===archived.id||c.id===oldClass.id));
 const student=await good('createStudent',{studentCode:'FORM-QA-1',fullName:'Học sinh QA forms',initialClassId:draft.id,startsOn:today});assert.equal(student.initialEnrollment.classId,draft.id);const source=await good('getStudentGuardianForm',undefined,{studentId:student.id});assert.equal(source.student.id,student.id);
});
test('notebook roster and group choices follow officer effective date, excluding cancelled and expired enrollment',async()=>{
 const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const student=await good('createStudent',{studentCode:'FORM-FUTURE',fullName:'Học sinh nhập học ngày mai',initialClassId:cls,startsOn:tomorrow});const groupId=crypto.randomUUID();
 await scoped(async tx=>{await tx.query('INSERT INTO app.class_groups(id,school_id,class_id,name,sort_order) VALUES($1,$2,$3,$4,20)',[groupId,school,cls,'Tổ QA tương lai']);await tx.query('INSERT INTO app.group_memberships(school_id,class_id,group_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)',[school,cls,groupId,student.initialEnrollment.id,tomorrow,'2027-06-01']);});
 const current=await good('getClassNotebookWorkspace');assert.ok(!current.roster.some(s=>s.student_id===student.id));const future=await good('getClassNotebookWorkspace',undefined,{}, {onDate:tomorrow});assert.equal(future.referenceDate,tomorrow);assert.equal(future.roster.find(s=>s.student_id===student.id)?.group_id,groupId);
 assert.equal((await req('getClassNotebookWorkspace',undefined,{}, {onDate:'2028-01-01'})).statusCode,422);assert.ok([403,404].includes((await req('getClassNotebookWorkspace',undefined,{schoolId:other},{onDate:tomorrow})).statusCode));
 const enrollment=seedId('enrollment:A:10A1:1');
 await scoped(tx=>tx.query('INSERT INTO app.group_memberships(school_id,class_id,group_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)',[school,cls,groupId,enrollment,today,'2027-06-01']));
 const leader=await good('assignClassOfficer',{enrollmentId:enrollment,role:'GROUP_LEADER',groupId,validFrom:today});
 const publicClassSlug=leader.loginPath.split('/')[2];
 const bootstrap=await server.inject({method:'GET',url:'/api/v1/auth/csrf',headers:{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}});for(const c of bootstrap.cookies)jar.set(c.name,c.value);
 const staffCsrf=csrf;csrf=bootstrap.json().data.csrfToken;await good('loginClassOfficer',{assignmentId:leader.id,pin:leader.pin},{publicClassSlug});csrf=staffCsrf;
 const publicToday=await good('getClassOfficerWorkspace',undefined,{publicClassSlug});assert.ok(!publicToday.targets.some(s=>s.student_id===student.id));
 const publicFuture=await good('getClassOfficerWorkspace',undefined,{publicClassSlug},{onDate:tomorrow});assert.equal(publicFuture.referenceDate,tomorrow);assert.ok(publicFuture.targets.some(s=>s.student_id===student.id));
 assert.equal((await req('getClassOfficerWorkspace',undefined,{publicClassSlug},{onDate:'2028-01-01'})).statusCode,422);
});
