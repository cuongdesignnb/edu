import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema,operations } from '../../dist/common/contract.js';
test('all operation IDs are unique, including the explicit rollover preview extension',()=>{
  assert.equal(operations.length,265);assert.equal(new Set(operations.map(op=>op.id)).size,265);
  assert.equal(operations.find(op=>op.id==='getRolloverPreview').permission,'year.manage');
});
test('login rejects spoofed role, school and unknown fields',()=>{
  for(const field of ['actorId','role','schoolId'])assert.throws(()=>validateSchema('LoginRequest',{
    email:'test@example.invalid',password:'anything',[field]:'spoofed',
  }),error=>error.status===422);
});
test('private user DTO rejects secrets and unknown properties',()=>{
  const value={id:'da72b470-4b45-4f5f-b89d-179c0cdf454a',version:1,createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),displayName:'Test',email:'test@example.invalid',status:'ACTIVE'};
  validateSchema('User',value,true);
  assert.throws(()=>validateSchema('User',{...value,passwordHash:'secret'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
test('school overview accepts explicit unavailable panels and rejects private directory fields',()=>{
  const counts=Object.fromEntries(['activeClasses','draftClasses','prevClasses','staffActive','students','prevStudents','linksActive','linksOpened'].map(key=>[key,null]));
  const value={year:null,prevYear:null,kpi:counts,setup:Array.from({length:8},(_,i)=>({key:String(i),label:'Hạng mục',done:null,detail:'Không có quyền xem hạng mục',href:'/school'})),classesNeedingAction:null,classesNeedingActionTotal:null,todayItems:null,announcements:null};
  validateSchema('SchoolOverviewDetails',value,true);
  assert.throws(()=>validateSchema('SchoolOverviewDetails',{...value,students:[{phone:'private'}]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
