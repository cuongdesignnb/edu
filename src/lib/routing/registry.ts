import screens from "@manifests/screens.json";

/** Fixture values used to turn registry routes (with :params) into real demo URLs. */
export const FIXTURE_PARAMS: Record<string, string> = {
  schoolId: "demo-school-a",
  yearId: "y-a-2026",
  classId: "c-a-10a1",
  memberId: "m-a-lan",
  roleId: "demo-school-a-role-homeroom",
  studentId: "demo-student-a-001",
  guardianId: "gd-2",
  accessId: "pa-minhanh-me",
  importId: "imp-2",
  ruleSetId: "rs-a-3",
  reportType: "attendance",
  ticketId: "tk-2",
  inviteId: "inv-b-lan",
  publicationId: "snap-c-a-10a1-w4-v1",
  activityId: "act-1",
  periodId: "y-a-2026-w4",
  schoolSlug: "binh-minh",
  announcementId: "an-1",
};

/** Per-screen overrides where the generic fixture is not the right example. */
const OVERRIDES: Record<string, Record<string, string>> = {
  CL23: { announcementId: "an-7" },
  PA11: { announcementId: "an-8" },
  SY02: { announcementId: "an-1" },
  SC43: { ticketId: "tk-2" },
  PL07: { ticketId: "tk-2" },
};

export type Persona = { kind: "platform" | "staff"; userId: string } | { kind: "parent"; token: string; slug: string } | { kind: "public" };

export interface RegistryEntry {
  id: string; group: string; scope: "core" | "internal" | "optional"; route: string; title: string; refs: string[]; basis: "reference" | "derived";
  layout: string; actions: string; component_ids: string[]; href: string; persona: Persona;
}

export function resolveRoute(id: string, route: string): string {
  if (route === "/*") return "/khong-ton-tai-demo";
  const params = { ...FIXTURE_PARAMS, ...(OVERRIDES[id] ?? {}) };
  return route.replace(/:([A-Za-z]+)/g, (_, k: string) => params[k] ?? k);
}

export function personaFor(id: string, route: string): Persona {
  if (route.startsWith("/platform")) return { kind: "platform", userId: "u-bao" };
  if (route.startsWith("/school/")) return { kind: "staff", userId: "u-hanh" };
  if (route.startsWith("/teacher/") || route.startsWith("/classroom/")) return { kind: "staff", userId: "u-lan" };
  if (route.startsWith("/p/")) return { kind: "parent", token: "demo-minhanh-me", slug: "binh-minh" };
  if (["/account", "/notifications", "/choose-school"].some((p) => route.startsWith(p))) return { kind: "staff", userId: "u-lan" };
  if (id === "AU08") return { kind: "staff", userId: "u-lan" };
  return { kind: "public" };
}

export const REGISTRY: RegistryEntry[] = (screens as Omit<RegistryEntry, "href" | "persona">[]).map((s) => ({
  ...s, href: resolveRoute(s.id, s.route), persona: personaFor(s.id, s.route),
}));

export function registryById(id: string) {
  return REGISTRY.find((r) => r.id === id);
}
