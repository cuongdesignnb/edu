import type { ID } from "@/lib/model/types";
import { fold } from "@/lib/formatters";
import { liveAssignments } from "@/lib/permissions/can";
import { allowed, read, type Ctx } from "./core";
import { currentYear, rosterOn, staffNameById } from "./selectors";

export interface SearchHit { kind: "school" | "class" | "student" | "teacher" | "page"; id: string; title: string; sub: string; href: string }

/** C008 — search strictly inside the actor's scope. No system-wide search for parents. */
export const searchRepo = {
  async search(ctx: Ctx, q: string, schoolId?: ID): Promise<SearchHit[]> {
    return read((db) => {
      const needle = fold(q.trim());
      if (needle.length < 2) return [];
      const hit = (s: string) => fold(s).includes(needle);
      const out: SearchHit[] = [];
      if (ctx.actor.kind === "platform") {
        db.schools.filter((s) => hit(`${s.name} ${s.code} ${s.province}`)).slice(0, 8).forEach((s) => out.push({ kind: "school", id: s.id, title: s.name, sub: `${s.province} · ${s.code}`, href: `/platform/schools/${s.id}` }));
        return out;
      }
      if (ctx.actor.kind !== "staff" || !schoolId) return out;
      const m = db.memberships.find((x) => x.userId === (ctx.actor as { userId: string }).userId && x.schoolId === schoolId && x.status === "active");
      if (!m) return out;
      const year = currentYear(db, schoolId);
      const schoolWide = allowed(db, ctx, "student.view.all", { schoolId });
      const myClassIds = new Set(liveAssignments(db, m.id, ctx.today).map((a) => a.classId));
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year?.id && (schoolWide || allowed(db, ctx, "school.view", { schoolId }) || myClassIds.has(c.id)));
      classes.filter((c) => hit(c.name)).slice(0, 6).forEach((c) => out.push({ kind: "class", id: c.id, title: `Lớp ${c.name}`, sub: `Năm học ${year?.label}`, href: `/classroom/${schoolId}/${c.yearId}/${c.id}` }));
      const visibleClassIds = schoolWide ? classes.map((c) => c.id) : [...myClassIds].filter((cid) => allowed(db, ctx, "roster.view", { schoolId, classId: cid }));
      const seen = new Set<string>();
      for (const cid of visibleClassIds) {
        for (const s of rosterOn(db, cid, ctx.today)) {
          if (seen.has(s.id) || !hit(`${s.fullName} ${s.code}`)) continue;
          seen.add(s.id);
          const cls = db.classes.find((c) => c.id === cid)!;
          out.push({ kind: "student", id: s.id, title: s.fullName, sub: `${s.code} · Lớp ${cls.name}`, href: schoolWide ? `/school/${schoolId}/students/${s.id}` : `/classroom/${schoolId}/${cls.yearId}/${cid}/students/${s.id}` });
          if (out.filter((o) => o.kind === "student").length >= 8) break;
        }
      }
      if (allowed(db, ctx, "staff.view", { schoolId })) {
        db.memberships.filter((x) => x.schoolId === schoolId && hit(staffNameById(db, x.userId, false))).slice(0, 6).forEach((x) => out.push({ kind: "teacher", id: x.id, title: staffNameById(db, x.userId), sub: x.department, href: `/school/${schoolId}/teachers/${x.id}` }));
      }
      return out;
    });
  },
};
