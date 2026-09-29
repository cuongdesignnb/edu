// End-to-end mutation checks for the school-org group, in ONE fresh browser context (fresh seed).
// Usage: node scripts/qa-school-org-flows.mjs [--as=u-hanh]  → prints one JSON line per step; screenshots in qa/screenshots/flow-*.png
import { chromium } from "@playwright/test";
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
const base = process.env.BASE ?? "http://localhost:3000";
const S = "/school/demo-school-a";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
const as = String(args.as ?? "u-hanh");
await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const go = async (p) => { await page.goto(base + p, { waitUntil: "networkidle" }); await page.waitForTimeout(1800); };
const toast = async () => { await page.waitForTimeout(1200); return (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ").slice(0, 300); };
const step = async (name, fn) => {
  try { const r = await fn(); console.log(JSON.stringify({ step: name, ok: true, info: r ?? null })); }
  catch (e) { console.log(JSON.stringify({ step: name, ok: false, error: String(e).slice(0, 300) })); await page.screenshot({ path: `D:/Edu/qa/screenshots/flow-fail-${name}.png` }); await page.keyboard.press("Escape").catch(() => {}); }
};
const pick = async (label, text) => { await page.getByRole("combobox", { name: label }).click(); await page.getByPlaceholder("Tìm…").fill(text); await page.waitForTimeout(300); await page.locator("[role=listbox] [role=option]").first().click(); };

await step("SC05-create-class", async () => {
  await go(`${S}/academic-years/y-a-2026`);
  await page.locator("main button.btn-primary:visible", { hasText: "Thêm lớp" }).first().click();
  await page.waitForTimeout(600);
  // validation first
  await page.getByRole("dialog").getByRole("button", { name: "Tạo lớp" }).click();
  const v = await page.getByRole("dialog").locator(".error-text").count();
  await page.getByRole("dialog").getByLabel("Khối").selectOption({ label: "Khối 10" });
  await page.getByRole("dialog").getByLabel("Tên lớp").fill("10a4");
  await page.getByRole("dialog").getByRole("button", { name: "Tạo lớp" }).click();
  const t = await toast();
  await page.waitForTimeout(800);
  const inTable = await page.locator("table").getByText("10A4").count();
  await page.screenshot({ path: "D:/Edu/qa/screenshots/flow-SC05-created.png" });
  return { validationErrors: v, toast: t, inTable };
});

await step("SC12-assign-homeroom", async () => {
  await go(`${S}/assignments`);
  await page.getByRole("button", { name: "Phân công chủ nhiệm 10A3" }).click();
  await page.waitForTimeout(800);
  await pick("Giáo viên", "Diệp");
  await page.getByRole("button", { name: "Xem trước quyền" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "D:/Edu/qa/screenshots/flow-SC12-preview.png" });
  const added = await page.getByText(/Quyền được thêm/).innerText();
  await page.getByRole("button", { name: "Xác nhận phân công" }).click();
  const t = await toast();
  await page.waitForTimeout(800);
  const cell = await page.locator("table tr", { hasText: "10A3" }).getByText("Cô Hồ Ngọc Diệp").count();
  return { added, toast: t, cell };
});

await step("SC09-activate-10A3", async () => {
  await go(`${S}/classes`);
  await page.getByRole("button", { name: "Thao tác với lớp 10A3" }).click();
  await page.getByRole("menuitem", { name: /Kích hoạt lớp/ }).click();
  const t = await toast();
  await page.waitForTimeout(600);
  const status = await page.locator("tr", { hasText: "10A3" }).locator(".badge").last().innerText();
  return { toast: t, status };
});

await step("SC10-invite", async () => {
  await go(`${S}/teachers`);
  await page.getByRole("button", { name: "Mời giáo viên" }).first().click();
  await page.getByLabel("Họ và tên").fill("Lương Thị Yến");
  await page.getByLabel("Email công việc").fill("yen.lt@giaovien.test");
  await page.getByLabel("Nhiệm vụ dự kiến").fill("Giáo viên Hóa học — dự kiến 10A3");
  await page.getByRole("button", { name: "Tạo lời mời" }).click();
  const t = await toast();
  await page.waitForTimeout(800);
  const listed = await page.getByText("Lương Thị Yến").count();
  return { toast: t, listed };
});

await step("SC10-suspend-self-hidden", async () => {
  await page.getByRole("button", { name: /Thao tác với Cô Nguyễn Thị Hạnh/ }).click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return { items };
});

await step("SC04-create-year", async () => {
  await go(`${S}/academic-years/new`);
  for (let i = 0; i < 3; i++) { await page.getByRole("button", { name: "Tiếp tục" }).click(); await page.waitForTimeout(400); }
  await page.getByRole("button", { name: "Tạo năm học" }).last().click();
  const t = await toast();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "D:/Edu/qa/screenshots/flow-SC04-done.png" });
  return { toast: t, done: await page.getByText(/Đã tạo năm học 2027–2028/).count() };
});

await step("SC07-rollover-target", async () => {
  await go(`${S}/academic-years/y-a-2026/rollover`);
  const hasTarget = await page.getByText("Năm học 2027–2028").count();
  const needClasses = await page.getByText("Năm đích chưa có lớp").count();
  return { hasTarget, needClasses };
});

await step("SC15-handover", async () => {
  await go(`${S}/handovers?class=c-a-11a1`);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await pick("Giáo viên nhận chủ nhiệm", "Hằng");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByLabel("Lý do / nội dung bàn giao").fill("Cô Thu nghỉ chế độ, bàn giao theo quyết định của BGH");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByRole("button", { name: "Xác nhận bàn giao" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bàn giao" }).click();
  const t = await toast();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "D:/Edu/qa/screenshots/flow-SC15-done.png" });
  return { toast: t, history: await page.getByText(/Lớp 11A1: Cô Ngô Thị Thu → Cô Đỗ Thị Hằng/).count() };
});

await step("SC14-edit-role", async () => {
  await go(`${S}/roles/demo-school-a-role-academic`);
  await page.getByLabel("Xuất dữ liệu báo cáo").check();
  await page.getByLabel("Lý do thay đổi").fill("Giáo vụ cần xuất danh sách lớp");
  await page.getByRole("button", { name: "Xem tác động & lưu" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận lưu" }).click();
  const t = await toast();
  return { toast: t };
});

await step("SC14-own-role-blocked", async () => {
  await go(`${S}/roles/demo-school-a-role-admin`);
  return { callout: await page.getByText("Bạn đang giữ mẫu quyền này").count(), disabled: await page.locator("input[type=checkbox]:disabled").count() };
});

await step("SC08-add-subject", async () => {
  await go(`${S}/dictionaries?tab=subject`);
  await page.getByRole("button", { name: "Thêm môn học" }).click();
  await page.getByRole("dialog").getByLabel("Mã").fill("TOAN");
  await page.getByRole("dialog").getByLabel("Tên").fill("Toán nâng cao");
  await page.getByRole("dialog").getByRole("button", { name: "Thêm" }).click();
  await page.waitForTimeout(1200);
  const dup = await page.getByRole("dialog").getByText("Mã đã tồn tại").count();
  await page.getByRole("dialog").getByLabel("Mã").fill("TOANNC");
  await page.getByRole("dialog").getByRole("button", { name: "Thêm" }).click();
  return { dupError: dup, toast: await toast() };
});

await step("SC06-holiday-and-term-overlap", async () => {
  await go(`${S}/academic-years/y-a-2026/calendar`);
  await page.getByRole("button", { name: "Sửa mốc" }).first().click();
  await page.getByRole("dialog").getByLabel("Ngày kết thúc").fill("20/01/2027");
  await page.getByRole("dialog").getByLabel("Ngày kết thúc").press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Lưu mốc học kỳ" }).click();
  await page.waitForTimeout(1300);
  const overlap = await page.getByRole("dialog").getByText(/Chồng thời gian/).count();
  await page.getByRole("dialog").getByRole("button", { name: "Hủy" }).click();
  await page.waitForTimeout(400);
  const discard = await page.getByRole("button", { name: "Bỏ thay đổi" }).count();
  if (discard) await page.getByRole("button", { name: "Bỏ thay đổi" }).click();
  return { overlap, dirtyPrompt: discard };
});

await step("SC02-save-profile", async () => {
  await go(`${S}/profile`);
  await page.getByLabel("Giới thiệu ngắn").fill("Trường <b>Bình Minh</b>");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await page.waitForTimeout(500);
  const htmlBlocked = await page.getByText(/Không chèn mã HTML/).count();
  await page.getByLabel("Giới thiệu ngắn").fill("Trường THPT Bình Minh đồng hành cùng học sinh.");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  return { htmlBlocked, toast: await toast() };
});

console.log(JSON.stringify({ consoleErrors: errors.slice(0, 8) }));
await browser.close();
