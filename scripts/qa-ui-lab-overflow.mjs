// Lists elements that stick out horizontally (group ui-lab). Usage: node scripts/qa-ui-lab-overflow.mjs <path> [as] [width]
import { chromium } from "@playwright/test";
const [path, as = "u-hanh", w = "390"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: 844 } });
const kind = as.includes(":") ? as.split(":")[0] : "staff"; const uid = as.split(":").pop();
const s = JSON.stringify({ actor: { kind, userId: uid }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); localStorage.setItem("edumanage-demo-session-last", v); }, s);
const page = await ctx.newPage();
await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const W = document.documentElement.clientWidth; const res = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && r.width > 0) {
      let p = el.parentElement, clipped = false;
      while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1) { clipped = true; break; } } p = p.parentElement; }
      if (!clipped) res.push(`${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} text=${(el.textContent || "").slice(0, 40)}`);
    }
  }
  return res.slice(0, 15);
});
console.log(out.join("\n"));
await browser.close();
