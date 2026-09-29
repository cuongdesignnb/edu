// QA for /preview/states live save demo (ST05/ST06/ST07/ST08) — group ui-lab.
// Usage: node scripts/qa-ui-lab-live.mjs <outPrefix>
import { chromium } from "@playwright/test";
const prefix = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
const s = JSON.stringify({ actor: { kind: "staff", userId: "u-lan" }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3000/preview/states", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const bio = page.getByLabel("Giới thiệu ngắn");
const stamp = `Thử lưu QA ${Date.now() % 100000}`;
// ST05: next write fails
await page.getByText("Lần lưu kế tiếp lỗi mạng").first().click();
await bio.fill(stamp);
await page.getByRole("button", { name: "Lưu thay đổi" }).click();
await page.waitForTimeout(1200);
await page.locator("#live").screenshot({ path: `${prefix}-st05.png` });
const kept = await bio.inputValue();
// retry → real success (ST07)
await page.getByRole("button", { name: "Lưu thay đổi" }).click();
await page.waitForTimeout(1500);
await page.locator("#live").screenshot({ path: `${prefix}-st07.png` });
// ST08: validation
await page.getByLabel("Họ tên").first().fill("A");
await page.getByRole("button", { name: "Lưu thay đổi" }).click();
await page.waitForTimeout(1200);
await page.locator("#live").screenshot({ path: `${prefix}-st08.png` });
await page.getByRole("button", { name: "Hủy thay đổi" }).click();
await page.waitForTimeout(500);
console.log(JSON.stringify({ keptAfterFailure: kept === stamp, errors: errors.slice(0, 5) }));
await browser.close();
