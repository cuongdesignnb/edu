import { test, expect } from "@playwright/test";
import screens from "../../manifests/screens.json";
import { asPersona, openParentLink, settle, type PersonaSpec } from "./helpers";

/** Q48 — every internal link rendered on every core/internal route points to an existing route (no 404). */
const FIXTURE: Record<string, string> = {
  schoolId: "demo-school-a", yearId: "y-a-2026", classId: "c-a-10a1", memberId: "m-a-lan", roleId: "demo-school-a-role-homeroom",
  studentId: "demo-student-a-001", guardianId: "gd-2", accessId: "pa-minhanh-me", importId: "imp-2", ruleSetId: "rs-a-3",
  reportType: "attendance", ticketId: "tk-2", inviteId: "inv-b-lan", publicationId: "snap-c-a-10a1-w4-v1", activityId: "act-1",
  periodId: "y-a-2026-w4", schoolSlug: "binh-minh", announcementId: "an-1",
};
const href = (route: string) => route.replace(/:([A-Za-z]+)/g, (_, k: string) => FIXTURE[k] ?? k);
function persona(route: string): PersonaSpec {
  if (route.startsWith("/platform")) return { kind: "platform", userId: "u-bao" };
  if (route.startsWith("/school/")) return { kind: "staff", userId: "u-hanh" };
  if (route.startsWith("/teacher/") || route.startsWith("/classroom/") || ["/account", "/notifications", "/choose-school"].some((x) => route.startsWith(x))) return { kind: "staff", userId: "u-lan" };
  if (route.startsWith("/p/")) return { kind: "parent", token: "demo-minhanh-me", slug: "binh-minh" };
  return { kind: "public" };
}

const groups = new Map<string, string[]>();
for (const s of screens as { route: string; scope: string }[]) {
  if (s.scope === "optional" || s.route === "/*" || s.route.endsWith("/access")) continue;
  const p = persona(s.route);
  const key = p.kind === "parent" ? "parent" : p.kind === "public" ? "public" : `${p.kind}:${p.userId}`;
  groups.set(key, [...(groups.get(key) ?? []), href(s.route)]);
}

for (const [key, routes] of groups) {
  test(`internal links resolve — ${key}`, async ({ page, context, request }) => {
    test.setTimeout(600_000);
    const p = persona(routes[0].startsWith("/p/") ? "/p/" : routes[0]);
    await asPersona(context, p);
    if (p.kind === "parent") await openParentLink(page, p.slug, p.token);
    const found = new Map<string, string>();
    for (const r of routes) {
      await page.goto(r);
      await settle(page).catch(() => undefined);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
      for (const h of hrefs) {
        if (!h.startsWith("/") || h === "/khong-ton-tai-demo" /* intentional ST28 demo */ || h.startsWith("//") || h.startsWith("/preview-references/") || h.startsWith("/assets/")) continue;
        const path = h.split("#")[0].split("?")[0];
        if (!found.has(path)) found.set(path, r);
      }
    }
    const broken: string[] = [];
    for (const [path, from] of found) {
      const res = await request.get(path, { maxRedirects: 0 });
      if (res.status() === 404) broken.push(`${path}  (từ ${from})`);
    }
    expect(broken, broken.join("\n")).toEqual([]);
  });
}
