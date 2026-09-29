// Flow checks for group "school-ops" (fresh IndexedDB per context). node scripts/qa-school-ops-flows.mjs
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const S = "/school/demo-school-a";
const browser = await chromium.launch({ channel: "msedge" });
async function session(as) {
  const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", acceptDownloads: true });
  const s = JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const go = async (p, path) => { await p.goto(base + path, { waitUntil: "networkidle" }); await p.waitForTimeout(1500); };
const results = [];
async function flow(name, as, fn) {
  const { ctx, page, errors } = await session(as);
  try { const r = await fn(page); results.push({ name, ok: true, r, errors }); } catch (e) { results.push({ name, ok: false, e: String(e).slice(0, 300), errors }); await page.screenshot({ path: `D:/Edu/qa/screenshots/flow-fail-${name}.png` }); }
  await ctx.close();
}
await flow("announcement-draft-then-publish", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/new`);
  await p.getByLabel("Tiêu đề").fill("Thông báo kiểm thử luồng");
  await p.getByLabel("Tóm tắt").fill("Tóm tắt kiểm thử đủ độ dài.");
  await p.getByLabel("Đoạn văn 1").fill("Nội dung kiểm thử.");
  await p.getByRole("button", { name: "Lưu nháp" }).click();
  await p.waitForURL(/announcements\/an-/, { timeout: 8000 }); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Công bố ngay" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Công bố" }).click();
  await p.waitForTimeout(1500);
  return await p.locator("h1 + span, .badge").first().innerText();
});
await flow("export-recorded", "u-dung", async (p) => {
  await go(p, `${S}/reports/attendance`);
  const dl = p.waitForEvent("download");
  await p.getByRole("button", { name: "Tải Excel (.xlsx)" }).click();
  const d = await dl; const name = d.suggestedFilename();
  await p.waitForTimeout(1200);
  await go(p, `${S}/exports`);
  const rows = await p.locator("tbody tr").count();
  const dl2 = p.waitForEvent("download");
  await p.getByRole("button", { name: "Tải lại" }).first().click();
  const d2 = await dl2;
  return { name, rows, redownload: d2.suggestedFilename() };
});
await flow("lesson-change-draft-publish", "u-quan", async (p) => {
  await go(p, `${S}/timetable`);
  await p.getByRole("button", { name: /Đổi tiết 10A1 .* tiết 2 ngày 07\/10\/2026/ }).first().click();
  await p.waitForTimeout(1000);
  await p.getByRole("radio", { name: "Đổi phòng" }).check();
  await p.getByLabel("Phòng mới").selectOption({ index: 2 });
  await p.getByLabel("Lý do").fill("Phòng A1.03 sửa điều hòa");
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Lưu nháp" }).click();
  await p.waitForTimeout(1500);
  const draft = await p.getByText("Đổi phòng").count();
  await p.getByRole("button", { name: "Công bố", exact: true }).first().click();
  await p.getByRole("dialog").getByRole("button", { name: "Công bố", exact: true }).click();
  await p.waitForTimeout(1500);
  return { draftVisible: draft, published: await p.getByText("Đã công bố").count() };
});
await flow("policy-save", "u-hanh", async (p) => {
  await go(p, `${S}/publication-policy`);
  await p.getByRole("switch", { name: /Cần ban giám hiệu duyệt/ }).click();
  await p.getByRole("button", { name: "Lưu quy trình" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Lưu" }).click();
  await p.waitForTimeout(1500);
  return await p.getByText("BGH duyệt").count();
});
await flow("ruleset-delete-new", "u-hanh", async (p) => {
  await go(p, `${S}/conduct-rules/rs-a-3`);
  await p.getByRole("button", { name: "Xóa bản nháp" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Xóa bản nháp" }).click();
  await p.waitForURL(/conduct-rules$/, { timeout: 8000 }); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Tạo bản mới" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Tạo bản nháp" }).click();
  await p.waitForURL(/conduct-rules\/rs-/, { timeout: 8000 }); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Ban hành" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Ban hành" }).click();
  await p.waitForTimeout(1800);
  return await p.locator("h1").innerText() + " | " + await p.getByText("Đã ban hành").count();
});
await flow("grant-revoke", "u-hanh", async (p) => {
  await go(p, `${S}/support`);
  await p.getByRole("button", { name: "Thu hồi" }).first().click();
  await p.getByRole("dialog").getByRole("button", { name: "Thu hồi" }).click();
  await p.waitForTimeout(1500);
  return await p.getByText("Đã thu hồi").count();
});
console.log(JSON.stringify(results, null, 1));
await browser.close();
