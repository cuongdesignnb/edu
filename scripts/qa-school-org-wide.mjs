import { chromium } from "@playwright/test";
const [path, as] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((v) => { sessionStorage.setItem("edumanage-demo-session", v); }, JSON.stringify({ actor: { kind: "staff", userId: as }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" }));
const p = await ctx.newPage(); await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
console.log(await p.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > 392).slice(0, 8).map(e => `${e.tagName}.${String(e.className).slice(0, 80)} r=${Math.round(e.getBoundingClientRect().right)}`).join("\n")));
await b.close();
