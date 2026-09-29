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
