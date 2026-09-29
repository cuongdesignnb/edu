// QA for group "school-ops": opens drawers/modals and captures them. Usage: node scripts/qa-school-ops-overlays.mjs [only]
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const S = "/school/demo-school-a";
const out = (n) => `D:/Edu/qa/screenshots/${n}.png`;
const only = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });

async function session(as, w = 1448, h = 1086) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", deviceScaleFactor: 1 });
  const s = JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  return { ctx, page, errors };
}
async function step(name, as, fn, vp) {
  if (only && !name.includes(only)) return;
  const { ctx, page, errors } = await session(as, ...(vp ?? []));
  try {
    await fn(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: out(name) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(JSON.stringify({ name, overflowX: overflow, errors: errors.slice(0, 3) }));
  } catch (e) { console.log(JSON.stringify({ name, failed: String(e).slice(0, 300), errors })); }
  await ctx.close();
}
const go = async (page, path) => { await page.goto(base + path, { waitUntil: "networkidle" }); await page.waitForTimeout(1800); };

await step("O25-lesson-change-drawer", "u-quan", async (p) => {
  await go(p, `${S}/timetable`);
  await p.getByRole("button", { name: /Đổi tiết 10A1 .* tiết 2 ngày 07\/10\/2026/ }).first().click();
  await p.waitForTimeout(1200);
  await p.getByLabel("Giáo viên dạy thay").selectOption({ label: "Thầy Nguyễn Văn Hùng" }).catch(async () => { await p.getByLabel("Giáo viên dạy thay").selectOption({ index: 3 }); });
  await p.waitForTimeout(1200);
});
await step("O25-lesson-change-drawer-mobile", "u-quan", async (p) => {
  await go(p, `${S}/timetable`);
  await p.getByRole("tab", { name: /T4/ }).click();
  await p.getByRole("button", { name: /Đổi tiết 10A1 .* tiết 2/ }).first().click();
  await p.waitForTimeout(1200);
}, [390, 844]);
await step("C071-composer-filled", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/new`);
  await p.getByLabel("Tiêu đề").fill("Lịch họp phụ huynh giữa học kỳ 1");
  await p.getByLabel("Tóm tắt").fill("Nhà trường tổ chức họp phụ huynh toàn trường vào sáng Chủ nhật 25/10/2026.");
  await p.getByLabel("Đoạn văn 1").fill("Kính gửi quý phụ huynh, nhà trường tổ chức họp phụ huynh giữa học kỳ 1.");
  await p.getByRole("button", { name: "Thêm khối" }).click();
  await p.getByLabel("Đoạn văn 2").fill("Thời gian: 08:00 Chủ nhật 25/10/2026");
  await p.getByRole("button", { name: "Gạch đầu dòng" }).click();
  await p.getByRole("button", { name: "Công bố ngay" }).click();
  await p.waitForTimeout(800);
});
await step("C071-composer-preview-mobile", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/new`);
  await p.getByLabel("Tiêu đề").fill("Lịch họp phụ huynh giữa học kỳ 1");
  await p.getByLabel("Đoạn văn 1").fill("Kính gửi quý phụ huynh.");
  await p.getByRole("button", { name: "Xem trước như phụ huynh" }).click();
}, [390, 844]);
await step("C071-composer-validation", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/new`);
  await p.getByRole("button", { name: "Công bố ngay" }).click();
});
await step("O29-withdraw", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/an-1`);
  await p.getByRole("button", { name: "Thu hồi" }).click();
});
await step("O31-delete-announcement-draft", "u-hanh", async (p) => {
  await go(p, `${S}/announcements/an-4`);
  await p.getByRole("button", { name: "Xóa nháp" }).click();
});
await step("O31-delete-ruleset-draft", "u-hanh", async (p) => {
  await go(p, `${S}/conduct-rules/rs-a-3`);
  await p.getByRole("button", { name: "Xóa bản nháp" }).click();
});
await step("O22-publish-ruleset", "u-hanh", async (p) => {
  await go(p, `${S}/conduct-rules/rs-a-3`);
  await p.getByRole("button", { name: "Ban hành" }).click();
});
await step("SC30-published-readonly", "u-hanh", async (p) => { await go(p, `${S}/conduct-rules/rs-a-1`); });
await step("O30-export-format", "u-dung", async (p) => {
  await go(p, `${S}/reports/attendance`);
  await p.getByRole("button", { name: "Xuất báo cáo" }).click();
});
await step("SC38-print-preview", "u-dung", async (p) => {
  await go(p, `${S}/reports/conduct`);
  await p.emulateMedia({ media: "print" });
  await p.waitForTimeout(500);
});
await step("O34-revoke-grant", "u-hanh", async (p) => {
  await go(p, `${S}/support`);
  await p.getByRole("button", { name: "Thu hồi" }).first().click();
});
await step("SC42-create-ticket", "u-hanh", async (p) => {
  await go(p, `${S}/support`);
  await p.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }).click();
});
await step("SC40-audit-detail", "u-dung", async (p) => {
  await go(p, `${S}/audit`);
  await p.getByRole("button", { name: /Xem chi tiết: Ban hành nội quy/ }).click();
});
await step("SC32-timetable-mobile-agenda", "u-quan", async (p) => { await go(p, `${S}/timetable`); }, [390, 844]);
await browser.close();
