import test from 'node:test';
import assert from 'node:assert/strict';
import { grantAllows,coversDelegatedExpiry } from '../../dist/common/permissions.js';
const base={id:'g',version:1,role_id:'r',role_code:'HOMEROOM',label:'role',scope_type:'CLASS',class_id:'A',subject_id:null,
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
test('end dates are exclusive and assignment is mandatory for default teacher grants',()=>{
  assert.equal(grantAllows(base,'student.read',{schoolId:'s',classId:'A'},'2027-06-01'),false);
  assert.equal(grantAllows({...base,assignment_id:null},'student.read',{schoolId:'s',classId:'A'},'2026-09-30'),false);
  assert.equal(grantAllows(base,'student.read',{schoolId:'s',classId:'A',date:'2026-08-31'},'2026-09-30'),false);
});
test('a custom class grant authorizes only its delegated action and class',()=>{
  const custom={...base,role_code:'CLASS_REVIEWER',assignment_id:null,starts_on:null,ends_on:null,actions:['conduct.read']};
  assert.equal(grantAllows(custom,'conduct.read',{schoolId:'s',classId:'A'},'2026-09-30'),true);
  assert.equal(grantAllows(custom,'conduct.publish',{schoolId:'s',classId:'A'},'2026-09-30'),false);
  assert.equal(grantAllows(custom,'conduct.read',{schoolId:'s',classId:'B'},'2026-09-30'),false);
});
test('a delegated grant cannot outlive an expiring authority, including an unbounded target or future start',()=>{
  const expiry=new Date('2026-10-01T00:00:00Z'),from=new Date('2026-09-30T00:00:00Z');
  assert.equal(coversDelegatedExpiry({valid_until:expiry},from,expiry),true);
  assert.equal(coversDelegatedExpiry({valid_until:expiry},from,null),false);
  assert.equal(coversDelegatedExpiry({valid_until:expiry},from,new Date(expiry.getTime()+1)),false);
  assert.equal(coversDelegatedExpiry({valid_until:expiry},expiry,new Date(expiry.getTime()+1)),false);
  assert.equal(coversDelegatedExpiry({valid_until:null},from,null),true);
});
