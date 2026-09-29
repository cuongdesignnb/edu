/**
 * Extra read models for the teacher / class-organisation / attendance screens
 * (group "teacher-class-1"). Same patterns as core.ts: read(), guards, projections.
 * Nothing here writes; mutations go through classroomRepo / attendanceRepo / studentsRepo.
 */
import type { AttendanceStatus, ID } from "@/lib/model/types";
import { enrollmentsOn, staffNameById, className, lessonsOn, subjectName } from "./selectors";
import { allowed, read, requireAnyAction, type Ctx } from "./core";
import { RepoError } from "./errors";
import { classActions, liveAssignments } from "@/lib/permissions/can";
import { classGuard, refDateOf } from "./classroom";

export const teacherExtraRepo = {
  /** CL03 — attendance summary of one student in this class (morning sessions saved so far). */
  async studentAttendance(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, studentId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["student.profile.view", "attendance.record", "report.class"], { schoolId, classId });
      const enr = db.enrollments.filter((e) => e.studentId === studentId && e.classId === classId);
      if (!enr.length) throw new RepoError("NOT_FOUND", "Học sinh không thuộc lớp này.");
      const ref = refDateOf(db, c, ctx.today);
      const inClass = (d: string) => enr.some((e) => e.startDate <= d && (!e.endDate || e.endDate >= d));
      const sessions = db.attendanceSessions.filter((s) => s.classId === classId && s.slot === "morning" && s.date <= ref && inClass(s.date)).sort((a, b) => b.date.localeCompare(a.date));
      const tally: Record<AttendanceStatus, number> = { present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0 };
      const notable: { date: string; status: AttendanceStatus; note?: string; published: boolean }[] = [];
      for (const s of sessions) {
        const r = db.attendanceRecords.find((x) => x.sessionId === s.id && x.studentId === studentId);
        const st = (r?.status ?? "unmarked") as AttendanceStatus;
        tally[st] += 1;
        if (st !== "present" && notable.length < 8) notable.push({ date: s.date, status: st, note: r?.note, published: s.status === "published" });
      }
      return { sessions: sessions.length, published: sessions.filter((s) => s.status === "published").length, tally, notable, className: className(db, classId) };
    });
  },

  /** CL04 / CL05 — change history of one student's record on a session, with actor names. */
  async recordHistory(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, studentId: ID, date: string, slot = "morning") {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["attendance.record", "report.class"], { schoolId, classId });
      const s = db.attendanceSessions.find((x) => x.classId === classId && x.date === date && x.slot === slot);
      const r = s ? db.attendanceRecords.find((x) => x.sessionId === s.id && x.studentId === studentId) : undefined;
      const st = db.students.find((x) => x.id === studentId);
      return {
        studentName: st?.fullName ?? "", code: st?.code ?? "", date, sessionStatus: s?.status ?? "none", publishedAt: s?.publishedAt,
        status: (r?.status ?? "unmarked") as AttendanceStatus, note: r?.note,
        history: (r?.history ?? []).map((h, i) => ({ id: `${i}`, ...h, byName: staffNameById(db, h.by) })).reverse(),
        linkedConduct: r?.sourceEventKey ? db.conductRecords.filter((x) => x.sourceEventKey === r.sourceEventKey).map((x) => ({ id: x.id, points: x.points, status: x.status, reason: x.reason })) : [],
      };
    });
  },

  /** O11 — candidate target classes (same school year, active) with current size / capacity. */
  async transferTargets(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const may = allowed(db, ctx, "student.transfer", { schoolId }) || allowed(db, ctx, "groups.manage", { schoolId, classId });
      if (!may) throw new RepoError("FORBIDDEN");
      const ref = refDateOf(db, c, ctx.today);
      return db.classes.filter((x) => x.schoolId === schoolId && x.yearId === c.yearId && x.status === "active" && x.id !== classId)
        .map((x) => ({ id: x.id, name: x.name, size: enrollmentsOn(db, x.id, ref).length, capacity: x.capacity }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    });
  },

  /** TE01 / TE02 — actions the actor holds per assigned class today (drives which buttons appear on class cards). */
  async myClassActions(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      if (ctx.actor.kind !== "staff") throw new RepoError("NO_SESSION");
      const uid = ctx.actor.userId;
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId && x.status === "active");
      if (!m) return {} as Record<ID, string[]>;
      const out: Record<ID, string[]> = {};
      for (const cid of [...new Set(liveAssignments(db, m.id, ctx.today).map((a) => a.classId))]) out[cid] = [...classActions(db, ctx.actor, schoolId, cid, ctx.today)];
      return out;
    });
  },

  /**
   * CL04 — slot options for a date with the actor's right to record each one
   * (same rule as attendanceRepo: session = homeroom/publisher, period = subject scope).
   */
  async attendanceSlots(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, date: string) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      const morning = { slot: "morning", label: "Buổi sáng (cả buổi)", canRecord: allowed(db, ctx, "attendance.publish", { schoolId, classId }) };
      const periods = lessonsOn(db, classId, date).map((l) => ({
        slot: `period-${l.period}`, label: `Tiết ${l.period} – ${subjectName(db, l.subjectId)}${l.cancelled ? " (nghỉ)" : ""}`,
        canRecord: !l.cancelled && allowed(db, ctx, "attendance.record", { schoolId, classId, subjectId: l.subjectId, date }),
      }));
      return [morning, ...periods];
    });
  },
};
