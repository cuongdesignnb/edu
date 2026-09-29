import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(() => { const v = JSON.stringify({ actor: { kind: "staff", userId: "u-lan" }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" }); sessionStorage.setItem("edumanage-demo-session", v); });
const p = await c.newPage();
await p.goto("http://localhost:3000" + process.argv[2], { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { if (e.getBoundingClientRect().right <= 391) return false; for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "hidden" || o === "scroll" || o === "clip") return false; } return true; }).slice(0, 10).map((e) => `${e.tagName}.${String(e.className).slice(0, 90)} r=${Math.round(e.getBoundingClientRect().right)} pos=${getComputedStyle(e).position} txt=${(e.textContent || "").slice(0, 30)}`).join(" || ")));
await b.close();
