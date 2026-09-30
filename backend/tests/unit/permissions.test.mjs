import test from 'node:test';
import assert from 'node:assert/strict';
import { grantAllows } from '../../dist/common/permissions.js';
const base={id:'g',version:1,role_id:'r',label:'role',scope_type:'CLASS',class_id:'A',subject_id:null,
  valid_from:new Date(),valid_until:null,actions:['student.read','seating.manage','conduct.publish'],
  assignment_id:'a',starts_on:'2026-09-01',ends_on:'2027-06-01'};
test('grant action and class scope stay together',()=>{
  assert.equal(grantAllows(base,'seating.manage',{schoolId:'s',classId:'A'},'2026-09-30'),true);
  assert.equal(grantAllows(base,'seating.manage',{schoolId:'s',classId:'B'},'2026-09-30'),false);
  assert.equal(grantAllows({...base,actions:['student.read']},'seating.manage',{schoolId:'s',classId:'A'},'2026-09-30'),false);
});
test('subject grants never authorize management without explicit subject policy',()=>{
  const grant={...base,scope_type:'SUBJECT',subject_id:'math'};
  assert.equal(grantAllows(grant,'student.read',{schoolId:'s',classId:'A'},'2026-09-30'),false);
  assert.equal(grantAllows(grant,'student.read',{schoolId:'s',classId:'A',allowSubject:true},'2026-09-30'),true);
  assert.equal(grantAllows(grant,'student.read',{schoolId:'s',classId:'A',allowSubject:true,subjectId:'art'},'2026-09-30'),false);
});
test('end dates are exclusive and assignment is mandatory for scoped grants',()=>{
  assert.equal(grantAllows(base,'student.read',{schoolId:'s',classId:'A'},'2027-06-01'),false);
  assert.equal(grantAllows({...base,assignment_id:null},'student.read',{schoolId:'s',classId:'A'},'2026-09-30'),false);
  assert.equal(grantAllows(base,'student.read',{schoolId:'s',classId:'A',date:'2026-08-31'},'2026-09-30'),false);
});
