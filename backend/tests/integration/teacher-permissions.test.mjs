import 'reflect-metadata';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../../dist/database/migrate.js';
import {seedLocal,seedId} from '../../dist/modules/identity/seed.js';
import {Database} from '../../dist/database/database.js';
import {databaseConfig} from '../../dist/common/config.js';
import {hashPassword} from '../../dist/common/security.js';
import {createApplication} from '../../dist/main.js';
import {WorkerRunner} from '../../dist/workers/runner.js';
import {Permissions} from '../../dist/common/permissions.js';
const password='Aa1-'+crypto.randomBytes(24).toString('base64url'),school=seedId('school:A'),other=seedId('school:B'),year=seedId('year:A'),cls=seedId('class:A:10A1'),cls2=seedId('class:A:10A2'),admin=seedId('user:admin-a'),contract=JSON.parse(await fs.readFile('src/generated/contract.json','utf8')),jar=new Map();
let db,raw,app,server,csrf,today,worker,full,subject,assignmentId,secondaryEmail,secondaryId;
const ids={schoolId:school,yearId:year,classId:cls};
function route(op,params={},query={}){const o=contract.operations.find(o=>o.id===op);assert.ok(o,op);return o.path.replace(/\{([^}]+)\}/g,(_,k)=>({...ids,...params})[k])+(Object.keys(query).length?'?'+new URLSearchParams(query):'');}
async function req(op,body,params={},query={}){const o=contract.operations.find(o=>o.id===op),r=await server.inject({method:o.method,url:route(op,params,query),headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(o.method==='GET'?{}:{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()})},...(body===undefined?{}:{payload:body})});for(const c of r.cookies)jar.set(c.name,c.value);return r;}
async function good(op,body,params={},query={}){const r=await req(op,body,params,query);assert.ok(r.statusCode>=200&&r.statusCode<300,op+': '+r.body);return r.json().data;}
async function login(email='admin-a@example.invalid'){jar.clear();const boot=await server.inject({method:'GET',url:'/api/v1/auth/csrf'});for(const c of boot.cookies)jar.set(c.name,c.value);const r=await server.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'x-csrf-token':boot.json().data.csrfToken},payload:{email,password}});assert.equal(r.statusCode,200,r.body);for(const c of r.cookies)jar.set(c.name,c.value);csrf=r.json().data.csrfToken;}
const saveSession=()=>({cookies:[...jar],csrf});
const restoreSession=s=>{jar.clear();for(const [k,v] of s.cookies)jar.set(k,v);csrf=s.csrf;};
const scoped=fn=>db.transaction(fn,{schoolId:school,userId:admin});
async function drain(){let e;while(e=await worker.claim(school))await worker.run(e);}
async function uploadCsv(csv,purpose='IMPORT'){
 const boundary='edu-'+crypto.randomUUID(),payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n--${boundary}\r\nContent-Disposition: form-data; name="classId"\r\n\r\n${cls}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="class.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`);
 const r=await server.inject({method:'POST',url:route('uploadFile'),headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':'multipart/form-data; boundary='+boundary},payload});assert.equal(r.statusCode,200,r.body);await drain();return r.json().data;
}
async function writesAcrossTabs(actor,index){
 const current=(await scoped(tx=>tx.query('SELECT * FROM app.school_weeks WHERE year_id=$1 AND starts_on<=$2 ORDER BY starts_on DESC LIMIT 1 OFFSET $3',[year,today,index]))).rows[0];
 const weeks=(await scoped(tx=>tx.query('SELECT * FROM app.school_weeks WHERE year_id=$1 AND starts_on>$2 ORDER BY starts_on',[year,today]))).rows;
 assert.ok(weeks[index*2+1]);const source=weeks[index*2],target=weeks[index*2+1],enrollment=seedId('enrollment:A:10A1:1');
 const student=await good('createStudent',{fullName:'Học sinh smoke '+index,initialClassId:cls,startsOn:today});
 await good('createGroup',{name:'Tổ smoke '+index,sortOrder:index});
 let attendance=await good('createAttendanceSession',{date:today,granularity:'DAILY',slot:index?'MORNING':'AFTERNOON'});
 attendance=await good('saveAttendanceRecords',{expectedVersion:attendance.version,records:attendance.records.map(r=>({enrollmentId:r.enrollmentId,expectedVersion:r.version,status:'PRESENT'}))},{sessionId:attendance.id});
 await good('publishAttendance',{expectedSourceVersion:attendance.dataVersion},{sessionId:attendance.id});
 const period=await good('createConductPeriod',{weekId:current.id});
 if(period.status==='OPEN')await good('reviewConductPeriod',undefined,{periodId:period.id});
 let live=(await scoped(tx=>tx.query('SELECT status,version,data_version AS "dataVersion" FROM app.conduct_periods WHERE id=$1',[period.id]))).rows[0];live.id=period.id;
 if(live.status!=='LOCKED')await good('lockConductPeriod',{expectedVersion:live.version},{periodId:live.id});
 live=(await scoped(tx=>tx.query('SELECT id,status,version,data_version AS "dataVersion" FROM app.conduct_periods WHERE id=$1',[period.id]))).rows[0];await good('publishConductPeriod',{expectedSourceVersion:live.dataVersion},{periodId:live.id});
 await good('calculateClassPeriodicConduct',{periodType:'MONTH',periodKey:current.starts_on.slice(0,7),aggregation:'AVERAGE'});
 const row=(await scoped(tx=>tx.query('SELECT version FROM app.classes WHERE id=$1',[cls]))).rows[0];
 await good('saveClassNotebookSettings',{expectedVersion:row.version,settings:{weeklySubmitTime:'18:00',weeklyLockTime:'20:00',reminderTemplate:'Nhắc việc '+index}});
 const oldWeek=(await scoped(tx=>tx.query('SELECT version FROM app.class_week_settings WHERE class_id=$1 AND week_id=$2',[cls,source.id]))).rows[0];
 await good('saveClassWeekDeadline',{weekId:source.id,expectedVersion:oldWeek?.version??0,submitDeadline:source.ends_on+'T10:00:00Z',lockDeadline:source.ends_on+'T12:00:00Z',reason:'Điều chỉnh hạn nộp trong lớp'});
 const seat=await good('getClassSeatingWorkspace');await good('saveClassSeatingRevision',{effectiveOn:today,expectedRevision:seat.latestRevision,seats:[{key:'A1',row:0,column:0,enrollmentId:enrollment}],note:'Sơ đồ kiểm thử '+index});
 const entries=[{weekday:1,periodNumber:14+index,subjectId:seedId('subject:A:math'),memberId:seedId('member:A:teacher-b'),startsAtLocal:index?'15:00':'14:00',endsAtLocal:index?'15:45':'14:45'}];
 let timetable=await good('createTimetable',{startsOn:source.starts_on,endsOn:source.ends_on,entries});
 timetable=await good('updateTimetable',{expectedVersion:timetable.version,entries},{timetableId:timetable.id});
 await good('validateTimetable',{expectedVersion:timetable.version},{timetableId:timetable.id});timetable=await good('getTimetable',undefined,{timetableId:timetable.id});
 await good('publishTimetable',{expectedSourceVersion:timetable.dataVersion,expectedPublicationId:(await good('getScheduleWorkspace',undefined,{}, {classId:cls})).publicationId},{timetableId:timetable.id});
 const copy=await good('copyClassNotebookSchedule',{weekId:target.id,kind:'TIMETABLE'});assert.equal(copy.status,'DRAFT');
 const duty=await good('createDuty',{startsOn:source.starts_on,endsOn:source.ends_on,assignments:[{enrollmentId:enrollment,dutyDate:source.starts_on,task:'Trực nhật '+index}]});await good('publishDuty',{expectedSourceVersion:duty.dataVersion},{dutyId:duty.id});
 const activity=await good('createActivity',{title:'Hoạt động quyền '+index,description:'Minh chứng hoạt động',dueAt:new Date(Date.now()+3*86400000).toISOString(),startsAt:new Date().toISOString(),evidenceRequired:true,maxFiles:1,enrollmentIds:[enrollment]});
 await good('assignActivity',{expectedVersion:activity.version},{activityId:activity.id});const participants=await good('listParticipants',undefined,{activityId:activity.id});await good('issueStudentEvidenceAccess',{participantId:participants[0].id,expiresAt:new Date(Date.now()+86400000).toISOString()});
 const announcement=await good('createClassAnnouncement',{yearId:year,title:'Thông báo quyền '+index,sanitizedHtml:'<p>Thông báo lớp</p>',targets:[{kind:'CLASS',id:cls}]});await good('publishClassAnnouncement',{expectedSourceVersion:announcement.dataVersion},{announcementId:announcement.id});
 const file=await uploadCsv('title,value\nTệp lớp,1','CLASS_DOCUMENT');await good('createFileLink',{fileId:file.id,classId:cls,shareWithGuardian:false});
 const relation=(await scoped(tx=>tx.query('SELECT * FROM app.guardian_relationships WHERE id=$1',[seedId('relationship:A:3')]))).rows[0];
 await good('verifyRelationship',{expectedVersion:relation.version,canReceiveInfo:true,verificationNote:'Giám hộ xác minh bởi người có quyền'},{relationshipId:relation.id});
 await good('issueParentAccess',{studentId:seedId('student:A:10A1:1'),yearId:year,relationshipId:relation.id,allowedSections:['overview'],allowDownload:false,expiresAt:new Date(Date.now()+86400000).toISOString()});
 const portal=await good('getClassPublicPortalSettings');await good('saveClassPublicPortalSettings',{expectedVersion:portal.version,publicPortalEnabled:true,publicStudentConductEnabled:false,publicStudentAttendanceEnabled:false,publicStudentActivitiesEnabled:false,publicRankingEnabled:false,publicSeatingEnabled:false,rotateSlug:false});
 const ruleClass=(await scoped(tx=>tx.query('SELECT version FROM app.classes WHERE id=$1',[cls]))).rows[0];
 await good('applyClassRules',{expectedClassVersion:ruleClass.version,ruleSetId:seedId('ruleset:A'),startsOn:weeks[4+index].starts_on});
 const staff=(await scoped(tx=>tx.query('SELECT staff_code FROM app.memberships WHERE id=$1',[seedId('member:A:teacher-b')]))).rows[0];
 const inputFile=await uploadCsv('weekday,slot,startsAt,endsAt,subjectCode,staffCode\n1,'+(18+index)+',17:00,17:45,MATH,'+staff.staff_code);
 let imported=await good('createImport',{kind:'TIMETABLE',fileId:inputFile.id,yearId:year,classId:cls});await drain();imported=await good('getImport',undefined,{importId:imported.id});await good('validateImport',{expectedVersion:imported.version,mode:'ADD_ONLY',mapping:['weekday','slot','startsAt','endsAt','subjectCode','staffCode'].map(k=>({sourceColumn:k,targetField:k}))},{importId:imported.id});imported=await settle(imported.id,'READY');assert.equal(imported.summary.invalid,0);await good('commitImport',{expectedVersion:imported.version,previewHash:imported.previewHash},{importId:imported.id});await settle(imported.id,'COMPLETED');
 const job=await good('createExport',{reportType:'attendance',format:'CSV',yearId:year,classId:cls,from:today,to:new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10),dataSource:'LIVE_INTERNAL',scope:'CLASS'});await drain();assert.equal((await good('getExport',undefined,{exportId:job.id})).status,'COMPLETED');
 const actions=['createStudent','createGroup','saveAttendanceRecords','publishAttendance','saveClassNotebookSettings','saveClassWeekDeadline','saveClassSeatingRevision','createTimetable','updateTimetable','publishTimetable','createDuty','createActivity','assignActivity','createClassAnnouncement','publishClassAnnouncement','uploadFile','createFileLink','verifyRelationship','issueParentAccess','saveClassPublicPortalSettings','applyClassRules','createExport'];
 const audited=(await scoped(tx=>tx.query('SELECT DISTINCT action FROM app.audit_events WHERE actor_user_id=$1 AND action=ANY($2::text[])',[actor,actions]))).rows.map(r=>r.action);for(const action of actions)assert.ok(audited.includes(action),'Actual actor audit for '+action);
 assert.ok(student.id);
}
async function settle(id,target){for(let i=0;i<80;i++){let event;while(event=await worker.claim(school))await worker.run(event);const job=await good('getImport',undefined,{importId:id});if(job.status===target)return job;assert.notEqual(job.status,'FAILED');}assert.fail('Import did not settle');}
before(async()=>{
 const baseline=await fs.mkdtemp(path.join(os.tmpdir(),'edu-permission-065-'));for(const file of await fs.readdir('migrations'))if(file.slice(0,3)<='065')await fs.copyFile(path.join('migrations',file),path.join(baseline,file));await migrate({directory:baseline});await seedLocal(password,true);
 raw=new Pool({...databaseConfig('migrator'),user:'postgres',password:await fs.readFile('/run/secrets/db_admin_password','utf8').then(s=>s.trim())});db=new Database();
 await raw.query('UPDATE identity.users SET password_hash=$1,must_change_password=false',[await hashPassword(password)]);
 for(const key of ['A','B'])await db.transaction(tx=>tx.query("DELETE FROM app.role_permissions WHERE school_id=$1 AND role_id=$2 AND action_code='import.read'",[seedId('school:'+key),seedId('role:'+key+':SCHOOL_ADMIN')]),{schoolId:seedId('school:'+key)});
 assert.deepEqual((await migrate()).applied,['066-school-admin-permission-authority.sql']);
 app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();worker=new WorkerRunner();await login();today=(await good('getMyContext')).memberships.find(m=>m.schoolId===school).today;
});
after(async()=>{if(process.env.TEACHER_PERMISSION_EVIDENCE_DIR){await fs.mkdir(process.env.TEACHER_PERMISSION_EVIDENCE_DIR,{recursive:true});await fs.writeFile(process.env.TEACHER_PERMISSION_EVIDENCE_DIR+'/fixture.json',JSON.stringify({fixture:'TEACHER_PERMISSION_QA',databaseName:'edumanage_test_local',schoolId:school,yearId:year,classId:cls,otherClassId:cls2,password,secondaryEmail,fullRoleId:full?.id,subjectRoleId:subject?.id,assignmentId,today}));}await worker?.close();await app?.close();await db?.onApplicationShutdown();await raw?.end();});

test('every school admin has all 75 school actions; migration is tenant-aware and system templates stay immutable',async()=>{
 const expected=contract.permissions.filter(a=>!a.startsWith('platform.')).sort();assert.equal(expected.length,75);
 for(const key of ['A','B']){const values=(await db.transaction(tx=>tx.query("SELECT action_code FROM app.role_permissions WHERE school_id=$1 AND role_id=$2",[seedId('school:'+key),seedId('role:'+key+':SCHOOL_ADMIN')]),{schoolId:seedId('school:'+key)})).rows.map(r=>r.action_code).sort();assert.deepEqual(values,expected);}
 await raw.query("UPDATE platform.schools SET settings=settings||'{\"homeroomMayPublish\":false}'::jsonb WHERE id=$1",[school]);
 const p=app.get(Permissions);await scoped(async tx=>{for(const action of expected)await p.require(tx,{userId:admin},action,{schoolId:school,classId:cls});});
 assert.equal((await req('updateRole',{expectedVersion:1,reason:'Do not mutate system',permissions:[]},{roleId:seedId('role:A:HOMEROOM')})).statusCode,409);
 await raw.query("UPDATE platform.schools SET settings=settings||'{\"homeroomMayPublish\":true}'::jsonb WHERE id=$1",[school]);
 const teacher=seedId('role:A:TEACHER'),newAdmin=await good('createSchoolStaffAccount',{displayName:'Quản trị thứ hai',email:'second-admin-'+crypto.randomUUID()+'@example.invalid',roleId:teacher,password,mustChangePassword:false});secondaryId=newAdmin.userId;secondaryEmail=newAdmin.email;
 const member=await good('getMember',undefined,{memberId:newAdmin.id});await good('replaceMemberSchoolRoles',{expectedVersion:member.version,roleIds:[seedId('role:A:SCHOOL_ADMIN')],reason:'Chủ động cấp quản trị trường thứ hai'},{memberId:newAdmin.id});await login(secondaryEmail);
 const catalog=await good('getTeacherPermissionProfiles');assert.equal(catalog.catalog.length,75);assert.ok(catalog.catalog.every(p=>!p.action.startsWith('platform.')));
});
test('clone exact system scopes, validate invalid combinations and create editable full/subject profiles',async()=>{
 const source=await good('getRole',undefined,{roleId:seedId('role:A:HOMEROOM')});full=await good('cloneSchoolRole',{code:'GVCN_CUSTOM_FULL',label:'GVCN đầy đủ tùy chỉnh',reason:'Sao chép để chỉnh đủ quyền'},{roleId:source.id});assert.equal(full.systemRole,false);assert.deepEqual(full.permissions,source.permissions);
 let r=await req('updateRole',{expectedVersion:full.version,reason:'Kiểm tra phạm vi vô nghĩa',permissions:[{action:'school.settings',scopes:['CLASS']}]},{roleId:full.id});assert.equal(r.statusCode,422);assert.equal(r.json().code,'INVALID_PERMISSION_SCOPE');
 full=await good('updateRole',{expectedVersion:full.version,reason:'Cấp quyền GVCN đầy đủ',permissions:contract.permissionPresets.find(p=>p.id==='homeroom-full').permissions},{roleId:full.id});
 subject=await good('cloneSchoolRole',{code:'GVBM_CUSTOM_STANDARD',label:'GVBM tiêu chuẩn tùy chỉnh',reason:'Sao chép quyền giáo viên bộ môn'},{roleId:seedId('role:A:SUBJECT_TEACHER')});subject=await good('updateRole',{expectedVersion:subject.version,reason:'Cấp preset bộ môn chuẩn',permissions:contract.permissionPresets.find(p=>p.id==='subject-standard').permissions},{roleId:subject.id});
 assert.equal((await req('createRole',{code:'BAD_PLATFORM',label:'Không hợp lệ',permissions:[{action:'platform.read',scopes:['SCHOOL']}]})).statusCode,403);
 assert.equal((await req('getRole',undefined,{schoolId:other,roleId:full.id})).statusCode,404);
});
test('default preview, apply-current and per-assignment override preserve member/class/dates and revoke the former grant',async()=>{
 assignmentId=seedId('assignment:A:teacher-a:10A1:HOMEROOM');const old=(await scoped(tx=>tx.query('SELECT * FROM app.teaching_assignments WHERE id=$1',[assignmentId]))).rows[0],profile=await good('getTeacherPermissionProfiles');
 const input={expectedVersion:profile.version,kind:'HOMEROOM',roleId:full.id,applyCurrent:true,reason:'Áp dụng quyền GVCN đầy đủ cho phân công đang chạy'},preview=await good('previewDefaultTeacherProfile',input);assert.ok(preview.affected>0&&preview.classIds.includes(cls));await good('setDefaultTeacherProfile',input);
 const changed=(await scoped(tx=>tx.query('SELECT * FROM app.teaching_assignments WHERE id=$1',[assignmentId]))).rows[0];for(const key of ['member_id','class_id','starts_on','ends_on'])assert.equal(changed[key],old[key]);assert.notEqual(changed.role_grant_id,old.role_grant_id);assert.ok((await scoped(tx=>tx.query('SELECT revoked_at FROM app.role_grants WHERE id=$1',[old.role_grant_id]))).rows[0].revoked_at);
 const subjectId=seedId('assignment:A:teacher-b:10A1:SUBJECT'),a=(await scoped(tx=>tx.query('SELECT version FROM app.teaching_assignments WHERE id=$1',[subjectId]))).rows[0];await good('changeAssignmentProfile',{expectedVersion:a.version,roleId:subject.id,reason:'Chọn mẫu quyền riêng cho phân công bộ môn'},{assignmentId:subjectId});
 assert.equal((await req('changeAssignmentProfile',{expectedVersion:a.version,roleId:subject.id,reason:'Không ghi đè nguồn đã thay đổi'},{assignmentId:subjectId})).statusCode,409);
 const state=await good('getTeacherPermissionProfiles'),subDefault={expectedVersion:state.version,kind:'SUBJECT',roleId:subject.id,applyCurrent:false,reason:'Dùng mặc định mới cho các phân công bộ môn mới'};
 assert.equal((await good('previewDefaultTeacherProfile',subDefault)).affected,0);assert.equal((await good('setDefaultTeacherProfile',subDefault)).subjectTeacherRoleId,subject.id);
 const physics=await good('createDictionary',{code:'PHY_PERM',name:'Vật lý kiểm thử quyền'},{dictionary:'subjects'}),created=await good('createSchoolStaffAccount',{displayName:'Giáo viên dùng mặc định bộ môn',email:'default-subject-'+crypto.randomUUID()+'@example.invalid',roleId:seedId('role:A:TEACHER'),password,mustChangePassword:false,assignment:{kind:'SUBJECT',classId:cls2,subjectId:physics.id,startsOn:today}});
 const newGrant=(await scoped(tx=>tx.query('SELECT g.role_id FROM app.teaching_assignments a JOIN app.role_grants g ON g.id=a.role_grant_id WHERE a.member_id=$1',[created.id]))).rows[0];assert.equal(newGrant.role_id,subject.id);
 const events=(await scoped(tx=>tx.query("SELECT actor_user_id,reason FROM app.audit_events WHERE action IN ('setDefaultTeacherProfile','changeAssignmentProfile')"))).rows;assert.ok(events.length>=2&&events.every(e=>e.actor_user_id===secondaryId&&e.reason));
});
const readTabs=['getClassWorkspaceOverview','getClassRosterWorkspace','getClassGroupWorkspace','getClassSeatingWorkspace','getClassDutyWorkspace','getClassActivitiesWorkspace','getClassAnnouncementDirectory','getClassFilesWorkspace','getClassReportCatalog','getClassRuleWorkspace','getClassNotebookWorkspace','getClassPeriodicOptions','getClassPublicPortalSettings'];
test('school admin has all 16 workspace tabs and writes as their real actor without a teaching assignment',async()=>{
 const header=await good('getClassWorkspaceHeader');assert.equal(header.tabs.length,16);assert.ok(header.tabs.every(t=>t.key&&t.path!==undefined));
 for(const op of readTabs)await good(op);assert.equal((await good('getClassRosterWorkspace')).canAdd,true);
 await good('getClassAttendanceSheet',undefined,{}, {date:today,slot:'morning'});await good('listClassTimetables');
 await writesAcrossTabs(secondaryId,0);
 const group=await good('createGroup',{name:'Tổ của quản trị',sortOrder:5});const student=await good('createStudent',{fullName:'Học sinh quản trị tạo',initialClassId:cls,startsOn:today});
 assert.ok(group.id&&student.id);const audits=(await scoped(tx=>tx.query("SELECT actor_user_id FROM app.audit_events WHERE action IN ('createGroup','createStudent') AND actor_user_id=$1",[secondaryId]))).rows;assert.ok(audits.length>=2);
 assert.equal((await scoped(tx=>tx.query('SELECT count(*)::int AS count FROM app.teaching_assignments WHERE member_id=(SELECT id FROM app.memberships WHERE user_id=$1 AND school_id=$2)',[secondaryId,school]))).rows[0].count,0);
});
test('full GVCN reads all 16 tabs and manages own pupils/paste, exact class file imports; other class and STAFF/CLASSES imports denied',async()=>{
 await login('teacher-a@example.invalid');const header=await good('getClassWorkspaceHeader');assert.equal(header.tabs.length,16);assert.ok(header.tabs.every(t=>t.key&&t.path!==undefined));for(const op of readTabs)await good(op);assert.equal((await good('getClassRosterWorkspace')).canAdd,true);
 const p=app.get(Permissions);await scoped(async tx=>{for(const action of full.permissions.map(p=>p.action)){await p.require(tx,{userId:seedId('user:teacher-a')},action,{schoolId:school,classId:cls});}});
 await writesAcrossTabs(seedId('user:teacher-a'),1);
 await good('createStudent',{fullName:'Học sinh GVCN tạo',initialClassId:cls,startsOn:today});let j=await good('createStudentPasteImport',{classId:cls,yearId:year,startsOn:today,rows:[{fullName:'Học sinh GVCN dán'}]});j=await settle(j.id,'READY');await good('commitImport',{expectedVersion:j.version,previewHash:j.previewHash},{importId:j.id});await settle(j.id,'COMPLETED');
 assert.equal((await req('createStudentPasteImport',{classId:cls2,yearId:year,startsOn:today,rows:[{fullName:'Không vượt lớp'}]})).statusCode,404);
 const csv='studentCode,fullName,gender,startsOn\nCLASS-FILE-1,Học sinh tệp lớp,Nam,'+today,boundary='edu-'+crypto.randomUUID(),payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nIMPORT\r\n--${boundary}\r\nContent-Disposition: form-data; name="classId"\r\n\r\n${cls}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="class.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`);
 const uploaded=await server.inject({method:'POST',url:route('uploadFile'),headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID(),'content-type':'multipart/form-data; boundary='+boundary},payload});assert.equal(uploaded.statusCode,200,uploaded.body);const file=uploaded.json().data;
 for(let i=0;i<80;i++){const e=await worker.claim(school);if(!e)break;await worker.run(e);}
 j=await good('createImport',{kind:'STUDENTS',fileId:file.id,yearId:year,classId:cls});for(let i=0;i<80;i++){const e=await worker.claim(school);if(!e)break;await worker.run(e);}j=await good('getImport',undefined,{importId:j.id});j=await good('validateImport',{expectedVersion:j.version,mode:'ADD_ONLY',mapping:['studentCode','fullName','gender','startsOn'].map(k=>({sourceColumn:k,targetField:k}))},{importId:j.id});j=await settle(j.id,'READY');assert.equal(j.summary.invalid,0);await good('commitImport',{expectedVersion:j.version,previewHash:j.previewHash},{importId:j.id});await settle(j.id,'COMPLETED');
 for(const kind of ['STAFF','CLASSES'])assert.equal((await req('createImport',{kind,fileId:file.id,yearId:year,classId:cls})).statusCode,403);
 assert.equal((await req('createImport',{kind:'STUDENTS',fileId:file.id,yearId:year,classId:cls2})).statusCode,404);
});
test('GVBM custom profile preserves class/subject restrictions and excludes class-admin actions',async()=>{
 await login('teacher-b@example.invalid');const context=await good('getMyContext'),grant=context.memberships.find(m=>m.schoolId===school).grants.find(g=>g.roleId===subject.id);assert.ok(grant.assignmentId&&grant.classId===cls&&grant.subjectId===seedId('subject:A:math'));
 assert.equal((await good('getClassRosterWorkspace')).canAdd,false);const p=app.get(Permissions);await scoped(async tx=>{for(const action of subject.permissions.map(p=>p.action))await p.require(tx,{userId:seedId('user:teacher-b')},action,{schoolId:school,classId:cls,subjectId:seedId('subject:A:math'),allowSubject:true});await assert.rejects(p.require(tx,{userId:seedId('user:teacher-b')},'student.read',{schoolId:school,classId:cls,subjectId:crypto.randomUUID(),allowSubject:true}));});
 assert.ok([403,404].includes((await req('createStudentPasteImport',{classId:cls,yearId:year,startsOn:today,rows:[{fullName:'Bộ môn không tạo'}]})).statusCode));assert.equal((await req('getClassWorkspaceHeader',undefined,{classId:cls2})).statusCode,404);
});
test('existing teacher session sees removed/added rights immediately and custom assignment expiry/revocation removes effective access',async()=>{
 await login('teacher-a@example.invalid');const activeTeacher=saveSession();await login(secondaryEmail);const activeAdmin=saveSession();const removed=await good('updateRole',{expectedVersion:full.version,reason:'Thu hồi quyền quản lý học sinh thử nghiệm',permissions:full.permissions.filter(p=>p.action!=='student.manage')},{roleId:full.id});
 restoreSession(activeTeacher);assert.equal((await req('createStudentPasteImport',{classId:cls,yearId:year,startsOn:today,rows:[{fullName:'Đã bị thu hồi'}]})).statusCode,404);let context=await good('getMyContext');assert.ok(!context.memberships.find(m=>m.schoolId===school).grants.filter(g=>g.roleId===full.id).some(g=>g.actions.includes('student.manage')));
 restoreSession(activeAdmin);full=await good('updateRole',{expectedVersion:removed.version,reason:'Khôi phục quyền học sinh sau kiểm thử',permissions:full.permissions},{roleId:full.id});restoreSession(activeTeacher);assert.ok((await good('getMyContext')).memberships.find(m=>m.schoolId===school).grants.some(g=>g.roleId===full.id&&g.actions.includes('student.manage')));
 await scoped(tx=>tx.query('UPDATE app.teaching_assignments SET ends_on=$2 WHERE id=$1',[assignmentId,today]));assert.equal((await req('getClassWorkspaceHeader')).statusCode,404);assert.ok(!(await good('getMyContext')).memberships.find(m=>m.schoolId===school).grants.some(g=>g.roleId===full.id));
 await scoped(tx=>tx.query("UPDATE app.teaching_assignments SET ends_on='2027-06-01' WHERE id=$1",[assignmentId]));await login(secondaryEmail);const a=(await scoped(tx=>tx.query('SELECT version FROM app.teaching_assignments WHERE id=$1',[assignmentId]))).rows[0];await good('revokeAssignment',{expectedVersion:a.version,reason:'Thu hồi phân công để kiểm tra ràng buộc'},{assignmentId});restoreSession(activeTeacher);assert.equal((await req('getClassWorkspaceHeader')).statusCode,404);
 // Leave an active custom assignment in this isolated QA fixture for browser checks.
 restoreSession(activeAdmin);const next=await good('createAssignment',{memberId:seedId('member:A:teacher-a'),classId:cls,kind:'HOMEROOM',startsOn:'2026-09-01',reason:'Khôi phục mốc phân công fixture sau kiểm thử'});assignmentId=next.id;const granted=(await scoped(tx=>tx.query('SELECT role_id FROM app.role_grants WHERE id=$1',[next.roleGrantId]))).rows[0];assert.equal(granted.role_id,full.id);
});
