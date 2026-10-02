import fs from 'node:fs';
import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({mode:'serial'});
const baseURL='http://127.0.0.1:18763';
const fixture=JSON.parse(fs.readFileSync('qa/backend/fast-track-browser-persistence-source.json','utf8')) as {schoolId:string;yearId:string;classId:string};
const schoolId=fixture.schoolId,school=`/school/${schoolId}`,classroom=`/classroom/${schoolId}/${fixture.yearId}/${fixture.classId}`;
const parentKey='edu:onboarding:parent-overview:v1';
const errors:string[]=[],writes:string[]=[];
let admin:BrowserContext,page:Page;
const welcome=(p:Page)=>p.getByRole('dialog',{name:'Chào mừng bạn đến với EduManage'});
const popover=(p:Page)=>p.locator('.edumanage-tour');
async function login(p:Page,email:string){
 await p.goto('/login');await p.getByLabel(/^Email công việc/).fill(email);await p.getByLabel(/^Mật khẩu/).fill(fs.readFileSync('.secrets/local/local_test_password','utf8').trim());await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
}
async function settled(p:Page){await p.waitForLoadState('networkidle');await expect(p.locator('[aria-busy="true"]')).toHaveCount(0);}
async function replay(p:Page){await settled(p);await p.getByRole('button',{name:'Trợ giúp',exact:true}).click();await p.getByRole('menuitem',{name:'Xem lại hướng dẫn',exact:true}).click();await expect(popover(p)).toBeVisible();}
async function complete(p:Page){
 for(let i=0;i<8;i++){const done=popover(p).getByRole('button',{name:'Hoàn tất',exact:true});if(await done.isVisible()){await done.click();await expect(popover(p)).toHaveCount(0);return;}await popover(p).getByRole('button',{name:'Tiếp theo',exact:true}).click();}
 throw new Error('Tour exceeded seven steps');
}
async function progress(context:BrowserContext){const r=await context.request.get(`/api/v1/me/onboarding?schoolId=${schoolId}`);expect(r.status()).toBe(200);return (await r.json()).data.progress as {tourKey:string;status:string}[];}
function observe(p:Page){p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/api/v1/')&&!/\/auth\/|\/parent\/.*\/(?:session|access\/exchange)/.test(new URL(r.url()).pathname))writes.push(r.method()+' '+new URL(r.url()).pathname);});}
async function staff(browser:Browser,email:string){const context=await browser.newContext({baseURL,reducedMotion:'reduce',viewport:{width:1440,height:1000}}),p=await context.newPage();observe(p);await login(p,email);return {context,p};}
test.beforeAll(async({browser})=>{({context:admin,p:page}=await staff(browser,'admin-a@example.invalid'));});
test.afterAll(async()=>{fs.writeFileSync('.secrets/local/tour-browser-evidence.json',JSON.stringify({kind:'REAL_EDGE_REAL_HTTP_NO_BUSINESS_FIXTURE_OR_INTERCEPTION',errors,writes},null,2));await admin?.close();});

test('staff auto invitation appears only after authenticated workspace readiness; skip survives reload and another browser',async({browser})=>{
 const prior=(await progress(admin)).find(p=>p.tourKey==='school-overview');
 if(new URL(page.url()).pathname!==school)await page.goto(school);await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
 if(!prior){await expect(welcome(page)).toBeVisible();const receipt=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/onboarding/school-overview'));await welcome(page).getByRole('button',{name:'Bỏ qua',exact:true}).click();expect((await receipt).status()).toBe(200);}else{await settled(page);await expect(welcome(page)).toHaveCount(0);}
 await page.reload();await settled(page);await expect(welcome(page)).toHaveCount(0);
 const second=await staff(browser,'admin-a@example.invalid');try{await second.p.goto(school);await settled(second.p);await expect(welcome(second.p)).toHaveCount(0);expect((await progress(second.context)).find(p=>p.tourKey==='school-overview')?.status).toBe(prior?.status??'skipped');}finally{await second.context.close();}
});
test('school replay supports completion, keyboard focus, reduced motion and 320 390 768 1440 layouts without business writes',async()=>{
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await replay(page);
  await expect(popover(page)).toHaveAttribute('role','dialog');await expect(popover(page)).toHaveAttribute('aria-modal','true');
  await page.keyboard.press('Tab');expect(await popover(page).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');expect(await popover(page).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  const box=await popover(page).boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  await page.screenshot({path:`.secrets/local/tour-school-${width}.png`});
  const axe=await new AxeBuilder({page}).include('.edumanage-tour').analyze();expect(axe.violations).toEqual([]);
  await complete(page);await expect.poll(async()=>(await progress(admin)).find(p=>p.tourKey==='school-overview')?.status).toBe('completed');
 }
 await replay(page);await popover(page).getByRole('button',{name:'Bỏ qua',exact:true}).click();await expect.poll(async()=>(await progress(admin)).find(p=>p.tourKey==='school-overview')?.status).toBe('completed');
 await expect(page.getByRole('button',{name:'Trợ giúp',exact:true})).toBeFocused();
});
test('class guide is manual, uses exact class rights and preserves real students and publications',async()=>{
 await page.goto(classroom);await settled(page);await expect(welcome(page)).toHaveCount(0);
 const api=`/api/v1/schools/${schoolId}/years/${fixture.yearId}/classes/${fixture.classId}/conduct-workspace/adjustments`,before=await admin.request.get(api);expect(before.status()).toBe(200);const data=await before.json();
 await page.getByRole('button',{name:'Hướng dẫn lớp này',exact:true}).click();await expect(popover(page)).toBeVisible();
 await popover(page).getByRole('button',{name:'Tiếp theo',exact:true}).click();await page.locator('.driver-active-element').evaluate(el=>(el as HTMLElement).click());expect(new URL(page.url()).pathname).toBe(classroom);await complete(page);
 const after=await admin.request.get(api);expect((await after.json()).data.snapshots).toEqual(data.data.snapshots);
 expect((await progress(admin)).find(p=>p.tourKey==='class-staff')?.status).toBe('completed');
});
test('dirty forms and open business modals prevent manual tour without losing input',async()=>{
 await page.goto(school+'/students/new');await settled(page);await page.locator('[data-field="fullName"] input').fill('Nội dung tour chưa lưu');
 await page.getByRole('button',{name:'Trợ giúp',exact:true}).click();await page.getByRole('menuitem',{name:'Xem lại hướng dẫn',exact:true}).click();await expect(popover(page)).toHaveCount(0);await expect(page.locator('[data-field="fullName"] input')).toHaveValue('Nội dung tour chưa lưu');
 // Reload discards only this test's unsaved browser form; no business API is called.
 page.once('dialog',dialog=>dialog.accept());await page.reload();await settled(page);await page.goto(classroom+'/attendance');await settled(page);
 const open=page.getByRole('button',{name:'Trợ giúp',exact:true});await open.click();await expect(page.getByRole('menu')).toBeVisible();await expect(welcome(page)).toHaveCount(0);await page.keyboard.press('Escape');
});
test('subject teacher gets its own invitation and class steps without homeroom publication; route change cleans up without progress',async({browser})=>{
 const teacher=await staff(browser,'teacher-b@example.invalid');try{
  const prior=(await progress(teacher.context)).find(p=>p.tourKey==='teacher-overview');
  if(new URL(teacher.p.url()).pathname!==`/teacher/${schoolId}`)await teacher.p.goto(`/teacher/${schoolId}`);if(!prior){await expect(welcome(teacher.p)).toBeVisible();await teacher.p.keyboard.press('Escape');}else await settled(teacher.p);await expect(welcome(teacher.p)).toHaveCount(0);
  const assigned=(await (await teacher.context.request.get(`/api/v1/schools/${schoolId}/me/classes`)).json()).data.find((c:{myAssignments:{kind:string}[]})=>c.myAssignments.some(a=>a.kind==='SUBJECT'));expect(assigned).toBeTruthy();const ownClass=`/classroom/${schoolId}/${assigned.yearId}/${assigned.id}`;
  const priorClass=(await progress(teacher.context)).find(p=>p.tourKey==='class-subject');
  await teacher.p.goto(ownClass);await settled(teacher.p);await teacher.p.getByRole('button',{name:'Hướng dẫn lớp này',exact:true}).click();await expect(popover(teacher.p)).toBeVisible();
  await expect(teacher.p.locator('[data-tour="class-publication"]')).toHaveCount(0);
  await teacher.p.goto(`/teacher/${schoolId}/schedule`);await settled(teacher.p);await expect(popover(teacher.p)).toHaveCount(0);expect(await teacher.p.locator('[inert]').count()).toBe(0);
  expect((await progress(teacher.context)).find(p=>p.tourKey==='class-subject')).toEqual(priorClass);
  await teacher.p.goto(ownClass);await settled(teacher.p);await teacher.p.getByRole('button',{name:'Hướng dẫn lớp này',exact:true}).click();await expect(popover(teacher.p)).toBeVisible();await complete(teacher.p);await expect.poll(async()=>(await progress(teacher.context)).find(p=>p.tourKey==='class-subject')?.status).toBe('completed');
 }finally{await teacher.context.close();}
});
test('platform tour stays in its authorized navigation and closes by x without a school ID',async({browser})=>{
 const operator=await staff(browser,'operator@example.invalid');try{
  const prior=await operator.context.request.get('/api/v1/me/onboarding'),handled=(await prior.json()).data.progress.some((p:{tourKey:string})=>p.tourKey==='platform-overview');
  if(new URL(operator.p.url()).pathname!=='/platform')await operator.p.goto('/platform');
  if(!handled){await expect(welcome(operator.p)).toBeVisible();await welcome(operator.p).getByRole('button',{name:'Bắt đầu hướng dẫn',exact:true}).click();}else await replay(operator.p);
  await expect(popover(operator.p)).toBeVisible();await popover(operator.p).getByRole('button',{name:'Đóng hướng dẫn',exact:true}).click();await replay(operator.p);await complete(operator.p);
  await expect.poll(async()=>{const r=await operator.context.request.get('/api/v1/me/onboarding');return (await r.json()).data.progress.find((p:{tourKey:string})=>p.tourKey==='platform-overview').status;}).toBe('completed');
 }finally{await operator.context.close();}
});
test('homeroom and teacher overview tours complete; other class scope and external logout end safely',async({browser})=>{
 const teacher=await staff(browser,'teacher-a@example.invalid');try{
  if(await welcome(teacher.p).isVisible())await welcome(teacher.p).getByRole('button',{name:'Đóng',exact:true}).click();
  await teacher.p.goto(`/teacher/${schoolId}`);await settled(teacher.p);if(await welcome(teacher.p).isVisible())await teacher.p.keyboard.press('Escape');
  await replay(teacher.p);await complete(teacher.p);await expect.poll(async()=>(await progress(teacher.context)).find(p=>p.tourKey==='teacher-overview')?.status).toBe('completed');
  const classes=(await (await teacher.context.request.get(`/api/v1/schools/${schoolId}/me/classes`)).json()).data as {id:string;yearId:string;myAssignments:{kind:string}[]}[];
  const homeroom=classes.find(c=>c.myAssignments.some(a=>a.kind==='HOMEROOM'));expect(homeroom).toBeTruthy();await teacher.p.setViewportSize({width:390,height:900});await teacher.p.goto(`/classroom/${schoolId}/${homeroom!.yearId}/${homeroom!.id}`);await settled(teacher.p);await teacher.p.getByRole('button',{name:'Hướng dẫn lớp này',exact:true}).click();await expect(popover(teacher.p)).toBeVisible();await complete(teacher.p);await expect.poll(async()=>(await progress(teacher.context)).find(p=>p.tourKey==='class-homeroom')?.status).toBe('completed');
  const subject=classes.find(c=>c.myAssignments.some(a=>a.kind==='SUBJECT'));expect(subject).toBeTruthy();await teacher.p.goto(`/classroom/${schoolId}/${subject!.yearId}/${subject!.id}`);await settled(teacher.p);const prior=(await progress(teacher.context)).find(p=>p.tourKey==='class-subject');await teacher.p.getByRole('button',{name:'Hướng dẫn lớp này',exact:true}).click();await expect(popover(teacher.p)).toBeVisible();await expect(teacher.p.locator('[data-tour="class-publication"]')).toHaveCount(0);
  const context=(await (await teacher.context.request.get('/api/v1/me/context')).json()).data;const response=await teacher.context.request.post('/api/v1/auth/logout',{headers:{Origin:baseURL,'X-CSRF-Token':context.csrfToken}});expect(response.status()).toBe(200);await teacher.p.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(popover(teacher.p)).toHaveCount(0);expect(await teacher.p.locator('[inert]').count()).toBe(0);
  const second=await staff(browser,'teacher-a@example.invalid');try{expect((await progress(second.context)).find(p=>p.tourKey==='class-subject')).toEqual(prior);}finally{await second.context.close();}
 }finally{await teacher.context.close();}
});
test('missing target and failed progress write close safely and do not claim server synchronization',async()=>{
 await page.goto(school);await replay(page);const before=writes.length;await page.locator('.driver-active-element').evaluate(el=>el.remove());await expect(popover(page)).toHaveCount(0);await expect(page.getByText('Chưa tìm thấy phần cần hướng dẫn',{exact:true})).toBeVisible();expect(writes.length).toBe(before);
 await page.reload();await replay(page);await admin.setOffline(true);await page.keyboard.press('Escape');await expect(popover(page)).toHaveCount(0);await expect(page.getByText('Chưa đồng bộ trạng thái hướng dẫn',{exact:true})).toBeVisible();await admin.setOffline(false);await page.reload();await settled(page);await expect(welcome(page)).toHaveCount(0);
});
test('parent valid link uses no account or tour token storage, replay preserves completed; invalid link has no tour',async({browser})=>{
 const parent=await browser.newContext({baseURL,reducedMotion:'reduce',viewport:{width:390,height:900}}),p=await parent.newPage();observe(p);
 try{await p.goto(fs.readFileSync('.secrets/local/fast-track-parent-link','utf8').trim());await p.waitForURL(/\/p\/[^/]+\/(overview|attendance|conduct|timetable)$/);await expect(welcome(p)).toBeVisible();await welcome(p).getByRole('button',{name:'Bắt đầu hướng dẫn',exact:true}).click();await expect(popover(p)).toBeVisible();await complete(p);expect(await p.evaluate(k=>localStorage.getItem(k),parentKey)).toBe('completed');
  expect(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('onboarding')))).toEqual([parentKey]);
  for(const width of [390,768,1440]){await p.setViewportSize({width,height:900});await replay(p);await p.keyboard.press('Tab');expect(await popover(p).evaluate(el=>el.contains(document.activeElement))).toBe(true);const box=await popover(p).boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);await p.screenshot({path:`.secrets/local/tour-parent-${width}.png`});await p.keyboard.press('Escape');expect(await p.evaluate(k=>localStorage.getItem(k),parentKey)).toBe('completed');}
  await p.reload();await settled(p);await expect(welcome(p)).toHaveCount(0);
  await p.goto('/p/truong-thu-a/access#token='+'a'.repeat(43));await p.waitForURL(/access-unavailable/);await expect(popover(p)).toHaveCount(0);await expect(welcome(p)).toHaveCount(0);await expect(p.getByRole('heading',{name:'Thông tin của con',exact:true})).toHaveCount(0);
 }finally{await parent.close();}
});
test('parent denied localStorage falls back to session memory without a page error or account',async({browser})=>{
 const context=await browser.newContext({baseURL,reducedMotion:'reduce'});await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage disabled for test');}}));const p=await context.newPage();observe(p);
 try{await p.goto(fs.readFileSync('.secrets/local/fast-track-parent-link','utf8').trim());await p.waitForURL(/\/p\/[^/]+\/(overview|attendance|conduct|timetable)$/);await expect(welcome(p)).toBeVisible();await welcome(p).getByRole('button',{name:'Bỏ qua',exact:true}).click();await expect(welcome(p)).toHaveCount(0);await expect(p.getByText('Đã đóng hướng dẫn',{exact:true})).toBeVisible();await replay(p);await p.keyboard.press('Escape');await expect(popover(p)).toHaveCount(0);await expect(p.getByRole('heading',{name:'Thông tin của con',exact:true})).toBeVisible();}finally{await context.close();}
});
test('tour request receipts contain only personal progress writes and no browser errors',()=>{
 expect(writes.filter(w=>!w.startsWith('PUT /api/v1/me/onboarding/'))).toEqual([]);expect(errors).toEqual([]);
});
