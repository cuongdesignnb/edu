import {expect,test,type Page,type Route} from '@playwright/test';

const schoolId='40000000-0000-4000-8000-000000000001',yearId='40000000-0000-4000-8000-000000000002',classId='40000000-0000-4000-8000-000000000003',studentId='40000000-0000-4000-8000-000000000004',guardianId='40000000-0000-4000-8000-000000000005',relationshipId='40000000-0000-4000-8000-000000000006',userId='40000000-0000-4000-8000-000000000007';
const base=`/api/v1/schools/${schoolId}`,web=`/school/${schoolId}`,stamp='2026-10-01T00:00:00Z';
const meta={version:4,createdAt:stamp,updatedAt:stamp};
const school={id:schoolId,version:1,code:'STUDENTS',name:'Trường học sinh API',slug:'students-api',shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'',publicContactEmail:null,publicContactPhone:null,publicAddress:null,website:null,status:'ACTIVE',createdAt:stamp};
const year={id:yearId,version:2,name:'2026–2027',code:'Y',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'};
const student=()=>({...meta,id:studentId,studentCode:'API001',fullName:'Học sinh API',dateOfBirth:'2011-09-30',gender:'Nữ',status:'ACTIVE',preferredName:null});
const contact=()=>({...meta,id:guardianId,fullName:'Giám hộ API',phone:'0912222222',email:null,status:'ACTIVE'});
const relationship=()=>({...meta,id:relationshipId,studentId,guardianId,relationshipLabel:'Mẹ',isPrimary:true,canReceiveInfo:false,status:'UNVERIFIED',verifiedAt:null,revokedAt:null});
const perms={edit:false,transfer:false,seeGuardians:false,editGuardians:false,verifyGuardians:false,manageLinks:false,issueLinks:false,revokeLinks:false,seeInternalNote:false,seeBirthDate:false};
const profile=()=>({student:student(),level:'FULL',today:'2026-10-01',year,referenceDate:'2026-10-01',selectedEnrollment:null,history:[],group:null,positions:[],relationships:null,links:null,accessLog:null,accessLogHasMore:null,internalNote:null,perms});
const guardianProfile=()=>({guardian:contact(),today:'2026-10-01',canEditContact:true,canViewHistory:false,historyHasMore:null,history:null,relationships:[{...relationship(),verifiedByName:null,verificationNote:null,revokedReason:null,student:{id:studentId,version:4,name:'Học sinh API',code:'API001',status:'ACTIVE',classId:null,className:null,yearId:null,enrollmentId:null,enrollmentVersion:null},canEdit:true,canVerify:true,canIssue:false,canRevokeLinks:false,canSeeLinks:false,links:null}]});
const guardianSource=(version=4)=>({student:{id:studentId,version,name:'Học sinh API',code:'API001'},today:'2026-10-01',primaryContacts:[{id:relationshipId,version}],target:{guardian:{...contact(),version},relationship:{...relationship(),version},canEditContact:true}});
const issueContext=()=>({schoolId,schoolVersion:3,schoolName:school.name,schoolSlug:school.slug,timezone:'Asia/Ho_Chi_Minh',today:'2026-10-01',ttlDays:30,defaultSections:['overview','teachers'],year:{id:yearId,version:2,name:year.name,startsOn:year.startsOn,endsOn:year.endsOn,lastDay:'2027-05-31',suggestedExpiryOn:'2026-10-31'}});
const issueSource=(version=4)=>({context:issueContext(),student:{id:studentId,version,fullName:'Học sinh API',studentCode:'API001',status:'ACTIVE'},enrollment:{id:relationshipId,version:5,inEffect:true},class:{id:classId,version:2,name:'Lớp API'},relationships:[{id:relationshipId,version,guardianId,guardianVersion:4,guardianName:'Giám hộ API',relationshipLabel:'Mẹ',status:'VERIFIED',isPrimary:true,canReceiveInfo:true,canIssue:true,activeLinkIds:[] as string[]}]});
const issuedAccess=(body:Record<string,unknown>,id='40000000-0000-4000-8000-000000000020')=>({access:{...meta,id,version:1,studentId,yearId,relationshipId,allowedSections:body.allowedSections,allowDownload:body.allowDownload,expiresAt:'2026-10-31T17:00:00Z',revokedAt:null,issuedToGuardianName:'Giám hộ API'},link:`http://127.0.0.1:18763/p/${school.slug}/access#token=${'B'.repeat(43)}`,displayOnce:true});
const reply=(route:Route,data:unknown)=>route.fulfill({status:200,json:{data,requestId:'students-browser-contract'}});
const list=(route:Route,data:unknown[])=>route.fulfill({status:200,json:{data,requestId:'students-browser-contract',page:{limit:100,total:data.length,hasMore:false,nextCursor:null}}});
const deny=(route:Route)=>route.fulfill({status:403,json:{code:'PERMISSION_DENIED',requestId:'students-browser-contract'}});
const screenshot=(name:string)=>`qa/backend/${process.env.EDU_NATIVE_QA_PREFIX??'b6-native-students'}-${name}.png`;
const accessId='40000000-0000-4000-8000-000000000019';
const staffAccess=(version=4)=>({...meta,id:accessId,version,studentId,studentVersion:4,studentName:'Học sinh API',studentCode:'API001',studentStatus:'ACTIVE',yearId,yearName:year.name,yearStatus:'ACTIVE',classId,classVersion:2,className:'Lớp API',enrollmentInEffect:true,relationshipId,relationshipVersion:4,relationshipLabel:'Mẹ',relationshipStatus:'VERIFIED',canReceiveInfo:true,relationshipRevokedAt:null,guardianId,guardianVersion:4,guardianName:'Giám hộ API',allowedSections:['overview','teachers'],allowDownload:false,expiresAt:'2026-11-01T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:userId,issuedByName:null,status:'ACTIVE',opens:42,lastOpenedAt:stamp,canIssue:false,canRevoke:false,canPreview:false});
const accessSummary=(canIssue=false)=>({today:'2026-10-01',kpi:{total:10,active:7,expired:2,revoked:1},canIssue,classes:[{id:classId,version:2,name:'Lớp API',yearId,yearName:year.name}]});
const accessDetails=(version=4)=>({access:staffAccess(version),today:'2026-10-01',canViewContact:false,phoneMasked:null,revokedByName:null,replacedById:null,siblings:{items:[],hasMore:false,total:0}});
const eventPage=(r:Route)=>{const next=new URL(r.request().url()).searchParams.has('cursor');return r.fulfill({status:200,json:{data:[{id:next?guardianId:relationshipId,accessLinkId:accessId,eventKind:next?'EXCHANGED':'READ',occurredAt:next?'2026-09-30T00:00:00Z':stamp,section:null,deviceSummary:null}],requestId:'parent-browser-history',page:{limit:10,total:11,hasMore:!next,nextCursor:next?null:'next-history'}}});};
async function routes(page:Page,actions:string[],handler:(route:Route,path:string)=>Promise<unknown>,scopeType='SCHOOL'){
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/me/context')return reply(route,{user:{id:userId,version:1,displayName:'Nhân sự native',email:'synthetic@example.invalid',status:'ACTIVE'},platformActions:[],csrfToken:'students-contract-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[{memberId:userId,schoolId,schoolName:school.name,schoolShortName:'API',schoolSlug:school.slug,schoolStatus:'ACTIVE',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',today:'2026-10-01',department:'',schoolWorkspace:true,teacherWorkspace:false,duties:[],grants:[{id:userId,version:1,roleId:userId,roleCode:'CUSTOM',roleLabel:'Quyền API',scopeType,...(scopeType==='CLASS'?{classId}:{}),validFrom:'2020-01-01T00:00:00Z',validUntil:null,revokedAt:null,actions}]}]});
    if(path==='/api/v1/me/notifications')return list(route,[]);
    if(path===`${base}/profile`&&actions.includes('school.read')&&scopeType==='SCHOOL')return reply(route,school);
    if(path===`${base}/academic-years`&&actions.includes('year.read')&&scopeType==='SCHOOL')return list(route,[year]);
    return handler(route,path);
  });
}
async function fillStudent(page:Page){
  await page.getByLabel(/^Họ và tên/, {exact:false}).fill('Học sinh mới');
  await page.getByLabel(/^Ngày sinh/).fill('30/09/2011');await page.getByLabel(/^Ngày sinh/).press('Tab');
  await page.getByRole('radio',{name:'Nữ',exact:true}).check();await page.getByLabel(/^Lớp/).selectOption(classId);
}

test.describe('Native staff parent-link metadata browser contracts — intercepted API, separate from PostgreSQL E2E',()=>{
  test('class manage alone reads its directory choices, sends filters and exposes the explicit student/year URL restriction',async({page})=>{
    const requests:string[]=[],unexpected:string[]=[];await routes(page,['parent_access.manage'],(r,path)=>{
      if(path===`${base}/parent-access-directory-summary`)return reply(r,accessSummary());
      if(path===`${base}/parent-access-directory`){requests.push(r.request().url());return list(r,[staffAccess()]);}
      unexpected.push(path);return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access?studentId=${studentId}&yearId=${yearId}`);
    await expect(page.getByRole('heading',{name:'Quyền tra cứu phụ huynh',exact:true})).toBeVisible();await expect(page.getByText('Đang lọc theo học sinh và năm học đã chọn.',{exact:false})).toBeVisible();await expect(page.getByRole('cell',{name:/^Học sinh API API001/})).toBeVisible();await expect(page.getByRole('button',{name:'Cấp link mới',exact:true})).toHaveCount(0);
    await page.getByLabel('Lọc theo lớp',{exact:true}).selectOption(classId);await expect.poll(()=>requests.some(u=>new URL(u).searchParams.get('classId')===classId&&new URL(u).searchParams.get('studentId')===studentId)).toBe(true);await page.screenshot({path:screenshot('parent-directory'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:screenshot('parent-directory-mobile'),fullPage:true});
    await page.getByRole('link',{name:'Xem toàn bộ phạm vi',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/school/${schoolId}/parent-access$`));await expect(page.getByText('Đang lọc theo học sinh và năm học đã chọn.',{exact:false})).toHaveCount(0);expect(unexpected).toEqual([]);
  });
  test('directory issuance searches one bounded page across 1600 candidates without reading a full roster',async({page})=>{
    const searches:string[]=[],unexpected:string[]=[];await routes(page,['parent_access.manage','parent_access.issue'],(r,path)=>{
      if(path===`${base}/parent-access-directory-summary`)return reply(r,accessSummary(true));if(path===`${base}/parent-access-directory`)return list(r,[{...staffAccess(),canIssue:true}]);
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());
      if(path===`${base}/parent-access/issue-students`){searches.push(r.request().url());return r.fulfill({status:200,json:{data:[{id:studentId,version:4,fullName:'Học sinh API',studentCode:'API001',classId,className:'Lớp API'}],requestId:'bounded-issue-search',page:{limit:100,total:1600,hasMore:true,nextCursor:'next-student'}}});}
      if(path===`${base}/students/${studentId}/parent-access-issue-source`)return reply(r,issueSource());unexpected.push(path);return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await expect(page.getByText(/Đang hiển thị 1\/1600 kết quả/)).toBeVisible();await page.getByRole('combobox',{name:/^Học sinh/}).click();await page.getByLabel('Tìm trong danh sách',{exact:true}).fill('API001');await expect.poll(()=>searches.some(u=>new URL(u).searchParams.get('q')==='API001')).toBe(true);await page.getByRole('option',{name:/Học sinh API/}).click();await expect(page.getByRole('radio',{name:/Giám hộ API/})).toBeVisible();expect(searches.every(u=>new URL(u).searchParams.get('cursor')===null)).toBe(true);expect(unexpected).toEqual([]);
  });
  test('details preserve denied contact, real total opens, explicit null history fields and bounded sibling metadata',async({page})=>{
    const histories:string[]=[];await routes(page,['parent_access.manage'],(r,path)=>{
      if(path===`${base}/parent-access/${accessId}/details`){const d=accessDetails();return reply(r,{...d,siblings:{items:Array.from({length:20},(_,i)=>({id:`40000000-0000-4000-8000-${String(i+30).padStart(12,'0')}`,status:'ACTIVE',guardianName:`Giám hộ ${i+1}`,relationshipLabel:'Mẹ'})),total:22,hasMore:true}});}
      if(path===`${base}/parent-access/${accessId}/history`){histories.push(r.request().url());return eventPage(r);}return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access/${accessId}`);await expect(page.getByText('Không có quyền xem liên hệ',{exact:true})).toBeVisible();await expect(page.getByText('42',{exact:true})).toBeVisible();await expect(page.getByText(/Đang hiển thị 20\/22 link/)).toBeVisible();await expect(page.getByText('Đọc thông tin',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Thu hồi',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Cấp lại',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Mở link tra cứu',exact:true})).toHaveCount(0);await expect(page.locator('img[alt*="QR"]')).toHaveCount(0);
    await page.getByRole('button',{name:'Trang sau',exact:true}).click();await expect(page.getByText('Mở phiên tra cứu',{exact:true})).toBeVisible();expect(histories.some(u=>new URL(u).searchParams.get('cursor')==='next-history')).toBe(true);await page.evaluate(()=>window.scrollTo(0,0));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:screenshot('parent-details-history'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:screenshot('parent-details-history-mobile'),fullPage:true});
  });
  test('revocation keeps the clicked version through a metadata refresh and retains the same key after an unconfirmed reason',async({page})=>{
    let version=4,reads=0;const writes:Record<string,unknown>[]=[],keys:string[]=[];await routes(page,['parent_access.manage','parent_access.revoke'],(r,path)=>{
      if(path===`${base}/parent-access/${accessId}/details`){reads++;return reply(r,{...accessDetails(version),access:{...staffAccess(version),canRevoke:true}});}
      if(path===`${base}/parent-access/${accessId}/history`)return eventPage(r);
      if(path===`${base}/parent-access/${accessId}/revoke`){const body=r.request().postDataJSON();writes.push(body);keys.push(r.request().headers()['idempotency-key']);return reply(r,{...meta,id:accessId,version:5,studentId,yearId,relationshipId,revokedAt:stamp,revokeReason:writes.length===1?'Khác lý do đã nhập':body.reason});}return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access/${accessId}`);await page.getByRole('button',{name:'Thu hồi',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Thu hồi link tra cứu',exact:true});await dialog.getByLabel(/^Lý do thu hồi/).fill('Đề nghị thu hồi');version=9;const previous=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await dialog.getByRole('button',{name:'Thu hồi link',exact:true}).click();await expect(dialog.getByText(/Chưa xác minh được kết quả thu hồi/)).toBeVisible();await expect(dialog.getByLabel(/^Lý do thu hồi/)).toHaveValue('Đề nghị thu hồi');await dialog.getByRole('button',{name:'Thu hồi link',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toEqual([{expectedVersion:4,reason:'Đề nghị thu hồi'},{expectedVersion:4,reason:'Đề nghị thu hồi'}]);expect(keys[0]).toBe(keys[1]);
  });
  test('a conflict keeps the revocation reason and directs an explicit reload without adopting a new version',async({page})=>{
    const writes:Record<string,unknown>[]=[];await routes(page,['parent_access.manage','parent_access.revoke'],(r,path)=>{
      if(path===`${base}/parent-access/${accessId}/details`)return reply(r,{...accessDetails(),access:{...staffAccess(),canRevoke:true}});if(path===`${base}/parent-access/${accessId}/history`)return eventPage(r);if(path===`${base}/parent-access/${accessId}/revoke`){writes.push(r.request().postDataJSON());return r.fulfill({status:409,json:{code:'VERSION_CONFLICT'}});}return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access/${accessId}`);await page.getByRole('button',{name:'Thu hồi',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Thu hồi link tra cứu',exact:true});await dialog.getByLabel(/^Lý do thu hồi/).fill('Theo hồ sơ mới');await dialog.getByRole('button',{name:'Thu hồi link',exact:true}).click();await expect(dialog.getByText('Đóng hộp thoại và tải lại màn hình để xem phiên bản hiện tại trước khi thu hồi.',{exact:true})).toBeVisible();await expect(dialog.getByLabel(/^Lý do thu hồi/)).toHaveValue('Theo hồ sơ mới');expect(writes).toEqual([{expectedVersion:4,reason:'Theo hồ sơ mới'}]);
  });
  test('loss of manage authority unmounts detail metadata and the open private revocation draft',async({page})=>{
    let denied=false,reads=0;await routes(page,['parent_access.manage','parent_access.revoke'],(r,path)=>{
      if(path===`${base}/parent-access/${accessId}/details`){reads++;return denied?deny(r):reply(r,{...accessDetails(),access:{...staffAccess(),canRevoke:true}});}if(path===`${base}/parent-access/${accessId}/history`)return eventPage(r);return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access/${accessId}`);await page.getByRole('button',{name:'Thu hồi',exact:true}).click();await page.getByLabel(/^Lý do thu hồi/).fill('Nội dung riêng');const previous=reads;denied=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await expect(page.getByRole('dialog',{name:'Thu hồi link tra cứu',exact:true})).toHaveCount(0);await expect(page.getByText('Giám hộ API',{exact:false})).toHaveCount(0);await expect(page.getByText('Bạn không có quyền xem mục này',{exact:true})).toBeVisible();
  });
  test('denied revoke authority removes the draft and exact recipient from the command error dialog',async({page})=>{
    await routes(page,['parent_access.manage','parent_access.revoke'],(r,path)=>{
      if(path===`${base}/parent-access/${accessId}/details`)return reply(r,{...accessDetails(),access:{...staffAccess(),canRevoke:true}});if(path===`${base}/parent-access/${accessId}/history`)return eventPage(r);return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access/${accessId}`);await page.getByRole('button',{name:'Thu hồi',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Thu hồi link tra cứu',exact:true});await dialog.getByLabel(/^Lý do thu hồi/).fill('Nội dung riêng');await dialog.getByRole('button',{name:'Thu hồi link',exact:true}).click();await expect(dialog.getByText('Bạn không có quyền xem mục này',{exact:true})).toBeVisible();await expect(dialog.getByLabel(/^Lý do thu hồi/)).toHaveCount(0);await expect(dialog.getByText('Giám hộ API',{exact:false})).toHaveCount(0);
  });
  test('directory rotation freezes the selected old link while background directory/source readers refresh',async({page})=>{
    let version=4,reads=0;const writes:Record<string,unknown>[]=[];await routes(page,['parent_access.manage','parent_access.issue'],(r,path)=>{
      if(path===`${base}/parent-access-directory-summary`)return reply(r,accessSummary(true));if(path===`${base}/parent-access-directory`){reads++;return list(r,[{...staffAccess(version),canIssue:true}]);}
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`){const s=issueSource();s.relationships[0].activeLinkIds=[accessId];return reply(r,s);}
      if(path===`${base}/parent-access/reviewed-issue`){const body=r.request().postDataJSON();writes.push(body);return r.fulfill({status:409,json:{code:'VERSION_CONFLICT'}});}return deny(r);
    },'CLASS');await page.goto(`${web}/parent-access`);await page.getByRole('button',{name:/Thao tác với Link cấp cho/}).click();await page.getByRole('menuitem',{name:/^Cấp lại/}).click();await expect(page.getByLabel(/^Lý do cấp lại/)).toBeVisible();await page.getByLabel(/^Lý do cấp lại/).fill('Cấp lại theo đề nghị');const previous=reads;version=9;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await page.getByRole('button',{name:'Thu hồi link cũ và cấp link mới',exact:true}).click();await expect(page.getByText('Đóng hộp thoại và tải lại trang đang xem để kiểm tra phiên bản link trước khi cấp lại.',{exact:true})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({replace:{accessId,expectedVersion:4},reason:'Cấp lại theo đề nghị'});
  });
});

test.describe('Native student and guardian browser contracts — intercepted API, separate from PostgreSQL E2E',()=>{
  test('uses directory year and class choices, preserves denied counters and sends server filters',async({page})=>{
    const requests:string[]=[],unexpected:string[]=[];
    await routes(page,['school.read','year.read','student.read'],(r,path)=>{
      if(path===`${base}/student-directory-summary`)return reply(r,{year,referenceDate:'2026-10-01',today:'2026-10-01',years:[year],classes:[{id:classId,version:2,yearId,name:'Lớp API',status:'ACTIVE'}],kpi:{students:1,studying:1,unverified:null,activeLinks:null},canSeeGuardians:false,canSeeLinks:false,canCreate:false,canTransfer:false,canExport:false});
      if(path===`${base}/student-directory`){requests.push(r.request().url());return list(r,[{...student(),classId,className:'Lớp API',yearId,yearName:year.name,enrollmentId:relationshipId,enrollmentVersion:5,enrollmentInEffect:true,guardianCount:null,verifiedGuardians:null,activeLinks:null}]);}
      unexpected.push(path);return deny(r);
    });
    await page.goto(`${web}/students`);await expect(page.getByRole('cell',{name:/^Học sinh API API001/})).toBeVisible();await expect(page.getByText('Không hiển thị theo quyền',{exact:true})).toHaveCount(2);await expect(page.getByLabel('Lọc người giám hộ',{exact:true})).toHaveCount(0);
    await page.getByLabel('Lọc theo lớp',{exact:true}).selectOption(classId);await expect.poll(()=>requests.some(u=>new URL(u).searchParams.get('classId')===classId)).toBe(true);expect(unexpected).toEqual([]);await page.screenshot({path:screenshot('student-directory'),fullPage:true});
  });

  test('opens a class-write creation form without school, year or roster readers and creates atomically',async({page})=>{
    const unexpected:string[]=[],writes:Record<string,unknown>[]=[];
    await routes(page,['student.manage'],(r,path)=>{
      if(path===`${base}/student-create-options`)return reply(r,{today:'2026-10-01',classes:[{id:classId,version:3,name:'Lớp API',status:'ACTIVE',yearId,yearName:year.name,yearStartsOn:year.startsOn,yearEndsOn:year.endsOn,canAddGuardian:false}]});
      if(path===`${base}/students`&&r.request().method()==='POST'){const body=r.request().postDataJSON();writes.push(body);return reply(r,{...student(),fullName:body.fullName,dateOfBirth:body.dateOfBirth,gender:body.gender,initialEnrollment:{...meta,id:relationshipId,studentId,classId,yearId,startsOn:body.startsOn,endsOn:'2027-06-02',status:'ACTIVE'}});}
      if(path===`${base}/students/${studentId}/details`)return reply(r,profile());
      unexpected.push(path);return deny(r);
    },'CLASS');
    await page.goto(`${web}/students/new`);await fillStudent(page);await expect(page.getByRole('checkbox',{name:/^Thêm người giám hộ ngay/})).toBeDisabled();await expect(page.getByLabel(/^Ngày vào lớp/)).toHaveValue('01/10/2026');
    await page.getByRole('button',{name:'Lưu học sinh',exact:true}).click();await expect(page).toHaveURL(`${web}/students/${studentId}`);expect(writes).toEqual([{fullName:'Học sinh mới',dateOfBirth:'2011-09-30',gender:'Nữ',initialClassId:classId,startsOn:'2026-10-01'}]);expect(unexpected).toEqual([]);await page.screenshot({path:screenshot('class-write-create'),fullPage:true});
  });

  test('renders the minimal subject projection without family, notes, positions or stored link credentials',async({page})=>{
    const unexpected:string[]=[];
    await routes(page,['school.read','year.read','student.read'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),level:'SUBJECT_MINIMAL',student:{...student(),dateOfBirth:null,gender:null},positions:null});
      unexpected.push(path);return deny(r);
    });
    await page.goto(`${web}/students/${studentId}`);await expect(page.getByText('Hồ sơ rút gọn theo phạm vi giáo viên bộ môn',{exact:true})).toBeVisible();await expect(page.getByText('Không hiển thị người giám hộ',{exact:true})).toBeVisible();await expect(page.getByText('Không quản lý link tra cứu',{exact:true})).toBeVisible();await expect(page.getByText('Chưa có người giám hộ.',{exact:true})).toHaveCount(0);await expect(page.getByText('Giám hộ API',{exact:true})).toHaveCount(0);expect(unexpected).toEqual([]);await page.screenshot({path:screenshot('student-subject-minimal'),fullPage:true});
  });

  test('renders existing link metadata without recovering a secret or borrowing issuance authority',async({page})=>{
    const unexpected:string[]=[];
    await routes(page,['school.read','year.read','student.read','parent-access.read'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,manageLinks:true},links:[{...meta,id:relationshipId,studentId,yearId,relationshipId,allowedSections:['overview','teachers'],allowDownload:false,expiresAt:'2026-10-02T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:userId,issuedByName:null,guardianName:'Giám hộ API',relationshipLabel:'Mẹ',yearName:year.name,status:'ACTIVE',opens:4,lastOpenedAt:stamp}],accessLog:[],accessLogHasMore:false});
      unexpected.push(path);return deny(r);
    });
    await page.goto(`${web}/students/${studentId}`);await expect(page.getByText('Link và QR chỉ hiển thị khi cấp. Hồ sơ đã lưu không trả lại mã truy cập riêng.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cấp link mới',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Hiện link/QR demo',exact:true})).toHaveCount(0);expect(unexpected).toEqual([]);await page.screenshot({path:screenshot('student-link-metadata'),fullPage:true});
  });

  test('retains the student draft and displayed version through background read failure and a wrong mutation ACK',async({page})=>{
    let reads=0,sourceVersion=4,readFailure=false;const writes:{body:Record<string,unknown>;key:string|undefined}[]=[];
    await routes(page,['school.read','year.read','student.read','student.manage','student.internal-note.read'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`){reads++;return readFailure?r.fulfill({status:503,json:{code:'READ_UNAVAILABLE'}}):reply(r,{...profile(),student:{...student(),version:sourceVersion,internalNote:'Ghi chú nguồn'},internalNote:'Ghi chú nguồn',perms:{...perms,edit:true,seeInternalNote:true,seeBirthDate:true}});}
      if(path===`${base}/students/${studentId}`&&r.request().method()==='PATCH'){const body=r.request().postDataJSON();writes.push({body,key:r.request().headers()['idempotency-key']});return reply(r,{...student(),id:writes.length===1?guardianId:studentId,version:9,fullName:body.fullName,dateOfBirth:body.dateOfBirth,gender:body.gender,internalNote:body.internalNote});}
      return deny(r);
    });
    await page.goto(`${web}/students/${studentId}/edit`);await page.getByLabel(/^Họ và tên/).fill('Học sinh đã sửa');await page.getByLabel(/^Ghi chú nội bộ/).fill('');sourceVersion=8;const prior=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Học sinh đã sửa');
    readFailure=true;const beforeFailure=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(beforeFailure);await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Học sinh đã sửa');readFailure=false;
    await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Học sinh đã sửa');await expect(page.getByText('Chưa xác minh được hồ sơ vừa cập nhật.',{exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await expect(page).toHaveURL(`${web}/students/${studentId}`);expect(writes).toHaveLength(2);expect(writes[0].body).toEqual({expectedVersion:4,fullName:'Học sinh đã sửa',dateOfBirth:'2011-09-30',gender:'Nữ',internalNote:null});expect(writes[1]).toEqual(writes[0]);
  });

  test('uses the atomic guardian source, keeps masked contact unchanged and freezes all reviewed versions',async({page})=>{
    let reads=0,sourceVersion=4;const writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','guardian.read','guardian.manage'],(r,path)=>{
      if(path===`${base}/guardians/${guardianId}/details`)return reply(r,guardianProfile());
      if(path===`${base}/students/${studentId}/guardian-form`){reads++;return reply(r,guardianSource(sourceVersion));}
      if(path===`${base}/students/${studentId}/guardians/save`){const body=r.request().postDataJSON();writes.push(body);return reply(r,{studentId,studentVersion:9,guardian:{...contact(),version:5,fullName:body.fullName,email:body.email},relationship:{...relationship(),version:5,relationshipLabel:body.relationshipLabel,isPrimary:body.isPrimary}});}
      return deny(r);
    });
    await page.goto(`${web}/guardians/${guardianId}`);await expect(page.getByText('Lịch sử thay đổi không thuộc phạm vi được phép xem.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Sửa liên hệ',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa người giám hộ',exact:true});await dialog.getByLabel(/^Họ và tên người giám hộ/).fill('Giám hộ đổi tên');await expect(dialog.getByLabel(/^Số điện thoại liên hệ/)).toHaveValue('0912 *** 222');sourceVersion=8;const prior=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(dialog.getByLabel(/^Họ và tên người giám hộ/)).toHaveValue('Giám hộ đổi tên');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([{expectedStudentVersion:4,expectedPrimaryContacts:[{id:relationshipId,version:4}],fullName:'Giám hộ đổi tên',relationshipLabel:'Mẹ',email:null,isPrimary:true,guardianId,relationshipId,expectedGuardianVersion:4,expectedRelationshipVersion:4}]);await page.screenshot({path:screenshot('guardian-details'),fullPage:true});
  });

  test('retains a guardian draft on 409 and adopts changed contact, relationship and primary versions only after explicit reload',async({page})=>{
    let sourceVersion=4,reads=0;const writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','guardian.read','guardian.manage'],(r,path)=>{
      if(path===`${base}/guardians/${guardianId}/details`)return reply(r,guardianProfile());
      if(path===`${base}/students/${studentId}/guardian-form`){reads++;return reply(r,guardianSource(sourceVersion));}
      if(path===`${base}/students/${studentId}/guardians/save`){const body=r.request().postDataJSON();writes.push(body);if(writes.length===1)return r.fulfill({status:409,json:{code:'VERSION_CONFLICT',requestId:'guardian-conflict'}});return reply(r,{studentId,studentVersion:9,guardian:{...contact(),version:9,fullName:body.fullName,email:body.email},relationship:{...relationship(),version:9,relationshipLabel:body.relationshipLabel,isPrimary:body.isPrimary}});}
      return deny(r);
    });
    await page.goto(`${web}/guardians/${guardianId}`);await page.getByRole('button',{name:'Sửa liên hệ',exact:true}).click();const form=page.getByRole('dialog',{name:'Sửa người giám hộ',exact:true,includeHidden:true});await form.getByLabel(/^Họ và tên người giám hộ/).fill('Giám hộ nháp của tôi');sourceVersion=8;const prior=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await form.getByRole('button',{name:'Lưu',exact:true}).click();const conflict=page.getByRole('dialog',{name:'Dữ liệu đã thay đổi',exact:true});await expect(conflict).toBeVisible();await expect(form.getByLabel(/^Họ và tên người giám hộ/)).toHaveValue('Giám hộ nháp của tôi');expect(writes[0]).toMatchObject({expectedStudentVersion:4,expectedGuardianVersion:4,expectedRelationshipVersion:4,expectedPrimaryContacts:[{id:relationshipId,version:4}]});
    await conflict.getByRole('button',{name:'Tải bản mới nhất',exact:true}).click();await expect(conflict).toHaveCount(0);await expect(form.getByLabel(/^Họ và tên người giám hộ/)).toHaveValue('Giám hộ API');await form.getByLabel(/^Họ và tên người giám hộ/).fill('Giám hộ xem nguồn mới');await form.getByRole('button',{name:'Lưu',exact:true}).click();await expect(form).toHaveCount(0);expect(writes[1]).toMatchObject({expectedStudentVersion:8,expectedGuardianVersion:8,expectedRelationshipVersion:8,expectedPrimaryContacts:[{id:relationshipId,version:8}],fullName:'Giám hộ xem nguồn mới'});
  });

  test('requires an explicit receiving choice for verification and sends the clicked relationship version',async({page})=>{
    let version=4,reads=0;const writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','guardian.read','guardian.verify'],(r,path)=>{
      if(path===`${base}/guardians/${guardianId}/details`){reads++;const view=guardianProfile();return reply(r,{...view,canEditContact:false,relationships:view.relationships.map(row=>({...row,version,canEdit:false}))});}
      if(path===`${base}/relationships/${relationshipId}/verify`){const body=r.request().postDataJSON();writes.push(body);return reply(r,{...relationship(),version:9,status:'VERIFIED',canReceiveInfo:body.canReceiveInfo,verifiedAt:stamp});}
      return deny(r);
    });
    await page.goto(`${web}/guardians/${guardianId}`);await page.getByRole('button',{name:'Xác minh',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Xác minh quan hệ giám hộ',exact:true});await dialog.getByLabel(/^Căn cứ xác minh/).fill('Đối chiếu hồ sơ');await dialog.getByRole('button',{name:'Xác minh',exact:true}).click();await expect(dialog.getByText('Chọn quyền nhận thông tin trước khi xác minh.',{exact:true})).toBeVisible();expect(writes).toEqual([]);
    version=8;const prior=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await dialog.getByRole('radio',{name:'Chưa được nhận thông tin',exact:true}).check();await dialog.getByRole('button',{name:'Xác minh',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toEqual([{expectedVersion:4,canReceiveInfo:false,verificationNote:'Đối chiếu hồ sơ'}]);
  });

  test('removes an open guardian draft when purpose authority is revoked',async({page})=>{
    let denied=false,reads=0;
    await routes(page,['school.read','year.read','guardian.read','guardian.manage'],(r,path)=>{
      if(path===`${base}/guardians/${guardianId}/details`)return reply(r,guardianProfile());
      if(path===`${base}/students/${studentId}/guardian-form`){reads++;return denied?deny(r):reply(r,guardianSource());}
      return deny(r);
    });
    await page.goto(`${web}/guardians/${guardianId}`);await page.getByRole('button',{name:'Sửa liên hệ',exact:true}).click();await page.getByLabel(/^Họ và tên người giám hộ/).fill('Nội dung riêng');const prior=reads;denied=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(prior);await expect(page.getByLabel(/^Họ và tên người giám hộ/)).toHaveCount(0);await expect(page.locator('input[value="Nội dung riêng"]')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Sửa người giám hộ',exact:true}).getByText('Bạn không có quyền xem mục này',{exact:true})).toBeVisible();
  });
});

test.describe('Native parent-link issuance browser contracts — intercepted API, separate from PostgreSQL E2E',()=>{
  test('issue-only class authority prepares the recipient without borrowed readers and displays a fragment link once',async({page})=>{
    const writes:Record<string,unknown>[]=[],unexpected:string[]=[];
    await routes(page,['student.read','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true}});
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());
      if(path===`${base}/students/${studentId}/parent-access-issue-source`)return reply(r,issueSource());
      if(path===`${base}/parent-access/reviewed-issue`){const body=r.request().postDataJSON();writes.push(body);return reply(r,issuedAccess(body));}
      unexpected.push(path);return deny(r);
    },'CLASS');
    await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await page.getByRole('radio',{name:/Giám hộ API/}).check();
    await expect(page.getByRole('checkbox',{name:/^Cho phép tải tài liệu/})).toBeDisabled();await page.getByRole('checkbox',{name:/^Tài liệu/}).check();await expect(page.getByRole('checkbox',{name:/^Cho phép tải tài liệu/})).not.toBeChecked();
    await page.getByRole('button',{name:'Cấp link',exact:true}).click();await expect(page.getByRole('dialog',{name:'Đã cấp link tra cứu',exact:true})).toBeVisible();
    const link=page.getByRole('link',{name:'Mở link tra cứu',exact:true});await expect(link).toHaveAttribute('href',new RegExp(`/p/${school.slug}/access#token=`));expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({studentId,yearId,relationshipId,allowDownload:false,allowedSections:['overview','teachers','documents'],expiresOn:'2026-10-31',reviewedSource:{schoolVersion:3,yearVersion:2,studentVersion:4,enrollmentId:relationshipId,enrollmentVersion:5,classVersion:2,relationshipVersion:4,guardianVersion:4}});expect(unexpected).toEqual([]);
    await expect(page.getByText('Đã cấp link tra cứu riêng',{exact:true})).toBeHidden();await page.screenshot({path:screenshot('parent-link-issued'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:screenshot('parent-link-issued-mobile'),fullPage:true});await page.getByRole('button',{name:'Xong',exact:true}).click();await expect(page.getByRole('link',{name:'Mở link tra cứu',exact:true})).toHaveCount(0);
  });
  test('a verified relationship without receiving authority remains disabled',async({page})=>{
    let writes=0;await routes(page,['student.read','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true}});
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`){const s=issueSource();s.relationships[0].canReceiveInfo=false;s.relationships[0].canIssue=false;return reply(r,s);}
      if(path===`${base}/parent-access/reviewed-issue`)writes++;return deny(r);
    },'CLASS');await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await expect(page.getByRole('radio',{name:/Giám hộ API/})).toBeDisabled();await expect(page.getByRole('button',{name:'Cấp link',exact:true})).toBeDisabled();expect(writes).toBe(0);
  });
  test('source conflicts keep the reviewed draft and only an explicit reload adopts the new versions/defaults',async({page})=>{
    let version=4;const writes:Record<string,unknown>[]=[];await routes(page,['student.read','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true}});
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`)return reply(r,issueSource(version));
      if(path===`${base}/parent-access/reviewed-issue`){const body=r.request().postDataJSON();writes.push(body);if(writes.length===1){version=9;return r.fulfill({status:409,json:{code:'PARENT_ISSUE_SOURCE_CHANGED'}});}return reply(r,issuedAccess(body));}return deny(r);
    },'CLASS');await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await page.getByRole('radio',{name:/Giám hộ API/}).check();await page.getByRole('checkbox',{name:/^Tài liệu/}).check();await page.getByRole('button',{name:'Cấp link',exact:true}).click();await expect(page.getByRole('dialog',{name:'Dữ liệu đã thay đổi',exact:true})).toBeVisible();
    expect(writes[0]).toMatchObject({reviewedSource:{studentVersion:4,relationshipVersion:4}});await page.getByRole('button',{name:'Tải bản mới nhất',exact:true}).click();await expect(page.getByRole('dialog',{name:'Dữ liệu đã thay đổi',exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:/^Tài liệu/})).not.toBeChecked();await page.getByRole('radio',{name:/Giám hộ API/}).check();await page.getByRole('button',{name:'Cấp link',exact:true}).click();await expect(page.getByRole('dialog',{name:'Đã cấp link tra cứu',exact:true})).toBeVisible();expect(writes[1]).toMatchObject({reviewedSource:{studentVersion:9,relationshipVersion:9},allowedSections:['overview','teachers']});
  });
  test('lost acknowledgement retries the same command and disables resubmission after the one-time receipt is unavailable',async({page})=>{
    const keys:string[]=[],id='40000000-0000-4000-8000-000000000020';await routes(page,['student.read','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true}});if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`)return reply(r,issueSource());
      if(path===`${base}/parent-access/reviewed-issue`){keys.push(r.request().headers()['idempotency-key']);return keys.length===1?r.abort('failed'):r.fulfill({status:409,json:{code:'LINK_ALREADY_ISSUED',resultId:id}});}return deny(r);
    },'CLASS');await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await page.getByRole('radio',{name:/Giám hộ API/}).check();await page.getByRole('button',{name:'Cấp link',exact:true}).click();await expect(page.getByRole('button',{name:'Cấp link',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Cấp link',exact:true}).click();await expect(page.getByRole('link',{name:'Xem quyền đã cấp để chủ động cấp lại',exact:true})).toHaveAttribute('href',`${web}/parent-access/${id}`);await expect(page.getByRole('button',{name:'Cấp link',exact:true})).toBeDisabled();await expect(page.getByRole('dialog',{name:'Dữ liệu đã thay đổi',exact:true})).toHaveCount(0);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);await page.screenshot({path:screenshot('parent-link-lost-receipt'),fullPage:true});
  });
  test('rotation sends the displayed old link version and preserves explicit document download permission',async({page})=>{
    const writes:Record<string,unknown>[]=[],old='40000000-0000-4000-8000-000000000019';await routes(page,['school.read','year.read','student.read','parent_access.manage','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true,manageLinks:true},links:[{...meta,id:old,studentId,yearId,relationshipId,allowedSections:['overview','documents'],allowDownload:true,expiresAt:'2026-11-01T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:userId,issuedByName:null,guardianName:'Giám hộ API',relationshipLabel:'Mẹ',yearName:year.name,status:'ACTIVE',opens:0,lastOpenedAt:null}],accessLog:[],accessLogHasMore:false});
      if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`){const s=issueSource();s.relationships[0].activeLinkIds=[old];return reply(r,s);}
      if(path===`${base}/parent-access/reviewed-issue`){const body=r.request().postDataJSON();writes.push(body);return reply(r,issuedAccess(body));}return deny(r);
    });await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp lại với mục khác',exact:true}).click();await expect(page.getByRole('checkbox',{name:/^Cho phép tải tài liệu/})).toBeChecked();await page.getByLabel(/^Lý do cấp lại/).fill('Cấp lại theo xác nhận mới');await page.getByRole('button',{name:'Thu hồi link cũ và cấp link mới',exact:true}).click();await expect(page.getByRole('dialog',{name:'Đã cấp link tra cứu',exact:true})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({replace:{accessId:old,expectedVersion:4},reason:'Cấp lại theo xác nhận mới',allowedSections:['overview','documents'],allowDownload:true});
  });
  test('a source authorization failure on refresh removes the private issuance form',async({page})=>{
    let denied=false,reads=0;await routes(page,['student.read','parent_access.issue'],(r,path)=>{
      if(path===`${base}/students/${studentId}/details`)return reply(r,{...profile(),perms:{...perms,issueLinks:true}});if(path===`${base}/parent-access/issue-context`)return reply(r,issueContext());if(path===`${base}/students/${studentId}/parent-access-issue-source`){reads++;return denied?deny(r):reply(r,issueSource());}return deny(r);
    },'CLASS');await page.goto(`${web}/students/${studentId}`);await page.getByRole('button',{name:'Cấp link mới',exact:true}).click();await page.getByRole('radio',{name:/Giám hộ API/}).check();denied=true;const previous=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await expect(page.getByRole('radio',{name:/Giám hộ API/})).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Cấp đường dẫn riêng cho phụ huynh',exact:true}).getByText('Bạn không có quyền xem mục này',{exact:true})).toBeVisible();
  });
});
