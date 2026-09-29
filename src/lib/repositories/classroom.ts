import type { ActionKey, ClassRoom, DemoDB, ID, LessonChange, SeatingPlan, StudentPositionKey, Duty } from "@/lib/model/types";
import { classActions, liveAssignments, activeMembership, isAssignmentLive } from "@/lib/permissions/can";
import { addDays, mondayOf, weekdayOf } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { matches, nameCompare, positionLabel } from "@/lib/formatters";
import { countAttendance } from "@/lib/domain/attendance";
import { periodTime } from "@/lib/domain/timetable";
import { RepoError } from "./errors";
import { audit, findOr404, read, requireAction, requireAnyAction, requireStaff, validation, write, actorId, allowed, type Ctx } from "./core";
import {
  className, groupOf, homeroomTeacher, lessonsOn, positionsOf, rosterOn, roomName, staffName, staffNameById, subjectName,
  teacherLessonsOn, userOfMembership, weekOfDate, subjectAssignments, rosterBetween,
} from "./selectors";
import { accessStatus } from "./students";

/** Guard: class exists in this school/year and actor may open it. */
export function classGuard(db: DemoDB, ctx: Ctx, schoolId: ID, yearId: ID, classId: ID): ClassRoom {
  const c = db.classes.find((x) => x.id === classId && x.schoolId === schoolId && x.yearId === yearId);
  if (!c) throw new RepoError("NOT_FOUND", "Không tìm thấy lớp trong trường và năm học này.");
  requireAction(db, ctx, "class.view", { schoolId, classId });
  return c;
}

export function refDateOf(db: DemoDB, c: ClassRoom, today: string) {
  const y = db.years.find((x) => x.id === c.yearId)!;
  if (y.status === "archived") return addDays(y.endDate, -62);
  return today < y.startDate ? y.startDate : today > y.endDate ? y.endDate : today;
}

const TAB_ACTIONS: { key: string; label: string; path: string; any: ActionKey[] }[] = [
  { key: "overview", label: "Tổng quan", path: "", any: ["class.view"] },
  { key: "students", label: "Học sinh", path: "/students", any: ["roster.view"] },
  { key: "attendance", label: "Điểm danh", path: "/attendance", any: ["attendance.record", "report.class"] },
  { key: "conduct", label: "Thi đua", path: "/conduct", any: ["conduct.record", "conduct.review", "adjustment.approve"] },
  { key: "timetable", label: "Lịch lớp", path: "/timetable", any: ["class.view"] },
  { key: "groups", label: "Tổ & sơ đồ", path: "/groups", any: ["groups.manage", "seating.manage", "student.profile.view"] },
  { key: "activities", label: "Hoạt động", path: "/activities", any: ["activity.manage", "evidence.manage"] },
  { key: "announcements", label: "Thông báo", path: "/announcements", any: ["announcement.class"] },
  { key: "files", label: "Tệp lớp", path: "/files", any: ["files.manage"] },
  { key: "reports", label: "Báo cáo", path: "/reports", any: ["report.class"] },
];

export const classroomRepo = {
  /** Header + tabs for ClassWorkspace. Tabs come from the SAME permission model as the repository guards. */
  async header(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const acts = classActions(db, ctx.actor, schoolId, classId, ref);
      const year = db.years.find((y) => y.id === c.yearId)!;
      const school = db.schools.find((s) => s.id === schoolId)!;
      const hr = homeroomTeacher(db, classId, ref);
      const m = ctx.actor.kind === "staff" ? activeMembership(db, ctx.actor.userId, schoolId) : undefined;
      const myDuties = m ? liveAssignments(db, m.id, ref).filter((a) => a.classId === classId).map((a) => (a.kind === "homeroom" ? "Chủ nhiệm" : subjectName(db, a.subjectId))) : [];
      const roster = rosterOn(db, classId, ref);
      return {
        class: c, year, school: { id: school.id, name: school.name, shortName: school.shortName, slug: school.slug },
        grade: db.grades.find((g) => g.id === c.gradeId)?.name ?? "",
        homeroom: hr ? { name: staffName(hr), phone: hr.workPhone, email: hr.email, tone: hr.avatarTone } : null,
        size: roster.length, male: roster.filter((s) => s.gender === "Nam").length, female: roster.filter((s) => s.gender === "Nữ").length,
        myDuties, viaSchoolRole: myDuties.length === 0, actions: [...acts],
        summary: (() => {
          const week = weekOfDate(db, c.yearId, ref);
          const period = week ? db.conductPeriods.find((p) => p.classId === classId && p.weekId === week.id) : undefined;
          const lastPub = db.snapshots.filter((x) => x.classId === classId && x.status === "published").map((x) => x.publishedAt ?? "").sort().pop();
          const seeLinks = acts.has("parentAccess.issue") || allowed(db, ctx, "parentAccess.manage.all", { schoolId });
          const ids = new Set(roster.map((s) => s.id));
          const active = seeLinks ? db.parentAccesses.filter((p) => ids.has(p.studentId) && accessStatus(p, ctx.now) === "active") : [];
          return {
            weekIndex: week?.index, weekStatus: period?.status ?? "open", lastPublishedAt: lastPub,
            links: seeLinks ? { studentsWithLink: new Set(active.map((p) => p.studentId)).size, opened: new Set(active.filter((p) => db.parentAccessLogs.some((l) => l.accessId === p.id && (l.event === "opened" || l.event === "viewed"))).map((p) => p.studentId)).size } : null,
            pending: db.conductRecords.filter((r) => r.classId === classId && r.status === "pending_review").length,
          };
        })(),
        tabs: TAB_ACTIONS.filter((t) => t.any.some((a) => acts.has(a))).map((t) => ({ key: t.key, label: t.label, path: t.path })),
        readOnly: year.status === "archived" || c.status === "archived",
      };
    });
  },

  async overview(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const roster = rosterOn(db, classId, ref);
      const acts = classActions(db, ctx.actor, schoolId, classId, ref);
      const session = db.attendanceSessions.find((s) => s.classId === classId && s.date === ref && s.slot === "morning");
      const recs = session ? db.attendanceRecords.filter((r) => r.sessionId === session.id) : [];
      const counts = countAttendance(roster.map((s) => s.id), recs);
      const week = weekOfDate(db, c.yearId, ref);
      const period = week ? db.conductPeriods.find((p) => p.classId === classId && p.weekId === week.id) : undefined;
      const pending = db.conductRecords.filter((r) => r.classId === classId && r.status === "pending_review");
      const acts2 = db.activities.filter((a) => a.classId === classId && a.status === "active");
      const pendingEvidence = db.evidence.filter((e) => e.classId === classId && e.status === "pending").length;
      const tasks: { key: string; label: string; detail: string; href: string; status: string; tone: "danger" | "warning" | "info" | "neutral" }[] = [];
      const base = `/classroom/${schoolId}/${yearId}/${classId}`;
      if (acts.has("attendance.record") && weekdayOf(ref) !== 7) {
        if (!session) tasks.push({ key: "att", label: "Điểm danh buổi sáng", detail: `${counts.total} học sinh`, href: `${base}/attendance`, status: "Chưa điểm danh", tone: "danger" });
        else if (session.status === "saved" && acts.has("attendance.publish")) tasks.push({ key: "attpub", label: "Công bố chuyên cần hôm nay", detail: `Đã lưu lúc ${session.updatedAt.slice(11, 16)}`, href: `${base}/attendance`, status: "Chưa công bố", tone: "warning" });
      }
      if (acts.has("conduct.review") && pending.length) tasks.push({ key: "rev", label: `Rà soát thi đua tuần ${week?.index ?? ""}`, detail: `${pending.length} ghi nhận chờ rà soát`, href: `${base}/conduct/review`, status: `${pending.length} ghi nhận`, tone: "warning" });
      if (acts.has("evidence.manage") && pendingEvidence) tasks.push({ key: "ev", label: "Duyệt minh chứng hoạt động", detail: `${pendingEvidence} minh chứng chờ duyệt`, href: `${base}/evidence`, status: `${pendingEvidence} minh chứng`, tone: "info" });
      const adj = db.adjustments.filter((a) => a.classId === classId && a.status === "pending").length;
      if (adj && (acts.has("adjustment.approve") || acts.has("adjustment.request"))) tasks.push({ key: "adj", label: "Điều chỉnh sau chốt", detail: `${adj} đề nghị đang chờ duyệt`, href: `${base}/adjustments`, status: "Chờ duyệt", tone: "warning" });
      const noGroup = roster.filter((s) => !groupOf(db, classId, s.id, ref));
      if (acts.has("groups.manage") && noGroup.length) tasks.push({ key: "grp", label: "Xếp tổ cho học sinh mới", detail: noGroup.map((s) => s.fullName).join(", "), href: `${base}/groups`, status: `${noGroup.length} chưa phân tổ`, tone: "neutral" });
      return {
        counts, sessionStatus: session?.status ?? "none", week, periodStatus: period?.status ?? "open", pendingConduct: pending.length,
        activities: acts2.map((a) => {
          const subs = db.submissions.filter((s) => s.activityId === a.id);
          return { id: a.id, title: a.title, dueDate: a.dueDate, total: a.assignedStudentIds.length, done: subs.filter((s) => s.status === "approved").length };
        }),
        today: lessonsOn(db, classId, ref).map((l) => ({ period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId), teacher: staffName(userOfMembership(db, l.teacherMembershipId)), room: roomName(db, l.roomId), changed: l.changed })),
        groups: db.groups.filter((g) => g.classId === classId).sort((a, b) => a.order - b.order).map((g) => ({ id: g.id, name: g.name, size: roster.filter((s) => groupOf(db, classId, s.id, ref)?.id === g.id).length })),
        noGroup: noGroup.length, tasks, date: ref,
      };
    });
  },

  /** Roster projection: subject teachers get teaching-relevant fields only (no guardians / link status). */
  async roster(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, opts: { q?: string; groupId?: string; linkStatus?: string } = {}) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "roster.view", { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const seeGuardians = allowed(db, ctx, "guardian.view", { schoolId, classId });
      const seeLinks = allowed(db, ctx, "parentAccess.issue", { schoolId, classId }) || allowed(db, ctx, "parentAccess.manage.all", { schoolId });
      const leftRecently = db.enrollments.filter((e) => e.classId === classId && e.endDate && e.endDate < ref).map((e) => {
        const s = db.students.find((x) => x.id === e.studentId)!;
        return { id: s.id, fullName: s.fullName, code: s.code, endDate: e.endDate!, reason: e.endReason ?? "" };
      });
      const rows = rosterOn(db, classId, ref).map((s) => {
        const g = groupOf(db, classId, s.id, ref);
        const rels = seeGuardians ? db.relationships.filter((r) => r.studentId === s.id && r.verification !== "revoked") : [];
        const primary = rels.find((r) => r.isPrimaryContact) ?? rels[0];
        const links = seeLinks ? db.parentAccesses.filter((p) => p.studentId === s.id) : [];
        const active = links.filter((p) => accessStatus(p, ctx.now) === "active");
        const opened = active.some((p) => db.parentAccessLogs.some((l) => l.accessId === p.id && (l.event === "opened" || l.event === "viewed")));
        const enr = db.enrollments.find((e) => e.studentId === s.id && e.classId === classId && !e.endDate);
        return {
          id: s.id, code: s.code, fullName: s.fullName, gender: s.gender, dob: seeGuardians ? s.dob : undefined, avatarTone: s.avatarTone,
          groupId: g?.id, groupName: g?.name, positions: positionsOf(db, classId, s.id, ref).map((p) => positionLabel[p.position]),
          joinedAt: enr?.startDate, transferredIn: !!enr && enr.startDate > c.createdAt.slice(0, 10) && db.enrollments.some((e) => e.studentId === s.id && e.classId !== classId && e.yearId === c.yearId),
          guardian: primary ? { name: db.guardians.find((x) => x.id === primary.guardianId)?.fullName ?? "", relation: primary.relation, verification: primary.verification, phone: db.guardians.find((x) => x.id === primary.guardianId)?.phoneMasked } : undefined,
          link: seeLinks ? (active.length ? (opened ? "opened" : "issued") : links.some((p) => accessStatus(p, ctx.now) === "revoked") ? "revoked" : "none") : undefined,
        };
      }).filter((r) => matches(opts.q ?? "", r.fullName, r.code) && (!opts.groupId || (opts.groupId === "none" ? !r.groupId : r.groupId === opts.groupId)) && (!opts.linkStatus || r.link === opts.linkStatus));
      return {
        rows, leftRecently, seeGuardians, seeLinks, groups: db.groups.filter((g) => g.classId === classId).sort((a, b) => a.order - b.order),
        canAdd: allowed(db, ctx, "student.edit", { schoolId }), canTransfer: allowed(db, ctx, "student.transfer", { schoolId }) || allowed(db, ctx, "groups.manage", { schoolId, classId }),
        canGroups: allowed(db, ctx, "groups.manage", { schoolId, classId }), linkSummary: seeLinks ? { total: rows.length, withLink: rows.filter((r) => r.link === "issued" || r.link === "opened").length, opened: rows.filter((r) => r.link === "opened").length } : undefined,
      };
    });
  },

  /* ------------------------------ groups & positions ------------------------------ */
  async groups(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["groups.manage", "student.profile.view"], { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const roster = rosterOn(db, classId, ref);
      const groups = db.groups.filter((g) => g.classId === classId).sort((a, b) => a.order - b.order);
      const pos = db.positions.filter((p) => p.classId === classId && p.validFrom <= ref && (!p.validTo || p.validTo >= ref));
      return {
        groups: groups.map((g) => ({ ...g, members: roster.filter((s) => groupOf(db, classId, s.id, ref)?.id === g.id).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code, positions: pos.filter((p) => p.studentId === s.id).map((p) => p.position) })) })),
        unassigned: roster.filter((s) => !groupOf(db, classId, s.id, ref)).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code })),
        positions: pos.map((p) => ({ ...p, studentName: db.students.find((s) => s.id === p.studentId)?.fullName ?? "", groupName: db.groups.find((g) => g.id === p.groupId)?.name })),
        canEdit: allowed(db, ctx, "groups.manage", { schoolId, classId }), date: ref,
      };
    });
  },

  /** O23 — move students between groups (effective date). Positions are data, not accounts. */
  async setGroup(ctx: Ctx, schoolId: ID, classId: ID, input: { studentIds: ID[]; groupId: ID | null; effectiveDate: string }) {
    return write((db) => {
      requireAction(db, ctx, "groups.manage", { schoolId, classId });
      if (input.groupId && !db.groups.some((g) => g.id === input.groupId && g.classId === classId)) validation({ groupId: "Tổ không thuộc lớp" });
      for (const sid of input.studentIds) {
        if (!db.enrollments.some((e) => e.studentId === sid && e.classId === classId && !e.endDate)) throw new RepoError("VALIDATION", "Học sinh không thuộc lớp.");
        const cur = db.groupMemberships.find((g) => g.classId === classId && g.studentId === sid && !g.validTo);
        if (cur?.groupId === input.groupId) continue;
        if (cur) { if (cur.validFrom >= input.effectiveDate) db.groupMemberships = db.groupMemberships.filter((x) => x.id !== cur.id); else cur.validTo = addDays(input.effectiveDate, -1); }
        if (input.groupId) db.groupMemberships.push({ id: newId("gm"), classId, groupId: input.groupId, studentId: sid, validFrom: input.effectiveDate });
        // a group leader who leaves the group stops being its leader
        db.positions.filter((p) => p.classId === classId && p.studentId === sid && p.position === "group_leader" && !p.validTo && p.groupId !== input.groupId).forEach((p) => (p.validTo = addDays(input.effectiveDate, -1)));
      }
      audit(db, ctx, { level: "school", schoolId, action: "Xếp tổ", entityType: "class", entityId: classId, entityLabel: `${className(db, classId)}: ${input.studentIds.length} học sinh → ${db.groups.find((g) => g.id === input.groupId)?.name ?? "chưa phân tổ"}` });
      return true;
    });
  },

  async setPosition(ctx: Ctx, schoolId: ID, classId: ID, input: { studentId: ID; position: StudentPositionKey; groupId?: ID; effectiveDate: string; remove?: boolean }) {
    return write((db) => {
      requireAction(db, ctx, "groups.manage", { schoolId, classId });
      const unique: StudentPositionKey[] = ["class_monitor", "secretary", "vice_study", "vice_labor"];
      const live = db.positions.filter((p) => p.classId === classId && !p.validTo);
      if (input.remove) {
        live.filter((p) => p.studentId === input.studentId && p.position === input.position).forEach((p) => (p.validTo = addDays(input.effectiveDate, -1) < p.validFrom ? p.validFrom : addDays(input.effectiveDate, -1)));
      } else {
        if (input.position === "group_leader") {
          const g = groupOf(db, classId, input.studentId, input.effectiveDate);
          if (!g) validation({ studentId: "Học sinh chưa thuộc tổ nào" });
          input.groupId = g!.id;
          const holder = live.find((p) => p.position === "group_leader" && p.groupId === g!.id);
          if (holder && holder.studentId !== input.studentId) throw new RepoError("DUPLICATE", `${g!.name} đã có tổ trưởng (${db.students.find((s) => s.id === holder.studentId)?.fullName}). Bỏ chức vụ cũ trước.`);
        } else if (unique.includes(input.position)) {
          const holder = live.find((p) => p.position === input.position);
          if (holder && holder.studentId !== input.studentId) throw new RepoError("DUPLICATE", `${positionLabel[input.position]} hiện là ${db.students.find((s) => s.id === holder.studentId)?.fullName}. Bỏ chức vụ cũ trước.`);
        }
        if (!live.some((p) => p.studentId === input.studentId && p.position === input.position)) db.positions.push({ id: newId("pos"), classId, studentId: input.studentId, position: input.position, groupId: input.groupId, validFrom: input.effectiveDate });
      }
      audit(db, ctx, { level: "school", schoolId, action: input.remove ? "Bỏ chức vụ học sinh" : "Giao chức vụ học sinh", entityType: "class", entityId: classId, entityLabel: `${db.students.find((s) => s.id === input.studentId)?.fullName} — ${positionLabel[input.position]}` });
      return true;
    });
  },

  /* ------------------------------ seating ------------------------------ */
  async seating(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["seating.manage", "student.profile.view"], { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const plans = db.seatingPlans.filter((p) => p.classId === classId).sort((a, b) => b.version - a.version);
      const active = plans.filter((p) => p.status !== "draft" && p.effectiveDate <= ref).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.version - a.version)[0];
      const roster = rosterOn(db, classId, ref);
      const inRoster = new Set(roster.map((s) => s.id));
      const seated = new Set(active?.seats.map((s) => s.studentId).filter(Boolean) as string[]);
      return {
        plan: active ? { ...active, seats: active.seats.map((s) => ({ ...s, studentId: s.studentId && inRoster.has(s.studentId) ? s.studentId : null })) } : null,
        drafts: plans.filter((p) => p.status === "draft"), history: plans.map((p) => ({ id: p.id, version: p.version, effectiveDate: p.effectiveDate, status: p.status, createdByName: staffNameById(db, p.createdBy), createdAt: p.createdAt })),
        students: roster.map((s) => ({ id: s.id, fullName: s.fullName, code: s.code, groupName: groupOf(db, classId, s.id, ref)?.name })),
        unseated: roster.filter((s) => !seated.has(s.id)).map((s) => s.id),
        canEdit: allowed(db, ctx, "seating.manage", { schoolId, classId }), date: ref,
      };
    });
  },

  /** O24 — save a new seating version with an effective date. One student per seat; previous versions kept. */
  async saveSeating(ctx: Ctx, schoolId: ID, classId: ID, input: { rows: number; cols: number; seats: SeatingPlan["seats"]; effectiveDate: string; basedOnVersion: number; note?: string }) {
    return write((db) => {
      requireAction(db, ctx, "seating.manage", { schoolId, classId });
      const latest = Math.max(0, ...db.seatingPlans.filter((p) => p.classId === classId).map((p) => p.version));
      if (input.basedOnVersion !== latest) throw new RepoError("CONFLICT", "Sơ đồ vừa được người khác lưu phiên bản mới. Hãy tải lại trước khi lưu.");
      const ids = input.seats.map((s) => s.studentId).filter(Boolean) as string[];
      if (new Set(ids).size !== ids.length) throw new RepoError("VALIDATION", "Một học sinh đang ở hai ghế trong cùng phiên bản.");
      if (input.effectiveDate < ctx.today) validation({ effectiveDate: "Ngày áp dụng không trước hôm nay" });
      const roster = new Set(rosterOn(db, classId, input.effectiveDate).map((s) => s.id));
      if (ids.some((id) => !roster.has(id))) throw new RepoError("VALIDATION", "Có học sinh không thuộc lớp vào ngày áp dụng.");
      db.seatingPlans.filter((p) => p.classId === classId && p.status === "active" && p.effectiveDate >= input.effectiveDate).forEach((p) => (p.status = "superseded"));
      const plan: SeatingPlan = { id: newId("seat"), classId, version: latest + 1, rows: input.rows, cols: input.cols, effectiveDate: input.effectiveDate, status: "active", seats: input.seats, createdBy: actorId(ctx), createdAt: ctx.now, note: input.note };
      db.seatingPlans.push(plan);
      audit(db, ctx, { level: "school", schoolId, action: "Lưu sơ đồ lớp", entityType: "seating", entityId: plan.id, entityLabel: `${className(db, classId)} — phiên bản ${plan.version}, áp dụng ${input.effectiveDate}` });
      return plan;
    });
  },

  /* ------------------------------ timetable ------------------------------ */
  async timetable(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekStart?: string) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const monday = weekStart ?? mondayOf(ref);
      const canEdit = allowed(db, ctx, "timetable.edit", { schoolId, classId }) || allowed(db, ctx, "timetable.manage", { schoolId });
      const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i));
      return {
        monday, days: days.map((d) => ({ date: d, holiday: db.holidays.find((h) => h.schoolId === schoolId && h.startDate <= d && h.endDate >= d)?.name, lessons: lessonsOn(db, classId, d, canEdit).map((l) => ({
          id: l.id, period: l.period, ...periodTime(l.period), subjectId: l.subjectId, subject: subjectName(db, l.subjectId), color: db.subjects.find((s) => s.id === l.subjectId)?.color ?? "#64748b",
          teacher: staffName(userOfMembership(db, l.teacherMembershipId)), teacherMembershipId: l.teacherMembershipId,
          teacherStatus: db.memberships.find((m) => m.id === l.teacherMembershipId)?.status, room: roomName(db, l.roomId), changed: l.changed, cancelled: l.cancelled,
        })) })),
        changes: db.lessonChanges.filter((x) => x.classId === classId).sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ ...x, createdByName: staffNameById(db, x.createdBy), teacher: staffName(userOfMembership(db, x.teacherMembershipId)), subject: subjectName(db, x.subjectId), room: roomName(db, x.roomId) })),
        canEdit, week: weekOfDate(db, c.yearId, monday),
        options: {
          subjects: db.subjects.filter((s) => s.schoolId === schoolId && s.status === "active"),
          teachers: db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").map((m) => ({ id: m.id, name: staffNameById(db, m.userId) })).sort((a, b) => nameCompare(a.name, b.name)),
          rooms: db.rooms.filter((r) => r.schoolId === schoolId && r.status === "active"),
        },
      };
    });
  },

  /** Conflicts for a proposed change: teacher or room already busy in another class at that period/date. */
  async checkLessonChange(ctx: Ctx, schoolId: ID, input: { classId: ID; date: string; period: number; teacherMembershipId?: ID; roomId?: ID }) {
    return read((db) => conflictsFor(db, schoolId, input));
  },

  /** O25 — lesson change with an effective date; never rewrites past lessons. Draft → publish. */
  async saveLessonChange(ctx: Ctx, schoolId: ID, input: Omit<LessonChange, "id" | "schoolId" | "createdBy" | "createdAt" | "status"> & { publish: boolean; force?: boolean }) {
    return write((db) => {
      if (!allowed(db, ctx, "timetable.manage", { schoolId })) requireAction(db, ctx, "timetable.edit", { schoolId, classId: input.classId });
      if (input.date < ctx.today) validation({ date: "Không đổi lịch của ngày đã qua" });
      if (input.reason.trim().length < 5) validation({ reason: "Ghi lý do đổi tiết" });
      if (!lessonsOn(db, input.classId, input.date, true).some((l) => l.period === input.period)) validation({ period: "Không có tiết này trong lịch ngày đã chọn" });
      const conflicts = conflictsFor(db, schoolId, input);
      if (conflicts.length && input.publish) throw new RepoError("VALIDATION", `Xung đột: ${conflicts.map((c) => c.message).join("; ")}`, { details: { conflicts } });
      db.lessonChanges = db.lessonChanges.filter((x) => !(x.classId === input.classId && x.date === input.date && x.period === input.period && x.status === "draft"));
      const ch: LessonChange = { id: newId("lc"), schoolId, classId: input.classId, date: input.date, period: input.period, kind: input.kind, subjectId: input.subjectId, teacherMembershipId: input.teacherMembershipId, roomId: input.roomId, reason: input.reason.trim(), status: input.publish ? "published" : "draft", createdBy: actorId(ctx), createdAt: ctx.now };
      db.lessonChanges.push(ch);
      audit(db, ctx, { level: "school", schoolId, action: input.publish ? "Công bố đổi tiết" : "Lưu nháp đổi tiết", entityType: "lessonChange", entityId: ch.id, entityLabel: `${className(db, input.classId)} — ${input.date} tiết ${input.period}`, reason: input.reason });
      return { change: ch, conflicts };
    });
  },

  async publishLessonChange(ctx: Ctx, schoolId: ID, changeId: ID) {
    return write((db) => {
      const ch = findOr404(db.lessonChanges.find((x) => x.id === changeId && x.schoolId === schoolId), "đổi tiết");
      if (!allowed(db, ctx, "timetable.manage", { schoolId })) requireAction(db, ctx, "timetable.edit", { schoolId, classId: ch.classId });
      const conflicts = conflictsFor(db, schoolId, ch);
      if (conflicts.length) throw new RepoError("VALIDATION", `Xung đột: ${conflicts.map((c) => c.message).join("; ")}`);
      ch.status = "published";
      audit(db, ctx, { level: "school", schoolId, action: "Công bố đổi tiết", entityType: "lessonChange", entityId: ch.id, entityLabel: `${className(db, ch.classId)} — ${ch.date} tiết ${ch.period}` });
      return ch;
    });
  },

  async deleteDraftChange(ctx: Ctx, schoolId: ID, changeId: ID) {
    return write((db) => {
      const ch = findOr404(db.lessonChanges.find((x) => x.id === changeId && x.schoolId === schoolId), "đổi tiết");
      if (!allowed(db, ctx, "timetable.manage", { schoolId })) requireAction(db, ctx, "timetable.edit", { schoolId, classId: ch.classId });
      if (ch.status !== "draft") throw new RepoError("VALIDATION", "Chỉ xóa được bản nháp. Bản đã công bố cần tạo thay đổi mới.");
      db.lessonChanges = db.lessonChanges.filter((x) => x.id !== ch.id);
      return true;
    });
  },

  /** SC32 — school-wide grid filtered by class / teacher / room. */
  async schoolTimetable(ctx: Ctx, schoolId: ID, filter: { classId?: ID; membershipId?: ID; roomId?: ID; weekStart: string }) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(filter.weekStart, i));
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.status === "active");
      const cells = days.flatMap((d) => classes.flatMap((c) => lessonsOn(db, c.id, d).map((l) => ({ ...l, className: c.name }))))
        .filter((l) => (!filter.classId || l.classId === filter.classId) && (!filter.membershipId || l.teacherMembershipId === filter.membershipId) && (!filter.roomId || l.roomId === filter.roomId))
        .map((l) => ({ id: `${l.id}-${l.date}`, classId: l.classId, className: l.className, date: l.date, period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId), color: db.subjects.find((s) => s.id === l.subjectId)?.color ?? "#64748b", teacher: staffName(userOfMembership(db, l.teacherMembershipId)), room: roomName(db, l.roomId), changed: l.changed, cancelled: l.cancelled }));
      const clashes: string[] = [];
      for (const d of days) for (let p = 1; p <= 7; p++) {
        const slot = days.length && classes.flatMap((c) => lessonsOn(db, c.id, d).filter((l) => l.period === p));
        const byT = new Map<string, string[]>();
        (slot || []).forEach((l) => { if (l.teacherMembershipId && !l.subjectId.endsWith("shl") && !l.subjectId.endsWith("chaoco")) byT.set(l.teacherMembershipId, [...(byT.get(l.teacherMembershipId) ?? []), className(db, l.classId)]); });
        byT.forEach((cls, t) => { if (cls.length > 1) clashes.push(`${d} tiết ${p}: ${staffName(userOfMembership(db, t))} trùng ${cls.join(", ")}`); });
      }
      return {
        days, cells, clashes,
        options: { classes: classes.map((c) => ({ id: c.id, name: c.name })), teachers: db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").map((m) => ({ id: m.id, name: staffNameById(db, m.userId) })).sort((a, b) => nameCompare(a.name, b.name)), rooms: db.rooms.filter((r) => r.schoolId === schoolId) },
        canManage: allowed(db, ctx, "timetable.manage", { schoolId }),
      };
    });
  },

  /* ------------------------------ duties ------------------------------ */
  async duties(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekStart?: string) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const monday = weekStart ?? mondayOf(ref);
      const roster = rosterOn(db, classId, ref);
      const name = (id: ID) => roster.find((s) => s.id === id)?.fullName ?? db.students.find((s) => s.id === id)?.fullName ?? "";
      return {
        monday, days: [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i)).map((d) => ({ date: d, duties: db.duties.filter((x) => x.classId === classId && x.date === d).map((x) => ({ ...x, groupName: db.groups.find((g) => g.id === x.groupId)?.name, studentNames: x.studentIds.map(name) })) })),
        groups: db.groups.filter((g) => g.classId === classId).sort((a, b) => a.order - b.order).map((g) => ({ ...g, members: roster.filter((s) => groupOf(db, classId, s.id, ref)?.id === g.id).map((s) => ({ id: s.id, fullName: s.fullName })) })),
        students: roster.map((s) => ({ id: s.id, fullName: s.fullName })), canEdit: allowed(db, ctx, "duty.manage", { schoolId, classId }),
      };
    });
  },

  /** O26 — assign/edit a duty for the CURRENT class only. */
  async saveDuty(ctx: Ctx, schoolId: ID, classId: ID, input: { id?: ID; date: string; task: string; groupId?: ID; studentIds: ID[]; publish: boolean }) {
    return write((db) => {
      requireAction(db, ctx, "duty.manage", { schoolId, classId });
      const errors: Record<string, string> = {};
      if (input.task.trim().length < 3) errors.task = "Mô tả nhiệm vụ";
      if (!input.studentIds.length) errors.studentIds = "Chọn ít nhất một học sinh hoặc một tổ";
      const roster = new Set(rosterOn(db, classId, input.date).map((s) => s.id));
      if (input.studentIds.some((s) => !roster.has(s))) errors.studentIds = "Có học sinh không thuộc lớp vào ngày này";
      if (input.date < ctx.today) errors.date = "Không phân công cho ngày đã qua";
      if (Object.keys(errors).length) validation(errors);
      let d: Duty;
      if (input.id) {
        d = findOr404(db.duties.find((x) => x.id === input.id && x.classId === classId), "lịch trực");
        Object.assign(d, { date: input.date, task: input.task.trim(), groupId: input.groupId, studentIds: input.studentIds, status: input.publish ? "published" : "draft" });
      } else {
        d = { id: newId("du"), classId, date: input.date, task: input.task.trim(), groupId: input.groupId, studentIds: input.studentIds, status: input.publish ? "published" : "draft", createdBy: actorId(ctx) };
        db.duties.push(d);
      }
      audit(db, ctx, { level: "school", schoolId, action: input.publish ? "Công bố lịch trực nhật" : "Lưu nháp trực nhật", entityType: "duty", entityId: d.id, entityLabel: `${className(db, classId)} — ${input.date}` });
      return d;
    });
  },

  async deleteDuty(ctx: Ctx, schoolId: ID, classId: ID, dutyId: ID) {
    return write((db) => {
      requireAction(db, ctx, "duty.manage", { schoolId, classId });
      const d = findOr404(db.duties.find((x) => x.id === dutyId && x.classId === classId), "lịch trực");
      if (d.date < ctx.today) throw new RepoError("LOCKED", "Không xóa lịch trực đã qua.");
      db.duties = db.duties.filter((x) => x.id !== d.id);
      return true;
    });
  },

  /* ------------------------------ teacher workspace ------------------------------ */
  async teacherHome(ctx: Ctx, schoolId: ID) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const school = findOr404(db.schools.find((s) => s.id === schoolId), "trường");
      if (school.status !== "active") throw new RepoError("SUSPENDED");
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId);
      if (!m) throw new RepoError("FORBIDDEN");
      if (m.status !== "active") throw new RepoError("REVOKED", "Thành viên của bạn tại trường này đã bị tạm khóa hoặc thu hồi.");
      const live = liveAssignments(db, m.id, ctx.today);
      const classIds = [...new Set(live.map((a) => a.classId))];
      const classes = classIds.map((cid) => {
        const c = db.classes.find((x) => x.id === cid)!;
        const roster = rosterOn(db, cid, ctx.today);
        const mine = live.filter((a) => a.classId === cid);
        const isHomeroom = mine.some((a) => a.kind === "homeroom");
        const next = lessonsOn(db, cid, ctx.today).filter((l) => l.teacherMembershipId === m.id)[0];
        const sess = db.attendanceSessions.find((s) => s.classId === cid && s.date === ctx.today && s.slot === "morning");
        const counts = countAttendance(roster.map((s) => s.id), sess ? db.attendanceRecords.filter((r) => r.sessionId === sess.id) : []);
        return {
          id: c.id, yearId: c.yearId, name: c.name, motto: c.motto, isHomeroom, subjects: mine.filter((a) => a.kind === "subject").map((a) => subjectName(db, a.subjectId)),
          size: roster.length, room: roomName(db, c.roomId), nextLesson: next ? { period: next.period, ...periodTime(next.period), subject: subjectName(db, next.subjectId), room: roomName(db, next.roomId) } : null,
          attendance: isHomeroom ? { status: sess?.status ?? "none", ...counts } : null,
          pendingConduct: isHomeroom ? db.conductRecords.filter((r) => r.classId === cid && r.status === "pending_review").length : 0,
          pendingEvidence: db.evidence.filter((e) => e.classId === cid && e.status === "pending").length,
        };
      }).sort((a, b) => Number(b.isHomeroom) - Number(a.isHomeroom) || a.name.localeCompare(b.name, "vi"));
      const tasks = teacherTasks(db, ctx, schoolId, m.id);
      const hc = classes.find((c) => c.isHomeroom);
      const recentFeed = db.audit.filter((a) => a.schoolId === schoolId && (classIds.some((cid) => a.entityLabel.includes(className(db, cid))) || a.actorId === uid)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((a) => ({ ...a, actorName: staffNameById(db, a.actorId) }));
      return {
        classes, tasks, homeroom: hc ?? null,
        kpi: {
          presentToday: hc?.attendance ? hc.attendance.presentAll : null, sizeHomeroom: hc?.size ?? null, attendanceStatus: hc?.attendance?.status ?? null,
          absentToday: hc?.attendance ? hc.attendance.excused + hc.attendance.unexcused : null, unmarkedToday: hc?.attendance ? hc.attendance.unmarked : null,
          pendingConduct: classes.reduce((a, c) => a + c.pendingConduct, 0),
          unread: db.notifications.filter((n) => n.userId === uid && n.schoolId === schoolId && !n.readAt).length,
        },
        todayLessons: teacherLessonsOn(db, m.id, ctx.today).map((l) => ({ ...l, ...periodTime(l.period), className: className(db, l.classId), subject: subjectName(db, l.subjectId), room: roomName(db, l.roomId) })),
        feed: recentFeed, membershipId: m.id, today: ctx.today,
      };
    });
  },

  async teacherSchedule(ctx: Ctx, schoolId: ID, weekStart: string) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId && x.status === "active");
      if (!m) throw new RepoError("FORBIDDEN");
      const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(weekStart, i));
      const lessonDays = new Set<string>();
      return {
        days: days.map((d) => ({ date: d, holiday: db.holidays.find((h) => h.schoolId === schoolId && h.startDate <= d && h.endDate >= d)?.name, lessons: teacherLessonsOn(db, m.id, d).map((l) => {
          lessonDays.add(d);
          const c = db.classes.find((x) => x.id === l.classId)!;
          const subjectId = l.subjectId;
          const canAttend = liveAssignments(db, m.id, d).some((a) => a.classId === c.id && a.actions.includes("attendance.record") && (a.kind === "homeroom" || a.subjectId === subjectId));
          return { id: `${l.id}-${d}`, classId: c.id, yearId: c.yearId, className: c.name, period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId), room: roomName(db, l.roomId), changed: l.changed, cancelled: l.cancelled, canAttend };
        }) })),
        monthLessonDays: [...lessonDays],
      };
    });
  },

  async teacherTasks(ctx: Ctx, schoolId: ID) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId && x.status === "active");
      if (!m) throw new RepoError("FORBIDDEN");
      return teacherTasks(db, ctx, schoolId, m.id);
    });
  },

  async teacherClasses(ctx: Ctx, schoolId: ID, includeEnded = false) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId);
      if (!m) throw new RepoError("FORBIDDEN");
      const all = db.assignments.filter((a) => a.membershipId === m.id).map((a) => ({ ...a, live: isAssignmentLive(a, ctx.today) && m.status === "active" }));
      const shown = all.filter((a) => includeEnded || a.live);
      const byClass = new Map<string, typeof shown>();
      shown.forEach((a) => byClass.set(a.classId, [...(byClass.get(a.classId) ?? []), a]));
      return [...byClass.entries()].map(([cid, as]) => {
        const c = db.classes.find((x) => x.id === cid)!;
        const y = db.years.find((x) => x.id === c.yearId)!;
        const next = teacherLessonsOn(db, m.id, ctx.today).find((l) => l.classId === cid) ?? [1, 2, 3, 4, 5, 6].map((i) => addDays(ctx.today, i)).flatMap((d) => lessonsOn(db, cid, d).filter((l) => l.teacherMembershipId === m.id))[0];
        return {
          id: c.id, yearId: c.yearId, name: c.name, yearLabel: y.label, motto: c.motto, status: c.status, size: rosterOn(db, cid, ctx.today).length,
          duties: as.map((a) => ({ id: a.id, kind: a.kind, label: a.kind === "homeroom" ? "Chủ nhiệm" : subjectName(db, a.subjectId), live: a.live, validFrom: a.validFrom, validTo: a.validTo, status: a.status })),
          live: as.some((a) => a.live), homeroom: staffName(homeroomTeacher(db, cid, ctx.today)), room: roomName(db, c.roomId),
          nextLesson: next ? { date: next.date, period: next.period, ...periodTime(next.period), subject: subjectName(db, next.subjectId) } : null,
        };
      }).sort((a, b) => Number(b.live) - Number(a.live) || Number(b.duties.some((d) => d.kind === "homeroom")) - Number(a.duties.some((d) => d.kind === "homeroom")));
    });
  },

  async weekRoster(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, from: string, to: string) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      return rosterBetween(db, classId, from, to).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code }));
    });
  },

  async subjectTeachers(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      return subjectAssignments(db, classId, refDateOf(db, c, ctx.today)).map((a) => ({ subject: subjectName(db, a.subjectId), teacher: staffName(userOfMembership(db, a.membershipId)) }));
    });
  },
};

function conflictsFor(db: DemoDB, schoolId: ID, input: { classId: ID; date: string; period: number; teacherMembershipId?: ID; roomId?: ID }) {
  const out: { kind: "teacher" | "room" | "inactive"; message: string }[] = [];
  const others = db.classes.filter((c) => c.schoolId === schoolId && c.id !== input.classId && c.status === "active");
  for (const c of others) {
    const l = lessonsOn(db, c.id, input.date, false).find((x) => x.period === input.period && !x.cancelled);
    if (!l) continue;
    if (input.teacherMembershipId && l.teacherMembershipId === input.teacherMembershipId) out.push({ kind: "teacher", message: `${staffName(userOfMembership(db, input.teacherMembershipId))} đang dạy ${c.name} tiết ${input.period}` });
    if (input.roomId && l.roomId === input.roomId) out.push({ kind: "room", message: `Phòng ${roomName(db, input.roomId)} đang dùng cho ${c.name} tiết ${input.period}` });
  }
  if (input.teacherMembershipId) {
    const m = db.memberships.find((x) => x.id === input.teacherMembershipId);
    if (m && m.status !== "active") out.push({ kind: "inactive", message: "Giáo viên được chọn đang bị khóa thành viên" });
  }
  return out;
}

function teacherTasks(db: DemoDB, ctx: Ctx, schoolId: ID, membershipId: ID) {
  const live = liveAssignments(db, membershipId, ctx.today);
  const tasks: { id: string; kind: string; title: string; detail: string; href: string; status: string; tone: "danger" | "warning" | "info" | "neutral"; due?: string; classId: string; className: string }[] = [];
  const classIds = [...new Set(live.map((a) => a.classId))];
  for (const cid of classIds) {
    const c = db.classes.find((x) => x.id === cid)!;
    const base = `/classroom/${schoolId}/${c.yearId}/${cid}`;
    const acts = new Set(live.filter((a) => a.classId === cid).flatMap((a) => a.actions));
    const isHr = live.some((a) => a.classId === cid && a.kind === "homeroom");
    const mySubjects = live.filter((a) => a.classId === cid && a.kind === "subject").map((a) => a.subjectId);
    if (isHr && weekdayOf(ctx.today) !== 7) {
      const s = db.attendanceSessions.find((x) => x.classId === cid && x.date === ctx.today && x.slot === "morning");
      if (!s) tasks.push({ id: `att-${cid}`, kind: "attendance", title: `Điểm danh lớp ${c.name}`, detail: "Buổi sáng — tiết 1 (07:00)", href: `${base}/attendance`, status: "Chưa điểm danh", tone: "danger", due: ctx.today, classId: cid, className: c.name });
      else if (s.status === "saved") tasks.push({ id: `attpub-${cid}`, kind: "attendance", title: `Công bố chuyên cần ${c.name}`, detail: `Đã lưu lúc ${s.updatedAt.slice(11, 16)}, phụ huynh chưa thấy`, href: `${base}/attendance`, status: "Chưa công bố", tone: "warning", due: ctx.today, classId: cid, className: c.name });
    }
    if (!isHr) {
      const mine = lessonsOn(db, cid, ctx.today).filter((l) => l.teacherMembershipId === membershipId && mySubjects.includes(l.subjectId));
      for (const l of mine) {
        const s = db.attendanceSessions.find((x) => x.classId === cid && x.date === ctx.today && x.slot === `period-${l.period}`);
        if (!s) tasks.push({ id: `attp-${cid}-${l.period}`, kind: "attendance", title: `Điểm danh tiết ${l.period} — ${c.name}`, detail: `${subjectName(db, l.subjectId)} ${periodTime(l.period).start}`, href: `${base}/attendance?slot=period-${l.period}`, status: "Chưa điểm danh", tone: "neutral", due: ctx.today, classId: cid, className: c.name });
      }
    }
    if (acts.has("conduct.review")) {
      const pending = db.conductRecords.filter((r) => r.classId === cid && r.status === "pending_review").length;
      const week = weekOfDate(db, c.yearId, ctx.today);
      if (pending) tasks.push({ id: `rev-${cid}`, kind: "conduct", title: `Rà soát thi đua tuần ${week?.index ?? ""} — ${c.name}`, detail: "Xem và duyệt các ghi nhận của lớp", href: `${base}/conduct/review`, status: `Còn ${pending} ghi nhận`, tone: "warning", due: week?.closeDeadline, classId: cid, className: c.name });
      const overdue = db.conductPeriods.filter((p) => p.classId === cid && p.status === "open" && (db.weeks.find((w) => w.id === p.weekId)?.closeDeadline ?? "9") < ctx.today);
      overdue.forEach((p) => tasks.push({ id: `late-${p.id}`, kind: "conduct", title: `Chốt thi đua tuần ${db.weeks.find((w) => w.id === p.weekId)?.index} — ${c.name}`, detail: "Đã quá hạn chốt", href: `${base}/conduct/review`, status: "Quá hạn", tone: "danger", classId: cid, className: c.name }));
    }
    if (acts.has("evidence.manage")) {
      const pe = db.evidence.filter((e) => e.classId === cid && e.status === "pending").length;
      if (pe) tasks.push({ id: `ev-${cid}`, kind: "evidence", title: `Duyệt minh chứng — ${c.name}`, detail: "Minh chứng giáo viên đã ghi nhận chờ duyệt", href: `${base}/evidence`, status: `${pe} minh chứng`, tone: "info", classId: cid, className: c.name });
      const sup = db.submissions.filter((s) => s.status === "needs_supplement" && db.activities.find((a) => a.id === s.activityId)?.classId === cid).length;
      if (sup) tasks.push({ id: `sup-${cid}`, kind: "evidence", title: `Theo dõi minh chứng cần bổ sung — ${c.name}`, detail: "Học sinh cần bổ sung minh chứng", href: `${base}/activities`, status: `${sup} cần bổ sung`, tone: "neutral", classId: cid, className: c.name });
    }
    if (acts.has("announcement.class")) {
      const drafts = db.announcements.filter((a) => a.originClassId === cid && a.status === "draft").length;
      if (drafts) tasks.push({ id: `ann-${cid}`, kind: "announcement", title: `Thông báo nháp — ${c.name}`, detail: "Xem lại và công bố khi sẵn sàng", href: `${base}/announcements`, status: `${drafts} bản nháp`, tone: "neutral", classId: cid, className: c.name });
    }
    if (acts.has("adjustment.request")) {
      const adj = db.adjustments.filter((a) => a.classId === cid && a.status === "approved").length;
      if (adj) tasks.push({ id: `adjpub-${cid}`, kind: "conduct", title: `Công bố bản điều chỉnh — ${c.name}`, detail: "Điều chỉnh đã được duyệt, chờ công bố lại", href: `${base}/adjustments`, status: `${adj} bản`, tone: "warning", classId: cid, className: c.name });
    }
  }
  return tasks;
}
