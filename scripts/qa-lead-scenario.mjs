import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" }); const c = await b.newContext();
await c.addInitScript(() => localStorage.setItem("edumanage-demo-scenario", JSON.stringify({ write: "offline", read: "normal", latencyMs: 180 })));
const p = await c.newPage(); const errs = []; p.on("console", m => m.type()==="error" && errs.push(m.text()));
await p.goto("http://localhost:3000/demo"); await p.waitForTimeout(4000);
console.log(await p.locator("text=Đang mô phỏng mất mạng").count(), errs.slice(0,2)); await b.close();
