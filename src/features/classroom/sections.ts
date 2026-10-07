import type { ActionKey } from "@/lib/model/types";

/**
 * Class workspace information architecture: the server still returns one flat list of permitted
 * tabs; the UI groups them into six teacher-facing sections, each with its own sub-navigation.
 * A section or sub-item only appears when its source tab is in the server list, so grouping never
 * widens what the actor can open.
 */
export type SectionKey = "overview" | "students" | "attendance" | "schedule" | "activities" | "parents";

interface SubItemDef {
  /** Server tab key that must be present for the item to show. */
  tab: string;
  label: string;
  path: string;
  /** Path prefixes (relative to the class base) that mark this item as active. Defaults to [path]. */
  match?: string[];
  /** Extra UI permission required on top of the tab (for routes that share a tab). */
  need?: ActionKey[];
}

interface SectionDef { key: SectionKey; label: string; items: SubItemDef[] }

export const CLASS_SECTIONS: SectionDef[] = [
  { key: "overview", label: "Tổng quan", items: [{ tab: "overview", label: "Tổng quan", path: "" }] },
  { key: "students", label: "Học sinh", items: [
    { tab: "students", label: "Danh sách", path: "/students" },
    { tab: "groups", label: "Tổ & chức vụ", path: "/groups" },
    { tab: "seating", label: "Sơ đồ chỗ ngồi", path: "/seating" },
  ] },
  { key: "attendance", label: "Điểm danh & Rèn luyện", items: [
    { tab: "attendance", label: "Điểm danh", path: "/attendance" },
    { tab: "conduct", label: "Rèn luyện tuần", path: "/conduct", match: ["/conduct", "/publications", "/adjustments", "/rules"] },
    { tab: "notebook", label: "Báo cáo tuần", path: "/notebook" },
    { tab: "periodic", label: "Xếp loại định kỳ", path: "/periodic" },
  ] },
  { key: "schedule", label: "Lịch & Tổ chức", items: [
    { tab: "timetable", label: "Thời khóa biểu", path: "/timetable" },
    { tab: "duties", label: "Trực nhật", path: "/duties" },
    { tab: "notebook-settings", label: "Cài đặt lớp", path: "/notebook-settings" },
  ] },
  { key: "activities", label: "Hoạt động", items: [
    { tab: "activities", label: "Hoạt động", path: "/activities" },
    { tab: "activities", label: "Minh chứng", path: "/evidence", need: ["evidence.manage", "report.class"] },
    { tab: "announcements", label: "Thông báo", path: "/announcements" },
    { tab: "files", label: "Tệp lớp", path: "/files" },
  ] },
  { key: "parents", label: "Phụ huynh & Báo cáo", items: [
    { tab: "public-portal", label: "Cổng lớp & mã QR", path: "/public-portal" },
    { tab: "reports", label: "Báo cáo", path: "/reports" },
    { tab: "reports", label: "Tin nhắn Zalo", path: "/reports/zalo", need: ["guardian.view"] },
  ] },
];

export interface ClassSubItem { label: string; href: string; path: string; match: string[] }
export interface ClassSection { key: SectionKey; label: string; href: string; items: ClassSubItem[] }

/** Builds the visible sections from the server tab list. `need` is any-of. */
export function visibleSections(tabs: readonly { key: string; path: string }[], base: string, can: (a: ActionKey) => boolean): ClassSection[] {
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const out: ClassSection[] = [];
  for (const s of CLASS_SECTIONS) {
    const items = s.items.flatMap((it) => {
      const tab = byKey.get(it.tab);
      if (!tab || (it.need && !it.need.some(can))) return [];
      // The legacy "groups" tab may point at seating/duties for actors without group.manage; those have their own items.
      if (it.tab === "groups" && tab.path !== "/groups") return [];
      return [{ label: it.label, path: it.path, href: `${base}${it.path}`, match: it.match ?? [it.path] }];
    });
    if (items.length) out.push({ key: s.key, label: s.label, href: items[0].href, items });
  }
  return out;
}

/** Longest matching prefix wins, so /reports/zalo selects "Tin nhắn Zalo" rather than "Báo cáo". */
export function activeLocation(sections: ClassSection[], rel: string): { section?: ClassSection; item?: ClassSubItem } {
  let best: { section: ClassSection; item: ClassSubItem; len: number } | undefined;
  for (const section of sections) {
    for (const item of section.items) {
      for (const m of item.match) {
        const hit = m === "" ? rel === "" : rel === m || rel.startsWith(`${m}/`);
        if (hit && (!best || m.length > best.len)) best = { section, item, len: m.length };
      }
    }
  }
  return best ? { section: best.section, item: best.item } : {};
}
