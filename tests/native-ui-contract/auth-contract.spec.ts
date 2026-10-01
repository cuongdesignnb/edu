import {expect,test,type Page,type Route} from '@playwright/test';
declare global {interface Window {__eduNativeProbe:{writes:string[];opens:string[]}}}

const userId='00000000-0000-4000-8000-000000000001',inviteId='00000000-0000-4000-8000-000000000002';
const password='SyntheticPassword123';
const evidencePrefix=process.env.EDU_NATIVE_QA_PREFIX??'b6-native-activation';
const user=(version=1)=>({id:userId,version,displayName:`Nhân sự API ${version}`,email:'synthetic@example.invalid',status:'ACTIVE',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',workPhone:'0900000000',bio:''});
const context=(version=1)=>({user:user(version),memberships:[],platformActions:[],csrfToken:'contract-staff-csrf',mode:'connected',serverNow:new Date().toISOString()});
const invitation=(existing=false)=>({id:inviteId,version:1,email:'synthetic@example.invalid',workDisplayName:'Nhân sự được mời',schoolId:userId,schoolSlug:'synthetic-school',schoolName:'Trường từ API',schoolStatus:'ACTIVE',inviterName:'Quản trị từ API',roleCodes:['SCHOOL_ADMIN'],roleLabels:['Quản trị trường'],requiresLogin:existing,signedInAsInvited:false,status:'PENDING',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z'});
const reply=(route:Route,data:unknown)=>route.fulfill({status:200,json:{data,requestId:'browser-contract'}});
const anonymous=(route:Route)=>route.fulfill({status:401,json:{code:'UNAUTHENTICATED',requestId:'browser-contract'}});
async function instrument(page:Page){
  await page.addInitScript(()=>{
    const writes:string[]=[],opens:string[]=[];
    Object.defineProperty(window,'__eduNativeProbe',{value:{writes,opens}});
    const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){writes.push(key);return setItem.call(this,key,value);};
    const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(name,...args){opens.push(name);return open(name,...args);};
  });
}
async function noPersistence(page:Page){
  const probe=await page.evaluate(()=>window.__eduNativeProbe);
  expect(probe.writes).toEqual([]);expect(probe.opens).toEqual([]);
  expect(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))).toEqual({local:[],session:[]});
}
async function routes(page:Page,handler:(route:Route,path:string)=>Promise<unknown>){
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/auth/csrf')return reply(route,{csrfToken:'contract-public-csrf'});
    if(path==='/api/v1/me/notifications')return route.fulfill({json:{data:[],requestId:'browser-contract',page:{limit:100,total:0,nextCursor:null,hasMore:false}}});
    return handler(route,path);
  });
}

test.describe('Native browser contract with intercepted API responses — PostgreSQL E2E remains separate',()=>{
  test('ignores a persisted demo persona and requires actual API authentication',async({page})=>{
    await page.addInitScript(()=>{sessionStorage.setItem('edumanage-demo-session',JSON.stringify({actor:{kind:'platform',userId:'fake-actor'},startedAt:new Date().toISOString()}));});
    await routes(page,route=>anonymous(route));await page.goto('/login');
    await expect(page.getByRole('heading',{name:'Đăng nhập nhân sự'})).toBeVisible();await expect(page.getByText('Bạn đang trong một phiên làm việc',{exact:true})).toHaveCount(0);
    await page.goto('/platform');await expect(page.getByText('Vui lòng đăng nhập',{exact:true})).toBeVisible();await expect(page.getByText('Quản lý nền tảng',{exact:true})).toHaveCount(0);
  });

  test('keeps a failed login form and retries the same intent before navigating on acknowledgement',async({page})=>{
    await instrument(page);let loggedIn=false;const commands:{body:unknown;key:string}[]=[];
    await routes(page,(route,path)=>{
      if(path==='/api/v1/me/context')return loggedIn?reply(route,context()):anonymous(route);
      if(path==='/api/v1/auth/login'){
        commands.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
        if(commands.length===1)return route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',requestId:'contract-lost'}});
        loggedIn=true;return reply(route,{user:user(),csrfToken:'contract-staff-csrf'});
      }
      return route.fulfill({status:404,json:{code:'NOT_FOUND',requestId:'browser-contract'}});
    });
    await page.goto('/login');await page.getByLabel(/^Email công việc/).fill('synthetic@example.invalid');await page.getByLabel(/^Mật khẩu/).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await expect(page.locator('#login-error')).toBeVisible();await expect(page.getByLabel(/^Mật khẩu/)).toHaveValue(password);await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(/\/choose-school$/);
    expect(commands).toHaveLength(2);expect(commands[0].key).toBeTruthy();expect(commands[1]).toEqual(commands[0]);await noPersistence(page);
  });

  test('accepts a new invitation only after a matching ACK and preserves the result after cache invalidation',async({page})=>{
    await instrument(page);const commands:{body:unknown;key:string}[]=[];
    await routes(page,(route,path)=>{
      if(path==='/api/v1/me/context')return anonymous(route);
      if(path==='/api/v1/invitations/inspect')return reply(route,invitation());
      if(path==='/api/v1/invitations/accept'){
        commands.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
        return reply(route,{id:commands.length===1?userId:inviteId,status:'ACCEPTED'});
      }
      return anonymous(route);
    });
    await page.goto(`/invitations/${inviteId}#token=synthetic-invitation-fragment&school=synthetic-school`);
    await expect(page.getByRole('button',{name:'Chấp nhận lời mời',exact:true})).toBeVisible();expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel(/^Mật khẩu mới/).fill(password);await page.getByLabel(/^Nhập lại mật khẩu mới/).fill(password);await page.getByRole('button',{name:'Chấp nhận lời mời',exact:true}).click();
    await expect(page.getByRole('button',{name:/Chưa xác minh được kết quả từ máy chủ/})).toBeVisible();await expect(page.getByLabel(/^Mật khẩu mới/)).toHaveValue(password);
    await page.getByRole('button',{name:'Chấp nhận lời mời',exact:true}).click();await expect(page.getByText('Bạn đã trở thành thành viên của trường',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Đăng nhập để tiếp tục'})).toBeVisible();
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('Bạn đã trở thành thành viên của trường',{exact:true})).toBeVisible();
    expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);expect(commands[1].body).toEqual({token:'synthetic-invitation-fragment',schoolSlug:'synthetic-school',displayName:'Nhân sự được mời',newPassword:password});await noPersistence(page);
    await page.getByRole('alert').filter({hasText:'Chưa nhận được xác nhận lưu'}).getByRole('button',{name:'Đóng thông báo'}).click();
    await page.screenshot({path:`qa/backend/${evidencePrefix}-invitation-desktop.png`,fullPage:true});
  });

  test('requires the invited existing identity and does not offer a password replacement',async({page})=>{
    let accepts=0;await routes(page,(route,path)=>{if(path==='/api/v1/invitations/inspect')return reply(route,invitation(true));if(path==='/api/v1/invitations/accept')accepts++;return anonymous(route);});
    await page.goto(`/invitations/${inviteId}#token=synthetic-existing-fragment&school=synthetic-school`);
    await expect(page.getByRole('button',{name:'Chấp nhận lời mời',exact:true})).toBeDisabled();await expect(page.getByLabel(/^Mật khẩu mới/)).toHaveCount(0);await expect(page.getByText('Đăng nhập đúng danh tính được mời',{exact:true})).toBeVisible();expect(accepts).toBe(0);
  });

  test('keeps a reset draft after an invalid ACK and shows completion after authentication changes',async({page})=>{
    await instrument(page);const keys:string[]=[];await routes(page,(route,path)=>{
      if(path==='/api/v1/auth/password/reset'){keys.push(route.request().headers()['idempotency-key']);return reply(route,{id:inviteId,status:keys.length===1?'ACCEPTED':'COMPLETED'});}return anonymous(route);
    });
    await page.goto('/reset-password#token=synthetic-reset-fragment');await page.getByLabel(/^Mật khẩu mới/).fill(password);await page.getByLabel(/^Nhập lại mật khẩu mới/).fill(password);await page.getByRole('button',{name:'Đặt lại mật khẩu',exact:true}).click();
    await expect(page.getByRole('button',{name:/Chưa xác minh được kết quả từ máy chủ/})).toBeVisible();await expect(page.getByLabel(/^Mật khẩu mới/)).toHaveValue(password);
    await page.getByRole('button',{name:'Đặt lại mật khẩu',exact:true}).click();await expect(page.getByText('Đã đặt lại mật khẩu',{exact:true})).toBeVisible();expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect(new URL(page.url()).hash).toBe('');await noPersistence(page);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:`qa/backend/${evidencePrefix}-reset-mobile.png`,fullPage:true});
  });

  test('retains a dirty profile and its reviewed version across background refresh and resolves conflict explicitly',async({page})=>{
    await instrument(page);let version=1,contextReads=0;const commands:Record<string,unknown>[]=[];
    await routes(page,(route,path)=>{
      if(path==='/api/v1/me/context'){contextReads++;return reply(route,context(version));}
      if(path==='/api/v1/me/profile'){commands.push(route.request().postDataJSON());return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',currentVersion:2,requestId:'browser-contract'}});}return anonymous(route);
    });
    await page.goto('/account/profile');await page.getByLabel(/^Họ và tên/).fill('Nội dung chưa lưu');
    version=2;const before=contextReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>contextReads).toBeGreaterThan(before);
    await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Nội dung chưa lưu');await expect(page.getByText('Phiên bản hồ sơ: 1',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();await expect(page.getByRole('dialog',{name:'Dữ liệu đã thay đổi'})).toBeVisible();expect(commands).toHaveLength(1);expect(commands[0].expectedVersion).toBe(1);
    await page.screenshot({path:`qa/backend/${evidencePrefix}-profile-conflict.png`,fullPage:true});
    await page.getByRole('button',{name:'Ở lại xem nội dung của tôi'}).click();await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Nội dung chưa lưu');
    await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();await page.getByRole('button',{name:'Tải bản mới nhất'}).click();await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Nhân sự API 2');await expect(page.getByText('Phiên bản hồ sơ: 2',{exact:true})).toBeVisible();await noPersistence(page);
  });

  test('allows an actual nullable own work phone and saves only after the server profile acknowledgement',async({page})=>{
    await instrument(page);let profile={...user(),workPhone:null};const commands:Record<string,unknown>[]=[];
    await routes(page,(route,path)=>{
      if(path==='/api/v1/me/context')return reply(route,{...context(),user:profile});
      if(path==='/api/v1/me/profile'){const command=route.request().postDataJSON();commands.push(command);profile={...profile,version:2,displayName:command.displayName};return reply(route,profile);}
      return anonymous(route);
    });
    await page.goto('/account/profile');await expect(page.getByLabel(/^Số liên hệ công việc/)).toHaveValue('');await page.getByLabel(/^Họ và tên/).fill('Hồ sơ mới từ API');await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();
    await expect(page.getByText('Đã lưu hồ sơ cá nhân',{exact:true})).toBeVisible();await expect(page.getByText('Phiên bản hồ sơ: 2',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Lưu hồ sơ',exact:true})).toBeDisabled();expect(commands).toHaveLength(1);expect(commands[0]).toEqual({expectedVersion:1,displayName:'Hồ sơ mới từ API',workPhone:'',bio:''});await noPersistence(page);
  });
});
