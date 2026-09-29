import type { DemoDB, ID } from "@/lib/model/types";
import { addDays } from "@/lib/demo/clock";
import { nameCompare } from "@/lib/formatters";
import { periodTime } from "@/lib/domain/timetable";
import { RepoError } from "./errors";
import { allowed, findOr404, read, requireAction, requireAnyAction, type Ctx } from "./core";
import { reportsRepo, type ReportData } from "./reports";
import { currentYear } from "./selectors";
import { className, lessonsOn, roomName, rosterOn, staffName, staffNameById, subjectName, userOfMembership } from "./selectors";

/** Group "school-ops" extra read models (no new writes — writes go through the shared repositories). */

function canEditClassTimetable(db: DemoDB, ctx: Ctx, schoolId: ID, classId: ID) {
  return allowed(db, ctx, "timetable.manage", { schoolId }) || allowed(db, ctx, "timetable.edit", { schoolId, classId });
}

export const schoolOpsRepo = {
  /** C022 — school composer targeting individual students: roster of one class (today). */
  async announcementClassStudents(ctx: Ctx, schoolId: ID, classId: ID) {
    return read((db) => {
      requireAction(db, ctx, "announcement.school", { schoolId });
      const c = findOr404(db.classes.find((x) => x.id === classId && x.schoolId === schoolId), "lớp");
      return rosterOn(db, c.id, ctx.today).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code })).sort((a, b) => nameCompare(a.fullName, b.fullName));
    });
  },

  /** O25 — current resolved lesson of one slot + options for the change drawer. */
  async lessonSlot(ctx: Ctx, schoolId: ID, classId: ID, date: string, period: number) {
    return read((db) => {
      const c = findOr404(db.classes.find((x) => x.id === classId && x.schoolId === schoolId), "lớp");
      if (!canEditClassTimetable(db, ctx, schoolId, classId)) throw new RepoError("FORBIDDEN", "Bạn không có quyền đổi tiết của lớp này.");
      const published = lessonsOn(db, classId, date, false).find((l) => l.period === period);
      const draft = db.lessonChanges.find((x) => x.classId === classId && x.date === date && x.period === period && x.status === "draft");
      return {
        className: c.name, yearId: c.yearId, date, period, ...periodTime(period), isPast: date < ctx.today, today: ctx.today,
        lesson: published ? { subjectId: published.subjectId, subject: subjectName(db, published.subjectId), teacherMembershipId: published.teacherMembershipId, teacher: staffName(userOfMembership(db, published.teacherMembershipId)), roomId: published.roomId, room: roomName(db, published.roomId), cancelled: !!published.cancelled, changed: published.changed } : null,
        draft: draft ?? null,
        options: {
          subjects: db.subjects.filter((s) => s.schoolId === schoolId && s.status === "active").map((s) => ({ id: s.id, name: s.name })),
          teachers: db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").map((m) => ({ id: m.id, name: staffNameById(db, m.userId) })).sort((a, b) => nameCompare(a.name, b.name)),
          rooms: db.rooms.filter((r) => r.schoolId === schoolId && r.status === "active").map((r) => ({ id: r.id, name: r.name })),
        },
      };
    });
  },

  /** SC32 — lesson changes (draft + published) that fall in the displayed week. */
  async weekLessonChanges(ctx: Ctx, schoolId: ID, weekStart: string) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const end = addDays(weekStart, 6);
      return db.lessonChanges.filter((x) => x.schoolId === schoolId && x.date >= weekStart && x.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
        .map((x) => ({
          ...x, className: className(db, x.classId), subject: x.subjectId ? subjectName(db, x.subjectId) : undefined, teacher: x.teacherMembershipId ? staffName(userOfMembership(db, x.teacherMembershipId)) : undefined,
          room: x.roomId ? roomName(db, x.roomId) : undefined, createdByName: staffNameById(db, x.createdBy), canEdit: canEditClassTimetable(db, ctx, schoolId, x.classId), isPast: x.date < ctx.today,
        }));
    });
  },

  /**
   * SC39 — "Tải lại": rebuild the report from the export job's stored params (same scope),
   * so the file is regenerated locally. Legacy params (month / week number) are normalised.
   */
  async regenerateExport(ctx: Ctx, schoolId: ID, exportId: ID): Promise<{ data: ReportData; params: Record<string, string | undefined>; classYearId?: ID }> {
    const info = await read((db) => {
      requireAnyAction(db, ctx, ["export.run", "report.school"], { schoolId });
      const job = findOr404(db.exports.find((e) => e.id === exportId && e.schoolId === schoolId), "bản xuất");
      if (job.status === "cancelled") throw new RepoError("VALIDATION", "Bản xuất đã hủy — hãy tạo lại từ trang báo cáo.");
      if (job.expiresAt < ctx.now) throw new RepoError("EXPIRED", "Bản xuất đã hết hạn — hãy tạo lại từ trang báo cáo.");
      const p: Record<string, string | undefined> = { ...job.params };
      if (p.month && !p.from) { p.from = `${p.month}-01`; const [y, m] = p.month.split("-").map(Number); p.to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
      if (p.week && !p.weekId) { const y = currentYear(db, schoolId); p.weekId = db.weeks.find((w) => w.yearId === y?.id && String(w.index) === p.week)?.id; }
      const classYearId = p.classId ? db.classes.find((c) => c.id === p.classId && c.schoolId === schoolId)?.yearId : undefined;
      return { type: job.reportType, params: p, classYearId };
    });
    const data = info.params.classId && info.classYearId
      ? await reportsRepo.classReport(ctx, schoolId, info.classYearId, info.params.classId, info.type, info.params)
      : await reportsRepo.school(ctx, schoolId, info.type, info.params);
    return { data, params: info.params, classYearId: info.classYearId };
  },
};
