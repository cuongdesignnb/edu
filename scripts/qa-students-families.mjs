// QA for the students-families group: opens dialogs / wizard steps and screenshots them.
// Usage: node scripts/qa-students-families.mjs [--w=1448] [--h=1086] [--suffix=desktop]
import { chromium } from "@playwright/test";
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
const W = Number(args.w ?? 1448), H = Number(args.h ?? 1086), sfx = args.suffix ?? "desktop";
const base = process.env.BASE ?? "http://localhost:3000";
const out = (n) => `D:/Edu/qa/screenshots/${n}-${sfx}.png`;
const browser = await chromium.launch({ channel: "msedge" });

async function session(as = "u-hanh") {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", acceptDownloads: true });
  const s = JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { ctx, page, errors };
}
const log = (name, extra = {}) => console.log(JSON.stringify({ name, ...extra }));

// O12 → O13 from the profile (issue a new link to the mother, which already has one — allowed)
if (!args.only) {
  const { ctx, page, errors } = await session();
  await page.goto(`${base}/school/demo-school-a/students/demo-student-a-001`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Cấp link mới" }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("radio").first().check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("O12") });
  await page.getByRole("button", { name: "Cấp link", exact: true }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out("O13") });
  const qr = await page.locator('img[alt^="Mã QR"]').count();
  const link = await page.locator('input[aria-label="Đường dẫn tra cứu demo"]').inputValue().catch(() => "");
  await page.getByRole("button", { name: "Sao chép đường dẫn" }).click().catch(() => {});
  await page.waitForTimeout(500);
  const toast = await page.getByText("Đã sao chép").count();
  log("O12-O13", { qr, link, toast, errors });
  await ctx.close();
}

// O12 unverified guardian (student with unverified guardians: Đặng Thu Trang) via SC23 "Cấp link"
if (!args.only) {
  const { ctx, page, errors } = await session();
  await page.goto(`${base}/school/demo-school-a/parent-access`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Cấp link", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("dialog").getByRole("combobox").click();
  await page.waitForTimeout(400);
  await page.keyboard.type("Đặng Thu Trang");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out("O12-unverified") });
  const msg = await page.getByText("Cần xác minh trước khi cấp link").count();
  log("O12-unverified", { msg, errors });
  await ctx.close();
}

// O14 revoke dialog + SC24 reveal
if (!args.only) {
  const { ctx, page, errors } = await session();
  await page.goto(`${base}/school/demo-school-a/parent-access/pa-hoa-dung`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Hiện link/QR demo" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: out("SC24-revealed") });
  await page.getByRole("button", { name: "Thu hồi" }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: out("O14") });
  log("SC24-O14", { errors });
  await ctx.close();
}

// SC27 wizard with the sample CSV
if (!args.only) {
  const { ctx, page, errors } = await session("u-quan");
  await page.goto(`${base}/school/demo-school-a/imports/new`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const csv = "\ufeffMã HS,Họ và tên,Ngày sinh,Giới tính,Người giám hộ,Quan hệ,SĐT giám hộ\r\n,Phan Gia Bảo,12/03/2011,Nam,Phan Văn Lực,Bố,0912 000 111\r\n,Nguyễn Minh Anh,02/02/2011,Nữ,,,\r\nHS26001,Nguyễn Minh Anh,01/01/2011,Nữ,,,\r\n,,05/05/2011,Nam,,,\r\n,Lâm Nhật Minh,2011-13-40,Nam,,,\r\n";
  await page.locator('input[type=file]').setInputFiles({ name: "danh-sach-thu.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out("SC27-step1") });
  await page.getByRole("button", { name: "Tiếp tục: ghép cột" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: out("SC27-step2") });
  await page.getByRole("button", { name: "Kiểm tra dữ liệu" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out("SC27-step3"), fullPage: true });
  await page.getByRole("button", { name: "Xem trước", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out("SC27-step4"), fullPage: true });
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: out("SC27-step5") });
  if (args.commit) {
    await page.getByRole("button", { name: /^Nhập \d+ dòng/ }).click();
    await page.waitForURL(/imports\/imp-/, { timeout: 15000, waitUntil: "commit" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out("SC28-after-import"), fullPage: true });
  }
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log("SC27", { overflowX: ov, url: page.url(), errors });
  await ctx.close();
}

// SC19 conflict via scenario
if (!args.only || args.only === "conflict") {
  const { ctx, page, errors } = await session();
  await page.goto(`${base}/school/demo-school-a/students/demo-student-a-001/edit`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByLabel(/Ghi chú nội bộ/).fill("Kiểm tra xung đột phiên bản");
  await page.getByRole("button", { name: "Mô phỏng", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out("SC19-conflict") });
  const dlg = await page.getByText("Dữ liệu đã thay đổi").count();
  log("SC19-conflict", { dlg, errors });
  await ctx.close();
}
await browser.close();
