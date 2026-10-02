import fs from 'node:fs';
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const baseURL='http://127.0.0.1:18763';
const f=JSON.parse(fs.readFileSync('qa/backend/fast-track-browser-persistence-source.json','utf8')) as {schoolId:string};
let p:Page,context:BrowserContext,base:string,api:string;
const writes:string[]=[],errors:string[]=[];
test.describe.configure({mode:'serial'});
async function ready(){await p.waitForLoadState('networkidle');await expect(p.getByRole('button',{name:'Lưu thay đổi',exact:true})).toBeVisible();}
test.beforeAll(async({browser})=>{
 context=await browser.newContext({baseURL,viewport:{width:1440,height:1100},locale:'vi-VN',reducedMotion:'reduce'});p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()!=='GET'&&path.startsWith('/api/v1/')&&!path.includes('/auth/'))writes.push(r.method()+' '+path);});
 await p.goto('/login');await p.getByLabel(/^Email công việc/).fill('teacher-a@example.invalid');await p.getByLabel(/^Mật khẩu/).fill(fs.readFileSync('.secrets/local/local_test_password','utf8').trim());await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
 const assigned=(await (await context.request.get(`/api/v1/schools/${f.schoolId}/me/classes`)).json()).data.find((c:{myAssignments:{kind:string}[]})=>c.myAssignments.some(a=>a.kind==='HOMEROOM'));
 base=`/classroom/${f.schoolId}/${assigned.yearId}/${assigned.id}`;api=`/api/v1/schools/${f.schoolId}/academic-years/${assigned.yearId}/classes/${assigned.id}/seating-workspace`;
});
test.afterAll(async()=>{fs.writeFileSync('.secrets/local/seating-browser-receipts.json',JSON.stringify({errors,writes},null,2));await context?.close();});
test('desktop supports actual drag, swap, undo, redo and resize without saving business data',async()=>{
 await p.goto(base+'/seating');await ready();const before=(await (await context.request.get(api)).json()).data;expect(before.plan).toBeNull();
 await p.getByLabel('Số hàng',{exact:true}).fill('2');await p.getByLabel('Ghế mỗi hàng',{exact:true}).fill('3');
 const roster=p.locator('section').filter({has:p.getByRole('heading',{name:'Học sinh chưa có chỗ',exact:true})});
 const chips=roster.locator('button[draggable="true"]'),first=await chips.first().textContent();await chips.first().dragTo(p.locator('[data-seat="r1c1"]'));await expect(p.locator('[data-seat="r1c1"]')).toContainText(first!.split(' ').slice(-2).join(' '));
 const second=await chips.first().textContent();await chips.first().dragTo(p.locator('[data-seat="r1c2"]'));await p.locator('[data-seat="r1c1"]').dragTo(p.locator('[data-seat="r1c2"]'));await expect(p.locator('[data-seat="r1c1"]')).toContainText(second!.split(' ').slice(-2).join(' '));
 await p.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(p.locator('[data-seat="r1c1"]')).toContainText(first!.split(' ').slice(-2).join(' '));await p.getByRole('button',{name:'Làm lại',exact:true}).click();await expect(p.locator('[data-seat="r1c2"]')).toContainText(first!.split(' ').slice(-2).join(' '));
 await p.getByLabel('Ghế mỗi hàng',{exact:true}).fill('1');await expect(p.getByText(/học sinh được chuyển về danh sách chưa có chỗ/)).toBeVisible();await p.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(p.locator('[data-seat="r1c2"]')).toContainText(first!.split(' ').slice(-2).join(' '));
 await p.screenshot({path:'D:/Edu/Anh-tour/So-do-lop-chinh-desktop.png',fullPage:true});await p.getByRole('button',{name:'Hủy thay đổi',exact:true}).click();expect((await (await context.request.get(api)).json()).data).toEqual(before);expect(writes).toEqual([]);
});
test('mobile click placement remains usable and discard clears note date layout and leave guard',async()=>{
 await p.setViewportSize({width:390,height:900});await p.goto(base+'/seating');await ready();await p.getByRole('button',{name:'Vừa màn hình',exact:true}).click();
 await p.getByLabel('Số hàng',{exact:true}).fill('2');await p.getByLabel('Ghế mỗi hàng',{exact:true}).fill('2');await p.getByRole('button',{name:'Xếp vào ghế trống',exact:true}).click();await p.locator('[data-seat="r1c1"]').click();await p.locator('[data-seat="r1c2"]').click();
 await p.getByLabel('Ghi chú phiên bản',{exact:true}).fill('Bản thử chưa lưu');const date=p.getByLabel('Ngày áp dụng',{exact:false});const original=await date.inputValue();await date.fill('03/10/2026');await p.screenshot({path:'D:/Edu/Anh-tour/So-do-lop-chinh-mobile.png',fullPage:true});
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.getByRole('button',{name:'Hủy thay đổi',exact:true}).click();await expect(p.getByLabel('Ghi chú phiên bản',{exact:true})).toHaveValue('');await expect(date).toHaveValue(original);await expect(p.getByLabel('Số hàng',{exact:true})).toHaveValue('6');await expect(p.getByRole('button',{name:'Lưu thay đổi',exact:true})).toBeDisabled();
 await p.getByRole('link',{name:'Tổng quan',exact:true}).click();await p.waitForURL(baseURL+base);await expect(p.getByRole('dialog')).toHaveCount(0);expect(errors).toEqual([]);expect(writes).toEqual([]);
});
