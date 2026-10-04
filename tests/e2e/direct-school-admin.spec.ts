import {test,expect,type Page} from '@playwright/test';

test.setTimeout(45_000);
const id='10000000-0000-4000-8000-000000000001',memberId='10000000-0000-4000-8000-000000000002',grantId='10000000-0000-4000-8000-000000000003',schoolId='10000000-0000-4000-8000-000000000004';
const native=`/api/v1/platform/schools/${schoolId}`,screen=`/platform/schools/${schoolId}/admins`;
// Real forms against controlled HTTP responses; identity, RLS and transactions use native PostgreSQL tests.
async function fixture(page:Page,{allowed=true,duplicate=false,forced=false}={}){
 const errors:string[]=[],writes:{path:string;body:Record<string,unknown>}[]=[],members:unknown[]=[],invites:unknown[]=[];let loggedIn=true;
 const now=new Date().toISOString(),user={id,version:1,displayName:'Người quản trị kiểm thử',email:'admin@example.invalid',status:'ACTIVE',mustChangePassword:forced};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data:unknown={},list=false;
  if(path==='/api/v1/me/context'){
   if(!loggedIn){await route.fulfill({status:401,json:{code:'UNAUTHENTICATED'}});return;}
   data={user,platformActions:forced?[]:['platform.read','platform.schools.read','platform.admins.manage','platform.mail.manage',...(allowed?['platform.admins.create_direct']:[])],csrfToken:'controlled-browser-csrf',mode:'connected',serverNow:now,memberships:[]};
  }else if(path===native)data={id:schoolId,version:1,name:'Trường kiểm thử',shortName:'Trường kiểm thử',code:'FIXTURE',slug:'fixture',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',createdAt:now,updatedAt:now,province:'Hà Nội',level:null,accentColor:'#2563eb',motto:'',publicIntro:'',adminNames:[],classCount:0,staffCount:members.length,onboarding:{profileDone:true,adminAssigned:members.length>0,yearCreated:false,classesCreated:false,teachersInvited:false,studentsImported:false,homeroomAssigned:false,rulesPublished:false}};
  else if(path===native+'/admins'&&req.method()==='GET'){data=members;list=true;}
  else if(path===native+'/admin-invitations'&&req.method()==='GET'){data=invites;list=true;}
  else if(path===native+'/admins'||path===native+'/admins/assign-existing'){
   const body=req.postDataJSON();writes.push({path,body});expect(req.headers()['x-csrf-token']).toBeTruthy();expect(req.headers()['idempotency-key']).toBeTruthy();
   if(duplicate&&path===native+'/admins'){await route.fulfill({status:409,json:{code:'IDENTITY_EXISTS_USE_ASSIGN'}});return;}
   data={id:memberId,userId:id,grantId,displayName:body.displayName,email:body.email,status:'ACTIVE',roleCode:'SCHOOL_ADMIN',scopeType:'SCHOOL',validFrom:body.validFrom??now,validUntil:body.validUntil??null,mustChangePassword:body.mustChangePassword??false};
   members.push({id:memberId,userId:id,version:1,status:'ACTIVE',workDisplayName:body.displayName,loginEmail:body.email,grants:[{id:grantId,roleCode:'SCHOOL_ADMIN',scopeType:'SCHOOL',validFrom:now,validUntil:null}]});
   await route.fulfill({status:201,json:{data,requestId:'fixture'}});return;
  }else if(path===native+'/admin-invitations'){
   const body=req.postDataJSON();writes.push({path,body});data={id:grantId,version:1,email:body.email,workDisplayName:body.workDisplayName,status:'PENDING',createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+14*86400_000).toISOString(),deliveryState:'QUEUED'};invites.push(data);
  }else if(path==='/api/v1/platform/settings/mail')data={enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',passwordConfigured:false,version:1,updatedAt:now,lastTestedAt:null,lastTestStatus:'NOT_TESTED',lastErrorCode:null,configurationStatus:'UNCONFIGURED'};
  else if(path==='/api/v1/me/onboarding')data={progress:[{tourKey:'platform-overview',tourVersion:1,status:'completed',updatedAt:now}]};
  else if(path==='/api/v1/me/notifications'||path==='/api/v1/me/sessions'){data=[];list=true;}
  else if(path==='/api/v1/auth/password/change'){writes.push({path,body:req.postDataJSON()});data={id,status:'COMPLETED'};loggedIn=false;}
  else if(path.includes('/public/'))data={brandName:'EduManage',supportEmail:null,publicSupportPhone:null,footerNote:''};
  else {errors.push('Unexpected fixture request: '+req.method()+' '+path);await route.fulfill({status:404,json:{code:'FIXTURE_NOT_FOUND'}});return;}
  await route.fulfill({json:{data,requestId:'fixture',...(list?{page:{limit:100,nextCursor:null,hasMore:false,total:(data as unknown[]).length}}:{})}});
 });
 await page.goto(screen);return {errors,writes};
}
async function fill(page:Page,email='new-admin@example.invalid'){
 await page.getByLabel(/^Họ\ và\ tên/).fill('Người quản trị mới');await page.getByLabel(/^Email\ đăng\ nhập/).fill(email);
 await page.getByLabel(/^Mật\ khẩu\ tạm\ thời/).fill('Synthetic-Temporary-12345');await page.getByLabel(/^Xác\ nhận\ mật\ khẩu/).fill('Synthetic-Temporary-12345');
}
test('two CTAs, validation, disabled SMTP direct success and separate invitations',async({page})=>{
 const f=await fixture(page);await expect(page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Gửi lời mời qua email',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true}).click();await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();expect(f.writes).toEqual([]);await expect(page.getByText('Họ tên tối thiểu 3 ký tự',{exact:true}).last()).toBeVisible();
 await fill(page);await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('new-admin@example.invalid',{exact:true})).toBeVisible();expect(f.writes[0].body.mustChangePassword).toBe(true);await expect(page.getByText('Chưa có lời mời',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true}).click();await expect(page.getByLabel(/^Mật\ khẩu\ tạm\ thời/)).toHaveValue('');await page.getByRole('button',{name:'Hủy',exact:true}).click();
 await page.getByRole('button',{name:'Gửi lời mời qua email',exact:true}).click();await expect(page.getByText(/SMTP chưa được cấu hình hoặc đang tắt/)).toBeVisible();
 await page.getByLabel(/^Họ\ tên\ người\ được\ mời/).fill('Người được mời');await page.getByLabel(/^Email\ công\ việc/).fill('invited@example.invalid');await page.getByRole('button',{name:'Tạo lời mời',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('invited@example.invalid',{exact:true})).toBeVisible();expect(f.writes.at(-1)?.path).toBe(native+'/admin-invitations');expect(f.errors).toEqual([]);
});
test('duplicate email requires explicit assignment and sends no password on assignment',async({page})=>{
 const f=await fixture(page,{duplicate:true});await page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true}).click();await fill(page,'existing@example.invalid');await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await expect(page.getByText(/Tài khoản đã tồn tại/)).toBeVisible();
 await page.getByRole('button',{name:'Gán tài khoản hiện có',exact:true}).click();await expect(page.getByLabel(/^Mật\ khẩu\ tạm\ thời/)).toHaveCount(0);await page.getByRole('button',{name:'Gán tài khoản hiện có',exact:true}).click();expect(f.writes).toHaveLength(1);await page.getByLabel(/^Tôi xác nhận gán/).check();await page.getByRole('button',{name:'Gán tài khoản hiện có',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(f.writes[1].path).toBe(native+'/admins/assign-existing');expect(f.writes[1].body).not.toHaveProperty('password');expect(f.errors).toEqual([]);
});
test('direct form fits mobile and desktop',async({page})=>{
 const f=await fixture(page);await page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true}).click();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await expect(page.getByLabel(/^Email\ đăng\ nhập/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
 await page.screenshot({path:'.secrets/local/direct-school-admin-form.png',fullPage:true});expect(f.errors).toEqual([]);
});
test('partial platform operator keeps invitation flow but has no direct CTA',async({page})=>{
 const f=await fixture(page,{allowed:false});await expect(page.getByRole('button',{name:'Gửi lời mời qua email',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Tạo tài khoản quản trị',exact:true})).toHaveCount(0);expect(f.errors).toEqual([]);
});
test('forced first login blocks deep navigation and changes password before returning to login',async({page})=>{
 const f=await fixture(page,{forced:true});await expect(page).toHaveURL(/\/account\/security$/);await expect(page.getByText('Bắt buộc đổi mật khẩu lần đầu',{exact:true})).toBeVisible();
 await page.getByLabel(/^Mật\ khẩu\ hiện\ tại/).fill('Synthetic-Temporary-12345');await page.getByLabel(/^Mật\ khẩu\ mới/).fill('Changed-Synthetic-98765');await page.getByLabel(/^Nhập\ lại\ mật\ khẩu\ mới/).fill('Changed-Synthetic-98765');await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();await expect(page).toHaveURL(/\/login$/);expect(f.writes[0].path).toBe('/api/v1/auth/password/change');expect(f.errors).toEqual([]);
});
