// Parent portal screenshots: opens the private link first (token stored per tab), then navigates.
// Usage: node scripts/qa-parent-shots.mjs [filter]   (Dev server on :3000, Edge installed)
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "D:/Edu/qa/screenshots";
const filter = process.argv[2];

// [id, slug, token, path (after /p/slug), options]
const SHOTS = [
  ["PA01", "binh-minh", null, "/access?t=demo-minhanh-me", { raw: true, early: 2500, slow: true }],
  ["PA02", "binh-minh", "demo-minhanh-me", "/overview"],
  ["PA03", "binh-minh", "demo-minhanh-me", "/attendance"],
  ["PA04", "binh-minh", "demo-minhanh-me", "/conduct"],
  ["PA05", "binh-minh", "demo-minhanh-me", "/conduct/y-a-2026-w4"],
  ["PA06", "binh-minh", "demo-minhanh-me", "/timetable"],
  ["PA07", "binh-minh", "demo-minhanh-me", "/duties"],
  ["PA08", "binh-minh", "demo-minhanh-me", "/activities"],
  ["PA09", "binh-minh", "demo-minhanh-me", "/activities/__first__"],
  ["PA10", "binh-minh", "demo-minhanh-me", "/announcements"],
  ["PA11", "binh-minh", "demo-minhanh-me", "/announcements/an-8"],
  ["PA11-other-student", "binh-minh", "demo-minhanh-me", "/announcements/an-9"],
  ["PA12", "binh-minh", "demo-minhanh-me", "/teachers"],
  ["PA13", "binh-minh", "demo-minhanh-me", "/documents"],
  ["PA02-limited", "binh-minh", "demo-limited", "/overview"],
  ["PA05-limited-module", "binh-minh", "demo-limited", "/conduct"],
  ["PA02-anhoa", "an-hoa", "demo-anhoa-01", "/overview"],
  ["PA12-anhoa", "an-hoa", "demo-anhoa-01", "/teachers"],
  ["PA14-expired", "binh-minh", null, "/access?t=demo-expired", { raw: true }],
  ["PA14-revoked", "binh-minh", null, "/access?t=demo-revoked", { raw: true }],
  ["PA14-invalid", "binh-minh", null, "/access?t=khong-ton-tai", { raw: true }],
  ["PA14-suspended", "tran-phu", null, "/access?t=demo-truong-tam-dung", { raw: true }],
  ["PA14-module", "binh-minh", null, "/access-unavailable?reason=module", { raw: true }],
];

const browser = await chromium.launch({ channel: "msedge" });
const results = [];
for (const [id, slug, token, path, opt = {}] of SHOTS) {
  if (filter && !id.startsWith(filter)) continue;
  for (const [suffix, w, h] of [["desktop", 1448, 1086], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", deviceScaleFactor: 1 });
    if (opt.slow) await ctx.addInitScript(() => localStorage.setItem("edumanage-demo-scenario", JSON.stringify({ write: "normal", read: "slow", latencyMs: 180 })));
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    if (token) {
      await page.goto(`${base}/p/${slug}/access?t=${token}`, { waitUntil: "load" });
      await page.waitForURL(/\/overview$/, { timeout: 60000 });
      await page.waitForTimeout(600);
    }
    let target = path;
    if (target.includes("__first__")) {
      await page.goto(`${base}/p/${slug}/activities`, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      const href = await page.locator('main a[href*="/activities/"]').first().getAttribute("href");
      target = href.replace(`/p/${slug}`, "");
    }
    await page.goto(`${base}/p/${slug}${target}`, { waitUntil: opt.early ? "domcontentloaded" : "load" });
    await page.waitForTimeout(opt.early ?? 2200);
    const file = `${OUT}/${id}-${suffix}${process.env.FULL === "1" ? "-full" : ""}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results.push({ id: `${id}-${suffix}`, url: page.url().replace(base, ""), overflowX, errors: errors.slice(0, 3) });
    await ctx.close();
  }
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
