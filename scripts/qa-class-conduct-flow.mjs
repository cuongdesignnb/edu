// F03 → F05 end-to-end in the UI with persona switching (fresh browser context = fresh seed).
// Usage: node scripts/qa-class-conduct-flow.mjs   (dev server on :3000, Microsoft Edge installed)
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:3000";
const OUT = "D:/Edu/qa/screenshots";
const C = "/classroom/demo-school-a/y-a-2026/c-a-10a1";
const MINHANH = "demo-student-a-001";
const W5 = "y-a-2026-w5";
const log = (...a) => console.log("[flow]", ...a);

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

async function as(userId) {
  if (page.url() === "about:blank") await page.goto(base + "/demo", { waitUntil: "domcontentloaded" });
  await page.evaluate((u) => {
    const v = JSON.stringify({ actor: { kind: "staff", userId: u }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
    sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v);
  }, userId);
  log("persona", userId);
}
async function go(path, wait = 1800) { await page.goto(base + path, { waitUntil: "networkidle" }); await page.waitForTimeout(wait); }
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
async function parent(label) {
  await page.goto(base + "/p/binh-minh/access?t=demo-minhanh-me", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.goto(base + "/p/binh-minh/conduct", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  const t = (await page.locator("main").innerText().catch(() => page.locator("body").innerText())).replace(/\s+/g, " ");
  const m = t.match(/Tuần 5[^]{0,160}/);
  log(`parent ${label}:`, m ? m[0] : "Tuần 5 không hiển thị", "| contains 97:", /b97b/.test(t), "| contains 102:", /b102b/.test(t));
  await shot(`F03-parent-${label}`);
}
const dialog = () => page.getByRole("dialog").last();
async function toastText() { await page.waitForTimeout(700); return (await page.locator("[role=status],[role=alert]").allInnerTexts()).join(" | ").slice(0, 300); }

// 1. u-lan records Minh Anh late −5
await as("u-lan");
await go(`${C}/conduct?hs=${MINHANH}`, 2500);
await page.getByRole("button", { name: "Ghi nhận Đi muộn cho Nguyễn Minh Anh" }).click();
await dialog().getByLabel(/Nội dung sự việc/).fill("Đến lớp lúc 07:12, tiết 1");
await page.waitForTimeout(300);
await shot("O17-record-form");
await dialog().getByTestId("record-submit").click();
log("u-lan late:", await toastText());

// 1b. hard duplicate — Trần Bảo Châu already late from attendance today
await page.locator("button[role=combobox]").first().click();
await page.getByPlaceholder("Tìm…").fill("Trần Bảo Châu");
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Ghi nhận Đi muộn cho Trần Bảo Châu" }).click();
await dialog().getByLabel(/Nội dung sự việc/).fill("Đi muộn buổi sáng");
await dialog().getByTestId("record-submit").click();
await page.waitForTimeout(1200);
await shot("O18-duplicate-hard");
log("hard dup dialog:", (await dialog().innerText()).slice(0, 120).replace(/\n/g, " "));
await dialog().getByRole("button", { name: "Đã hiểu, không lưu" }).click();
await page.waitForTimeout(500);

// 1c. soft duplicate — Hoàng Gia Huy uniform (already recorded twice today)
await page.locator("button[role=combobox]").first().click();
await page.getByPlaceholder("Tìm…").fill("Hoàng Gia Huy");
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Ghi nhận Không đồng phục cho Hoàng Gia Huy" }).click();
await dialog().getByLabel(/Nội dung sự việc/).fill("Không mặc đồng phục");
await dialog().getByTestId("record-submit").click();
await page.waitForTimeout(1200);
await dialog().getByRole("button", { name: "Đây là sự việc khác" }).click();
await page.waitForTimeout(300);
await shot("O18-duplicate-soft");
await dialog().getByRole("button", { name: "Hủy, giữ ghi nhận cũ" }).click();
await page.waitForTimeout(500);

// 2. u-hung (subject teacher) records +2 for Minh Anh
await as("u-hung");
await go(`${C}/conduct?hs=${MINHANH}`, 2500);
await page.getByRole("button", { name: "Ghi nhận Tích cực phát biểu cho Nguyễn Minh Anh" }).click();
await dialog().getByLabel(/Nội dung sự việc/).fill("Tích cực phát biểu giờ Toán");
await dialog().getByTestId("record-submit").click();
log("u-hung speak:", await toastText());
await shot("CL06-u-hung");

// Parent before publish
await parent("before-publish");

// 3. u-lan reviews: void duplicate, approve rest
await as("u-lan");
await go(`${C}/conduct/review?week=${W5}`, 2500);
await page.getByTestId("void-btn").nth(1).click();
await dialog().getByLabel(/Lý do loại/).fill("Trùng với ghi nhận của cô chủ nhiệm cùng buổi sáng");
await dialog().getByRole("button", { name: "Loại bản này" }).click();
log("void:", await toastText());
await page.waitForTimeout(1200);
await page.getByLabel("Chọn tất cả dòng trên trang này").check();
await page.waitForTimeout(300);
await page.getByTestId("bulk-approve").click();
log("approve:", await toastText());
await page.waitForTimeout(1500);
log("checks:", (await page.getByTestId("checks").innerText()).replace(/\n/g, " | "));

// 4. lock only
await page.getByTestId("btn-lock").click();
await page.waitForTimeout(500);
await shot("O20-lock");
await dialog().getByTestId("publish-confirm").click();
log("lock:", await toastText());
await page.waitForTimeout(1500);
await shot("CL08-locked-ST16");
await parent("after-lock");

// 5. publish
await go(`${C}/conduct/review?week=${W5}`, 2500);
await page.getByTestId("btn-publish").click();
await page.waitForTimeout(500);
await shot("O20-publish");
await dialog().getByTestId("publish-confirm").click();
log("publish:", await toastText());
await page.waitForTimeout(1200);

// 6. weekly shows 97 + O19
await go(`${C}/conduct/weekly?week=${W5}`, 2500);
await page.getByLabel("Tìm học sinh trong bảng thi đua").fill("Minh Anh");
await page.waitForTimeout(500);
log("weekly row:", (await page.locator("tbody tr").first().innerText()).replace(/\s+/g, " "));
await page.getByRole("button", { name: "Xem giải trình điểm của Nguyễn Minh Anh" }).click();
await page.waitForTimeout(700);
log("formula:", await page.getByTestId("explain-formula").innerText());
await shot("O19-explain");
await page.keyboard.press("Escape");
await parent("after-publish");

// 7. u-lan requests adjustment removing the −5
await as("u-lan");
await go(`${C}/adjustments`, 2500);
await page.getByTestId("btn-new-adjustment").click();
await page.waitForTimeout(800);
const d = dialog();
const snapSel = d.getByLabel(/Bản đang công bố/);
const optVal = await snapSel.locator("option", { hasText: "Tuần 5 — bản 1" }).getAttribute("value");
await snapSel.selectOption(optVal);
await page.waitForTimeout(800);
await d.locator("button[role=combobox]").click();
await page.getByPlaceholder("Tìm…").fill("Nguyễn Minh Anh");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const recSel = d.getByLabel(/Ghi nhận trong bản công bố/);
const recVal = await recSel.locator("option", { hasText: "Đi muộn" }).getAttribute("value");
await recSel.selectOption(recVal);
await d.getByLabel(/Lý do điều chỉnh/).fill("Ghi nhận đi muộn nhầm học sinh, em đến đúng giờ");
await page.waitForTimeout(600);
log("O21 preview:", (await d.getByTestId("adj-preview").innerText()).replace(/\s+/g, " "));
await shot("O21-adjustment");
await d.getByTestId("adj-submit").click();
log("request:", await toastText());

// 8. u-dung approves
await as("u-dung");
await go(`${C}/adjustments`, 2500);
await page.getByTestId("adj-approve").first().click();
await page.waitForTimeout(400);
await dialog().getByRole("button", { name: "Duyệt và tạo bản mới" }).click();
log("approve adj:", await toastText());
await page.waitForTimeout(1200);
await shot("CL11-approved");

// 9. u-lan re-publishes
await as("u-lan");
await go(`${C}/adjustments`, 2500);
await page.getByTestId("adj-publish").first().click();
await page.waitForTimeout(400);
await dialog().getByRole("button", { name: "Công bố lại" }).click();
log("republish:", await toastText());
await page.waitForTimeout(1200);

// 10. CL09 / CL10
await go(`${C}/publications`, 2500);
log("publications:", (await page.locator("tbody").innerText()).split("\n").slice(0, 12).join(" | "));
await shot("CL09-after-flow");
await page.getByRole("link", { name: "Tuần 5" }).first().click();
await page.waitForTimeout(2500);
log("versions:", (await page.getByTestId("versions").innerText()).replace(/\n/g, " | "));
log("diff:", (await page.getByTestId("diff").innerText().catch(() => "none")).replace(/\n/g, " | "));
await shot("CL10-desktop");
await parent("after-republish");

log("errors:", JSON.stringify(errors.slice(0, 8)));
await browser.close();
