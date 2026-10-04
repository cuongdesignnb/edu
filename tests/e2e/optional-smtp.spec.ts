import {test,expect,type Page} from '@playwright/test';
import type {ApiSchemas} from '../../src/lib/api/generated';
test.setTimeout(45_000);

// Controlled HTTP responses test the real form. PostgreSQL/SMTP authorization is tested natively in backend.
async function fixture(page:Page,allowed=true){
 const writes:Record<string,unknown>[]=[],errors:string[]=[];let reads=0;
 let mail:ApiSchemas['PlatformMailSettings']={enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',passwordConfigured:false,version:1,updatedAt:new Date().toISOString(),lastTestedAt:null,lastTestStatus:'NOT_TESTED',lastErrorCode:null,configurationStatus:'UNCONFIGURED'};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data:unknown={};
  if(path==='/api/v1/me/context')data={user:{id:'10000000-0000-4000-8000-000000000001',version:1,displayName:'Platform operator',email:'operator@example.invalid',status:'ACTIVE'},platformActions:['platform.read','platform.settings',...(allowed?['platform.mail.manage']:[])],csrfToken:'controlled-browser-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[]};
  else if(path==='/api/v1/platform/settings')data={id:'10000000-0000-4000-8000-000000000002',version:1,brandName:'EduManage',supportEmail:'support@example.invalid',publicSupportPhone:'0123456789',footerNote:''};
  else if(path==='/api/v1/me/onboarding')data={progress:[{tourKey:'platform-overview',tourVersion:1,status:'completed',updatedAt:new Date().toISOString()}]};
  else if(path==='/api/v1/platform/settings/mail'){
   if(req.method()==='GET')reads++;
   else {const body=req.postDataJSON();writes.push(body);const {password,clearPassword,expectedVersion,...fields}=body;expect(expectedVersion).toBe(mail.version);mail={...mail,...fields,passwordConfigured:clearPassword?false:!!password||mail.passwordConfigured,version:mail.version+1,lastTestStatus:'NOT_TESTED',configurationStatus:body.enabled?'ENABLED_UNVERIFIED':fields.host?'DISABLED':'UNCONFIGURED'};}
   data=mail;
  }else if(path==='/api/v1/platform/settings/mail/test'){writes.push(req.postDataJSON());mail={...mail,lastTestStatus:'PENDING'};data=mail;}
  else if(path==='/api/v1/me/notifications'){await route.fulfill({json:{data:[],requestId:'fixture',page:{limit:6,nextCursor:null,hasMore:false,total:0}}});return;}
  else if(path.includes('/public/'))data={brandName:'EduManage',supportEmail:'support@example.invalid',publicSupportPhone:'0123456789',footerNote:''};
  else {errors.push('Unexpected fixture request: '+req.method()+' '+path);await route.fulfill({status:404,json:{code:'FIXTURE_NOT_FOUND'}});return;}
  await route.fulfill({json:{data,requestId:'fixture'}});
 });
 await page.goto('/platform/settings');
 return {writes,errors,reads:()=>reads,sent:()=>{mail={...mail,lastTestStatus:'SENT',configurationStatus:'WORKING'};}};
}
test('optional SMTP form validates enabling, blank password preservation, explicit clear and real test status UX',async({page})=>{
 const f=await fixture(page);await expect(page.getByText('Chưa cấu hình SMTP',{exact:true})).toBeVisible();await expect(page.getByLabel('Mật khẩu SMTP',{exact:true})).toHaveValue('');
 await page.getByLabel('Email nhận kiểm tra',{exact:true}).fill('recipient@example.invalid');await expect(page.getByRole('button',{name:'Gửi email kiểm tra',exact:true})).toBeDisabled();
 await page.getByLabel('Bật gửi email',{exact:true}).click();await page.getByRole('button',{name:'Lưu cấu hình SMTP',exact:true}).click();expect(f.writes).toHaveLength(0);await expect(page.getByText('Nhập SMTP host',{exact:true}).last()).toBeVisible();
 await page.getByLabel('Bật gửi email',{exact:true}).click();await page.getByLabel('From name',{exact:true}).fill('Disabled sender');await page.getByRole('button',{name:'Lưu cấu hình SMTP',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);expect(f.writes[0].enabled).toBe(false);expect(f.writes[0]).not.toHaveProperty('password');
 await page.getByLabel('Bật gửi email',{exact:true}).click();await page.getByLabel(/^SMTP Host/).fill('smtp.example.invalid');await page.getByLabel(/^SMTP Username/).fill('sender@example.invalid');await page.getByLabel(/^From email/).fill('sender@example.invalid');await page.getByLabel('Mật khẩu SMTP',{exact:true}).fill('browser-only-synthetic-password');
 await page.getByRole('button',{name:'Lưu cấu hình SMTP',exact:true}).click();await expect(page.getByText('Đã lưu mật khẩu. Để trống để giữ nguyên.',{exact:true})).toBeVisible();await expect(page.getByLabel('Mật khẩu SMTP',{exact:true})).toHaveValue('');
 await page.getByLabel('From name',{exact:true}).fill('Preserved sender');await expect(page.getByRole('button',{name:'Gửi email kiểm tra',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Lưu cấu hình SMTP',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(3);expect(f.writes[2]).not.toHaveProperty('password');
 await page.getByLabel('Email nhận kiểm tra',{exact:true}).fill('recipient@example.invalid');await expect(page.getByRole('button',{name:'Gửi email kiểm tra',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Gửi email kiểm tra',exact:true}).click();await expect(page.getByText('Email kiểm tra đang chờ worker xử lý.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Gửi email kiểm tra',exact:true})).toBeDisabled();f.sent();await expect(page.getByText('Email kiểm tra đã gửi thành công.',{exact:true})).toBeVisible();
 await page.getByLabel('Bật gửi email',{exact:true}).click();await page.getByLabel(/^Xóa mật khẩu SMTP đã lưu khi lưu cấu hình/).check();await page.getByRole('button',{name:'Lưu cấu hình SMTP',exact:true}).click();await expect(page.getByText('Chưa cấu hình mật khẩu.',{exact:true})).toBeVisible();expect(f.writes.at(-1)?.clearPassword).toBe(true);
 expect(f.errors).toEqual([]);
});
test('SMTP settings fit mobile and desktop without horizontal overflow',async({page})=>{
 const f=await fixture(page);await expect(page.getByText('Chưa cấu hình SMTP',{exact:true})).toBeVisible();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await page.getByLabel('SMTP Host',{exact:true}).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
 await page.screenshot({path:'.secrets/local/optional-smtp-settings.png',fullPage:true});expect(f.errors).toEqual([]);
});
test('platform actor without mail.manage cannot read or render SMTP fields',async({page})=>{
 const f=await fixture(page,false);await expect(page.getByText('Cấu hình gửi email chỉ dành cho quản trị nền tảng được cấp quyền quản lý SMTP.',{exact:true})).toBeVisible();await expect(page.getByLabel('Mật khẩu SMTP',{exact:true})).toHaveCount(0);expect(f.reads()).toBe(0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
