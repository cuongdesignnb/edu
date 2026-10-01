import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema,operations } from '../../dist/common/contract.js';
test('all operation IDs are unique, including the explicit frontend workflow extensions',()=>{
  assert.equal(operations.length,299);assert.equal(new Set(operations.map(op=>op.id)).size,299);
  assert.equal(operations.find(op=>op.id==='getRolloverPreview').permission,'year.manage');
  for(const op of operations){const ref=op.requestBody?.content?.['application/json']?.schema?.$ref;if(ref)assert.equal(op.request,ref.split('/').at(-1),op.id);}
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
test('atomic guardian save requires displayed student and primary versions without verification or actor fields',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',value={expectedStudentVersion:2,expectedPrimaryContacts:[{id,version:3}],fullName:'Giám hộ giả',relationshipLabel:'Mẹ',email:null,isPrimary:true,phone:'0912222222'};
  validateSchema('GuardianSaveRequest',value);
  for(const bad of [{...value,expectedStudentVersion:undefined},{...value,expectedPrimaryContacts:undefined},{...value,actorId:id},{...value,studentId:id},{...value,status:'VERIFIED'},{...value,canReceiveInfo:true},{...value,expectedPrimaryContacts:[{id,version:3,guardianId:id}]}])assert.throws(()=>validateSchema('GuardianSaveRequest',bad),error=>error.status===422);
  const form={student:{id,version:2,name:'Học sinh giả',code:'SOURCE'},today:'2026-10-01',primaryContacts:[],target:null};validateSchema('GuardianFormContext',form,true);
  for(const field of ['dateOfBirth','internalNote','otherStudentIds'])assert.throws(()=>validateSchema('GuardianFormContext',{...form,student:{...form.student,[field]:'private'}},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  for(const name of ['getStudentGuardianForm','saveStudentGuardian'])assert.equal(operations.find(op=>op.id===name).permission,'guardian.manage+guardian.read');
});
test('assignment preview is a CSRF-protected read-only POST and preserves explicit source versions without actor authority',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a';validateSchema('AssignmentCreate',{memberId:id,classId:id,kind:'HOMEROOM',startsOn:'2026-10-01',expectedClassVersion:4,expectedMemberVersion:2});
  for(const field of ['actorId','schoolId','roleId','scopeType'])assert.throws(()=>validateSchema('AssignmentCreate',{memberId:id,classId:id,kind:'HOMEROOM',startsOn:'2026-10-01',[field]:id}),error=>error.status===422);
  const op=operations.find(op=>op.id==='previewStaffAssignment');assert.equal(op.method,'POST');assert.equal(op.permission,'assignment.manage');assert.equal(op.readOnly,true);assert.equal(operations.find(op=>op.id==='createAssignment').readOnly,false);
});
test('assignment matrix represents a real unconfigured year and empty cells without borrowing profiles, rosters or permissions',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',value={year:null,referenceDate:'2026-10-01',subjects:[],rows:[],canAssign:false,canViewMembers:false};validateSchema('StaffAssignmentMatrix',value,true);
  validateSchema('StaffAssignmentMatrixRow',{classId:id,version:1,className:'Lớp giả',status:'ACTIVE',homeroom:null,bySubject:{[id]:null},conflicts:[]},true);
  for(const field of ['students','memberEmails','rolePermissions'])assert.throws(()=>validateSchema('StaffAssignmentMatrix',{...value,[field]:[]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  assert.equal(operations.find(op=>op.id==='getStaffAssignmentMatrix').permission,'assignment.read');
});

test('role details retain exact native scopes and denied panels without exposing staff contacts or a fabricated editable system role',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',role={id,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),code:'NATIVE',label:'Vai trò giả',systemRole:false,status:'ACTIVE',scopes:['CLASS','SUBJECT'],permissions:[{action:'student.read',scopes:['CLASS','SUBJECT']}],memberCount:0,assignmentCount:0};
  validateSchema('RoleDetails',{role,canEdit:false,ownRole:false,systemRole:false,canViewMembers:false,canViewHistory:false,actions:[{action:'student.read',canGrant:false}],members:null,history:null},true);
  assert.throws(()=>validateSchema('RoleHolder',{grantId:id,memberId:id,name:'Tên giả',scopeType:'CLASS',classId:id,subjectId:null,validFrom:new Date().toISOString(),validUntil:null,email:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  assert.equal(operations.find(op=>op.id==='getRoleDetails').permission,'role.read');
  validateSchema('RolePatch',{expectedVersion:1,reason:'Lý do giả',permissions:role.permissions});
  assert.throws(()=>validateSchema('RolePatch',{expectedVersion:1,permissions:role.permissions}),error=>error.status===422);
});

test('handover receipts retain unknown legacy metadata and strict reviewed source fields without exposing the internal state',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',time=new Date().toISOString(),row={id,version:1,createdAt:time,updatedAt:time,classId:id,fromAssignmentId:id,toMemberId:id,effectiveOn:'2026-10-02',reason:'Lý do giả',status:'SUBMITTED',checklist:null,previewHash:null,appliedAssignmentId:null,appliedAt:null,clientRequestId:null,appliedAssignment:null};validateSchema('Handover',row,true);
  assert.throws(()=>validateSchema('Handover',{...row,sourceState:{identities:[{email:'private'}]}},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  validateSchema('HandoverCreate',{classId:id,fromAssignmentId:id,toMemberId:id,effectiveOn:'2026-10-02',reason:'Lý do giả',clientRequestId:id,previewHash:'a'.repeat(64),expectedClassVersion:2,expectedFromAssignmentVersion:3,expectedToMemberVersion:4});
  for(const key of ['actorId','schoolId','appliedAssignmentId'])assert.throws(()=>validateSchema('HandoverCreate',{classId:id,fromAssignmentId:id,toMemberId:id,effectiveOn:'2026-10-02',reason:'Lý do giả',[key]:id}),error=>error.status===422);
  validateSchema('HandoverApprove',{expectedVersion:1,previewHash:'a'.repeat(64)});assert.equal(operations.find(op=>op.id==='approveHandover').request,'HandoverApprove');
  assert.equal(operations.find(op=>op.id==='getHandoverByRequest').permission,'assignment.manage');
});

test('student forms persist nullable gender and an atomic unverified guardian without accepting actor or result state',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',value={fullName:'Học sinh giả',dateOfBirth:'2011-09-30',gender:'Nữ',initialClassId:id,startsOn:'2026-10-01',initialGuardian:{fullName:'Giám hộ giả',relationshipLabel:'Mẹ',phone:'0912222222'}};validateSchema('StudentCreate',value);
  validateSchema('StudentPatch',{expectedVersion:3,gender:null,internalNote:null});
  for(const bad of [{...value,gender:'UNKNOWN'},{...value,actorId:id},{...value,schoolId:id},{...value,initialGuardian:{...value.initialGuardian,status:'VERIFIED',canReceiveInfo:true}}])assert.throws(()=>validateSchema('StudentCreate',bad),error=>error.status===422);
  const student={id,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),studentCode:'HS26001',fullName:'Học sinh cũ giả',dateOfBirth:null,gender:null,status:'ACTIVE'};validateSchema('Student',student,true);validateSchema('StudentDetail',{student,enrollments:[],internalNote:null},true);
});

test('student read models distinguish denied and unknown values and exclude reusable parent tokens',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',time=new Date().toISOString(),student={id,version:1,createdAt:time,updatedAt:time,studentCode:'SOURCE',fullName:'Tên nguồn giả',dateOfBirth:null,gender:null,status:'LEFT'};
  const row={...student,enrollmentId:id,enrollmentVersion:2,classId:id,className:'Lớp nguồn giả',yearId:id,yearName:'Năm nguồn giả',enrollmentInEffect:false,guardianCount:null,verifiedGuardians:null,activeLinks:null};validateSchema('StudentDirectoryRow',row,true);
  const value={student:{...student,preferredName:null},level:'SUBJECT_MINIMAL',today:'2026-10-01',year:null,referenceDate:null,selectedEnrollment:null,history:[],group:null,positions:null,relationships:null,links:null,accessLog:null,accessLogHasMore:null,internalNote:null,perms:Object.fromEntries(['edit','transfer','seeGuardians','editGuardians','verifyGuardians','manageLinks','issueLinks','revokeLinks','seeInternalNote','seeBirthDate'].map(key=>[key,false]))};validateSchema('StudentDetails',value,true);
  for(const key of ['internalNote','initialGuardian','initialRelationship'])assert.throws(()=>validateSchema('StudentDetails',{...value,student:{...value.student,[key]:{}}},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  for(const bad of [{...row,internalNote:'private'},{...row,guardianPhone:'private'}])assert.throws(()=>validateSchema('StudentDirectoryRow',bad,true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  const link={id,version:1,createdAt:time,updatedAt:time,studentId:id,yearId:id,relationshipId:id,allowedSections:['overview'],allowDownload:false,expiresAt:time,revokedAt:null,revokeReason:null,issuedBy:id,issuedByName:null,guardianName:'Tên giả',relationshipLabel:'Mẹ',yearName:'Năm giả',status:'ACTIVE',opens:0,lastOpenedAt:null};validateSchema('StudentAccessLink',link,true);
  for(const key of ['token','tokenHash','link'])assert.throws(()=>validateSchema('StudentAccessLink',{...link,[key]:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  for(const op of ['listStudentDirectory','listStudentDirectoryIds','getStudentDirectorySummary','getStudentDetails'])assert.equal(operations.find(o=>o.id===op).permission,'student.read');
});

test('guardian projections exclude student private profiles and audit snapshots and require explicit denied panels',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',time=new Date().toISOString(),guardian={id,version:1,createdAt:time,updatedAt:time,fullName:'Liên hệ giả',phone:null,email:null,status:'ACTIVE'};
  validateSchema('GuardianDetails',{guardian,today:'2026-10-01',canEditContact:false,canViewHistory:false,historyHasMore:null,relationships:[],history:null},true);
  validateSchema('GuardianDirectorySummary',{guardians:0,verified:0,unverified:0,revoked:0,activeLinks:null,canSeeLinks:false,canManage:false,canVerify:false},true);
  const student={id,version:1,name:'Học sinh giả',code:'CODE',status:'LEFT',classId:null,className:null,yearId:null,enrollmentId:null,enrollmentVersion:null};validateSchema('GuardianProfileStudent',student,true);
  for(const key of ['dateOfBirth','internalNote','guardianPhone'])assert.throws(()=>validateSchema('GuardianProfileStudent',{...student,[key]:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  const event={id,actorId:null,actorName:null,action:'verifyRelationship',targetType:'relationship',targetId:id,at:time,reason:null};validateSchema('GuardianHistoryEvent',event,true);
  for(const key of ['before','after','redactedAfter','requestId','ipDailyHash'])assert.throws(()=>validateSchema('GuardianHistoryEvent',{...event,[key]:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  for(const op of ['listGuardianDirectory','getGuardianDirectorySummary','getGuardianDetails'])assert.equal(operations.find(o=>o.id===op).permission,'guardian.read');
});
