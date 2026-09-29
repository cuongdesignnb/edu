// QA helper for the school-org group (drawers/modals/panels).
// Usage: node scripts/qa-school-org.mjs <path> <out.png> [--as=u-hanh] [--w=1448] [--h=1086] [--wait=ms] [--full]
//        [--click="sel1||sel2"] [--fill="sel=>value||sel2=>value2"]  (clicks run first, then fills, then a final screenshot)
// Same session setup and Edge channel as scripts/shot.mjs. Dev server must run on :3000.
import { chromium } from "@playwright/test";
const args = Object.fromEntries(process.argv.slice(4).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
const [path, out] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge" });
const w = Number(args.w ?? 1448);
const ctx = await browser.newContext({ viewport: { width: w, height: Number(args.h ?? 1086) }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
if (args.as) {
  const [kind, userId] = String(args.as).includes(":") ? String(args.as).split(":") : ["staff", String(args.as)];
  const s = JSON.stringify({ actor: { kind, userId }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
  await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
}
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(base + path, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(args.wait ?? 2500));
for (const sel of String(args.click ?? "").split("||").filter(Boolean)) {
  await page.locator(sel).first().click({ timeout: 8000 });
  await page.waitForTimeout(900);
}
for (const pair of String(args.fill ?? "").split("||").filter(Boolean)) {
  const [sel, value] = pair.split("=>");
  await page.locator(sel).first().fill(value, { timeout: 8000 });
  await page.waitForTimeout(300);
}
await page.waitForTimeout(600);
await page.screenshot({ path: out, fullPage: !!args.full });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ path, out, overflowX: overflow, errors: errors.slice(0, 5) }));
await browser.close();
