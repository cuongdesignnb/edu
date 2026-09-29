// QA for class-activities overlays: O27 (Ghi nhận minh chứng), O28 (Xem tệp), review dialog, file upload dialog.
// Usage: node scripts/qa-class-activities-dialogs.mjs  (dev server on :3000, Edge installed)
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const C = "/classroom/demo-school-a/y-a-2026/c-a-10a1";
const out = (n) => `D:/Edu/qa/screenshots/${n}.png`;
const browser = await chromium.launch({ channel: "msedge" });
async function session(w = 1448, h = 1086) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
  const s = JSON.stringify({ actor: { kind: "staff", userId: "u-lan" }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { page, errors };
}
// 1x1 PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQG/1Fq8DQAAAABJRU5ErkJggg==", "base64");
const results = {};
for (const [w, h, suffix] of [[1448, 1086, "desktop"], [390, 844, "mobile"]]) {
  const { page, errors } = await session(w, h);
  await page.goto(`${base}${C}/activities/act-1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Ghi nhận minh chứng" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out(`O27-validation-${suffix}`) });
  await page.locator('input[type=file]').setInputFiles({ name: "minh-chung-test.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out(`O27-${suffix}`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: out(`O27-discard-${suffix}`) });
  await page.goto(`${base}${C}/activities/act-1?tab=evidence`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Xem$/ }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: out(`O28-${suffix}`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Duyệt", exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: out(`review-approve-${suffix}`) });
  await page.keyboard.press("Escape");
  await page.goto(`${base}${C}/files`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Tải tệp lên" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("dialog").getByText("Riêng phụ huynh một em", { exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out(`CL24-upload-${suffix}`) });
  results[suffix] = { overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), errors: errors.slice(0, 5) };
  await page.context().close();
}
console.log(JSON.stringify(results));
await browser.close();
