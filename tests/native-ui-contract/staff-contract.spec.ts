import {expect,test,type Page,type Route} from '@playwright/test';

const schoolId='20000000-0000-4000-8000-000000000001',yearId='20000000-0000-4000-8000-000000000002',classId='20000000-0000-4000-8000-000000000003',memberId='20000000-0000-4000-8000-000000000004',recipientId='20000000-0000-4000-8000-000000000005',roleId='20000000-0000-4000-8000-000000000006',userId='20000000-0000-4000-8000-000000000007',assignmentId='20000000-0000-4000-8000-000000000008';
const base=`/api/v1/schools/${schoolId}`,web=`/school/${schoolId}`,stamp='2026-10-01T00:00:00Z';
const year={id:yearId,version:1,code:'Y',name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'};
const school={id:schoolId,version:1,code:'STAFF',name:'Trường nhân sự API',slug:'staff-api',shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'',publicContactEmail:null,publicContactPhone:null,publicAddress:null,website:null,status:'ACTIVE',createdAt:stamp};
const member=(version=7)=>({id:memberId,version,userId:memberId,status:'ACTIVE',workDisplayName:'Giáo viên API',shareWorkContact:false,workEmail:null,workPhone:null,schoolRoleGrants:[],grants:[],joinedAt:null,endedAt:null,statusReason:null});
const details=(canAssign=false)=>({member:member(),referenceDate:'2026-10-01',joinedOn:null,accessActive:true,otherSchools:2,assignments:null,roleChoices:null,canAssign,canSuspend:false,canRole:false,canViewHistory:false,isSelf:false});
const summary={kpi:{total:1,active:1,suspended:0,pendingInvites:null},departments:[],roleLabels:[],canInvite:false,canSuspend:false,canAssign:false,canExport:false,canViewInvitations:false};
const reply=(route:Route,data:unknown)=>route.fulfill({status:200,json:{data,requestId:'staff-browser-contract'}});
const list=(route:Route,data:unknown[])=>route.fulfill({status:200,json:{data,requestId:'staff-browser-contract',page:{limit:100,total:data.length,hasMore:false,nextCursor:null}}});
const denied=(route:Route)=>route.fulfill({status:403,json:{code:'PERMISSION_DENIED',requestId:'staff-browser-contract'}});
async function routes(page:Page,actions:string[],handler:(route:Route,path:string)=>Promise<unknown>){
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/me/context')return reply(route,{user:{id:userId,version:1,displayName:'Nhân sự native',email:'synthetic@example.invalid',status:'ACTIVE'},platformActions:[],csrfToken:'staff-contract-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[{memberId:recipientId,schoolId,schoolName:school.name,schoolCode:school.code,schoolSlug:school.slug,schoolStatus:'ACTIVE',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',today:'2026-10-01',duties:[],grants:[{id:roleId,version:1,roleId,roleCode:'CUSTOM',roleLabel:'Quyền API',scopeType:'SCHOOL',validFrom:'2020-01-01T00:00:00Z',validUntil:null,revokedAt:null,actions}]}]});
    if(path==='/api/v1/me/notifications')return list(route,[]);
    if(path===`${base}/profile`)return reply(route,school);
    if(path===`${base}/academic-years`)return list(route,[year]);
    return handler(route,path);
  });
}
const screenshot=(name:string)=>`qa/backend/${process.env.EDU_NATIVE_QA_PREFIX??'b6-native-staff'}-${name}.png`;

test.describe('Native staff browser contracts — intercepted API, separate from PostgreSQL E2E',()=>{
  test('renders denied assignment and history panels without inventing empty data or reading invitations',async({page})=>{
    const deniedReads:string[]=[];
    await routes(page,['school.read','year.read','member.read'],(route,path)=>{
      if(path===`${base}/members/${memberId}/details`)return reply(route,details());
      deniedReads.push(path);return denied(route);
    });
    await page.goto(`${web}/teachers/${memberId}`);
    await expect(page.getByRole('heading',{name:'Giáo viên API',exact:true})).toBeVisible();await expect(page.getByText('Bạn không được phép xem phân công.',{exact:true})).toBeVisible();await expect(page.getByText('Bạn không được phép xem lịch sử.',{exact:true})).toBeVisible();await expect(page.getByText('Chưa có phân công',{exact:true})).toHaveCount(0);expect(deniedReads).toEqual([]);
    await page.screenshot({path:screenshot('member-desktop'),fullPage:true});
  });

  test('keeps mixed action scopes and source version through refresh, retains read failures and reloads a role explicitly after conflict',async({page})=>{
    const role=(version=7)=>({id:roleId,version,createdAt:stamp,updatedAt:stamp,code:'CUSTOM',label:'Vai trò nhiều phạm vi',systemRole:false,status:'ACTIVE',scopes:['CLASS','SUBJECT'],memberCount:3,assignmentCount:1,permissions:[{action:'student.read',scopes:['CLASS','SUBJECT']}]});
    let version=7,failure=0,reads=0;const writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','role.read','role.manage','student.read'],(route,path)=>{
      if(path===`${base}/roles/${roleId}/details`){reads++;return failure?route.fulfill({status:failure,json:{code:'SERVICE_UNAVAILABLE'}}):reply(route,{role:role(version),canEdit:true,ownRole:false,systemRole:false,canViewMembers:false,canViewHistory:false,actions:[{action:'student.read',canGrant:true},{action:'guardian.read',canGrant:false}],members:null,history:null});}
      if(path===`${base}/roles/${roleId}`&&route.request().method()==='PATCH'){writes.push(route.request().postDataJSON());return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',currentVersion:8}});}
      return denied(route);
    });
    await page.goto(`${web}/roles/${roleId}`);
    const student=page.getByText('Xem học sinh',{exact:true}).locator('..'),guardian=page.getByText('Xem giám hộ',{exact:true}).locator('..');
    await expect(student.getByRole('checkbox',{name:'Lớp',exact:true})).toBeChecked();await expect(student.getByRole('checkbox',{name:'Môn',exact:true})).toBeChecked();await expect(guardian.getByRole('checkbox',{name:/^Trường/})).toBeDisabled();await student.getByRole('checkbox',{name:'Môn',exact:true}).uncheck();await page.getByLabel(/^Lý do thay đổi/).fill('Giữ quyền theo lớp');
    let prior=reads;version=8;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(student.getByRole('checkbox',{name:'Môn',exact:true})).not.toBeChecked();
    prior=reads;failure=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(page.getByLabel(/^Lý do thay đổi/)).toHaveValue('Giữ quyền theo lớp');await expect(page.getByRole('button',{name:'Xem tác động & lưu'})).toBeVisible();failure=0;
    await page.getByRole('button',{name:'Xem tác động & lưu'}).click();await page.getByRole('button',{name:'Xác nhận lưu',exact:true}).click();await expect(page.getByRole('button',{name:'Tải bản mới nhất'})).toBeVisible();expect(writes).toEqual([{expectedVersion:7,reason:'Giữ quyền theo lớp',permissions:[{action:'student.read',scopes:['CLASS']}]}]);await page.getByRole('button',{name:'Tải bản mới nhất'}).click();await expect(student.getByRole('checkbox',{name:'Môn',exact:true})).toBeChecked();
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:screenshot('role-mobile'),fullPage:true});
  });

  test('creates an invitation through purpose-bound choices with zero roles and truthful queued delivery',async({page})=>{
    const reads:string[]=[],writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','member.read','member.manage'],(route,path)=>{
      if(path===`${base}/staff-directory-summary`)return reply(route,{...summary,canInvite:true,canViewInvitations:true,kpi:{...summary.kpi,pendingInvites:0}});
      if(path===`${base}/staff-directory`||path===`${base}/invitations`&&route.request().method()==='GET')return list(route,[]);
      if(path===`${base}/staff-invitation-options`)return reply(route,{roles:[{id:roleId,version:1,label:'Vai trò vượt quyền',code:'CUSTOM',systemRole:false,canDelegate:false,delegationUntil:null}]});
      if(path===`${base}/staff-invitations`&&route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);return reply(route,{id:roleId,version:1,createdAt:stamp,updatedAt:stamp,email:body.email,workDisplayName:body.workDisplayName,proposedDuty:body.proposedDuty,roleIds:body.roleIds,expiresAt:'2099-10-01T00:00:00Z',status:'PENDING',deliveryState:'QUEUED',inviterName:'Người mời API'});}
      reads.push(path);return denied(route);
    });
    await page.goto(`${web}/teachers`);await page.getByRole('button',{name:'Mời giáo viên',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Vai trò vượt quyền'})).toBeDisabled();await page.getByLabel(/^Họ và tên/).fill('Giáo viên được mời');await page.getByLabel(/^Email công việc/).fill('invite@example.invalid');await page.getByRole('button',{name:'Tạo lời mời',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mời giáo viên',exact:true})).toHaveCount(0);expect(writes).toEqual([{email:'invite@example.invalid',workDisplayName:'Giáo viên được mời',proposedDuty:'',roleIds:[],expiresInDays:7}]);expect(reads).toEqual([]);await expect(page.getByText(/email đã được xếp hàng gửi/)).toBeVisible();
  });

  test('replaces school roles with the reviewed member version and actual delegation deadline without reading a role catalog',async({page})=>{
    const oldRole='20000000-0000-4000-8000-000000000009',deadline='2099-10-01T00:00:00Z';
    const held={id:assignmentId,version:2,roleId:oldRole,roleLabel:'Vai trò giữ lại',roleCode:'KEEP',scopeType:'SCHOOL',actions:['school.read'],validFrom:stamp,validUntil:'2099-12-01T00:00:00Z'};
    const choices=[{id:oldRole,version:1,label:'Vai trò giữ lại',code:'KEEP',systemRole:false,canDelegate:false,delegationUntil:null},{id:roleId,version:1,label:'Vai trò cấp mới',code:'NEW',systemRole:false,canDelegate:true,delegationUntil:deadline}];
    let version=7,reads=0;const writes:Record<string,unknown>[]=[],catalogReads:string[]=[];
    await routes(page,['school.read','year.read','member.read','role.manage'],(route,path)=>{
      if(path===`${base}/members/${memberId}/details`){reads++;return reply(route,{...details(),member:{...member(version),schoolRoleGrants:[held],grants:[held]},roleChoices:choices,canRole:true});}
      if(path===`${base}/members/${memberId}/school-roles`){const body=route.request().postDataJSON();writes.push(body);return reply(route,{id:memberId,version:9,status:'ACTIVE',schoolRoleGrants:[held,{...held,id:recipientId,roleId,roleLabel:'Vai trò cấp mới',roleCode:'NEW',validUntil:deadline}]});}
      catalogReads.push(path);return denied(route);
    });
    await page.goto(`${web}/teachers/${memberId}`);await page.getByRole('button',{name:'Thay đổi',exact:true}).click();await page.getByRole('checkbox',{name:/Vai trò cấp mới/}).check();await page.getByLabel(/^Lý do thay đổi/).fill('Cấp quyền trong thời hạn');const prior=reads;version=8;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(page.getByRole('checkbox',{name:/Vai trò cấp mới/})).toBeChecked();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await expect(page.getByRole('dialog',{name:'Thay đổi mẫu quyền nhà trường',exact:true})).toHaveCount(0);expect(writes).toEqual([{expectedVersion:7,roleIds:[oldRole,roleId],reason:'Cấp quyền trong thời hạn',validUntil:deadline}]);expect(catalogReads).toEqual([]);
  });

  test('saves the reviewed assignment dates and versions, retains a wrong ACK and manually retries the same key',async({page})=>{
    let previewReads=0;const saves:{body:Record<string,unknown>;key:string}[]=[],classReads:string[]=[];
    await routes(page,['school.read','year.read','member.read','assignment.manage'],(route,path)=>{
      if(path===`${base}/members/${memberId}/details`)return reply(route,details(true));
      if(path===`${base}/classes`){classReads.push(new URL(route.request().url()).searchParams.get('purpose')??'');return list(route,[{id:classId,version:8,name:'Lớp API',status:'ACTIVE'}]);}
      if(path===`${base}/members`)return list(route,[{...member(),homeroomOf:[]}]);
      if(path.includes('/dictionaries/'))return list(route,[]);
      if(path===`${base}/assignments/preview`){previewReads++;return reply(route,{memberId,memberVersion:previewReads===1?7:9,classId,classVersion:previewReads===1?8:10,kind:'HOMEROOM',subjectId:null,scopeName:'Lớp API',referenceDate:'2026-10-01',startsOn:'2026-10-01',endsOn:'2027-06-01',grantStartsAt:stamp,grantEndsAt:'2027-05-31T17:00:00Z',added:['student.read'],kept:[],notIncluded:[],warnings:[]});}
      if(path===`${base}/assignments`&&route.request().method()==='POST'){const body=route.request().postDataJSON();saves.push({body,key:route.request().headers()['idempotency-key']});return reply(route,{id:assignmentId,version:1,createdAt:stamp,updatedAt:stamp,classId,memberId:saves.length===1?recipientId:memberId,roleGrantId:roleId,kind:'HOMEROOM',subjectId:null,startsOn:body.startsOn,endsOn:body.endsOn,revokedAt:null});}
      return denied(route);
    });
    await page.goto(`${web}/teachers/${memberId}`);await page.getByRole('button',{name:'Phân công mới',exact:true}).click();await page.getByRole('radio',{name:/Giáo viên chủ nhiệm/}).check();await page.getByLabel(/^Lớp/).selectOption(classId);await page.getByRole('button',{name:'Xem trước quyền'}).click();await expect(page.getByText('Xem học sinh',{exact:true})).toBeVisible();const prior=previewReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>previewReads).toBeGreaterThan(prior);
    await page.getByRole('button',{name:'Xác nhận phân công',exact:true}).click();await expect(page.getByText(/Chưa xác minh được kết quả từ máy chủ/)).toBeVisible();await expect(page.getByRole('button',{name:'Xác nhận phân công',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Xác nhận phân công',exact:true}).click();await expect(page.getByRole('dialog',{name:'Xem thay đổi quyền'})).toHaveCount(0);expect(saves).toHaveLength(2);expect(saves[0].body).toMatchObject({startsOn:'2026-10-01',endsOn:'2027-06-01',expectedMemberVersion:7,expectedClassVersion:8});expect(saves[1]).toEqual(saves[0]);expect(classReads.every(p=>p==='assignment-picker')).toBe(true);
  });

  test('recovers a handover after a lost create ACK and reload, then reviews changed sources without creating a second receipt',async({page})=>{
    const current={assignmentId,version:3,membershipId:memberId,memberVersion:7,name:'Giáo viên API',memberStatus:'ACTIVE',startsOn:'2026-09-01',endsOn:null,accessActive:true},checklist={pendingConduct:2,openWeeks:1,pendingAdjustments:0,pendingEvidence:0,draftAnnouncements:0,activeLinks:1};
    let stored:Record<string,unknown>|null=null;const create:Record<string,unknown>[]=[],review:Record<string,unknown>[]=[],approve:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','assignment.manage'],(route,path)=>{
      if(path===`${base}/classes`)return list(route,[{id:classId,version:8,name:'Lớp API',status:'ACTIVE'}]);
      if(path===`${base}/members`)return list(route,[{...member(),homeroomOf:[]},{...member(6),id:recipientId,userId:recipientId,workDisplayName:'Giáo viên nhận',homeroomOf:[]}]);
      if(path.includes('/dictionaries/'))return list(route,[]);
      if(path===`${base}/classes/${classId}/handover-preview`){const query=new URL(route.request().url()).searchParams;return reply(route,{className:'Lớp API',classVersion:stored?9:8,referenceDate:'2026-10-01',effectiveOn:query.get('effectiveOn')??'2026-10-02',canHandover:true,current,openItems:checklist,previewHash:stored?'b'.repeat(64):'a'.repeat(64),toMemberVersion:query.get('toMemberId')?6:null});}
      if(path.startsWith(`${base}/handovers/requests/`))return stored?reply(route,stored):route.fulfill({status:404,json:{code:'RESOURCE_NOT_FOUND'}});
      if(path===`${base}/handovers`&&route.request().method()==='POST'){const body=route.request().postDataJSON();create.push(body);stored={id:roleId,version:1,createdAt:stamp,updatedAt:stamp,classId,fromAssignmentId:assignmentId,toMemberId:recipientId,effectiveOn:body.effectiveOn,reason:body.reason,status:'SUBMITTED',clientRequestId:body.clientRequestId,previewHash:body.previewHash,checklist,appliedAssignmentId:null,appliedAssignment:null,appliedAt:null};return route.fulfill({status:503,json:{code:'LOST_ACK'}});}
      if(path===`${base}/handovers/${roleId}/review`){const body=route.request().postDataJSON();review.push(body);stored={...stored!,version:2,previewHash:body.previewHash};return reply(route,stored);}
      if(path===`${base}/handovers/${roleId}/approve`){approve.push(route.request().postDataJSON());const assignment={id:classId,version:1,createdAt:stamp,updatedAt:stamp,classId,memberId:recipientId,roleGrantId:roleId,kind:'HOMEROOM',subjectId:null,startsOn:stored!.effectiveOn,endsOn:'2027-06-01',revokedAt:null};stored={...stored!,status:'APPLIED',version:3,appliedAt:stamp,appliedAssignmentId:classId,appliedAssignment:assignment};return reply(route,stored);}
      return denied(route);
    });
    page.on('dialog',dialog=>void dialog.accept());
    await page.goto(`${web}/handovers?class=${classId}`);await expect(page.getByText('Giáo viên API',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();await page.getByRole('combobox',{name:/Giáo viên nhận chủ nhiệm/}).click();await page.getByRole('option',{name:/Giáo viên nhận/}).click();await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();await page.getByLabel(/^Lý do \/ nội dung bàn giao/).fill('Bàn giao từ nguồn API');await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();await page.getByRole('button',{name:'Xác nhận bàn giao',exact:true}).click();await page.getByRole('button',{name:'Bàn giao',exact:true}).click();await expect(page.getByText(/Máy chủ chưa sẵn sàng/).first()).toBeVisible();expect(create).toHaveLength(1);
    const values=await page.evaluate(()=>Object.values(sessionStorage));expect(values).toEqual([create[0].clientRequestId]);await page.reload();await expect(page.getByText('Biên nhận bàn giao trước đó')).toBeVisible();await page.getByRole('button',{name:'Mở lại để kiểm tra nguồn'}).click();await page.getByRole('button',{name:'Xác nhận bàn giao',exact:true}).click();await expect(page.getByText(/nguồn lớp phiên bản 9/)).toBeVisible();await page.getByRole('button',{name:'Bàn giao',exact:true}).click();await expect(page.getByText('Đã bàn giao chủ nhiệm lớp Lớp API',{exact:true})).toBeVisible();expect(create).toHaveLength(1);expect(review).toHaveLength(1);expect(review[0]).toMatchObject({expectedVersion:1,expectedClassVersion:9,expectedFromAssignmentVersion:3,expectedToMemberVersion:6,previewHash:'b'.repeat(64)});expect(approve).toEqual([{expectedVersion:2,previewHash:'b'.repeat(64)}]);expect(await page.evaluate(()=>Object.values(sessionStorage))).toEqual([]);
  });
});
