import fs from 'node:fs';
import {test,expect} from '@playwright/test';

test('public login/help expose no demo credentials or role picker and preview assets are blocked',async({page})=>{
  await page.goto('http://127.0.0.1:18763/');
  await page.waitForURL('**/login');
  await expect(page.getByLabel(/^Email công việc/)).toHaveValue('');
  await expect(page.getByLabel(/^Mật khẩu/)).toHaveValue('');
  await expect(page.getByLabel(/^Email công việc/)).toHaveAttribute('placeholder','Email do nhà trường cấp');
  await expect(page.locator('body')).not.toContainText(/tài khoản demo|mật khẩu demo|chọn vai trò|ten@truong\.edu\.test/i);
  await page.screenshot({path:'D:/Edu/Anh-tour/Dang-nhap-da-don-demo.png',fullPage:true});
  await page.goto('http://127.0.0.1:18763/help');
  await expect(page.locator('body')).not.toContainText(/lời mời demo|bản demo không có chat|liên hệ nền tảng \(mẫu\)/i);
  for(const path of ['/demo','/preview','/preview-references/evidence-index.json']){
    const response=await page.request.get('http://127.0.0.1:18763'+path);
    expect(response.status()).toBe(404);
  }
});

test('real staff login and permitted workspace selection still work after removing demo presentation',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:18763/login');
  await page.getByLabel(/^Email công việc/).fill('teacher-a@example.invalid');
  await page.getByLabel(/^Mật khẩu/).fill(fs.readFileSync('.secrets/local/local_test_password','utf8').trim());
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.waitForURL(u=>u.pathname!='/login');
  await page.getByRole('button',{name:/^Tài khoản:/}).click();
  await expect(page.getByRole('menuitem',{name:'Chọn không gian làm việc',exact:true})).toBeVisible();
  await expect(page.getByRole('menu')).not.toContainText(/chọn vai trò|đăng nhập thay|tài khoản demo/i);
  await page.getByRole('menuitem',{name:'Thoát phiên',exact:true}).click();
  await page.waitForURL('**/login');
  await expect(page.getByLabel(/^Email công việc/)).toHaveValue('');
  await expect(page.getByLabel(/^Mật khẩu/)).toHaveValue('');
  expect(errors).toEqual([]);
});
