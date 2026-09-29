import type { BrowserContext, Page } from "@playwright/test";

export type PersonaSpec = { kind: "platform" | "staff"; userId: string } | { kind: "parent"; token: string; slug: string } | { kind: "public" };

/** Put a demo staff/platform session into the tab before any script runs (not authentication). */
export async function asPersona(context: BrowserContext, p: PersonaSpec) {
  if (p.kind === "platform" || p.kind === "staff") {
    const s = JSON.stringify({ actor: { kind: p.kind, userId: p.userId }, startedAt: "2026-10-05T08:00:00+07:00", via: "demo" });
    await context.addInitScript((v) => {
      window.sessionStorage.setItem("edumanage-demo-session", v);
      window.localStorage.setItem("edumanage-demo-session-last", v);
    }, s);
  }
}

export async function openParentLink(page: Page, slug: string, token: string) {
  await page.goto(`/p/${slug}/access?t=${encodeURIComponent(token)}`);
  await page.waitForURL(new RegExp(`/p/${slug}/(overview|access-unavailable)`), { timeout: 30_000 });
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Next dev overlay noise and intentionally failing demo reads are not app errors.
    if (/Download the React DevTools|\[Fast Refresh\]|webpack-hmr|turbopack-hmr/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|\.map$|__nextjs/.test(r.url())) errors.push(`404: ${r.url()}`); });
  return errors;
}

/** Wait until the page settled: no skeleton with aria-busy left, fonts loaded. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), undefined, { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export async function hasMojibake(page: Page) {
  return page.evaluate(() => /�|Ã[\u0080-¿]|Ä[\u0080-¿]|á»|Ä‘/.test(document.body.innerText));
}

/** Route fixture ids + the persona that should open each route (shared by links/a11y specs). */
const FIXTURE: Record<string, string> = {
  schoolId: "demo-school-a", yearId: "y-a-2026", classId: "c-a-10a1", memberId: "m-a-lan", roleId: "demo-school-a-role-homeroom",
  studentId: "demo-student-a-001", guardianId: "gd-2", accessId: "pa-minhanh-me", importId: "imp-2", ruleSetId: "rs-a-3",
  reportType: "attendance", ticketId: "tk-2", inviteId: "inv-b-lan", publicationId: "snap-c-a-10a1-w4-v1", activityId: "act-1",
  periodId: "y-a-2026-w4", schoolSlug: "binh-minh", announcementId: "an-1",
};
export const routeHref = (route: string) => route.replace(/:([A-Za-z]+)/g, (_, k: string) => FIXTURE[k] ?? k);
export function routePersona(route: string): PersonaSpec {
  if (route.startsWith("/platform")) return { kind: "platform", userId: "u-bao" };
  if (route.startsWith("/school/")) return { kind: "staff", userId: "u-hanh" };
  if (route.startsWith("/teacher/") || route.startsWith("/classroom/") || ["/account", "/notifications", "/choose-school"].some((x) => route.startsWith(x))) return { kind: "staff", userId: "u-lan" };
  if (route.startsWith("/p/")) return { kind: "parent", token: "demo-minhanh-me", slug: "binh-minh" };
  return { kind: "public" };
}

