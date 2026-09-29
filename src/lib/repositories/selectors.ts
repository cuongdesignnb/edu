/** Pure lookups over DemoDB shared by all repository modules (single source of truth). */
import type { DemoDB, ID, Student, StaffUser, Membership, Lesson, RuleSet, Week, ClassRoom, AcademicYear } from "@/lib/model/types";
import { isAssignmentLive } from "@/lib/permissions/can";
import { weekdayOf } from "@/lib/demo/clock";
import { nameCompare } from "@/lib/formatters";

export function enrollmentsOn(db: DemoDB, classId: ID, date: string) {
  return db.enrollments.filter((e) => e.classId === classId && e.startDate <= date && (!e.endDate || e.endDate >= date));
}

export function rosterOn(db: DemoDB, classId: ID, date: string): Student[] {
  const ids = new Set(enrollmentsOn(db, classId, date).map((e) => e.studentId));
  return db.students.filter((s) => ids.has(s.id)).sort((a, b) => nameCompare(a.fullName, b.fullName));
}

/** Students enrolled at any point in a date range (for weekly views/snapshots). */
export function rosterBetween(db: DemoDB, classId: ID, from: string, to: string): Student[] {
  const ids = new Set(db.enrollments.filter((e) => e.classId === classId && e.startDate <= to && (!e.endDate || e.endDate >= from)).map((e) => e.studentId));
  return db.students.filter((s) => ids.has(s.id)).sort((a, b) => nameCompare(a.fullName, b.fullName));
}

export function classOfStudentOn(db: DemoDB, studentId: ID, date: string): ClassRoom | undefined {
  const e = db.enrollments.find((x) => x.studentId === studentId && x.startDate <= date && (!x.endDate || x.endDate >= date));
  return e ? db.classes.find((c) => c.id === e.classId) : undefined;
}

export function latestClassOf(db: DemoDB, studentId: ID): ClassRoom | undefined {
  const e = [...db.enrollments].filter((x) => x.studentId === studentId).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return e ? db.classes.find((c) => c.id === e.classId) : undefined;
}

export function userById(db: DemoDB, id?: ID): StaffUser | undefined {
  return id ? db.users.find((u) => u.id === id) : undefined;
}

export function userOfMembership(db: DemoDB, membershipId?: ID): StaffUser | undefined {
  const m = db.memberships.find((x) => x.id === membershipId);
  return m ? userById(db, m.userId) : undefined;
}

export function staffName(u?: StaffUser | null, withHonorific = true): string {
  if (!u) return "—";
  return withHonorific && u.honorific ? `${u.honorific} ${u.fullName}` : u.fullName;
}

export function staffNameById(db: DemoDB, userId?: ID, withHonorific = true): string {
  if (!userId) return "—";
  if (userId === "anonymous") return "Phiên không xác định";
  return staffName(userById(db, userId), withHonorific);
}

export function membershipOf(db: DemoDB, userId: ID, schoolId: ID): Membership | undefined {
  return db.memberships.find((m) => m.userId === userId && m.schoolId === schoolId);
}

export function homeroomAssignment(db: DemoDB, classId: ID, date: string) {
  return db.assignments.find((a) => a.classId === classId && a.kind === "homeroom" && isAssignmentLive(a, date));
}

export function homeroomTeacher(db: DemoDB, classId: ID, date: string): StaffUser | undefined {
  const a = homeroomAssignment(db, classId, date);
  return a ? userOfMembership(db, a.membershipId) : undefined;
}

export function subjectAssignments(db: DemoDB, classId: ID, date: string) {
  return db.assignments.filter((a) => a.classId === classId && a.kind === "subject" && isAssignmentLive(a, date));
}

export function currentYear(db: DemoDB, schoolId: ID): AcademicYear | undefined {
  return db.years.find((y) => y.schoolId === schoolId && y.status === "active") ?? db.years.filter((y) => y.schoolId === schoolId).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export function weekOfDate(db: DemoDB, yearId: ID, date: string): Week | undefined {
  return db.weeks.find((w) => w.yearId === yearId && w.startDate <= date && w.endDate >= date);
}

export function ruleSetOn(db: DemoDB, schoolId: ID, date: string): RuleSet | undefined {
  return db.ruleSets
    .filter((r) => r.schoolId === schoolId && r.status !== "draft" && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date))
    .sort((a, b) => b.versionNo - a.versionNo)[0];
}

export function className(db: DemoDB, classId?: ID): string {
  return db.classes.find((c) => c.id === classId)?.name ?? "—";
}

export function subjectName(db: DemoDB, subjectId?: ID): string {
  return db.subjects.find((s) => s.id === subjectId)?.name ?? "—";
}

export function roomName(db: DemoDB, roomId?: ID): string {
  return db.rooms.find((r) => r.id === roomId)?.code ?? "—";
}

export function groupOf(db: DemoDB, classId: ID, studentId: ID, date: string) {
  const gm = db.groupMemberships.find((g) => g.classId === classId && g.studentId === studentId && g.validFrom <= date && (!g.validTo || g.validTo >= date));
  return gm ? db.groups.find((g) => g.id === gm.groupId) : undefined;
}

export function positionsOf(db: DemoDB, classId: ID, studentId: ID, date: string) {
  return db.positions.filter((p) => p.classId === classId && p.studentId === studentId && p.validFrom <= date && (!p.validTo || p.validTo >= date));
}

export interface ResolvedLesson extends Lesson {
  date: string;
  changed?: { kind: string; reason: string };
  cancelled?: boolean;
}

/** Lessons valid on a date, with published (or, if includeDraft, draft) changes applied. */
export function lessonsOn(db: DemoDB, classId: ID, date: string, includeDraft = false): ResolvedLesson[] {
  const wd = weekdayOf(date);
  const base = db.lessons
    .filter((l) => l.classId === classId && l.weekday === wd && l.validFrom <= date && (!l.validTo || l.validTo >= date) && (includeDraft || l.status === "published"))
    .map((l): ResolvedLesson => ({ ...l, date }));
  const changes = db.lessonChanges.filter((c) => c.classId === classId && c.date === date && (includeDraft || c.status === "published"));
  for (const c of changes) {
    const l = base.find((x) => x.period === c.period);
    if (!l) continue;
    if (c.kind === "cancel") { l.cancelled = true; l.changed = { kind: c.kind, reason: c.reason }; continue; }
    if (c.subjectId) l.subjectId = c.subjectId;
    if (c.teacherMembershipId) l.teacherMembershipId = c.teacherMembershipId;
    if (c.roomId) l.roomId = c.roomId;
    l.changed = { kind: c.kind, reason: c.reason };
  }
  return base.sort((a, b) => a.period - b.period);
}

/** Lessons taught by a membership on a date across classes. */
export function teacherLessonsOn(db: DemoDB, membershipId: ID, date: string): ResolvedLesson[] {
  const classIds = [...new Set(db.lessons.map((l) => l.classId))];
  return classIds.flatMap((cid) => lessonsOn(db, cid, date).filter((l) => l.teacherMembershipId === membershipId)).sort((a, b) => a.period - b.period);
}

export function studentsById(db: DemoDB): Map<ID, Student> {
  return new Map(db.students.map((s) => [s.id, s]));
}
