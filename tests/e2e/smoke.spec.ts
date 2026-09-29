import { test, expect } from "@playwright/test";
import screens from "../../manifests/screens.json";
import { asPersona, collectErrors, hasMojibake, horizontalOverflow, openParentLink, settle, type PersonaSpec } from "./helpers";

/**
 * Q02 / Q05 / Q06 / Q47 — every core + internal route opens with a valid fixture and the
 * right persona, at desktop and phone width: no unintended 404, no runtime error, no
 * horizontal body overflow, no mojibake. Optional EX01–EX03 must NOT be reachable (Q44).
 */
const FIXTURE: Record<string, string> = {
  schoolId: "demo-school-a", yearId: "y-a-2026", classId: "c-a-10a1", memberId: "m-a-lan", roleId: "demo-school-a-role-homeroom",
  studentId: "demo-student-a-001", guardianId: "gd-2", accessId: "pa-minhanh-me", importId: "imp-2", ruleSetId: "rs-a-3",
  reportType: "attendance", ticketId: "tk-2", inviteId: "inv-b-lan", publicationId: "snap-c-a-10a1-w4-v1", activityId: "act-1",
  periodId: "y-a-2026-w4", schoolSlug: "binh-minh", announcementId: "an-1",
};
const OVERRIDE: Record<string, Record<string, string>> = { CL23: { announcementId: "an-7" }, PA11: { announcementId: "an-8" } };

function href(id: string, route: string) {
  if (route === "/*") return "/khong-ton-tai-demo";
  const p = { ...FIXTURE, ...(OVERRIDE[id] ?? {}) };
  return route.replace(/:([A-Za-z]+)/g, (_, k: string) => p[k] ?? k);
}
function persona(id: string, route: string): PersonaSpec {
  if (route.startsWith("/platform")) return { kind: "platform", userId: "u-bao" };
  if (route.startsWith("/school/")) return { kind: "staff", userId: "u-hanh" };
  if (route.startsWith("/teacher/") || route.startsWith("/classroom/")) return { kind: "staff", userId: "u-lan" };
  if (route.startsWith("/p/")) return { kind: "parent", token: "demo-minhanh-me", slug: "binh-minh" };
  if (["/account", "/notifications", "/choose-school"].some((x) => route.startsWith(x))) return { kind: "staff", userId: "u-lan" };
  return { kind: "public" };
}

const VIEWPORTS = [{ name: "desktop", width: 1448, height: 1086 }, { name: "mobile", width: 390, height: 844 }];
const list = (screens as { id: string; route: string; scope: string; title: string }[]).filter((s) => s.scope !== "optional");

for (const vp of VIEWPORTS) {
  test.describe(`smoke ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const s of list) {
      test(`${s.id} ${s.title}`, async ({ page, context }) => {
        const p = persona(s.id, s.route);
        await asPersona(context, p);
        const errors = collectErrors(page);
        const url = href(s.id, s.route);
        if (p.kind === "parent" && s.id !== "PA01" && s.id !== "PA14") await openParentLink(page, p.slug, p.token);
        if (s.id === "PA01") { await openParentLink(page, "binh-minh", "demo-minhanh-me"); await expect(page).toHaveURL(/\/p\/binh-minh\/overview$/); }
        else {
          const res = await page.goto(s.id === "PA14" ? `${url}?reason=revoked` : url);
          if (s.id === "SY08") expect(res?.status()).toBe(404);
          else expect(res?.status(), `HTTP status for ${url}`).toBeLessThan(400);
        }
        await settle(page);
        const body = await page.locator("body").innerText();
        // DV06 intentionally demonstrates the 404 state (ST28); SY08 is the 404 page itself.
        if (s.id !== "SY08" && s.id !== "DV06") expect(body).not.toMatch(/404|This page could not be found/);
        expect(await horizontalOverflow(page), "horizontal overflow (px)").toBeLessThanOrEqual(1);
        expect(await hasMojibake(page), "mojibake").toBe(false);
        if (s.route.startsWith("/p/")) {
          expect(await page.locator("input[type=password]").count(), "no password field on parent pages").toBe(0);
          expect(body).not.toMatch(/Đăng ký tài khoản|Nhắn tin|Gửi tin nhắn|Kết quả học tập/);
        }
        expect(errors.filter((e) => !(s.id === "SY08" && (e.startsWith("404") || /status of 404/.test(e)))), errors.join("\n")).toEqual([]);
      });
    }
  });
}

test("Q44 optional academic-results routes are off", async ({ page, context }) => {
  await asPersona(context, { kind: "staff", userId: "u-hanh" });
  for (const u of ["/school/demo-school-a/academic-results", "/classroom/demo-school-a/y-a-2026/c-a-10a1/academic-results"]) {
    const r = await page.goto(u);
    expect(r?.status()).toBe(404);
  }
});
