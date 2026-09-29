/**
 * Parent read-only projection. There is NO parent account: a demo link token maps to
 * exactly one student × one school × one year. Every read re-validates the link, so a
 * revoked/expired link stops working on the next read (even in an open tab).
 * Only PUBLISHED data and granted modules are returned. This is a frontend mock —
 * not a security boundary.
 */
import type { AttendanceStatus, DemoDB, ID, ParentAccess, ParentModule } from "@/lib/model/types";
import * as clock from "@/lib/demo/clock";
import { addDays, mondayOf, weekdayOf } from "@/lib/demo/clock";
import * as fmt from "@/lib/formatters";
import { newId } from "@/lib/demo/ids";
import { periodTime } from "@/lib/domain/timetable";
import { RepoError } from "./errors";
import { read, write, allowed, requireAction, type Ctx } from "./core";
import { classOfStudentOn, homeroomAssignment, lessonsOn, roomName, staffName, subjectAssignments, subjectName, userOfMembership, weekOfDate } from "./selectors";
import { accessStatus } from "./students";

export type ParentKey = { token: string } | { preview: { ctx: Ctx; accessId: ID } };

export type UnavailableReason = "invalid" | "expired" | "revoked" | "suspended" | "module";

interface Resolved { pa: ParentAccess; studentId: ID; schoolId: ID; yearId: ID; now: string; today: string }

function nowOf(key: ParentKey): { now: string; today: string } {
  if ("preview" in key) return { now: key.preview.ctx.now, today: key.preview.ctx.today };
  // parent pages use the demo clock too
  const { demoNowISO, demoToday } = clock;
  return { now: demoNowISO(), today: demoToday() };
}

function resolve(db: DemoDB, key: ParentKey, slug: string): Resolved {
  const { now, today } = nowOf(key);
  let pa: ParentAccess | undefined;
  if ("preview" in key) {
    pa = db.parentAccesses.find((p) => p.id === key.preview.accessId);
    if (!pa) throw new RepoError("NOT_FOUND");
    const cls = classOfStudentOn(db, pa.studentId, key.preview.ctx.today);
    if (!allowed(db, key.preview.ctx, "parentAccess.manage.all", { schoolId: pa.schoolId })) requireAction(db, key.preview.ctx, "parentAccess.issue", { schoolId: pa.schoolId, classId: cls?.id });
  } else {
    pa = db.parentAccesses.find((p) => p.token === key.token);
    if (!pa) throw new RepoError("NOT_FOUND", "invalid");
  }
  const school = db.schools.find((s) => s.id === pa!.schoolId)!;
  if (school.slug !== slug) throw new RepoError("NOT_FOUND", "invalid");
  const st = accessStatus(pa, now);
  if (st === "revoked") throw new RepoError("REVOKED", "revoked");
  if (st === "expired") throw new RepoError("EXPIRED", "expired");
  if (school.status !== "active") throw new RepoError("SUSPENDED", "suspended");
  const rel = db.relationships.find((r) => r.id === pa!.relationshipId);
  if (!rel || rel.verification !== "verified") throw new RepoError("REVOKED", "revoked");
  return { pa, studentId: pa.studentId, schoolId: pa.schoolId, yearId: pa.yearId, now, today };
}

function needModule(r: Resolved, m: ParentModule) {
  if (!r.pa.modules.includes(m)) throw new RepoError("FORBIDDEN", "module");
}

/** Student's class inside the granted year only (a class change in the same year stays the same student). */
function classFor(db: DemoDB, r: Resolved) {
  const inYear = db.enrollments.filter((e) => e.studentId === r.studentId && e.yearId === r.yearId).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const cur = inYear.find((e) => e.startDate <= r.today && (!e.endDate || e.endDate >= r.today)) ?? inYear[0];
  return cur ? db.classes.find((c) => c.id === cur.classId) : undefined;
}

function visibleAnnouncements(db: DemoDB, r: Resolved) {
  const cls = classFor(db, r);
  const classIds = new Set(db.enrollments.filter((e) => e.studentId === r.studentId && e.yearId === r.yearId).map((e) => e.classId));
  return db.announcements.filter((a) => {
    if (a.schoolId !== r.schoolId || a.audience === "staff") return false;
    const live = a.status === "published" || (a.status === "scheduled" && !!a.scheduledAt && a.scheduledAt <= r.now);
    if (!live) return false;
    switch (a.scope.type) {
      case "school": return true;
      case "grade": return !!cls && (a.scope.gradeIds ?? []).includes(cls.gradeId);
      case "class": return (a.scope.classIds ?? []).some((c) => classIds.has(c));
      case "student": return (a.scope.studentIds ?? []).includes(r.studentId);
    }
  }).sort((a, b) => (b.publishedAt ?? b.scheduledAt ?? "").localeCompare(a.publishedAt ?? a.scheduledAt ?? ""));
}

function publishedAttendance(db: DemoDB, r: Resolved, from: string, to: string) {
  const sessions = db.attendanceSessions.filter((s) => s.status === "published" && s.date >= from && s.date <= to && (s.slot === "morning" || s.slot === "afternoon"));
  const out: { date: string; status: AttendanceStatus; note?: string; slot: string }[] = [];
  for (const s of sessions) {
    const rec = db.attendanceRecords.find((x) => x.sessionId === s.id && x.studentId === r.studentId);
    if (rec && rec.status !== "unmarked") out.push({ date: s.date, status: rec.status, note: rec.status === "excused" || rec.status === "late" ? rec.note : undefined, slot: s.slot });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function publishedConduct(db: DemoDB, r: Resolved) {
  return db.snapshots
    .filter((s) => s.status === "published" && db.weeks.find((w) => w.id === s.weekId)?.yearId === r.yearId && s.rows.some((x) => x.studentId === r.studentId))
    .map((s) => {
      const row = s.rows.find((x) => x.studentId === r.studentId)!;
      const w = db.weeks.find((x) => x.id === s.weekId)!;
      const bands = db.ruleSets.find((x) => x.id === s.ruleSetId)?.bands ?? [];
      return {
        periodId: w.id, weekIndex: w.index, startDate: w.startDate, endDate: w.endDate, versionNo: s.versionNo, publishedAt: s.publishedAt!, ruleSetName: s.ruleSetName, ruleSetVersionNo: s.ruleSetVersionNo,
        adjusted: s.versionNo > 1, adjustmentNote: s.versionNo > 1 ? "Kết quả đã được nhà trường điều chỉnh và công bố lại." : undefined,
        base: row.base, plus: row.plus, minus: row.minus, total: row.total, grade: row.grade, gradeTone: bands.find((b) => b.label === row.grade)?.tone ?? "info",
        items: row.items.filter((i) => i.shareWithParent).map((i) => ({ date: i.date, label: i.label, points: i.points })),
      };
    }).sort((a, b) => b.weekIndex - a.weekIndex);
}

export const parentRepo = {
  /** Validate a link (PA01). Errors carry a reason for the unavailable page — never any student data. */
  async open(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      return { ok: true as const, modules: r.pa.modules };
    });
  },

  async logView(key: ParentKey, slug: string, module: ParentModule | "overview", device: string) {
    if ("preview" in key) return;
    return write((db) => {
      const r = resolve(db, key, slug);
      const recent = db.parentAccessLogs.filter((l) => l.accessId === r.pa.id && l.module === module).map((l) => l.at).sort().pop();
      if (recent && Date.parse(r.now) - Date.parse(recent) < 30 * 60_000) return;
      const opened = !db.parentAccessLogs.some((l) => l.accessId === r.pa.id && (l.event === "opened" || l.event === "viewed"));
      db.parentAccessLogs.push({ id: newId("pal"), accessId: r.pa.id, schoolId: r.schoolId, at: r.now, event: opened ? "opened" : "viewed", module, device });
    }).catch(() => undefined);
  },

  async context(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      const s = db.students.find((x) => x.id === r.studentId)!;
      const cls = classFor(db, r);
      const school = db.schools.find((x) => x.id === r.schoolId)!;
      const year = db.years.find((y) => y.id === r.yearId)!;
      const lastPublished = [
        ...db.snapshots.filter((x) => x.classId === cls?.id && x.status === "published").map((x) => x.publishedAt ?? ""),
        ...db.attendanceSessions.filter((x) => x.classId === cls?.id && x.status === "published").map((x) => x.publishedAt ?? ""),
      ].sort().pop();
      const rel = db.relationships.find((x) => x.id === r.pa.relationshipId)!;
      return {
        student: { fullName: s.fullName, gender: s.gender, avatarTone: s.avatarTone },
        className: cls?.name ?? "—", school: { name: school.name, shortName: school.shortName, slug: school.slug, publicPhone: school.publicPhone, publicEmail: school.publicEmail, address: school.address, motto: school.motto },
        yearLabel: year.label, modules: r.pa.modules, expiresAt: r.pa.expiresAt, lastPublishedAt: lastPublished || undefined, relation: rel.relation, isPreview: "preview" in key,
      };
    });
  },

  async overview(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      const cls = classFor(db, r);
      const monday = mondayOf(r.today);
      const has = (m: ParentModule) => r.pa.modules.includes(m);
      const hr = cls ? homeroomAssignment(db, cls.id, r.today) : undefined;
      const hrUser = hr ? userOfMembership(db, hr.membershipId) : undefined;
      const settings = db.settings.find((x) => x.schoolId === r.schoolId);
      const att = has("attendance") ? publishedAttendance(db, r, monday, addDays(monday, 5)) : [];
      const conduct = has("conduct") ? publishedConduct(db, r)[0] : undefined;
      const today = has("timetable") && cls ? lessonsOn(db, cls.id, r.today).map((l) => ({ period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId), room: roomName(db, l.roomId), teacher: staffName(userOfMembership(db, l.teacherMembershipId)), changed: l.changed?.reason, cancelled: l.cancelled })) : [];
      const duties = has("duties") && cls ? db.duties.filter((d) => d.classId === cls.id && d.status === "published" && d.studentIds.includes(r.studentId) && d.date >= r.today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2).map((d) => ({ date: d.date, task: d.task })) : [];
      const acts = has("activities") && cls ? db.activities.filter((a) => a.classId === cls.id && a.publishedToParents && a.status !== "draft" && a.assignedStudentIds.includes(r.studentId)).map((a) => ({ id: a.id, title: a.title, dueDate: a.dueDate, status: db.submissions.find((s) => s.activityId === a.id && s.studentId === r.studentId)?.status ?? "not_received" })) : [];
      return {
        modules: r.pa.modules, today: r.today,
        teacher: has("teachers") && hrUser ? { name: staffName(hrUser), role: `Giáo viên chủ nhiệm lớp ${cls?.name}`, phone: settings?.shareTeacherPhone ? hrUser.workPhone : undefined, email: settings?.shareTeacherEmail ? hrUser.email : undefined, tone: hrUser.avatarTone, contactHours: settings?.contactHours } : null,
        attendanceWeek: has("attendance") ? { monday, published: att.length, present: att.filter((x) => x.status === "present").length, late: att.filter((x) => x.status === "late").length, excused: att.filter((x) => x.status === "excused").length, unexcused: att.filter((x) => x.status === "unexcused").length, schoolDaysSoFar: [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i)).filter((d) => d <= r.today).length } : null,
        conduct: conduct ?? null, todayLessons: today, duties, activities: acts,
        announcements: has("announcements") ? visibleAnnouncements(db, r).slice(0, 3).map((a) => ({ id: a.id, title: a.title, summary: a.summary, publishedAt: a.publishedAt ?? a.scheduledAt })) : [],
      };
    });
  },

  async attendance(key: ParentKey, slug: string, month: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "attendance");
      const year = db.years.find((y) => y.id === r.yearId)!;
      const from = `${month}-01`;
      const [yy, mm] = month.split("-").map(Number);
      const end = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      const records = publishedAttendance(db, r, from, end);
      const days: string[] = [];
      for (let d = from; d <= end; d = addDays(d, 1)) days.push(d);
      const byDate = new Map(records.map((x) => [x.date, x]));
      return {
        month, yearStart: year.startDate.slice(0, 7), yearEnd: (year.endDate < r.today ? year.endDate : r.today).slice(0, 7),
        days: days.map((d) => ({ date: d, weekday: weekdayOf(d), status: byDate.get(d)?.status ?? (d > r.today ? "future" : db.holidays.some((h) => h.schoolId === r.schoolId && h.startDate <= d && h.endDate >= d) ? "holiday" : weekdayOf(d) === 7 ? "weekend" : "not_published"), note: byDate.get(d)?.note })),
        totals: { present: records.filter((x) => x.status === "present").length, late: records.filter((x) => x.status === "late").length, excused: records.filter((x) => x.status === "excused").length, unexcused: records.filter((x) => x.status === "unexcused").length, published: records.length },
      };
    });
  },

  async conductList(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "conduct");
      return publishedConduct(db, r);
    });
  },

  async conductDetail(key: ParentKey, slug: string, periodId: ID) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "conduct");
      const item = publishedConduct(db, r).find((x) => x.periodId === periodId);
      if (!item) throw new RepoError("NOT_FOUND", "Kỳ này chưa có kết quả công bố cho học sinh.");
      const history = db.snapshots.filter((s) => s.weekId === periodId && (s.status === "published" || s.status === "superseded") && s.rows.some((x) => x.studentId === r.studentId))
        .sort((a, b) => a.versionNo - b.versionNo).map((s) => ({ versionNo: s.versionNo, publishedAt: s.publishedAt, total: s.rows.find((x) => x.studentId === r.studentId)!.total, current: s.status === "published" }));
      return { ...item, history, className: classFor(db, r)?.name };
    });
  },

  async timetable(key: ParentKey, slug: string, weekStart: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "timetable");
      const cls = classFor(db, r);
      const year = db.years.find((y) => y.id === r.yearId)!;
      if (weekStart < mondayOf(year.startDate) || weekStart > year.endDate) throw new RepoError("FORBIDDEN", "Ngoài năm học được cấp quyền xem.");
      return {
        weekStart, week: weekOfDate(db, r.yearId, weekStart)?.index,
        days: [0, 1, 2, 3, 4, 5].map((i) => addDays(weekStart, i)).map((d) => ({ date: d, holiday: db.holidays.find((h) => h.schoolId === r.schoolId && h.startDate <= d && h.endDate >= d)?.name,
          lessons: cls ? lessonsOn(db, cls.id, d).map((l) => ({ period: l.period, ...periodTime(l.period), subject: subjectName(db, l.subjectId), room: roomName(db, l.roomId), teacher: staffName(userOfMembership(db, l.teacherMembershipId)), changed: l.changed?.reason, cancelled: l.cancelled })) : [] })),
      };
    });
  },

  async duties(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "duties");
      const cls = classFor(db, r);
      // Only the child's own duties; no names of other students.
      return (cls ? db.duties.filter((d) => d.classId === cls.id && d.status === "published" && d.studentIds.includes(r.studentId)) : []).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ id: d.id, date: d.date, task: d.task, groupName: db.groups.find((g) => g.id === d.groupId)?.name, upcoming: d.date >= r.today }));
    });
  },

  async activities(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "activities");
      const cls = classFor(db, r);
      return (cls ? db.activities.filter((a) => a.classId === cls.id && a.publishedToParents && a.status !== "draft" && a.assignedStudentIds.includes(r.studentId)) : []).map((a) => ({
        id: a.id, title: a.title, description: a.description, illustration: a.illustration, dueDate: a.dueDate, status: a.status,
        submission: db.submissions.find((s) => s.activityId === a.id && s.studentId === r.studentId)?.status ?? "not_received",
      })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    });
  },

  async activity(key: ParentKey, slug: string, activityId: ID) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "activities");
      const a = db.activities.find((x) => x.id === activityId && x.publishedToParents && x.status !== "draft" && x.assignedStudentIds.includes(r.studentId) && x.schoolId === r.schoolId);
      if (!a) throw new RepoError("NOT_FOUND", "Không có hoạt động này trong thông tin của học sinh.");
      const sub = db.submissions.find((s) => s.activityId === a.id && s.studentId === r.studentId);
      const ev = db.evidence.filter((e) => e.activityId === a.id && e.studentId === r.studentId && e.sharedWithParent && e.status === "approved").map((e) => {
        const f = db.files.find((x) => x.id === e.fileId && x.status === "active" && x.share === "student_parent" && x.studentId === r.studentId);
        return f ? { id: f.id, name: f.name, mime: f.mime, size: f.size, source: f.source, uploadedAt: e.uploadedAt } : null;
      }).filter(Boolean);
      return { id: a.id, title: a.title, description: a.description, illustration: a.illustration, dueDate: a.dueDate, status: a.status, submission: sub?.status ?? "not_received", note: sub?.status === "needs_supplement" ? sub.note : undefined, updatedAt: sub?.updatedAt, evidence: ev };
    });
  },

  async announcements(key: ParentKey, slug: string, q = "") {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "announcements");
      const { fold } = fmt;
      return visibleAnnouncements(db, r).filter((a) => !q || fold(a.title + " " + a.summary).includes(fold(q))).map((a) => ({ id: a.id, title: a.title, summary: a.summary, publishedAt: a.publishedAt ?? a.scheduledAt, scope: a.scope.type, from: a.origin === "class" ? `Lớp ${db.classes.find((c) => c.id === a.originClassId)?.name}` : "Nhà trường", attachments: a.attachmentIds.length }));
    });
  },

  async announcement(key: ParentKey, slug: string, id: ID) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "announcements");
      const a = visibleAnnouncements(db, r).find((x) => x.id === id);
      if (!a) throw new RepoError("NOT_FOUND", "Thông báo không tồn tại, đã thu hồi hoặc không dành cho học sinh này.");
      return {
        id: a.id, title: a.title, body: a.body, publishedAt: a.publishedAt ?? a.scheduledAt, from: a.origin === "class" ? `Giáo viên chủ nhiệm lớp ${db.classes.find((c) => c.id === a.originClassId)?.name}` : db.schools.find((s) => s.id === r.schoolId)?.name,
        attachments: a.attachmentIds.map((fid) => db.files.find((f) => f.id === fid && f.status === "active" && f.share !== "internal")).filter(Boolean).map((f) => ({ id: f!.id, name: f!.name, mime: f!.mime, size: f!.size, source: f!.source })),
      };
    });
  },

  async teachers(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "teachers");
      const cls = classFor(db, r);
      const settings = db.settings.find((x) => x.schoolId === r.schoolId)!;
      const school = db.schools.find((s) => s.id === r.schoolId)!;
      if (!cls) return { homeroom: null, subjects: [], school, contactHours: settings.contactHours };
      const hr = homeroomAssignment(db, cls.id, r.today);
      const hu = hr ? userOfMembership(db, hr.membershipId) : undefined;
      const days = (membershipId: ID) => [...new Set(db.lessons.filter((l) => l.classId === cls.id && l.teacherMembershipId === membershipId).map((l) => l.weekday))].sort().map((d) => (d === 7 ? "CN" : `Thứ ${d + 1}`));
      const contact = (u?: ReturnType<typeof userOfMembership>) => ({ phone: settings.shareTeacherPhone ? u?.workPhone : undefined, email: settings.shareTeacherEmail ? u?.email : undefined });
      return {
        homeroom: hu ? { name: staffName(hu), tone: hu.avatarTone, className: cls.name, ...contact(hu) } : null,
        subjects: subjectAssignments(db, cls.id, r.today).filter((a) => db.memberships.find((m) => m.id === a.membershipId)?.status === "active").map((a) => { const u = userOfMembership(db, a.membershipId); return { subject: subjectName(db, a.subjectId), subjectColor: db.subjects.find((s) => s.id === a.subjectId)?.color, name: staffName(u), days: days(a.membershipId).join(", "), ...contact(u) }; }).sort((a, b) => a.subject.localeCompare(b.subject, "vi")),
        school: { name: school.name, address: school.address, publicPhone: school.publicPhone, publicEmail: school.publicEmail }, contactHours: settings.contactHours,
      };
    });
  },

  async documents(key: ParentKey, slug: string) {
    return read((db) => {
      const r = resolve(db, key, slug);
      needModule(r, "documents");
      const cls = classFor(db, r);
      const files = db.files.filter((f) => f.schoolId === r.schoolId && f.status === "active" && f.category !== "evidence" && ((f.share === "class_parents" && (f.classId === cls?.id || !f.classId)) || (f.share === "student_parent" && f.studentId === r.studentId)))
        .map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, source: f.source, createdAt: f.createdAt, kind: f.share === "student_parent" ? "Riêng của con" : f.classId ? "Lớp" : "Nhà trường" }));
      const reports = r.pa.modules.includes("conduct") ? publishedConduct(db, r).map((c) => ({ periodId: c.periodId, title: `Kết quả thi đua tuần ${c.weekIndex}`, publishedAt: c.publishedAt, total: c.total, grade: c.grade })) : [];
      return { files, reports };
    });
  },

  /** Fetch one file for the parent: only if shared with THIS student/class. */
  async file(key: ParentKey, slug: string, fileId: ID) {
    return read((db) => {
      const r = resolve(db, key, slug);
      const cls = classFor(db, r);
      const f = db.files.find((x) => x.id === fileId && x.schoolId === r.schoolId);
      const ok = f && f.status === "active" && ((f.share === "student_parent" && f.studentId === r.studentId) || (f.share === "class_parents" && (!f.classId || f.classId === cls?.id)));
      if (!ok) throw new RepoError(f?.status === "revoked" ? "REVOKED" : "NOT_FOUND", "Tệp không được chia sẻ cho học sinh này hoặc đã bị thu hồi.");
      return { id: f!.id, name: f!.name, mime: f!.mime, size: f!.size, source: f!.source };
    });
  },

  /** For the public/demo chooser: tokens are listed ONLY in demo mode, never in product UI. */
  async demoLinks() {
    return read((db) => db.parentAccesses.map((p) => {
      const s = db.students.find((x) => x.id === p.studentId)!;
      const rel = db.relationships.find((x) => x.id === p.relationshipId)!;
      const school = db.schools.find((x) => x.id === p.schoolId)!;
      return { id: p.id, token: p.token, slug: school.slug, schoolName: school.shortName, studentName: s.fullName, relation: rel.relation, status: accessStatus(p, clock.demoNowISO()), modules: p.modules.length, yearLabel: db.years.find((y) => y.id === p.yearId)?.label };
    }));
  },
};
