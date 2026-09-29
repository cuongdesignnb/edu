// QA helper for /preview/* (group ui-lab): screenshots a page at several scroll positions and
// optionally clicks elements (by text) to open overlays, then screenshots.
// Usage: node scripts/qa-ui-lab-shots.mjs <path> <outPrefix> [--as=u-hanh] [--w=1448] [--h=1086] [--pages=6] [--click="Text A|Text B"] [--wait=3000]
import { chromium } from "@playwright/test";
const args = Object.fromEntries(process.argv.slice(4).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
const [path, prefix] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge" });
const w = Number(args.w ?? 1448), h = Number(args.h ?? 1086);
const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce", deviceScaleFactor: 1 });
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
await page.waitForTimeout(Number(args.wait ?? 3000));
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const n = Math.min(Number(args.pages ?? 6), Math.ceil(total / h));
const shots = [];
if (!args.click) {
  for (let i = 0; i < n; i++) {
    const y = args.at ? Number(String(args.at).split(",")[i] ?? 0) : i * h;
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(500);
    const out = `${prefix}-${i}.png`;
    await page.screenshot({ path: out });
    shots.push(out);
  }
} else {
  let i = 0;
  for (const text of String(args.click).split("|")) {
    const el = page.getByRole("button", { name: text, exact: false }).first();
    await el.scrollIntoViewIfNeeded();
    await el.click();
    await page.waitForTimeout(Number(args.after ?? 1500));
    const out = `${prefix}-${i++}.png`;
    await page.screenshot({ path: out });
    shots.push(out);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ path, total, shots: shots.length, overflowX: overflow, errors: errors.slice(0, 8) }));
await browser.close();
