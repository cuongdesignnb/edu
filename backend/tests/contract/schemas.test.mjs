import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema,operations } from '../../dist/common/contract.js';
test('all operation IDs are unique, including the explicit frontend workflow extensions',()=>{
  assert.equal(operations.length,283);assert.equal(new Set(operations.map(op=>op.id)).size,283);
  assert.equal(operations.find(op=>op.id==='getRolloverPreview').permission,'year.manage');
});
test('atomic school roles require a displayed version and unique explicit role IDs without actor authority',()=>{
  const value={expectedVersion:4,roleIds:[],reason:'Thay vai trò'};validateSchema('MemberRolesReplace',value);
  for(const bad of [{roleIds:[],reason:'Thay vai trò'},{...value,actorId:'spoofed'},{...value,scopeType:'CLASS'},
    {...value,roleIds:['da72b470-4b45-4f5f-b89d-179c0cdf454a','da72b470-4b45-4f5f-b89d-179c0cdf454a']}])assert.throws(()=>validateSchema('MemberRolesReplace',bad),error=>error.status===422);
  assert.equal(operations.find(op=>op.id==='replaceMemberSchoolRoles').permission,'role.manage');
  assert.equal(operations.find(op=>op.id==='endMember').permission,'member.manage');
  validateSchema('MemberSchoolRoles',{id:'da72b470-4b45-4f5f-b89d-179c0cdf454a',version:4,status:'ACTIVE',schoolRoleGrants:[]},true);
  assert.throws(()=>validateSchema('MemberSchoolRoles',{id:'da72b470-4b45-4f5f-b89d-179c0cdf454a',version:4,status:'ACTIVE',schoolRoleGrants:[],workPhone:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
test('school invite retains zero or multiple roles and the 1–30 day form without widening platform admin invitations',()=>{
  const value={email:'test@example.invalid',workDisplayName:'Nhân sự giả',roleIds:[],expiresInDays:30};validateSchema('SchoolStaffInvite',value);
  for(const bad of [{...value,expiresInDays:31},{...value,expiresInDays:0},{...value,classId:'da72b470-4b45-4f5f-b89d-179c0cdf454a'},{...value,actorId:'spoofed'}])assert.throws(()=>validateSchema('SchoolStaffInvite',bad),error=>error.status===422);
  assert.throws(()=>validateSchema('PlatformAdminInviteRequest',{email:'test@example.invalid',expiresInDays:30}),error=>error.status===422);
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
test('platform first administrator supports server start time and rejects scope spoofing or excessive invitation lifetime',()=>{
  const value={email:'test@example.invalid',roleId:null,workDisplayName:'Quản trị giả',expiresInDays:7};
  validateSchema('PlatformAdminInviteRequest',value);
  assert.throws(()=>validateSchema('PlatformAdminInviteRequest',{...value,scopeType:'PLATFORM'}),error=>error.status===422);
  assert.throws(()=>validateSchema('PlatformAdminInviteRequest',{...value,expiresInDays:15}),error=>error.status===422);
});
test('school overview accepts explicit unavailable panels and rejects private directory fields',()=>{
  const counts=Object.fromEntries(['activeClasses','draftClasses','prevClasses','staffActive','students','prevStudents','linksActive','linksOpened'].map(key=>[key,null]));
  const value={year:null,prevYear:null,kpi:counts,setup:Array.from({length:8},(_,i)=>({key:String(i),label:'Hạng mục',done:null,detail:'Không có quyền xem hạng mục',href:'/school'})),classesNeedingAction:null,classesNeedingActionTotal:null,todayItems:null,announcements:null};
  validateSchema('SchoolOverviewDetails',value,true);
  assert.throws(()=>validateSchema('SchoolOverviewDetails',{...value,students:[{phone:'private'}]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
test('directory represents invitations without fake memberships and keeps unavailable invitation KPI explicit',()=>{
  const value={id:'da72b470-4b45-4f5f-b89d-179c0cdf454a',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),kind:'INVITATION',memberId:null,userId:null,status:null,accessActive:false,fullName:'Nhân sự mời',email:'invite@example.invalid',department:null,staffCode:null,expiresAt:new Date().toISOString(),roleLabels:['Lời mời'],dutyLabels:[]};validateSchema('StaffDirectoryRow',value,true);
  for(const field of ['loginEmail','workPhone','token','rolePermissions'])assert.throws(()=>validateSchema('StaffDirectoryRow',{...value,[field]:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  validateSchema('StaffDirectorySummary',{kpi:{total:2,active:1,suspended:1,pendingInvites:null},departments:[],roleLabels:[],canInvite:false,canSuspend:false,canAssign:false,canExport:false,canViewInvitations:false},true);
});
test('member profile separates denied panels and exact native authority without exposing other school metadata',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',member={id,userId:id,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),workDisplayName:'Nhân sự giả',status:'ACTIVE',shareWorkContact:false};
  const value={member,referenceDate:'2026-10-01',joinedOn:null,accessActive:true,otherSchools:2,assignments:null,roleChoices:null,canAssign:false,canSuspend:false,canRole:false,canViewHistory:false,isSelf:false};
  validateSchema('MemberDetails',value,true);
  for(const field of ['otherSchoolIds','otherSchoolNames','loginEmail','history'])assert.throws(()=>validateSchema('MemberDetails',{...value,[field]:[]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  assert.equal(operations.find(op=>op.id==='listMemberHistory').permission,'member.read+audit.read');
  const choice={id,version:1,label:'Vai trò',code:'REAL',systemRole:false,canDelegate:false,delegationUntil:null};validateSchema('MemberRoleChoice',choice,true);
  assert.throws(()=>validateSchema('MemberRoleChoice',{...choice,permissions:[]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
