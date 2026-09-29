import type { AttendanceRecord, AttendanceSession, AttendanceStatus, DemoDB, ID } from "@/lib/model/types";
import { addDays, mondayOf, weekdayOf } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { countAttendance } from "@/lib/domain/attendance";
import { periodTime } from "@/lib/domain/timetable";
import { isAssignmentLive } from "@/lib/permissions/can";
import { RepoError } from "./errors";
import { allowed, audit, read, requireAction, validation, write, actorId, type Ctx } from "./core";
import { classGuard, refDateOf } from "./classroom";
import { className, groupOf, lessonsOn, rosterBetween, rosterOn, ruleSetOn, staffNameById, subjectName, weekOfDate } from "./selectors";

export type Slot = AttendanceSession["slot"];

/** Subject teachers may only record their own period (subject scope); homeroom may record any slot. */
function requireRecordScope(db: DemoDB, ctx: Ctx, schoolId: ID, classId: ID, date: string, slot: Slot) {
  if (slot === "morning" || slot === "afternoon") {
    // whole-session attendance: homeroom (or school role holding attendance.record)
    const homeroomOrRole = allowed(db, ctx, "attendance.publish", { schoolId, classId });
    if (!homeroomOrRole) throw new RepoError("FORBIDDEN", "Điểm danh buổi do giáo viên chủ nhiệm thực hiện. Giáo viên bộ môn điểm danh theo tiết mình dạy.");
    return undefined;
  }
  const period = Number(slot.split("-")[1]);
  const lesson = lessonsOn(db, classId, date).find((l) => l.period === period);
  if (!lesson) throw new RepoError("VALIDATION", "Không có tiết học này trong lịch ngày đã chọn.");
  requireAction(db, ctx, "attendance.record", { schoolId, classId, subjectId: lesson.subjectId, date });
  return lesson.subjectId;
}

export const attendanceRepo = {
  async sheet(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, date: string, slot: Slot) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const roster = rosterOn(db, classId, date);
      const session = db.attendanceSessions.find((s) => s.classId === classId && s.date === date && s.slot === slot);
      const recs = session ? db.attendanceRecords.filter((r) => r.sessionId === session.id) : [];
      const byStudent = new Map(recs.map((r) => [r.studentId, r]));
      const lessons = lessonsOn(db, classId, date);
      const periodNo = slot.startsWith("period-") ? Number(slot.split("-")[1]) : undefined;
      const lesson = periodNo ? lessons.find((l) => l.period === periodNo) : undefined;
      let canRecord = false;
      try { requireRecordScope(db, ctx, schoolId, classId, date, slot); canRecord = true; } catch { canRecord = false; }
      const year = db.years.find((y) => y.id === c.yearId)!;
      const holiday = db.holidays.find((h) => h.schoolId === schoolId && h.startDate <= date && h.endDate >= date);
      const conductByKey = new Map(db.conductRecords.filter((r) => r.classId === classId && r.date === date && r.sourceEventKey && r.status !== "void").map((r) => [r.sourceEventKey!, r]));
      const rs = ruleSetOn(db, schoolId, date);
      const week = weekOfDate(db, c.yearId, date);
      const period = week ? db.conductPeriods.find((p) => p.classId === classId && p.weekId === week.id) : undefined;
      return {
        date, slot, session: session ?? null, sessionStatus: session?.status ?? "none",
        rows: roster.map((s) => {
          const r = byStudent.get(s.id);
          const linked = r?.sourceEventKey ? conductByKey.get(r.sourceEventKey) : undefined;
          return {
            studentId: s.id, code: s.code, fullName: s.fullName, avatarTone: s.avatarTone, groupName: groupOf(db, classId, s.id, date)?.name,
            status: (r?.status ?? "unmarked") as AttendanceStatus, note: r?.note ?? "", history: r?.history ?? [],
            linkedConduct: linked ? { id: linked.id, points: linked.points, status: linked.status } : null,
          };
        }),
        counts: countAttendance(roster.map((s) => s.id), recs),
        lessons: lessons.map((l) => ({ period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId) })),
        lesson: lesson ? { period: lesson.period, subject: subjectName(db, lesson.subjectId), ...periodTime(lesson.period) } : null,
        canRecord: canRecord && year.status !== "archived" && !holiday, canPublish: allowed(db, ctx, "attendance.publish", { schoolId, classId }) && (slot === "morning" || slot === "afternoon"),
        holiday: holiday?.name, isSunday: weekdayOf(date) === 7, updatedByName: staffNameById(db, session?.updatedBy), week: week ? { id: week.id, index: week.index } : null,
        periodLocked: period ? period.status !== "open" : false,
        linkRules: rs ? rs.rules.filter((x) => x.attendanceLink).map((x) => ({ link: x.attendanceLink!, label: x.label, points: x.points })) : [],
        className: className(db, classId), today: ctx.today,
      };
    });
  },

  /**
   * Save a session. "unmarked" stays unmarked (never becomes present). Late/unexcused can
   * create ONE linked conduct record per source event (no double counting).
   */
  async save(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { date: string; slot: Slot; entries: { studentId: ID; status: AttendanceStatus; note?: string }[]; expectedVersion?: number; linkConduct: boolean; reason?: string }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      const subjectId = requireRecordScope(db, ctx, schoolId, classId, input.date, input.slot);
      if (input.date > ctx.today) validation({ date: "Không điểm danh cho ngày chưa tới" });
      if (db.holidays.some((h) => h.schoolId === schoolId && h.startDate <= input.date && h.endDate >= input.date)) throw new RepoError("VALIDATION", "Ngày nghỉ theo lịch nhà trường — không điểm danh.");
      const roster = new Set(rosterOn(db, classId, input.date).map((s) => s.id));
      if (input.entries.some((e) => !roster.has(e.studentId))) throw new RepoError("VALIDATION", "Có học sinh không thuộc lớp vào ngày này.");
      let session = db.attendanceSessions.find((s) => s.classId === classId && s.date === input.date && s.slot === input.slot);
      if (session && input.expectedVersion !== undefined && session.version !== input.expectedVersion) {
        throw new RepoError("CONFLICT", `Bảng điểm danh vừa được ${staffNameById(db, session.updatedBy)} cập nhật lúc ${session.updatedAt.slice(11, 16)}.`, { details: { updatedBy: staffNameById(db, session.updatedBy), updatedAt: session.updatedAt } });
      }
      if (session?.status === "published" && (!input.reason || input.reason.trim().length < 5)) validation({ reason: "Sửa điểm danh đã công bố cần ghi lý do (tối thiểu 5 ký tự)" });
      if (!session) {
        session = { id: newId("as"), schoolId, classId, date: input.date, slot: input.slot, subjectId, status: "saved", version: 0, updatedAt: ctx.now, updatedBy: actorId(ctx) };
        db.attendanceSessions.push(session);
      }
      const week = weekOfDate(db, db.classes.find((c) => c.id === classId)!.yearId, input.date);
      const period = week ? db.conductPeriods.find((p) => p.classId === classId && p.weekId === week.id) : undefined;
      const rs = ruleSetOn(db, schoolId, input.date);
      let changed = 0, linkedCreated = 0, linkedVoided = 0;
      const blockedLinks: string[] = [];
      for (const e of input.entries) {
        let r = db.attendanceRecords.find((x) => x.sessionId === session!.id && x.studentId === e.studentId);
        const prev: AttendanceStatus = r?.status ?? "unmarked";
        if (!r) {
          r = { id: newId("ar"), sessionId: session.id, classId, studentId: e.studentId, date: input.date, status: e.status, note: e.note, history: [] } as AttendanceRecord;
          db.attendanceRecords.push(r);
        }
        if (prev !== e.status) { r.history.push({ at: ctx.now, by: actorId(ctx), from: prev, to: e.status, reason: input.reason }); changed++; }
        r.status = e.status;
        r.note = e.note?.trim() || undefined;
        const needsLink = e.status === "late" || e.status === "unexcused";
        const key = `att:${session.id}:${e.studentId}`;
        const existing = db.conductRecords.find((c) => c.sourceEventKey === key && c.status !== "void" && c.status !== "rejected");
        if (needsLink) {
          r.sourceEventKey = key;
          const rule = rs?.rules.find((x) => x.attendanceLink === e.status);
          if (input.linkConduct && rule && week) {
            if (existing && existing.ruleId !== rule.id) {
              if (period && period.status !== "open") { blockedLinks.push(e.studentId); continue; }
              existing.status = "void"; existing.reviewNote = "Trạng thái điểm danh đã thay đổi"; linkedVoided++;
            }
            const still = db.conductRecords.find((c) => c.sourceEventKey === key && c.status !== "void" && c.status !== "rejected");
            if (!still) {
              if (period && period.status !== "open") { blockedLinks.push(e.studentId); continue; }
              db.conductRecords.push({ id: newId("cr"), schoolId, classId, studentId: e.studentId, weekId: week.id, date: input.date, ruleSetId: rs!.id, ruleId: rule.id, points: rule.points, reason: `${rule.label} (từ điểm danh)`, sourceEventKey: key, linkedAttendanceRecordId: r.id, createdBy: actorId(ctx), createdAt: ctx.now, status: "pending_review", version: 1 });
              linkedCreated++;
            }
          }
        } else if (existing) {
          if (period && period.status !== "open") { blockedLinks.push(e.studentId); continue; }
          existing.status = "void"; existing.reviewNote = "Điểm danh đã sửa thành không vi phạm"; linkedVoided++;
        }
      }
      session.version += 1;
      session.updatedAt = ctx.now;
      session.updatedBy = actorId(ctx);
      if (session.status === "open") session.status = "saved";
      audit(db, ctx, { level: "school", schoolId, action: session.status === "published" ? "Sửa điểm danh đã công bố" : "Lưu điểm danh", entityType: "attendance", entityId: session.id, entityLabel: `${className(db, classId)} — ${input.date} ${input.slot === "morning" ? "buổi sáng" : input.slot}`, after: { changed, linkedCreated, linkedVoided }, reason: input.reason });
      return { sessionId: session.id, version: session.version, changed, linkedCreated, linkedVoided, blockedLinks };
    });
  },

  async publish(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, date: string, slot: Slot) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "attendance.publish", { schoolId, classId });
      const s = db.attendanceSessions.find((x) => x.classId === classId && x.date === date && x.slot === slot);
      if (!s) throw new RepoError("VALIDATION", "Chưa lưu điểm danh — không có gì để công bố.");
      const roster = rosterOn(db, classId, date).map((x) => x.id);
      const counts = countAttendance(roster, db.attendanceRecords.filter((r) => r.sessionId === s.id));
      if (counts.unmarked > 0) throw new RepoError("VALIDATION", `Còn ${counts.unmarked} học sinh chưa điểm danh. Hoàn tất trước khi công bố.`);
      s.status = "published";
      s.publishedAt = ctx.now;
      s.version += 1;
      audit(db, ctx, { level: "school", schoolId, action: "Công bố chuyên cần", entityType: "attendance", entityId: s.id, entityLabel: `${className(db, classId)} — ${date}` });
      return s;
    });
  },

  /** Student × day matrix for a week (morning sessions), plus the period attendance count per day. */
  async weekly(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekStart?: string) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      if (!allowed(db, ctx, "attendance.record", { schoolId, classId }) && !allowed(db, ctx, "report.class", { schoolId, classId })) requireAction(db, ctx, "attendance.record", { schoolId, classId });
      const monday = weekStart ?? mondayOf(refDateOf(db, c, ctx.today));
      const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i));
      const roster = rosterBetween(db, classId, days[0], days[5]);
      const sessions = days.map((d) => db.attendanceSessions.find((s) => s.classId === classId && s.date === d && s.slot === "morning"));
      const holidays = days.map((d) => db.holidays.find((h) => h.schoolId === schoolId && h.startDate <= d && h.endDate >= d)?.name);
      const recs = new Map(db.attendanceRecords.filter((r) => sessions.some((s) => s?.id === r.sessionId)).map((r) => [`${r.sessionId}:${r.studentId}`, r]));
      const enrolledOn = (sid: ID, d: string) => db.enrollments.some((e) => e.studentId === sid && e.classId === classId && e.startDate <= d && (!e.endDate || e.endDate >= d));
      const rows = roster.map((s) => {
        const cells = days.map((d, i) => {
          if (!enrolledOn(s.id, d)) return { status: "not_enrolled" as const };
          if (holidays[i]) return { status: "holiday" as const };
          const ses = sessions[i];
          if (!ses) return { status: d > ctx.today ? ("future" as const) : ("unmarked" as const) };
          const r = recs.get(`${ses.id}:${s.id}`);
          return { status: (r?.status ?? "unmarked") as AttendanceStatus, note: r?.note, edited: (r?.history.length ?? 0) > 0 };
        });
        const tally = { present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0 };
        cells.forEach((x) => { if (x.status in tally) tally[x.status as keyof typeof tally]++; });
        return { studentId: s.id, fullName: s.fullName, code: s.code, cells, tally };
      });
      const week = weekOfDate(db, c.yearId, monday);
      return {
        monday, days: days.map((d, i) => ({ date: d, sessionStatus: sessions[i]?.status ?? (d > ctx.today ? "future" : "none"), holiday: holidays[i], periodSessions: db.attendanceSessions.filter((s) => s.classId === classId && s.date === d && s.slot.startsWith("period-")).length })),
        rows, week: week ? { index: week.index, startDate: week.startDate, endDate: week.endDate } : null, today: ctx.today,
      };
    });
  },

  /** Is a subject-teacher period attendance allowed right now? Used by the teacher schedule. */
  async canRecordPeriod(ctx: Ctx, schoolId: ID, classId: ID, date: string, period: number) {
    return read((db) => {
      try { requireRecordScope(db, ctx, schoolId, classId, date, `period-${period}`); return true; } catch { return false; }
    });
  },
};

export function _liveFor(db: DemoDB, membershipId: ID, date: string) {
  return db.assignments.filter((a) => a.membershipId === membershipId && isAssignmentLive(a, date));
}
