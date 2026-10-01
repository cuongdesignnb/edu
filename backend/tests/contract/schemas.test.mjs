import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema,operations } from '../../dist/common/contract.js';
test('staff preview context has a minimal context schema and independent school authority',()=>{
 const op=operations.find(operation=>operation.id==='getParentAccessPreviewContext');assert.equal(op.response,'ParentContext');assert.equal(op.permission,'parent_access.preview');assert.equal(op.auth,'staff');assert.equal(op.scope,'school');assert.equal(op.method,'GET');assert.equal(op.path,'/api/v1/schools/{schoolId}/parent-access/{accessId}/preview/context');assert.equal(op.readOnly,true);
 const value={viewId:'da72b470-4b45-4f5f-b89d-179c0cdf454a',school:{name:'Trường kiểm thử',slug:'preview-test',publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con riêng',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['teachers'],allowDownload:false,csrfToken:'synthetic-preview-csrf',expiresAt:'2026-10-01T01:01:00Z',today:'2026-10-01',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null};validateSchema('ParentContext',value,true);
 for(const bad of [{context:value},{...value,attendance:[]},{...value,token:'secret'},{...value,student:{...value.student,id:value.viewId}}])assert.throws(()=>validateSchema('ParentContext',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
});
test('class workspace header has exact year routing and explicitly permits absent independent period metadata',()=>{
 const op=operations.find(o=>o.id==='getClassWorkspaceHeader');assert.equal(op.auth,'staff');assert.equal(op.permission,'class.read');assert.equal(op.method,'GET');assert.equal(op.readOnly,true);assert.deepEqual(op.parameters.filter(p=>p.in==='path').map(p=>p.name),['schoolId','yearId','classId']);
 const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',value={school:{id,name:'Trường thử',shortName:'TT',slug:'header-test'},class:{id,version:1,yearId:id,gradeLevelId:id,name:'6A',capacity:40,status:'DRAFT',roomId:null,motto:null,createdAt:'2026-10-01T00:00:00Z'},year:{id,version:1,code:'Y26',name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'},grade:'Khối 6',today:'2026-10-01',referenceDate:'2026-10-01',homeroom:null,studentCount:null,maleCount:null,femaleCount:null,myDuties:[],viaSchoolRole:false,workspaceKind:'CLASS',actions:['class.read'],tabs:[{key:'overview',label:'Tổng quan',path:''}],summary:{weekIndex:null,weekStatus:null,pending:null,links:null,lastPublishedAt:null},readOnly:false};validateSchema('ClassWorkspaceHeader',value,true);
 for(const bad of [{...value,studentId:id},{...value,tokenHash:'secret'},{...value,summary:{...value.summary,periodId:id}},{...value,homeroom:{name:'Tên công tác',contactVisible:true,workEmail:null,workPhone:null,userId:id}}])assert.throws(()=>validateSchema('ClassWorkspaceHeader',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
});

test('class workspace overview is exact-class staff read with nullable panels bounded previews and no private source objects',()=>{
 const op=operations.find(o=>o.id==='getClassWorkspaceOverview');assert.equal(op.auth,'staff');assert.equal(op.permission,'class.read');assert.equal(op.readOnly,true);assert.equal(op.method,'GET');assert.deepEqual(op.parameters.filter(p=>p.in==='path').map(p=>p.name),['schoolId','yearId','classId']);
 const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',v={schoolId:id,yearId:id,classId:id,today:'2026-10-01',referenceDate:'2026-10-01',asOf:'2026-10-01T01:00:00Z',isCurrent:true,readOnly:false,permissions:{attendance:false,schedule:false,groups:false,activities:false},canRecordMorning:false,allowedTaskKinds:[],tasks:null,attendance:null,lessons:null,groups:null,activities:null,navigation:[]};validateSchema('ClassWorkspaceOverview',v,true);
 const lesson={id,version:1,periodNumber:null,startsAtLocal:'08:00',endsAtLocal:'08:30',subjectName:'Môn thật',teacherName:null,roomName:null,status:'CANCELLED',changeReason:null};validateSchema('ClassWorkspaceOverview',{...v,lessons:[lesson]},true);
 for(const bad of [{...v,studentId:id},{...v,internalNote:'secret'},{...v,tasks:[{kind:'role-spoof',count:1}]},{...v,lessons:[{...lesson,memberId:id}]},{...v,lessons:Array.from({length:101},()=>lesson)},{...v,groups:{items:[],noGroup:0,totalStudents:0,students:[]}}])assert.throws(()=>validateSchema('ClassWorkspaceOverview',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
});

test('all operation IDs are unique, including the explicit frontend workflow extensions',()=>{
  assert.equal(operations.length,343);assert.equal(new Set(operations.map(op=>op.id )).size,343);
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
test('reviewed parent issuance requires every reviewed source version and rejects contact/token/actor fields',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',reviewedSource={schoolVersion:1,yearVersion:1,studentVersion:1,enrollmentId:id,enrollmentVersion:1,classVersion:1,relationshipVersion:1,guardianVersion:1};
  const body={studentId:id,yearId:id,relationshipId:id,reviewedSource,allowedSections:['overview','documents'],allowDownload:false,expiresOn:'2026-10-15'};
  validateSchema('ParentAccessReviewedCreate',body);
  for(const key of Object.keys(reviewedSource)){const copy=structuredClone(body);delete copy.reviewedSource[key];assert.throws(()=>validateSchema('ParentAccessReviewedCreate',copy),error=>error.status===422);}
  for(const bad of [{...body,token:'secret'},{...body,actorId:id},{...body,phone:'0901234567'},{...body,reviewedSource:{...reviewedSource,expectedVersion:1}},{...body,replace:{accessId:id}},{...body,allowedSections:['overview','overview']}])assert.throws(()=>validateSchema('ParentAccessReviewedCreate',bad),error=>error.status===422);
  for(const name of ['getParentAccessIssueContext','listParentAccessIssueStudents','getStudentParentAccessIssueSource','issueReviewedParentAccess'])assert.equal(operations.find(op=>op.id===name).permission,'parent_access.issue');
  validateSchema('Error',{type:'urn:test',title:'LINK_ALREADY_ISSUED',status:409,code:'LINK_ALREADY_ISSUED',requestId:'r',resultId:id},true);
});
test('parent staff metadata excludes bearer/private fields and history represents missing device/section explicitly',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',stamp='2026-10-01T00:00:00Z',row={id,version:1,createdAt:stamp,updatedAt:stamp,studentId:id,studentVersion:1,studentName:'Học sinh',studentCode:'HS001',studentStatus:'ACTIVE',yearId:id,yearName:'Năm học',yearStatus:'ACTIVE',classId:id,classVersion:1,className:'Lớp',enrollmentInEffect:true,
    relationshipId:id,relationshipVersion:1,relationshipLabel:'Mẹ',relationshipStatus:'VERIFIED',canReceiveInfo:true,relationshipRevokedAt:null,guardianId:id,guardianVersion:1,guardianName:'Người nhận',allowedSections:['overview'],allowDownload:false,expiresAt:stamp,revokedAt:null,revokeReason:null,issuedBy:id,issuedByName:null,status:'ACTIVE',opens:0,lastOpenedAt:null,canIssue:false,canRevoke:false,canPreview:false};
  validateSchema('ParentStaffAccessRow',row,true);
  for(const key of ['token','tokenHash','link','phone','email','internalNote','dateOfBirth'])assert.throws(()=>validateSchema('ParentStaffAccessRow',{...row,[key]:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  validateSchema('ParentStaffAccessEvent',{id,accessLinkId:id,eventKind:'READ',occurredAt:stamp,deviceSummary:null,section:null},true);
  assert.throws(()=>validateSchema('ParentStaffAccessEvent',{id,accessLinkId:id,eventKind:'READ',occurredAt:stamp,deviceSummary:null,section:null,ipDailyHash:'private'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  for(const operation of ['listParentAccessDirectory','getParentAccessDirectorySummary','getParentAccessDetails','listParentAccessHistory'])assert.equal(operations.find(op=>op.id===operation).permission,'parent_access.manage');
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
test('invitation choices use invitation authority and never lend role metadata or contacts',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',value={roles:[{id,version:1,label:'Vai trò',code:'ACTUAL',systemRole:false,canDelegate:false,delegationUntil:null}]};
  validateSchema('StaffInvitationOptions',value,true);
  for(const field of ['permissions','actions','memberCount','email'])assert.throws(()=>validateSchema('StaffInvitationOptions',{roles:[{...value.roles[0],[field]:[]}]},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
  assert.equal(operations.find(op=>op.id==='getStaffInvitationOptions').permission,'member.manage');
  assert.equal(operations.find(op=>op.id==='listStaffActivity').permission,'audit.read');
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

test('student-create options are a minimal write-purpose class projection without roster or borrowed catalogs',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',choice={id,version:1,name:'Lớp',status:'DRAFT',yearId:id,yearName:'Năm',yearStartsOn:'2026-01-01',yearEndsOn:'2027-01-01',canAddGuardian:false};
  validateSchema('StudentCreateOptions',{today:'2026-10-01',classes:[choice]},true);
  for(const field of ['students','capacity','homeroomMemberId','gradeId','contacts'])assert.throws(()=>validateSchema('StudentCreateClassChoice',{...choice,[field]:[]},true));
  assert.equal(operations.find(op=>op.id==='getStudentCreateOptions').permission,'student.manage');
});


test('parent context metadata distinguishes year, link and session bounds without child private fields',()=>{
  const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',time=new Date().toISOString(),context={viewId:id,school:{name:'Trường',slug:'truong',publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Học sinh',classLabel:'Lớp',schoolYearLabel:'Năm'},allowedSections:['overview'],allowDownload:false,csrfToken:'synthetic-csrf',expiresAt:time,today:'2026-10-01',year:{label:'Năm',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:time,lastPublishedAt:null};
  validateSchema('ParentContext',context,true);
  for(const field of ['dateOfBirth','internalNote','guardianPhone','studentId','token','tokenHash'])assert.throws(()=>validateSchema('ParentContext',{...context,student:{...context.student,[field]:'private'}},true));
  assert.throws(()=>validateSchema('ParentContext',{...context,year:{...context.year,endsOn:time}},true));
});


test('parent attendance month preserves real session/holiday counts and rejects private fields or invented calendar states',()=>{
 const row={granularity:'DAILY',month:'2026-10',yearStart:'2026-09',yearEnd:'2027-05',today:'2026-10-01',days:[{date:'2026-10-01',weekday:4,holidayNames:[],sessions:[],status:'not_published'}],totals:{present:0,late:0,excused:0,unexcused:0,unmarked:0,published:0,marked:0}};
 assert.doesNotThrow(()=>validateSchema('ParentAttendanceMonth',row,true));
 for(const value of [{...row,granularity:'LESSON'},{...row,granularity:undefined},{...row,studentId:'63000000-0000-4000-8000-000000000001'},{...row,days:[{...row.days[0],status:'invented-present'}]},{...row,totals:{...row.totals,marked:-1}}])assert.throws(()=>validateSchema('ParentAttendanceMonth',value,true));
});

test('parent teacher directory requires explicit nullable work metadata and minimal unique weekdays without raw staff identity',()=>{
 const teacher={kind:'SUBJECT',displayName:'Giáo viên công tác',subjectName:'Toán',workEmail:null,workPhone:null,weekdays:[1,3,7]},value={today:'2026-10-01',classLabel:'6A',contactHours:null,teachers:[teacher]};validateSchema('ParentTeacherDirectory',value,true);
 for(const bad of [{...value,studentId:'private'},{...value,teachers:[{...teacher,userId:'private'}]},{...value,teachers:[{...teacher,weekdays:[1,1]}]},{...value,teachers:[{...teacher,weekdays:[0]}]},{...value,teachers:[{...teacher,kind:'ADMIN'}]}])assert.throws(()=>validateSchema('ParentTeacherDirectory',bad,true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
 assert.equal(operations.find(op=>op.id==='getParentTeacherDirectory').permission,'parent.teachers');assert.equal(operations.find(op=>op.id==='previewParentTeacherDirectory').permission,'parent_access.preview');
});

test('parent duty schedule exposes only concrete published tasks with explicit status and year/date metadata',()=>{
 const item={date:'2026-10-01',task:'Quét lớp',status:'ASSIGNED',publishedAt:'2026-10-01T01:00:00Z'},value={today:'2026-10-01',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},items:[item]};validateSchema('ParentDutySchedule',value,true);
 for(const bad of [{...value,studentId:'private'},{...value,items:[{...item,groupStudents:['Bạn khác']}]},{...value,items:[{...item,status:'PUBLISHED'}]},{...value,items:Array.from({length:5001},()=>item)}])assert.throws(()=>validateSchema('ParentDutySchedule',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 assert.equal(operations.find(op=>op.id==='getParentDutySchedule').permission,'parent.duties');assert.equal(operations.find(op=>op.id==='previewParentDutySchedule').permission,'parent_access.preview');
});

test('parent weekly timetable requires explicit published status, timezone and nullable pinned metadata without raw source fields',()=>{
 const lesson={date:'2026-10-05',startsAt:'2026-10-05T01:00:00Z',endsAt:'2026-10-05T01:45:00Z',startsAtLocal:'08:00',endsAtLocal:'08:45',periodNumber:null,subjectName:'Toán',teacherName:'Giáo viên',roomName:null,status:'SCHEDULED',changeNote:null},day={date:'2026-10-05',holidayNames:[],lessons:[lesson]},value={weekStart:'2026-10-05',today:'2026-10-05',timezone:'Asia/Ho_Chi_Minh',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},weekNumber:null,days:[day]};validateSchema('ParentTimetableWeek',value,true);
 for(const bad of [{...value,studentId:'private'},{...value,days:[{...day,lessons:[{...lesson,memberId:'private'}]}]},{...value,days:[{...day,lessons:[{...lesson,periodNumber:0}]}]},{...value,days:[{...day,lessons:[{...lesson,status:'DRAFT'}]}]},{...value,days:[{...day,lessons:[{...lesson,startsAtLocal:'25:00'}]}]}])assert.throws(()=>validateSchema('ParentTimetableWeek',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 assert.equal(operations.find(op=>op.id==='getParentTimetableWeek').permission,'parent.timetable');assert.equal(operations.find(op=>op.id==='previewParentTimetableWeek').permission,'parent_access.preview');
});


test('parent document directory requires real independent capabilities and minimal report fields without storage keys',()=>{
 const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',file={id,title:'Tài liệu',contentType:'image/png',byteSize:3,downloadAllowed:false,viewAllowed:true,publishedAt:'2026-10-01T01:00:00Z'},report={periodId:id,title:'Kết quả thi đua Tuần 5',publishedAt:file.publishedAt,total:'80.10',grade:null,revision:1},data={files:[file],reports:[report]};validateSchema('ParentDocumentDirectory',data,true);
 for(const bad of [{...data,files:[{...file,fileId:id}]},{...data,files:[{...file,objectKey:'private'}]},{...data,files:[{...file,id:null}]},{...data,reports:[{...report,internalNote:'private'}]},{...data,files:Array.from({length:1001},()=>file)}])assert.throws(()=>validateSchema('ParentDocumentDirectory',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 for(const op of ['getParentDocumentDirectory','getParentDocument','viewParentDocument'])assert.equal(operations.find(o=>o.id===op).permission,'parent.documents');for(const op of ['previewParentDocumentDirectory','previewParentDocument','previewParentDocumentView','previewParentDocumentDownload'])assert.equal(operations.find(o=>o.id===op).permission,'parent_access.preview');
});

test('parent shared content keeps pinned nullable metadata and independent attachments without raw sources or recipients',()=>{
 const id='da72b470-4b45-4f5f-b89d-179c0cdf454a',at='2026-10-01T01:00:00Z',activity={id,title:'Hoạt động',description:null,dueAt:'2026-10-03T17:30:00Z',studentStatus:'EXCUSED',publicReviewNote:null,documents:[],publishedAt:at,activityStatus:null,illustration:null,updatedAt:null,timezone:'Asia/Ho_Chi_Minh',dueOn:'2026-10-04'},announcement={id,title:'Thông báo',sanitizedHtml:'<h2>Nội dung</h2><p>Đã công bố</p>',publishedAt:at,senderLabel:'Lớp',documents:[],summary:null,scopeKinds:['STUDENT']};
 validateSchema('ParentSharedActivity',activity,true);validateSchema('ParentSharedAnnouncement',announcement,true);
 for(const value of [{...activity,participantId:id},{...activity,activityStatus:'DRAFT'},{...activity,studentStatus:'PUBLISHED'},{...activity,timezone:null}])assert.throws(()=>validateSchema('ParentSharedActivity',value,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 for(const value of [{...announcement,recipients:[id]},{...announcement,internalNote:'private'},{...announcement,scopeKinds:['STUDENT','STUDENT']},{...announcement,scopeKinds:['STAFF']}])assert.throws(()=>validateSchema('ParentSharedAnnouncement',value,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 for(const [type,value]of [['ParentSharedActivityDirectory',activity],['ParentSharedAnnouncementDirectory',announcement]])assert.throws(()=>validateSchema(type,{items:Array.from({length:1001},()=>value)},true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 for(const section of ['Activity','Announcement'])for(const ending of ['','Directory']){assert.equal(operations.find(o=>o.id==='getParentPublished'+section+ending).permission,'parent.'+(section==='Activity'?'activities':'announcements'));assert.equal(operations.find(o=>o.id==='previewParentPublished'+section+ending).permission,'parent_access.preview');}
});

test('parent conduct display exposes published own history and explicit absent metadata without staff rules or cohort identity',()=>{
 const periodId='da72b470-4b45-4f5f-b89d-179c0cdf454a',publishedAt='2026-10-01T01:00:00Z',value={periodId,periodLabel:'Tuần 5',revision:1,basePoints:'80.10',bonusPoints:'0.20',penaltyPoints:'0.00',finalPoints:'80.30',classification:null,lines:[],publishedAt,adjusted:false,weekNumber:null,startsOn:null,endsOn:null,classLabel:null,ruleSetName:null,ruleSetRevision:null,minimumPoints:null,maximumPoints:null,timezone:'Asia/Ho_Chi_Minh',history:[{revision:1,publishedAt,total:'80.30',classification:null,current:true}]};validateSchema('ParentSharedConduct',value,true);
 for(const bad of [{...value,studentId:periodId},{...value,ruleSetId:periodId},{...value,rank:1},{...value,history:[{...value.history[0],staffSnapshot:{}}]},{...value,lines:[{label:'Nguồn',delta:'0.20',occurredAt:publishedAt,reason:'Công khai',date:'2026-10-01',internalNote:'private'}]},{...value,history:Array.from({length:1001},()=>value.history[0])}])assert.throws(()=>validateSchema('ParentSharedConduct',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 for(const id of ['getParentPublishedConduct','getParentPublishedConductDirectory'])assert.equal(operations.find(o=>o.id===id).permission,'parent.conduct');for(const id of ['previewParentPublishedConduct','previewParentPublishedConductDirectory'])assert.equal(operations.find(o=>o.id===id).permission,'parent_access.preview');
});

test('parent published overview requires explicit section absence, DAILY week facts and bounded purpose previews without private source fields',()=>{
 const value={today:'2026-10-01',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},asOf:'2026-10-01T01:00:00Z',teachers:null,attendanceWeek:null,conduct:null,timetable:null,duties:null,activities:null,announcements:null};validateSchema('ParentPublishedOverview',value,true);
 const week={granularity:'DAILY',weekStart:'2026-09-28',startsOn:'2026-09-28',endsOn:'2026-10-05',totals:{present:0,late:0,excused:0,unexcused:0,unmarked:0,published:0,marked:0},records:[]};validateSchema('ParentPublishedOverview',{...value,attendanceWeek:week,teachers:{today:value.today,classLabel:null,contactHours:null,teachers:[]},duties:{today:value.today,year:value.year,items:[]},activities:{items:[]},announcements:{items:[]}},true);
 for(const bad of [{...value,teachers:undefined},{...value,students:[]},{...value,attendanceWeek:{...week,granularity:'LESSON'}},{...value,attendanceWeek:{...week,records:Array.from({length:1001},()=>({date:value.today,slotLabel:'Buổi sáng',status:'PRESENT',publishedAt:value.asOf}))}},{...value,duties:{today:value.today,year:value.year,items:Array.from({length:3},()=>({date:value.today,task:'Nhiệm vụ',status:'ASSIGNED',publishedAt:value.asOf}))}}])assert.throws(()=>validateSchema('ParentPublishedOverview',bad,true),e=>e.code==='RESPONSE_CONTRACT_ERROR');
 assert.equal(operations.find(o=>o.id==='getParentPublishedOverview').permission,'parent.overview');assert.equal(operations.find(o=>o.id==='previewParentPublishedOverview').permission,'parent_access.preview');
});
