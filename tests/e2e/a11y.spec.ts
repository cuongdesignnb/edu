import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import screens from "../../manifests/screens.json";
import { asPersona, openParentLink, settle, routeHref, routePersona, type PersonaSpec } from "./helpers";

/** Automated WCAG 2.1 A/AA check (axe-core) on every core/internal route (desktop). Blocks on serious/critical. */
const CASES: { route: string; p: PersonaSpec }[] = (screens as { route: string; scope: string }[])
  .filter((s) => s.scope !== "optional" && s.route !== "/*" && !s.route.endsWith("/access"))
  .map((s) => ({ route: routeHref(s.route), p: routePersona(s.route) }));

for (const { route, p } of CASES) {
  test(`axe — ${route}`, async ({ page, context }) => {
    await asPersona(context, p);
    if (p.kind === "parent") await openParentLink(page, p.slug, p.token);
    if (p.kind !== "parent" || !page.url().endsWith(route)) await page.goto(route);
    await settle(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const msg = bad.map((v) => `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
    if (process.env.AXE_DUMP) (await import("node:fs")).appendFileSync(process.env.AXE_DUMP, JSON.stringify({ route, v: bad.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ t: n.target.join(" "), html: n.html.slice(0, 160), f: (n.failureSummary ?? "").split("\n").slice(1, 2).join(" ") })) })) }) + "\n");
    expect(bad, msg).toEqual([]);
  });
}
