// QA flows for group teacher-class-1 (TE01–TE06, CL02–CL05, CL13–CL16).
// Usage: node scripts/qa-teacher-class-1-flows.mjs [flowName ...]
// Uses Edge like scripts/shot.mjs; each flow runs in a fresh context (fresh demo data).
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const out = (n) => `D:/Edu/qa/screenshots/${n}.png`;
const C = "/classroom/demo-school-a/y-a-2026/c-a-10a1";
const browser = await chromium.launch({ channel: "msedge" });

async function page(as = "u-lan", w = 1448, h = 1086) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
  const s = JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") p.errors.push(m.text()); });
  return p;
}
const log = (name, p, extra = {}) => console.log(JSON.stringify({ flow: name, errors: p.errors.slice(0, 3), ...extra }));
const go = async (p, path) => { await p.goto(base + path, { waitUntil: "networkidle", timeout: 90000 }); await p.waitForTimeout(1500); };
const text = (p, sel) => p.locator(sel).first().innerText();

const flows = {
  // CL04: change one row, check chips, save, see linked conduct; then bulk confirm dialog.
  async attendance() {
    const p = await page();
    await go(p, `${C}/attendance`);
    const row = p.locator("tbody tr").nth(2);
    await row.getByRole("radio", { name: "Nghỉ không phép" }).click();
    const chips = await text(p, 'ul[aria-label^="Tổng"]');
    await p.screenshot({ path: out("CL04-edit-unsaved") });
    await p.getByRole("button", { name: /Lưu điểm danh \(1 thay đổi\)/ }).first().click();
    await p.waitForTimeout(2500);
    const linked = await row.innerText();
    await p.screenshot({ path: out("CL04-saved") });
    // bulk: select page, set Có mặt
    await p.getByRole("checkbox", { name: "Chọn tất cả học sinh trên trang này" }).check();
    await p.locator('[role="status"]').getByRole("button", { name: "Có mặt", exact: true }).click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: out("O16-bulk-confirm") });
    const dialog = await text(p, '[role="dialog"]');
    log("attendance", p, { chips: chips.replace(/\n/g, " "), linkedRow: linked.replace(/\n/g, " ").slice(0, 160), dialog: dialog.replace(/\n/g, " ").slice(0, 260) });
  },
  async publish() {
    const p = await page();
    await go(p, `${C}/attendance`);
    await p.getByRole("button", { name: "Công bố cho phụ huynh" }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: out("CL04-publish-confirm") });
    await p.locator('[role="dialog"]').getByRole("button", { name: "Công bố" }).click();
    await p.waitForTimeout(2500);
    const badge = await text(p, "main h2 >> xpath=ancestor::div[contains(@class,'card-header')]");
    // edit a published row → reason dialog
    await p.locator("tbody tr").nth(0).getByRole("radio", { name: "Đi muộn" }).click();
    await p.getByRole("button", { name: /Lưu điểm danh \(1/ }).first().click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: out("O15-edit-published-reason") });
    await p.locator('[role="dialog"] textarea').fill("Học sinh đến muộn, cập nhật lại");
    await p.locator('[role="dialog"]').getByRole("button", { name: "Lưu thay đổi" }).click();
    await p.waitForTimeout(2500);
    await p.locator("tbody tr").nth(0).getByRole("button", { name: /Lịch sử/ }).click();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out("CL04-history-drawer") });
    const drawer = await text(p, '[role="dialog"]');
    log("publish", p, { header: badge.replace(/\n/g, " "), drawer: drawer.replace(/\n/g, " ").slice(0, 300) });
  },
  async subject() {
    const p = await page("u-hung");
    await go(p, `${C}/attendance`);
    const slot = await p.locator("#att-slot").inputValue();
    await p.screenshot({ path: out("CL04-subject-desktop") });
    await go(p, `${C}/students`);
    const head = await text(p, "thead");
    await p.screenshot({ path: out("CL02-subject-desktop") });
    log("subject", p, { slot, rosterHeader: head.replace(/\n/g, " | ") });
  },
  async mobile() {
    const p = await page("u-lan", 390, 844);
    for (const [path, name] of [[`${C}/attendance`, "CL04"], [`${C}/students`, "CL02"], ["/teacher/demo-school-a", "TE01"]]) {
      await go(p, path);
      await p.screenshot({ path: out(`${name}-mobile`) });
      const ox = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      log(`mobile ${name}`, p, { overflowX: ox });
    }
  },
  async seating() {
    const p = await page();
    await go(p, `${C}/seating`);
    await p.getByRole("button", { name: "Vũ Tuấn Anh" }).click();
    await p.getByRole("button", { name: /^Hàng 8, ghế 1: trống/ }).click();
    await p.getByRole("button", { name: /^Hàng 1, ghế 1:/ }).click();
    await p.getByRole("button", { name: /^Hàng 1, ghế 2:/ }).click();
    await p.screenshot({ path: out("CL14-edited") });
    const r11 = await p.getByRole("button", { name: /^Hàng 1, ghế 1:/ }).getAttribute("aria-label");
    await p.getByRole("button", { name: "Hoàn tác" }).click();
    const r11b = await p.getByRole("button", { name: /^Hàng 1, ghế 1:/ }).getAttribute("aria-label");
    await p.getByRole("button", { name: "Làm lại" }).click();
    await p.getByRole("button", { name: /Lưu phiên bản 2/ }).click();
    await p.waitForTimeout(2500);
    const hist = await text(p, "section:has(h2:text('Lịch sử phiên bản'))");
    log("seating", p, { afterSwap: r11, afterUndo: r11b, history: hist.replace(/\n/g, " ").slice(0, 200) });
  },
  async groups() {
    const p = await page();
    await go(p, `${C}/groups`);
    await p.getByRole("button", { name: /^Vũ Tuấn Anh/ }).click();
    await p.getByRole("button", { name: /Chuyển Anh vào đây/ }).first().click();
    await p.waitForTimeout(2500);
    // duplicate position error
    const sel = p.getByLabel("Chọn học sinh cho Lớp trưởng");
    await sel.selectOption({ index: 3 });
    await p.locator("div.rounded-xl:has(b:text-is('Lớp trưởng'))").getByRole("button", { name: "Giao chức vụ" }).click();
    await p.waitForTimeout(2500);
    await p.screenshot({ path: out("CL13-duplicate-error"), fullPage: true });
    const err = await p.locator("div.rounded-xl:has(b:text-is('Lớp trưởng')) [role=alert]").innerText().catch(() => "");
    log("groups", p, { duplicateError: err });
  },
  async timetable() {
    const p = await page();
    await go(p, `${C}/timetable`);
    await p.getByRole("button", { name: /^Đổi tiết 3 Thứ Ba/ }).first().click();
    await p.waitForTimeout(600);
    await p.getByLabel("Giáo viên dạy thay").selectOption({ label: "Thầy Trần Văn Minh" }).catch(async () => { await p.getByLabel("Giáo viên dạy thay").selectOption({ index: 2 }); });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out("O25-lesson-change") });
    const d = await text(p, '[role="dialog"]');
    log("timetable", p, { drawer: d.replace(/\n/g, " ").slice(0, 400) });
  },
  async duties() {
    const p = await page();
    await go(p, `${C}/duties`);
    await p.getByLabel("Chọn học sinh").selectOption({ label: "Nguyễn Minh Anh" });
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Phân công" }).click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: out("O26-duty-drawer") });
    await p.locator('[role="dialog"]').getByRole("button", { name: "Công bố" }).click();
    await p.waitForTimeout(500);
    const errs = await text(p, '[role="dialog"] [role="alert"]').catch(() => "");
    log("duties", p, { validation: errs.replace(/\n/g, " ") });
  },
  async announcements() {
    const p = await page();
    await go(p, "/teacher/demo-school-a/announcements");
    await p.locator("main li button").first().click();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out("TE05-drawer") });
    log("announcements", p, {});
  },
  async transfer() {
    const p = await page();
    await go(p, `${C}/students`);
    await p.getByRole("button", { name: "Thao tác cho Trịnh Ngọc Anh" }).click();
    await p.getByRole("menuitem", { name: /Đề nghị chuyển lớp/ }).click();
    await p.waitForTimeout(1200);
    await p.locator('[role="dialog"]').getByRole("button", { name: "Gửi đề nghị" }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: out("O11-transfer-validation") });
    log("transfer", p, {});
  },
  async weekly() {
    const p = await page();
    await go(p, `${C}/attendance/weekly`);
    await p.locator("tbody button").nth(3).click();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out("CL05-cell-drawer") });
    log("weekly", p, {});
  },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(flows);
for (const n of names) {
  try { await flows[n](); } catch (e) { console.log(JSON.stringify({ flow: n, failed: String(e).slice(0, 400) })); }
}
await browser.close();
