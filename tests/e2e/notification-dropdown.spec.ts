import fs from 'node:fs';
import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({mode:'serial'});
const baseURL='http://127.0.0.1:18763';
const fixture=JSON.parse(fs.readFileSync('qa/backend/fast-track-browser-persistence-source.json','utf8')) as {schoolId:string};
type Notice={id:string;title:string;body:string;readAt:string|null};
let context:BrowserContext,page:Page,notices:Notice[];
const errors:string[]=[],writes:string[]=[];
const menu=(p:Page)=>p.getByRole('menu',{name:/^Thông báo(?:,|$)/});
async function login(browser:Browser,email:string){
 const c=await browser.newContext({baseURL,viewport:{width:1440,height:1000},locale:'vi-VN',reducedMotion:'reduce'}),p=await c.newPage();
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()!=='GET'&&path.startsWith('/api/v1/')&&!path.includes('/auth/'))writes.push(r.method()+' '+path);});
 await p.goto('/login');await p.getByLabel(/^Email công việc/).fill(email);await p.getByLabel(/^Mật khẩu/).fill(fs.readFileSync('.secrets/local/local_test_password','utf8').trim());await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');return {c,p};
}
async function open(p:Page){await p.waitForLoadState('networkidle');await p.getByRole('button',{name:/^Thông báo(?:,|$)/}).click();await expect(menu(p)).toBeVisible();}
test.beforeAll(async({browser})=>{const staff=await login(browser,'admin-a@example.invalid');context=staff.c;page=staff.p;const r=await context.request.get('/api/v1/me/notifications?limit=100');expect(r.ok()).toBeTruthy();notices=(await r.json()).data;expect(notices.length).toBeGreaterThan(0);});
test.afterAll(async()=>{fs.writeFileSync('.secrets/local/notification-browser-receipts.json',JSON.stringify({errors,writes},null,2));await context?.close();});

test('bell opens a keyboard dropdown; footer opens the notification list',async()=>{
 await page.goto('/school/'+fixture.schoolId);const route=new URL(page.url()).pathname;await open(page);expect(new URL(page.url()).pathname).toBe(route);
 expect(await menu(page).getByRole('menuitem').count()).toBe(Math.min(6,notices.length)+1);
 const footer=menu(page).getByRole('menuitem',{name:'Xem thêm',exact:true});await expect(footer).toHaveAttribute('href','/notifications');
 await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);await expect(page.getByRole('button',{name:/^Thông báo(?:,|$)/})).toBeFocused();
 await open(page);await footer.click();await page.waitForURL('**/notifications');await expect(page.getByRole('heading',{name:'Thông báo của tôi',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Xem chi tiết',exact:true}).first()).toBeVisible();await page.screenshot({path:'D:/Edu/Anh-tour/Thong-bao-danh-sach.png'});
});
test('clicking a notification opens its exact detail and read receipt, including on reload',async()=>{
 await page.goto('/school/'+fixture.schoolId);await open(page);const chosen=notices.find(n=>!n.readAt)??notices[0],item=menu(page).locator(`a[href="/notifications/${chosen.id}"]`);await item.click();await page.waitForURL('**/notifications/'+chosen.id);
 await expect(page.getByRole('heading',{name:'Chi tiết thông báo',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:chosen.title,exact:true})).toBeVisible();
 await expect.poll(async()=>{const r=await context.request.get('/api/v1/me/notifications?limit=100');return (await r.json()).data.find((n:Notice)=>n.id===chosen.id)?.readAt;}).toBeTruthy();await expect(page.getByText('Đã đọc',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:chosen.title,exact:true})).toBeVisible();await page.screenshot({path:'D:/Edu/Anh-tour/Thong-bao-chi-tiet.png'});await page.getByRole('link',{name:'Danh sách thông báo',exact:true}).click();await page.waitForURL('**/notifications');
});
test('dropdown fits 320 390 768 1440 with keyboard and accessible menu items',async()=>{
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.goto('/school/'+fixture.schoolId);await open(page);const box=await menu(page).boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(901);
  await page.keyboard.press('End');await expect(menu(page).getByRole('menuitem',{name:'Xem thêm',exact:true})).toBeFocused();
  const axe=await new AxeBuilder({page}).include('[role="menu"]').analyze();expect(axe.violations).toEqual([]);await page.screenshot({path:`D:/Edu/Anh-tour/Thong-bao-dropdown-${width}.png`});await page.keyboard.press('Escape');
 }
});
test('another recipient cannot open the first user detail; invalid IDs do not write read receipts',async({browser})=>{
 const other=await login(browser,'teacher-b@example.invalid');try{const feed=await other.c.request.get('/api/v1/me/notifications?limit=100');expect((await feed.json()).data.some((n:Notice)=>n.id===notices[0].id)).toBe(false);
  const before=writes.length;await other.p.goto('/notifications/'+notices[0].id);await expect(other.p.getByText('Thông báo không khả dụng',{exact:true})).toBeVisible();expect(writes.length).toBe(before);
  await other.p.goto('/notifications/00000000-0000-4000-8000-000000000000');await expect(other.p.getByText('Thông báo không khả dụng',{exact:true})).toBeVisible();expect(writes.length).toBe(before);
 }finally{await other.c.close();}
});
test('empty platform dropdown keeps footer navigation and recorded writes are only read receipts',async({browser})=>{
 const operator=await login(browser,'operator@example.invalid');try{await operator.p.goto('/platform');await open(operator.p);await expect(menu(operator.p).getByText('Thông báo của trường dành cho nhân sự nhà trường.',{exact:true})).toBeVisible();await menu(operator.p).getByRole('menuitem',{name:'Xem thêm',exact:true}).click();await operator.p.waitForURL('**/notifications');await expect(operator.p.getByRole('heading',{name:'Thông báo của tôi',exact:true})).toBeVisible();}finally{await operator.c.close();}
 expect(errors).toEqual([]);expect(writes.filter(w=>!/^POST \/api\/v1\/me\/notifications\/[^/]+\/read$/.test(w))).toEqual([]);
});
