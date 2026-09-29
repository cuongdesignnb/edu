import type { ID } from "@/lib/model/types";
import { addDays, mondayOf } from "@/lib/demo/clock";
import { activeMembership, liveAssignments } from "@/lib/permissions/can";
import { allowed, read, requireAction, requireAnyAction, type Ctx } from "./core";
import { classGuard, refDateOf } from "./classroom";
import { CLASS_REPORTS } from "./reports";
import { rosterOn, staffNameById } from "./selectors";

/**
 * Extra reads for the class-activities group (CL17–CL26). Read-only helpers built on the
 * same permission model as the shared repositories; nothing here writes data.
 */
export const activitiesExtraRepo = {
  /**
   * CL25 — report catalog for this class. Homeroom teachers and school roles (report.class via
   * role template) see every class report; subject teachers only see attendance and activities
   * (same rule as reportsRepo.teacherCatalog).
   */
  async classReportCatalog(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "report.class", { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const m = ctx.actor.kind === "staff" ? activeMembership(db, ctx.actor.userId, schoolId) : undefined;
      const live = m ? liveAssignments(db, m.id, ref).filter((a) => a.classId === classId) : [];
      const isHomeroom = live.some((a) => a.kind === "homeroom");
      const viaRole = !!m && db.roleTemplates.some((t) => m.roleTemplateIds.includes(t.id) && t.actions.includes("report.class"));
      const subjectOnly = live.length > 0 && !isHomeroom && !viaRole;
      const reports = CLASS_REPORTS.filter((r) => !subjectOnly || r.type === "attendance" || r.type === "activities");
      return {
        reports: reports.map((r) => ({ type: r.type, title: r.title, description: r.description })),
        hiddenCount: CLASS_REPORTS.length - reports.length,
        role: isHomeroom ? "Chủ nhiệm" : subjectOnly ? "Bộ môn" : "Nhà trường",
        canExport: allowed(db, ctx, "report.export", { schoolId, classId }),
        students: rosterOn(db, classId, ref).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code })),
        weeks: db.weeks.filter((w) => w.yearId === yearId && w.startDate <= ref).sort((a, b) => b.index - a.index).map((w) => ({ id: w.id, index: w.index, startDate: w.startDate, endDate: w.endDate })),
        today: ref,
      };
    });
  },

  /**
   * CL17 "Hoạt động gần đây" — merges audit events of this class's activities/evidence with the
   * evidence records themselves (teacher recorded / reviewed) and activity creation, newest first.
   */
  async recentFeed(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, limit = 6) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["activity.manage", "evidence.manage", "report.class"], { schoolId, classId });
      const acts = db.activities.filter((a) => a.classId === classId);
      const actIds = new Set(acts.map((a) => a.id));
      const evs = db.evidence.filter((e) => e.classId === classId);
      const evIds = new Set(evs.map((e) => e.id));
      const student = (id: ID) => db.students.find((s) => s.id === id)?.fullName ?? "";
      const title = (id: ID) => acts.find((a) => a.id === id)?.title ?? "";
      type Item = { id: string; at: string; kind: "evidence" | "approved" | "supplement" | "activity"; actor: string; text: string; detail: string; href: string };
      const out: Item[] = [];
      const seen = new Set<string>();
      for (const x of db.audit) {
        if (!(actIds.has(x.entityId) || evIds.has(x.entityId))) continue;
        const ev = evs.find((e) => e.id === x.entityId);
        seen.add(`${x.entityId}|${x.at}`);
        out.push({
          id: x.id, at: x.at, actor: staffNameById(db, x.actorId), text: x.action.replace(" (tệp lưu cục bộ, mô phỏng)", ""), detail: x.entityLabel,
          kind: /Duyệt/.test(x.action) ? "approved" : /bổ sung|Từ chối/.test(x.action) ? "supplement" : x.entityType === "evidence" ? "evidence" : "activity",
          href: ev ? `activities/${ev.activityId}?tab=evidence` : `activities/${x.entityId}`,
        });
      }
      for (const e of evs) {
        if (seen.has(`${e.id}|${e.uploadedAt}`) || db.audit.some((x) => x.entityId === e.id)) continue;
        out.push({ id: `ev-${e.id}`, at: e.uploadedAt, kind: "evidence", actor: staffNameById(db, e.uploadedBy), text: `Ghi nhận minh chứng của ${student(e.studentId)}`, detail: title(e.activityId), href: `activities/${e.activityId}?tab=evidence` });
      }
      for (const a of acts) {
        if (db.audit.some((x) => x.entityId === a.id)) continue;
        out.push({ id: `act-${a.id}`, at: a.createdAt, kind: "activity", actor: staffNameById(db, a.createdBy), text: a.status === "draft" ? "Lưu nháp hoạt động" : "Giao hoạt động mới", detail: a.title, href: `activities/${a.id}` });
      }
      return out.filter((x) => x.at <= ctx.now).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    });
  },

  /**
   * CL17 — right/bottom panels: class announcements published this week vs last week and the
   * upcoming (draft/scheduled) ones. Only for actors with announcement.class.
   */
  async announcementsPanel(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["activity.manage", "evidence.manage", "report.class"], { schoolId, classId });
      if (!allowed(db, ctx, "announcement.class", { schoolId, classId })) return null;
      const ref = refDateOf(db, c, ctx.today);
      const mon = mondayOf(ref);
      const prevMon = addDays(mon, -7);
      const own = db.announcements.filter((a) => a.originClassId === classId);
      const day = (iso?: string) => (iso ?? "").slice(0, 10);
      const thisWeek = own.filter((a) => a.status === "published" && day(a.publishedAt) >= mon && day(a.publishedAt) <= addDays(mon, 6)).length;
      const lastWeek = own.filter((a) => a.status === "published" && day(a.publishedAt) >= prevMon && day(a.publishedAt) < mon).length;
      const upcoming = own.filter((a) => a.status === "draft" || a.status === "scheduled")
        .sort((a, b) => (a.scheduledAt ?? a.updatedAt).localeCompare(b.scheduledAt ?? b.updatedAt))
        .map((a) => ({
          id: a.id, title: a.title, summary: a.summary, status: a.status, scheduledAt: a.scheduledAt, updatedAt: a.updatedAt, createdByName: staffNameById(db, a.createdBy),
          scopeLabel: a.scope.type === "student" ? `Riêng ${(a.scope.studentIds ?? []).length} học sinh` : `Lớp ${c.name}`,
          audienceLabel: a.audience === "staff" ? "Nội bộ nhân sự" : a.audience === "families" ? "Gia đình học sinh" : "Nhân sự và gia đình",
        }));
      return { thisWeek, lastWeek, upcoming };
    });
  },
};
