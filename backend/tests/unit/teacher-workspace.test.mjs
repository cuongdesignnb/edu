import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherWorkspace} from '../../dist/modules/classroom/teacher-workspace.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {extendTeacherWorkspaceContract} from '../../scripts/teacher-workspace-contract.mjs';
const schoolId='68100000-0000-4000-8000-000000000001',classId='68100000-0000-4000-8000-000000000002',yearId='68100000-0000-4000-8000-000000000003',memberId='68100000-0000-4000-8000-000000000004',assignmentId='68100000-0000-4000-8000-000000000005',otherId='68100000-0000-4000-8000-000000000006';
const cls={id:classId,year_id:yearId,name:'6A API',motto:null,status:'ACTIVE',year_status:'ACTIVE',starts_on:'2026-09-01',ends_on:'2027-06-01',reference_date:'2026-10-02',room:null,is_homeroom:true,subjects:[]};
const grant={id:assignmentId,version:1,role_id:assignmentId,role_code:'HOMEROOM',label:'GVCN',scope_type:'CLASS',class_id:classId,subject_id:null,valid_from:new Date('2026-09-01'),valid_until:null,assignment_id:assignmentId,starts_on:'2026-09-01',ends_on:'2027-06-01',actions:['teacher.self','class.read','student.read','attendance.read','attendance.record','conduct.read','conduct.review']};
function setup(grants=[grant],lessonRows=[]){
 const calls=[];const tx={async query(sql,values=[]){calls.push({sql,values});let rows=[];
  if(sql.includes('SELECT id,now() AS as_of FROM app.memberships'))rows=[{id:memberId,as_of:new Date('2026-10-02T02:00:00Z')}];
  else if(sql.includes('GROUP BY c.id,y.id,r.name'))rows=[cls];
  else if(sql.startsWith('SELECT t.* FROM'))rows=[];
  else if(sql.includes('FROM app.lesson_occurrences l JOIN app.timetable_versions'))rows=lessonRows;
  else if(sql.includes('SELECT count(*) AS n'))rows=[{n:'3'}];
  else if(sql.includes('FROM app.enrollments e LEFT JOIN app.attendance_records'))rows=[{total:3,present:0,late:0,excused:0,unexcused:0,unmarked:3}];
  return {rows,rowCount:rows.length};}};
 const db={async transaction(fn,ctx){calls.push({ctx});return fn(tx);}},policy={async require(...args){calls.push({require:args});return {today:'2026-10-02',grants};}};
 return {db,policy,calls};
}
const context=(id,query={})=>({operation:{id},params:{schoolId},principal:{userId:memberId},query,body:{}});
test('teacher workspace SQL binds current own assignments and fresh policy in a scoped readonly transaction',async()=>{
 const {db,policy,calls}=setup();const result=await teacherWorkspace(db,policy,context('getTeacherWorkspaceHome'));
 assert.equal(result.data.classes[0].attendance.unmarked,3);assert.equal(result.data.classes[0].attendance.present,0);assert.equal(result.data.unread,3);
 assert.deepEqual(calls[0].ctx,{schoolId,userId:memberId,readOnly:true});assert.equal(calls.find(c=>c.require).require[2],'teacher.self');
 const own=calls.find(c=>c.sql?.includes('GROUP BY c.id,y.id,r.name'));assert.deepEqual(own.values[2],[assignmentId]);assert.match(own.sql,/a\.revoked_at IS NULL/);
 const lessons=calls.find(c=>c.sql?.includes('FROM app.lesson_occurrences l JOIN app.timetable_versions'));assert.deepEqual(lessons.values[2],[classId]);assert.deepEqual(lessons.values[5],[assignmentId]);assert.match(lessons.sql,/t\.status='PUBLISHED'/);
 assert.equal(calls.some(c=>c.sql?.includes('audit_events')),false);
});
test('task permissions never borrow homeroom action from a different subject class or infer record authority from read only',async()=>{
 const subject={...grant,id:otherId,assignment_id:otherId,role_code:'SUBJECT_TEACHER',scope_type:'SUBJECT',class_id:otherId,subject_id:yearId,actions:['teacher.self','class.read','conduct.review','attendance.record']};
 const noRead={...grant,actions:['teacher.self','class.read','attendance.record','conduct.review']};
 const {db,policy,calls}=setup([noRead,subject]);await teacherWorkspace(db,policy,context('getTeacherWorkspaceTasks'));
 const task=calls.find(c=>c.sql?.startsWith('SELECT t.* FROM')),bindings=JSON.parse(task.values[1]);
 assert.ok(bindings.every(b=>b.class_id===classId));assert.ok(bindings.every(b=>!b.actions.includes('conduct.review')&&!b.actions.includes('attendance.record')));
 assert.deepEqual(task.values[6],[classId]);
});
test('invalid weeks and unknown query fields fail before any authorization or data queries',async()=>{
 for(const query of [{},{weekStart:'2026-10-02'},{weekStart:'2026-02-30'},{weekStart:'2026-09-28',memberId:otherId}]){
  const {db,policy,calls}=setup();await assert.rejects(teacherWorkspace(db,policy,context('getTeacherWorkspaceSchedule',query)),e=>e.status===422);assert.equal(calls.some(c=>c.sql||c.require),false);
 }
});
test('schedule never offers attendance on a future, holiday or cancelled lesson and keeps actual local hours',async()=>{
 const base={id:assignmentId,class_id:classId,year_id:yearId,class_name:'6A API',subject_id:yearId,period_number:null,day:'2026-10-02',starts:'08:05',ends:'08:50',subject_name:'Toán',room_name:null,status:'SCHEDULED',change_reason:null,on_holiday:false};
 const {db,policy}=setup([grant],[base,{...base,id:otherId,on_holiday:true},{...base,id:yearId,status:'CANCELLED'},{...base,id:memberId,day:'2026-10-03'}]);
 const {data}=await teacherWorkspace(db,policy,context('getTeacherWorkspaceSchedule',{weekStart:'2026-09-28'}));assert.equal(data.days.length,7);assert.equal(data.days[4].lessons[0].startsAtLocal,'08:05');assert.equal(data.days[4].lessons[0].periodNumber,null);assert.deepEqual(data.days.flatMap(d=>d.lessons).map(l=>l.canAttend),[true,false,false,false]);
});
test('membership or school denial aborts with no data query and no empty successful workspace',async()=>{
 const {db,policy,calls}=setup();policy.require=async()=>{throw Object.assign(new Error('revoked'),{status:404});};
 await assert.rejects(teacherWorkspace(db,policy,context('getTeacherWorkspaceHome')),e=>e.status===404);assert.equal(calls.some(c=>c.sql),false);
});
test('teacher home response contract accepts actual nullable lesson and denied panels without nullable reference errors',()=>{
 const spec={components:{schemas:{}}},object=(properties)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 extendTeacherWorkspaceContract(spec,()=>{}, {object,uuid:{type:'string',format:'uuid'},label:{type:'string',minLength:1},count:{type:'integer',minimum:0},timestamp:{type:'string',format:'date-time'}});
 const ajv=new Ajv({strict:false});addFormats(ajv);ajv.addSchema(spec,'teacher');const validate=ajv.compile({$ref:'teacher#/components/schemas/TeacherWorkspaceHome'});
 const value={schoolId,today:'2026-10-02',asOf:'2026-10-02T02:00:00Z',membershipId:memberId,classes:[{id:classId,yearId,name:'6A API',motto:null,isHomeroom:true,subjects:[],size:null,room:null,nextLesson:null,attendance:null,pendingConduct:null}],tasks:[],unread:0,feed:[]};
 assert.equal(validate(value),true,JSON.stringify(validate.errors));value.classes[0].internalNote='secret';assert.equal(validate(value),false);
});
