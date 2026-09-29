// QA for group "auth-platform-system": drives overlays / flows and screenshots them.
// Usage (Git Bash): node scripts/qa-auth-platform-system-flows.mjs [flowName]
// Uses installed Microsoft Edge, dev server on :3000. Each flow runs in a fresh context (fresh demo data).
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:3000";
const OUT = "D:/Edu/qa/screenshots";
const only = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const results = [];

async function ctxFor(as, viewport = { width: 1448, height: 1086 }) {
  const ctx = await browser.newContext({ viewport, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
  if (as) {
    const [kind, userId] = as.includes(":") ? as.split(":") : ["staff", as];
    const s = JSON.stringify({ actor: { kind, userId }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
    await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  }
  return ctx;
}

async function flow(name, as, fn, viewport) {
  if (only && only !== name) return;
  const ctx = await ctxFor(as, viewport);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text()); });
  const shot = async (id) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${id}.png` }); };
  const go = async (p) => { await page.goto(base + p, { waitUntil: "networkidle" }); await page.waitForTimeout(1500); };
  try {
    await fn({ page, shot, go });
    results.push({ name, ok: true, url: page.url(), errors: errors.slice(0, 3) });
  } catch (e) {
    await page.screenshot({ path: `${OUT}/FAIL-${name}.png` }).catch(() => {});
    results.push({ name, ok: false, error: String(e).slice(0, 300), errors: errors.slice(0, 3) });
  }
  await ctx.close();
}

await flow("login", null, async ({ page, shot, go }) => {
  await go("/login");
  await page.getByRole("button", { name: /Đăng nhập \(mô phỏng\)/ }).click();
  await shot("AU01-validation");
  await page.getByLabel("Email công việc").fill("khong-ton-tai@truong.test");
  await page.locator("#login-password").fill("matkhau-bat-ky");
  await page.getByRole("button", { name: /Đăng nhập \(mô phỏng\)/ }).click();
  await page.getByText("Không đăng nhập được").waitFor();
  await shot("AU01-error");
  await page.getByLabel("Email công việc").fill("nam.hv@giaovien.test");
  await page.locator("#login-password").fill("matkhau-bat-ky");
  await page.getByRole("button", { name: /Đăng nhập \(mô phỏng\)/ }).click();
  await page.waitForURL(/choose-school/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot("AU01-success-choose-school");
});

await flow("login-single", null, async ({ page, go }) => {
  await go("/login");
  await page.getByLabel("Email công việc").fill("hanh.nt@binhminh.edu.test");
  await page.locator("#login-password").fill("x");
  await page.getByRole("button", { name: /Đăng nhập \(mô phỏng\)/ }).click();
  await page.waitForURL(/\/school\/demo-school-a/, { timeout: 15000 });
});

await flow("forgot", null, async ({ page, shot, go }) => {
  await go("/forgot-password");
  await page.getByLabel("Email công việc").fill("ai-do@truong.test");
  await page.getByRole("button", { name: /Gửi hướng dẫn/ }).click();
  await page.getByText("Đã ghi nhận yêu cầu").waitFor();
  await shot("AU02-result");
  await page.getByRole("link", { name: /Mở đường dẫn đặt lại/ }).click();
  await page.waitForURL(/reset-password/);
  await page.waitForTimeout(1200);
  await page.locator("#reset-password").fill("abc");
  await page.locator("#reset-confirm").fill("abd");
  await page.getByRole("button", { name: /Đặt lại mật khẩu/ }).click();
  await shot("AU03-validation");
  await page.locator("#reset-password").fill("MatKhauMoi2026");
  await page.locator("#reset-confirm").fill("MatKhauMoi2026");
  await page.getByRole("button", { name: /Đặt lại mật khẩu/ }).click();
  await page.getByText("Đã đặt lại mật khẩu (mô phỏng)").waitFor();
  await shot("AU03-success");
});

await flow("invite-new", null, async ({ page, shot, go }) => {
  await go("/invitations/inv-a-ngoc");
  await page.getByRole("button", { name: "Chấp nhận lời mời" }).click();
  await page.getByText("Bạn đã trở thành thành viên").waitFor();
  await shot("AU04-accepted");
  await page.getByRole("button", { name: /Vào không gian/ }).click();
  await page.waitForURL(/choose-school/);
  await page.waitForTimeout(1500);
  await shot("AU05-new-member-unassigned");
});

await flow("invite-decline", null, async ({ page, shot, go }) => {
  await go("/invitations/inv-b-lan");
  await page.getByRole("button", { name: "Từ chối" }).click();
  await shot("AU04-decline-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Từ chối lời mời" }).click();
  await page.getByText("Bạn đã từ chối lời mời").waitFor();
  await shot("AU04-declined");
});

await flow("session-expire", "u-lan", async ({ page, shot, go }) => {
  await go("/account/security");
  await page.getByRole("button", { name: "Kết thúc phiên demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kết thúc phiên" }).click();
  await page.getByText("Phiên demo đã hết").waitFor();
  await shot("ST11-session-expired");
  await page.getByRole("link", { name: /Đăng nhập lại/ }).click();
  await page.waitForURL(/login/);
  await page.waitForTimeout(1200);
  await shot("ST11-login-after-expire");
});

await flow("profile", "u-lan", async ({ page, shot, go }) => {
  await go("/account/profile");
  await page.getByLabel("Số liên hệ công việc").fill("abc");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await shot("AU06-validation");
  await page.getByLabel("Số liên hệ công việc").fill("0912 *** 111");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await page.getByText("Phiên bản hồ sơ: 2").waitFor();
  await shot("AU06-saved");
});

await flow("notifications", "u-lan", async ({ page, shot, go }) => {
  await go("/notifications");
  await page.getByRole("tab", { name: /Chưa đọc/ }).click();
  await shot("AU09-unread");
  await page.getByRole("button", { name: /Đánh dấu đã đọc \(3\)/ }).click();
  await page.getByText("Bạn đã đọc hết thông báo").waitFor();
  await shot("AU09-all-read");
});

await flow("status-dialog", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/schools/demo-school-a");
  await page.getByRole("button", { name: "Tạm dừng" }).click();
  await shot("O01-suspend-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Hủy" }).click();
  await page.getByRole("button", { name: "Sửa thông tin vận hành" }).click();
  await page.waitForTimeout(600);
  await shot("PL04-edit-drawer");
});

await flow("admins", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/schools/demo-school-a/admins");
  await page.getByRole("button", { name: /Thao tác với Nguyễn Thị Hạnh/ }).click();
  await shot("PL05-last-admin-guard");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Mời quản trị" }).click();
  await page.getByLabel("Họ tên người được mời").fill("Lê Minh Châu");
  await page.getByLabel("Email công việc").fill("chau.lm@binhminh.edu.test");
  await shot("O02-invite-admin");
  await page.getByRole("dialog").getByRole("button", { name: "Tạo lời mời" }).click();
  await page.getByText("chau.lm@binhminh.edu.test").first().waitFor();
  await page.waitForTimeout(800);
  await shot("PL05-after-invite");
  await page.getByRole("button", { name: "Thay quản trị" }).click();
  await shot("O02-replace-admin");
});

await flow("wizard", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/schools/new");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await shot("PL03-validation");
  await page.getByLabel("Tên trường").fill("Trường THCS Nguyễn Du");
  await page.getByLabel("Mã trường").fill("THCS-LQD");
  await page.getByLabel("Tỉnh/thành").fill("TP. Đà Nẵng");
  await page.waitForTimeout(800);
  await shot("PL03-duplicate-code");
  await page.getByLabel("Mã trường").fill("THCS-ND");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await page.getByLabel("Họ tên quản trị").fill("Võ Thanh Tâm");
  await page.getByLabel("Email công việc").fill("tam.vt@nguyen-du.edu.test");
  await shot("PL03-step2");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await shot("PL03-review");
  await page.getByRole("button", { name: /Tạo trường và gửi lời mời/ }).click();
  await page.getByRole("heading", { name: "Đã tạo Trường THCS Nguyễn Du" }).waitFor();
  await page.waitForTimeout(800);
  await shot("PL03-done");
  await page.getByRole("link", { name: "Mở hồ sơ trường" }).click();
  await page.waitForURL(/platform\/schools\/sch-/);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Kích hoạt" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kích hoạt" }).click();
  await page.waitForTimeout(1200);
  await shot("PL04-activate-blocked");
});

await flow("support", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/support-access");
  await page.getByRole("button", { name: /Đề nghị quyền hỗ trợ/ }).first().click();
  await page.waitForTimeout(800);
  await shot("O34-request-support");
  await page.getByRole("dialog").getByRole("button", { name: "Gửi đề nghị" }).click();
  await shot("O34-validation");
  await page.keyboard.press("Escape");
  await go("/platform/support");
  await page.getByRole("button", { name: /Thao tác với Hướng dẫn cấp link/ }).click();
  await page.getByRole("menuitem", { name: /Phân công người xử lý/ }).click();
  await shot("PL06-assign");
  await page.getByRole("dialog").getByRole("button", { name: "Phân công" }).click();
  await page.waitForTimeout(1200);
  await shot("PL06-after-assign");
});

await flow("audit", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/audit");
  await page.getByRole("button", { name: /Xem chi tiết: Tạm dừng trường/ }).click();
  await page.waitForTimeout(600);
  await shot("PL09-detail-drawer");
  await page.keyboard.press("Escape");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Xuất CSV" }).click()]);
  results.push({ name: "audit-csv", file: dl.suggestedFilename() });
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Xuất XLSX" }).click()]);
  results.push({ name: "audit-xlsx", file: dl2.suggestedFilename() });
});

await flow("operations", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/operations");
  await page.getByRole("button", { name: "Khôi phục" }).click();
  await shot("PL10-restore-explained");
});

await flow("settings", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/settings");
  await page.getByLabel("Tên hiển thị").fill("EduManage Việt Nam");
  await page.getByLabel("Email hỗ trợ").fill("sai-email");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await shot("PL11-preview-validation");
});

await flow("maintenance", null, async ({ page, shot, go }) => {
  await go("/maintenance");
  await page.getByRole("button", { name: "Thử lại" }).click();
  await page.getByText("Kết nối lại được").waitFor();
  await shot("SY07-retry-ok");
});

await flow("help-search", null, async ({ page, shot, go }) => {
  await go("/help#quy-trinh-cong-bo");
  await shot("AU10-anchor-publication");
  await page.getByLabel("Tìm trong hướng dẫn").fill("công bố");
  await shot("AU10-search");
});

await flow("mobile-drawer", "platform:u-bao", async ({ page, shot, go }) => {
  await go("/platform/audit");
  await page.getByRole("button", { name: /Xem chi tiết: Tạm dừng trường/ }).click();
  await page.waitForTimeout(600);
  await shot("PL09-detail-drawer-mobile");
}, { width: 390, height: 844 });

console.log(JSON.stringify(results, null, 1));
await browser.close();
