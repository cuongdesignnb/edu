import 'reflect-metadata';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../../dist/database/migrate.js';
import {verifyInstallation} from '../../dist/database/verify.js';
import {seedLocal,seedId} from '../../dist/modules/identity/seed.js';
import {Database} from '../../dist/database/database.js';
import {databaseConfig} from '../../dist/common/config.js';
import {PublicationsService} from '../../dist/modules/publications/publications.service.js';
import {createApplication} from '../../dist/main.js';
import {hashPassword,verifyPassword} from '../../dist/common/security.js';
import {expireWeekly} from '../../dist/modules/classroom/notebook-common.js';
import {ReportsService} from '../../dist/modules/reports/reports.service.js';
import {Permissions} from '../../dist/common/permissions.js';
import {Commands} from '../../dist/common/commands.js';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
const password='Aa1-'+crypto.randomBytes(24).toString('base64url'),school=seedId('school:A'),other=seedId('school:B'),cls=seedId('class:A:10A1'),year=seedId('year:A'),admin=seedId('user:admin-a'),jar=new Map();
let db,raw,app,server,csrf,upgrade,original,baselineHistory;
const namespace=`/api/v1/schools/${school}/classes/${cls}/notebook`;
const contract=JSON.parse(await fs.readFile('src/generated/contract.json','utf8'));
function route(op,params={}){return contract.operations.find(o=>o.id===op).path.replace(/\{([^}]+)\}/g,(_,key)=>({schoolId:school,classId:cls,yearId:year,...params})[key]);}
async function scoped(schoolId,fn){return db.transaction(fn,{schoolId,userId:admin});}
async function req(method,url,body,write=false,headers={}){const r=await server.inject({method,url,headers:{origin:process.env.APP_URL,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(write?{'x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()}:{}),...headers},...(body===undefined?{}:{payload:body})});for(const c of r.cookies)jar.set(c.name,c.value);return r;}
async function login(email='admin-a@example.invalid'){jar.clear();const bootstrap=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken,r=await req('POST','/api/v1/auth/login',{email,password},false,{'x-csrf-token':bootstrap});assert.equal(r.statusCode,200,r.body);csrf=r.json().data.csrfToken;}
async function good(method,url,body,write=false,headers={}){const r=await req(method,url,body,write,headers);assert.ok(r.statusCode>=200&&r.statusCode<300,r.body);return r.json().data;}
before(async()=>{
 assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.DB_NAME,'edumanage_test_local');
 const baseline=await fs.mkdtemp(path.join(os.tmpdir(),'edu-populated-060-'));
 for(const file of await fs.readdir('migrations'))if(/^\d{3}-.*\.sql$/.test(file)&&Number(file.slice(0,3))<=60)await fs.copyFile(path.join('migrations',file),path.join(baseline,file));
 await migrate({directory:baseline});await seedLocal(password,true);db=new Database();raw=new Pool(databaseConfig('migrator'));
 await raw.query('UPDATE identity.users SET password_hash=$1,must_change_password=false',[await hashPassword(password)]);
 const publications=new PublicationsService(db,undefined,undefined);
 for(const key of ['A','B'])await scoped(seedId('school:'+key),async tx=>{
  const schoolId=seedId('school:'+key),classId=seedId('class:'+key+':10A1'),yearId=seedId('year:'+key),weekId=seedId('week:'+key+':5'),userId=seedId('user:admin-'+key.toLowerCase());
  const p=(await tx.query("INSERT INTO app.conduct_periods(school_id,class_id,year_id,week_id,rule_set_id) VALUES($1,$2,$3,$4,$5) RETURNING *",[schoolId,classId,yearId,weekId,seedId('ruleset:'+key)])).rows[0];
  await tx.query("UPDATE app.conduct_periods SET status='LOCKED',locked_at=now(),locked_by=$3 WHERE school_id=$1 AND id=$2",[schoolId,p.id,userId]);
  const students=(await tx.query('SELECT e.student_id,s.full_name FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2',[schoolId,classId])).rows;
  const scores=students.map(s=>({studentId:s.student_id,fullName:s.full_name,basePoints:'100.00',bonusPoints:'0.00',penaltyPoints:'0.00',finalPoints:'100.00',classification:'Tốt',unreviewedCount:0}));
  const version=(await tx.query('SELECT data_version FROM app.conduct_periods WHERE school_id=$1 AND id=$2',[schoolId,p.id])).rows[0].data_version;
  await publications.create(tx,{principal:{userId},params:{schoolId},operation:{id:'test060publication'},requestId:crypto.randomUUID(),body:{}},{kind:'CONDUCT',id:p.id,schoolId,classId,yearId,version},{conduct:{students:scores},conductDisplay:{weekNumber:5,startsOn:'2026-09-28',endsOn:'2026-10-05',classLabel:'10A1'}},scores.map(s=>({studentId:s.studentId,section:'conduct',schema:'ParentConduct',payload:{periodId:p.id,periodLabel:'Tuần 5',revision:1,basePoints:s.basePoints,bonusPoints:s.bonusPoints,penaltyPoints:s.penaltyPoints,finalPoints:s.finalPoints,classification:s.classification,lines:[],publishedAt:new Date().toISOString(),adjusted:false}})),true);
 });
 original=await Promise.all(['A','B'].map(k=>scoped(seedId('school:'+k),async tx=>({students:(await tx.query('SELECT * FROM app.students ORDER BY id')).rows,classes:(await tx.query('SELECT * FROM app.classes ORDER BY id')).rows,staff:(await tx.query('SELECT * FROM app.memberships ORDER BY id')).rows,published:(await tx.query("SELECT * FROM app.publication_revisions WHERE status='PUBLISHED' ORDER BY id")).rows,children:(await tx.query('SELECT * FROM app.parent_publication_items ORDER BY id')).rows}))));
 baselineHistory=(await raw.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
 const failure=await fs.mkdtemp(path.join(os.tmpdir(),'edu-061-atomic-'));
 for(const file of await fs.readdir(baseline))await fs.copyFile(path.join(baseline,file),path.join(failure,file));
 await fs.writeFile(path.join(failure,'061-class-officer-access.sql'),(await fs.readFile('migrations/061-class-officer-access.sql','utf8')).replace(/COMMIT\s*;/i,"DO $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; COMMIT;"));
 await assert.rejects(migrate({directory:failure}),/061-class-officer-access.sql/);
 assert.equal((await raw.query("SELECT to_regclass('app.class_officer_assignments') AS table_name")).rows[0].table_name,null);
 assert.deepEqual((await raw.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,baselineHistory);
 upgrade=await migrate();app=await createApplication();server=app.getHttpAdapter().getInstance();await server.ready();await login();
});
after(async()=>{await app?.close();await db?.onApplicationShutdown();await raw?.end();});
test('populated 060 upgrade retains two schools, staff, roster and published snapshots; checksums, retry, forced RLS and installation pass',async()=>{
 assert.equal(upgrade.applied.length,6);assert.equal(upgrade.current,'066-school-admin-permission-authority.sql');
 const history=(await raw.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;assert.deepEqual(history.slice(0,60),baselineHistory);assert.deepEqual((await migrate()).applied,[]);
 assert.equal((await verifyInstallation(raw)).schemaRevision,upgrade.current);
 for(const [i,k]of ['A','B'].entries())await scoped(seedId('school:'+k),async tx=>{for(const [name,table]of [['students','students'],['staff','memberships'],['published','publication_revisions'],['children','parent_publication_items']]){const sql=name==='published'?" WHERE status='PUBLISHED'":'';assert.deepEqual((await tx.query('SELECT * FROM app.'+table+sql+' ORDER BY id')).rows.map(r=>{if(name==='published')delete r.periodic_conduct_id;return r;}),original[i][name]);}
  const classes=(await tx.query('SELECT * FROM app.classes ORDER BY id')).rows.map(r=>{delete r.notebook_settings;return r;});assert.deepEqual(classes,original[i].classes);
 });
 const newTables=['app.class_officer_assignments','identity.class_officer_credentials','identity.class_officer_sessions','app.class_week_settings','app.class_week_submissions','app.capability_commands','app.periodic_conduct','app.evidence_access','identity.evidence_sessions','app.position_bonus_snapshots'];
 const guards=(await raw.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])',[newTables])).rows;assert.equal(guards.length,newTables.length);assert.ok(guards.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
 await assert.rejects(scoped(school,tx=>tx.query("INSERT INTO app.periodic_conduct(school_id,class_id,year_id,period_type,period_key,period_label,starts_on,ends_on,policy_snapshot,source_publication_ids,results) VALUES($1,$2,$3,'MONTH','2026-10','Denied','2026-10-01','2026-11-01','{}','{}','[]')",[other,seedId('class:B:10A1'),seedId('year:B')])),e=>e.code==='42501');
});
let classSlug,leader,labor,leaderRule,currentWeek;
test('officer roles enforce current group/assignment, PIN lockout, server submit-lock and reopen expiry, revocation and frozen exact-once position bonus',async()=>{
 await login();const w=await good('GET',namespace);currentWeek=w.weekId;
 const enroll=n=>seedId('enrollment:A:10A1:'+n),group1=crypto.randomUUID(),group2=crypto.randomUUID();
 await scoped(school,async tx=>{for(const [g,name,ids]of [[group1,'Tổ 1',[1,2]],[group2,'Tổ 2',[3,4]]]){await tx.query('INSERT INTO app.class_groups(id,school_id,class_id,name,sort_order) VALUES($1,$2,$3,$4,0)',[g,school,cls,name]);for(const n of ids)await tx.query("INSERT INTO app.group_memberships(school_id,class_id,group_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,'2026-09-01','2027-06-01')",[school,cls,g,enroll(n)]);}});
 await good('POST',route('createConductPeriod'),{weekId:currentWeek},true);
 leader=await good('POST',namespace+'/officers/assign',{enrollmentId:enroll(1),role:'GROUP_LEADER',groupId:group1,validFrom:w.today},true);
 const second=await good('POST',namespace+'/officers/assign',{enrollmentId:enroll(3),role:'GROUP_LEADER',groupId:group2,validFrom:w.today},true);
 const captain=await good('POST',namespace+'/officers/assign',{enrollmentId:enroll(5),role:'CLASS_LEADER',validFrom:w.today},true);
 labor=await good('POST',namespace+'/officers/assign',{enrollmentId:enroll(6),role:'LABOR_VICE',validFrom:w.today},true);
 classSlug=leader.loginPath.split('/')[2];const base=`/api/v1/public/classes/${classSlug}/officer`;
 const credential=await scoped(school,async tx=>(await tx.query('SELECT pin_hash FROM identity.class_officer_credentials WHERE assignment_id=$1',[leader.id])).rows[0]);assert.ok(await verifyPassword(credential.pin_hash,leader.pin));assert.notEqual(credential.pin_hash,leader.pin);
 const officerLogin=async account=>{const token=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken;return req('POST',base+'/login',account,false,{'x-csrf-token':token});};
 for(let i=0;i<5;i++){const r=await officerLogin({assignmentId:leader.id,pin:'bad-pin-123'});assert.equal(r.statusCode,401,r.body);}
 assert.equal((await officerLogin({assignmentId:leader.id,pin:leader.pin})).statusCode,401);
 leader=await good('POST',namespace+'/officers/pin',{assignmentId:leader.id,expectedVersion:leader.version},true);
 async function enter(account){const r=await officerLogin({assignmentId:account.id,pin:account.pin});assert.equal(r.statusCode,200,r.body);const workspace=await good('GET',base);return {workspace,token:r.json().data.csrfToken};}
 let session=await enter(leader);leaderRule=session.workspace.rules.find(r=>r.value_mode==='FIXED');assert.ok(leaderRule);
 const body=()=>({weekId:currentWeek,expectedVersion:session.workspace.submission.version,enrollmentIds:[enroll(1)],ruleId:leaderRule.id,occurredOn:w.today,occurrences:1,note:'Kiểm thử ghi nhận đúng tổ'});
 assert.equal((await req('POST',base+'/entries',{...body(),enrollmentIds:[enroll(3)]},true,{'x-csrf-token':session.token})).statusCode,404);
 session=await enter(captain);assert.equal((await req('POST',base+'/entries',{...body(),enrollmentIds:[enroll(2)]},true,{'x-csrf-token':session.token})).statusCode,404);
 session=await enter(labor);assert.equal((await req('POST',base+'/entries',body(),true,{'x-csrf-token':session.token})).statusCode,403);
 session=await enter(leader);let r=await req('POST',base+'/entries',body(),true,{'x-csrf-token':session.token});assert.equal(r.statusCode,200,r.body);session.workspace=await good('GET',base);assert.equal(session.workspace.records.length,1);
 const record=session.workspace.records[0];r=await req('POST',base+'/entries',{...body(),recordId:record.id,recordVersion:record.version,note:'Đã sửa trong cửa sổ cho phép'},true,{'x-csrf-token':session.token});assert.equal(r.statusCode,200,r.body);session.workspace=await good('GET',base);
 r=await req('POST',base+'/submit',{weekId:currentWeek,expectedVersion:session.workspace.submission.version},true,{'x-csrf-token':session.token});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.status,'SUBMITTED');
 await scoped(school,tx=>tx.query("UPDATE app.class_week_submissions SET lock_at=now()-interval '1 second' WHERE id=$1",[r.json().data.id]));await scoped(school,tx=>expireWeekly(tx,school));session.workspace=await good('GET',base);assert.equal(session.workspace.submission.status,'LOCKED');assert.equal((await req('POST',base+'/entries',body(),true,{'x-csrf-token':session.token})).statusCode,409);
 let unlocked=await good('POST',namespace+'/weeks/reopen',{assignmentId:leader.id,weekId:currentWeek,expectedVersion:session.workspace.submission.version,reason:'GVCN cho điều chỉnh lại tuần'},true);assert.equal(unlocked.status,'REOPENED');assert.ok(new Date(unlocked.reopened_until)>new Date());
 await scoped(school,tx=>tx.query("UPDATE app.class_week_submissions SET reopened_until=now()-interval '1 second' WHERE id=$1",[unlocked.id]));await scoped(school,tx=>expireWeekly(tx,school));session.workspace=await good('GET',base);assert.equal(session.workspace.submission.status,'LOCKED');assert.equal((await req('POST',base+'/entries',body(),true,{'x-csrf-token':session.token})).statusCode,409);
 await good('POST',namespace+'/weeks/reopen',{assignmentId:leader.id,weekId:currentWeek,expectedVersion:session.workspace.submission.version,reason:'Kiểm thử mở lại thủ công'},true);session.workspace=await good('GET',base);await good('POST',namespace+'/weeks/relock',{assignmentId:leader.id,weekId:currentWeek,expectedVersion:session.workspace.submission.version,reason:'GVCN khóa lại sau rà soát'},true);
 const detail=await good('GET',namespace),assignment=detail.officers.find(o=>o.id===leader.id);await good('POST',namespace+'/officers/pin',{assignmentId:leader.id,expectedVersion:assignment.version},true);assert.equal((await req('GET',base)).statusCode,401);
 const approvedRecord=await scoped(school,async tx=>(await tx.query('SELECT * FROM app.conduct_records WHERE id=$1',[record.id])).rows[0]);await good('POST',route('approveConductRecord',{recordId:record.id}),{expectedVersion:approvedRecord.version},true);
 const pos=await good('POST',route('createPosition'),{code:'TEST_OFFICER',name:'Cán bộ tuần',singleHolder:true},true);await good('POST',namespace+'/positions/policy',{positionId:pos.id,expectedVersion:pos.version,name:'Cán bộ tuần',description:'Thưởng theo tuần',weeklyBonus:2.5,officerRole:null},true);
 await good('POST',route('assignPosition'),{positionId:pos.id,enrollmentId:enroll(1),startsOn:w.today,endsOn:'2027-06-01'},true);
 const period=await scoped(school,async tx=>(await tx.query('SELECT * FROM app.conduct_periods WHERE class_id=$1 AND week_id=$2',[cls,currentWeek])).rows[0]);await good('POST',route('lockConductPeriod',{periodId:period.id}),{expectedVersion:period.version},true);
 const summary=await good('GET',route('getConductSummary',{periodId:period.id})),score=summary.students.find(s=>s.studentId===seedId('student:A:10A1:1')).finalPoints;
 await scoped(school,tx=>tx.query('UPDATE app.class_positions SET weekly_bonus=9,name=$2 WHERE id=$1',[pos.id,'Tên mới sau khóa']));assert.equal((await good('GET',route('getConductSummary',{periodId:period.id}))).students.find(s=>s.studentId===seedId('student:A:10A1:1')).finalPoints,score);
 const snapshot=await scoped(school,async tx=>(await tx.query('SELECT label,points FROM app.position_bonus_snapshots WHERE period_id=$1',[period.id])).rows);assert.deepEqual(snapshot,[{label:'Cán bộ tuần',points:'2.50'}]);
 const auditRows=await scoped(school,async tx=>(await tx.query("SELECT action,redacted_after FROM app.audit_events WHERE action LIKE 'weekly.%' OR action LIKE 'officer.%' ORDER BY created_at")).rows);assert.ok(auditRows.some(a=>a.action==='weekly.auto-lock'));assert.ok(!JSON.stringify(auditRows).includes(leader.pin));
});
test('periodic month, term and year publish immutable classifications and actual exports; parent/public scope, evidence capabilities, credentials and schedule parity persist',async()=>{
 await login();const base=namespace+'/periodic',periods=[],studentId=seedId('student:A:10A1:1');
 const options=await good('GET',base+'/options'),term=options.terms[0];assert.ok(term);
 for(const [periodType,periodKey]of [['MONTH','2026-09'],['TERM',term.id],['YEAR',year]]){
  let p=await good('POST',base+'/calculate',{periodType,periodKey,aggregation:'AVERAGE'},true);assert.equal(p.status,'DRAFT');assert.ok(p.source_publication_ids.length);assert.equal(p.results.find(r=>r.studentId===studentId).score,'100.00');
  const target=p.results.find(r=>r.studentId===studentId),label=p.policy_snapshot.thresholds.find(t=>t.label!==target.suggestedClassification).label;
  assert.equal((await req('POST',base+'/override',{periodId:p.id,expectedVersion:p.version,studentId,classification:label},true)).statusCode,422);
  p=await good('POST',base+'/override',{periodId:p.id,expectedVersion:p.version,studentId,classification:label,reason:'Điều chỉnh theo nhận xét cả kỳ'},true);
  p=await good('POST',base+'/review',{periodId:p.id,expectedVersion:p.version},true);p=await good('POST',base+'/finalize',{periodId:p.id,expectedVersion:p.version},true);assert.equal(p.status,'FINALIZED');
  assert.equal((await req('POST',base+'/override',{periodId:p.id,expectedVersion:p.version,studentId,classification:label},true)).statusCode,409);
  p=await good('POST',base+'/publish',{periodId:p.id,expectedVersion:p.version},true);assert.equal(p.status,'PUBLISHED');periods.push(p);
  const report=await good('GET',route('getClassReport',{reportType:'parent-conduct'})+`?yearId=${year}&periodId=${p.id}&periodType=${periodType}`),row=report.rows.find(r=>r.studentId===studentId);
  assert.equal(row.values.classification,label);assert.equal(row.values.overrideReason,'Điều chỉnh theo nhận xét cả kỳ');assert.notEqual(row.values.classification,row.values.weeks.at(-1).classification);
  const reports=app.get(ReportsService);
  for(const [format,single]of [['PDF',true],['PDF',false],['XLSX',false]]){
   const job=await good('POST',route('createExport'),{reportType:'parent-conduct',format,yearId:year,classId:cls,periodId:p.id,periodType,from:p.starts_on,to:p.ends_on,...(single?{studentId}:{})},true);
   await reports.runExport(school,job.id,async()=>{});const status=await good('GET',route('getExport',{exportId:job.id}));assert.equal(status.status,'COMPLETED');const download=await req('GET',route('downloadExport',{exportId:job.id}));assert.equal(download.statusCode,200,download.body.slice(0,200));
   if(format==='PDF'){assert.equal(download.rawPayload.subarray(0,5).toString(),'%PDF-');if(process.env.ALL_REMAINING_EVIDENCE_DIR)await fs.writeFile(path.join(process.env.ALL_REMAINING_EVIDENCE_DIR,periodType+'-'+(single?'single':'class')+'.pdf'),download.rawPayload);}else{const book=new ExcelJS.Workbook();await book.xlsx.load(download.rawPayload);assert.ok(JSON.stringify(book.getWorksheet(1).getSheetValues()).includes(label));}
  }
 }
 const portal='/api/v1/schools/'+school+'/classes/'+cls+'/public-portal';let cfg=await good('GET',portal);
  await good('POST',portal,{expectedVersion:cfg.version,publicPortalEnabled:true,publicStudentConductEnabled:true,publicStudentAttendanceEnabled:false,publicStudentActivitiesEnabled:false,publicRankingEnabled:false,publicSeatingEnabled:false,rotateSlug:false},true);
 const published=await good('GET',route('getPublicClassPortal',{publicClassSlug:classSlug}));assert.equal(published.periodic.length,3);assert.ok(published.periodic.every(p=>p.ranking.length===0));assert.ok(!JSON.stringify(published).includes('Điều chỉnh theo nhận xét cả kỳ'));
 const draft=await good('POST',base+'/calculate',{periodType:'MONTH',periodKey:'2026-10',aggregation:'SUM'},true);assert.equal((await good('GET',route('getPublicClassPortal',{publicClassSlug:classSlug}))).periodic.length,3);
 const relation=(await scoped(school,tx=>tx.query("SELECT id FROM app.guardian_relationships WHERE student_id=$1 AND status='VERIFIED' AND can_receive_info LIMIT 1",[studentId]))).rows[0];assert.ok(relation);
 const issued=await good('POST',route('issueParentAccess'),{studentId,yearId:year,relationshipId:relation.id,allowedSections:['conduct'],allowDownload:false,expiresAt:new Date(Date.now()+7*86400000).toISOString()},true),slug=(await raw.query('SELECT slug FROM platform.schools WHERE id=$1',[school])).rows[0].slug;
 const bootstrap=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken;let r=await req('POST',route('exchangeParentLink',{schoolSlug:slug}),{token:new URLSearchParams(new URL(issued.link).hash.slice(1)).get('token')},false,{'x-csrf-token':bootstrap});assert.equal(r.statusCode,200,r.body);
 const own=await good('GET',route('listParentConduct',{schoolSlug:slug})+'?periodType=MONTH',undefined,false,{'x-parent-view':r.json().data.viewId});assert.equal(own.length,1);assert.equal(own[0].classification,periods[0].results.find(r=>r.studentId===studentId).finalClassification);assert.ok(!JSON.stringify(own).includes('overrideReason'));
 assert.equal((await req('GET',route('getClassPeriodicOptions',{schoolId:other,classId:seedId('class:B:10A1')}))).statusCode,404);
 const activity=await good('POST',route('createActivity'),{title:'Hoạt động minh chứng kiểm thử',description:'Học sinh nộp một ảnh bằng link riêng',dueAt:new Date(Date.now()+2*86400000).toISOString(),startsAt:new Date(Date.now()-3600000).toISOString(),maxFiles:1,evidenceRequired:true,enrollmentIds:[seedId('enrollment:A:10A1:1')]},true);
 const opened=await good('POST',route('assignActivity',{activityId:activity.id}),{expectedVersion:activity.version},true),participants=await good('GET',route('listParticipants',{activityId:activity.id}));assert.equal(opened.maxFiles,1);const participant=participants[0];
 const access=await good('POST',namespace+'/evidence-access/issue',{participantId:participant.id,expiresAt:new Date(Date.now()+86400000).toISOString()},true),evbase=`/api/v1/public/classes/${classSlug}/evidence`;
 const boot=(await req('GET','/api/v1/auth/csrf')).json().data.csrfToken;r=await req('POST',evbase+'/exchange',{accessToken:access.path.split('#access=')[1]},false,{'x-csrf-token':boot});assert.equal(r.statusCode,200,r.body);const evcsrf=r.json().data.csrfToken;
 assert.equal((await req('GET',evbase+'/files/'+crypto.randomUUID())).statusCode,404);
 const image=await sharp({create:{width:24,height:24,channels:3,background:'#57ab89'}}).png().toBuffer(),boundary='edu-'+crypto.randomUUID();
 const multipart=bytes=>Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidence.png"\r\nContent-Type: image/png\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 assert.equal((await req('POST',evbase+'/files',multipart(Buffer.from('not an image')),true,{'content-type':`multipart/form-data; boundary=${boundary}`,'x-csrf-token':evcsrf})).statusCode,422);
 r=await req('POST',evbase+'/files',multipart(image),true,{'content-type':`multipart/form-data; boundary=${boundary}`,'x-csrf-token':evcsrf});assert.equal(r.statusCode,200,r.body);const ev=(await good('GET',evbase)).files[0];assert.ok(ev);assert.equal((await req('GET',evbase+'/files/'+ev.file_id)).statusCode,200);
 assert.equal((await req('POST',evbase+'/files',multipart(image),true,{'content-type':`multipart/form-data; boundary=${boundary}`,'x-csrf-token':evcsrf})).statusCode,422);
 const evidenceRow=(await scoped(school,tx=>tx.query('SELECT version FROM app.evidence WHERE id=$1',[ev.id]))).rows[0];await good('POST',route('reviewEvidence',{evidenceId:ev.id}),{expectedVersion:evidenceRow.version,decision:'APPROVED',reason:'Minh chứng đúng yêu cầu',shareWithGuardian:false},true);
 assert.equal((await good('GET',namespace+`/activity-reminders?activityId=${activity.id}`))[0].status,'APPROVED');
 const activityWorkspace=await good('GET',route('getClassActivitiesWorkspace'));assert.ok(activityWorkspace.history.some(h=>h.action==='evidence.student-submit'&&h.actorId===null&&h.actorName==='Học sinh'));
 await good('POST',namespace+'/evidence-access/revoke',{accessId:access.access.id,expectedVersion:access.access.version,reason:'Kết thúc quyền nộp kiểm thử'},true);assert.equal((await req('GET',evbase)).statusCode,401);
 const teacher=(await scoped(school,tx=>tx.query('SELECT * FROM app.memberships WHERE user_id=$1',[seedId('user:teacher-a')]))).rows[0],newPassword='Aa1-'+crypto.randomBytes(20).toString('base64url');
 await good('POST',route('resetSchoolStaffPassword',{memberId:teacher.id}),{expectedVersion:teacher.version,password:newPassword,reason:'Nhân sự yêu cầu khôi phục tài khoản'},true);
 const user=(await raw.query('SELECT password_hash,must_change_password FROM identity.users WHERE id=$1',[teacher.user_id])).rows[0];assert.ok(user.must_change_password&&await verifyPassword(user.password_hash,newPassword));assert.ok(!JSON.stringify((await scoped(school,tx=>tx.query("SELECT response_metadata FROM app.idempotency_keys WHERE operation_id='resetSchoolStaffPassword'"))).rows).includes(newPassword));
 for(const [name,status]of [['admin-a',422],['multi',409]]){const m=(await scoped(school,tx=>tx.query('SELECT id,version FROM app.memberships WHERE user_id=$1',[seedId('user:'+name)]))).rows[0];assert.equal((await req('POST',route('resetSchoolStaffPassword',{memberId:m.id}),{expectedVersion:m.version,password:newPassword,reason:'Kiểm thử danh tính được bảo vệ'},true)).statusCode,status);}
 await login('teacher-b@example.invalid');assert.equal((await req('POST',route('resetSchoolStaffPassword',{memberId:teacher.id}),{expectedVersion:teacher.version,password:newPassword,reason:'Giáo viên bộ môn không có quyền quản trị'},true)).statusCode,403);assert.equal((await req('GET',namespace)).statusCode,404);await login();
 const zalo=await good('GET',namespace+'/zalo');assert.equal(zalo.students.length,6);assert.ok(zalo.students.every(s=>s.zaloUrl===null||/^https:\/\/zalo\.me\/84\d{9}$/.test(s.zaloUrl)));assert.ok(!JSON.stringify(zalo).includes(draft.id));
 const workspace=await good('GET',namespace),weeks=[...workspace.weeks].sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
 const sourceIndex=weeks.findIndex(w=>w.starts_on>=workspace.today);
 assert.ok(sourceIndex>=0,'Fixture needs a source week starting on or after workspace.today');
 assert.ok(weeks[sourceIndex+1],'Fixture needs a following target week');
 const sourceWeek=weeks[sourceIndex],targetWeek=weeks[sourceIndex+1];
 assert.equal(sourceWeek.ends_on,targetWeek.starts_on,'Copy fixture weeks must be consecutive');
 const teaching=(await scoped(school,tx=>tx.query("SELECT member_id,subject_id FROM app.teaching_assignments WHERE class_id=$1 AND kind='SUBJECT' AND revoked_at IS NULL LIMIT 1",[cls]))).rows[0];assert.ok(teaching);
 const entries=[{weekday:1,periodNumber:12,subjectId:teaching.subject_id,memberId:teaching.member_id,startsAtLocal:'16:00',endsAtLocal:'16:45'}];
 await good('POST',route('createTimetable'),{startsOn:sourceWeek.starts_on,endsOn:sourceWeek.ends_on,entries},true);
 let copied=await good('POST',namespace+'/schedule/copy',{weekId:targetWeek.id,kind:'TIMETABLE'},true);assert.equal(copied.status,'DRAFT');assert.equal(copied.entries[0].periodNumber,12);
 const validation=await good('POST',route('validateTimetable',{timetableId:copied.id}),{expectedVersion:copied.version},true);assert.ok(validation);
 copied=await good('GET',route('getTimetable',{timetableId:copied.id}));await good('POST',route('publishTimetable',{timetableId:copied.id}),{expectedSourceVersion:copied.dataVersion,expectedPublicationId:null},true);
 const beforeLessons=(await scoped(school,tx=>tx.query('SELECT count(*)::int AS n FROM app.lesson_occurrences WHERE timetable_id=$1',[copied.id]))).rows[0].n;assert.ok(beforeLessons);
 await good('POST',namespace+'/schedule/withdraw',{weekId:targetWeek.id,reason:'Rút lịch tương lai kiểm thử'},true);assert.equal((await scoped(school,tx=>tx.query("SELECT count(*)::int AS n FROM app.lesson_occurrences WHERE timetable_id=$1 AND status='CANCELLED'",[copied.id]))).rows[0].n,beforeLessons);
 const duty=await good('POST',route('createDuty'),{startsOn:sourceWeek.starts_on,endsOn:sourceWeek.ends_on,assignments:[{enrollmentId:seedId('enrollment:A:10A1:1'),dutyDate:sourceWeek.starts_on,task:'Lau bảng',status:'DONE'}]},true);
 const copiedDuty=await good('POST',namespace+'/schedule/copy',{weekId:targetWeek.id,kind:'DUTY'},true);assert.equal(copiedDuty.assignments[0].status,'ASSIGNED');assert.equal(copiedDuty.assignments[0].dutyDate,targetWeek.starts_on);
 await good('POST',route('publishDuty',{dutyId:copiedDuty.id}),{expectedSourceVersion:copiedDuty.dataVersion,expectedPublicationId:null},true);
 if(process.env.ALL_REMAINING_EVIDENCE_DIR){await fs.writeFile(path.join(process.env.ALL_REMAINING_EVIDENCE_DIR,'browser-upload.png'),image);await fs.writeFile(path.join(process.env.ALL_REMAINING_EVIDENCE_DIR,'browser-fixture.json'),JSON.stringify({password,schoolId:school,classId:cls,yearId:year,slug:classSlug,studentId,activityId:activity.id,periodic:periods.map(p=>({id:p.id,type:p.period_type})),parentLink:issued.link,officers:[leader,labor]}),{mode:0o600});}
});
