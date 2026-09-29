// F06 + Q29: a revoked link stops working in an already-open parent tab; the other guardian's link keeps working;
// an announcement for another student is not found. Uses a fresh browser profile (its own IndexedDB).
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const OUT = "D:/Edu/qa/screenshots";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
const staffSession = JSON.stringify({ actor: { kind: "staff", userId: "u-lan" }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
await ctx.addInitScript((v) => { localStorage.setItem("edumanage-demo-session-last", v); }, staffSession);
const errors = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) process.exitCode = 1; };

// 1. Parent tab (mẹ) opens the link and reads a page.
const parent = await ctx.newPage();
parent.on("pageerror", (e) => errors.push(String(e)));
await parent.goto(`${base}/p/binh-minh/access?t=demo-minhanh-me`, { waitUntil: "load" });
await parent.waitForURL(/\/overview$/, { timeout: 60000 });
check("token removed from address bar", !parent.url().includes("t="), parent.url());
await parent.getByRole("heading", { name: "Thông tin của con" }).waitFor({ timeout: 30000 });
await parent.getByText("Nguyễn Minh Anh").filter({ visible: true }).first().waitFor();
check("parent overview shows the child", true);

// Q29: announcement of another student → not found.
await parent.goto(`${base}/p/binh-minh/announcements/an-9`, { waitUntil: "load" });
await parent.getByText("Không tìm thấy nội dung").waitFor({ timeout: 30000 });
const leaked = await parent.getByText("Bảo Châu").count();
check("Q29 an-9 shows not-found without content", leaked === 0);

// 2. Staff (u-lan) revokes the mother's link through the SC24 UI in another tab of the same profile.
const staff = await ctx.newPage();
await staff.goto(`${base}/school/demo-school-a/parent-access/pa-minhanh-me`, { waitUntil: "load" });
await staff.getByRole("button", { name: "Thu hồi", exact: true }).click({ timeout: 60000 });
const dialog = staff.getByRole("dialog");
await dialog.getByRole("textbox").fill("Kiểm thử F06: link bị chuyển tiếp nhầm");
await dialog.getByRole("button", { name: "Thu hồi link" }).click();
await staff.getByText("Đã thu hồi link").first().waitFor({ timeout: 30000 });
check("staff revoked pa-minhanh-me via UI", true);

// 3. The open parent tab navigates (client-side) → must land on access-unavailable?reason=revoked.
await parent.bringToFront();
await parent.waitForTimeout(1500);
console.log("parent tab URL right after revoke:", parent.url().replace(base, ""));
if (!/access-unavailable/.test(parent.url())) await parent.locator('aside a[href="/p/binh-minh/conduct"]').click();
await parent.waitForURL(/access-unavailable\?reason=revoked/, { timeout: 30000 });
await parent.getByRole("heading", { name: "Đường dẫn đã bị thu hồi" }).waitFor();
const pii = await parent.getByText("Nguyễn Minh Anh").count();
check("open parent tab lands on reason=revoked without student data", pii === 0, parent.url());
await parent.screenshot({ path: `${OUT}/F06-parent-revoked.png` });

// 4. The father's link still works (a fresh tab = fresh per-tab token).
const father = await ctx.newPage();
await father.goto(`${base}/p/binh-minh/access?t=demo-minhanh-bo`, { waitUntil: "load" });
await father.waitForURL(/\/overview$/, { timeout: 60000 });
await father.getByText("Nguyễn Minh Anh").filter({ visible: true }).first().waitFor({ timeout: 30000 });
await father.goto(`${base}/p/binh-minh/conduct`, { waitUntil: "load" });
await father.getByText("Các tuần đã công bố").waitFor({ timeout: 30000 });
check("demo-minhanh-bo still works after revoking the mother's link", true);
await father.screenshot({ path: `${OUT}/F06-father-still-works.png` });

// 5. Re-opening the revoked link → PA14 revoked.
const again = await ctx.newPage();
await again.goto(`${base}/p/binh-minh/access?t=demo-minhanh-me`, { waitUntil: "load" });
await again.waitForURL(/reason=revoked/, { timeout: 60000 });
check("re-opening the revoked link → reason=revoked", true);

console.log(JSON.stringify({ pageErrors: errors.slice(0, 5) }));
await browser.close();
