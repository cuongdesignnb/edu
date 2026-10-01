import { beforeEach, describe, expect, it } from "vitest";
import {
  attendanceRepo, classroomRepo, conductRepo, makeCtx, parentRepo, resetStore, staffRepo, studentsRepo, platformRepo, announcementsRepo, isRepoError,
} from "@/lib/repositories/demo-index";
import { SCHOOL_A, SCHOOL_B, YEAR_A, YEAR_B, CLASS_A_10A1, CLASS_A_10A2, CLASS_B_10A1, MINH_ANH } from "@/lib/fixtures/seed";
import { setScenario } from "@/lib/demo/scenario";
import { getDB } from "@/lib/repositories/store";

// Historical synthetic domain regression only. These tests do not certify the API or native UI.

const lan = makeCtx({ kind: "staff", userId: "u-lan" });
const hung = makeCtx({ kind: "staff", userId: "u-hung" });
const hanh = makeCtx({ kind: "staff", userId: "u-hanh" });
const dung = makeCtx({ kind: "staff", userId: "u-dung" });
const khang = makeCtx({ kind: "staff", userId: "u-khang" });
const platform = makeCtx({ kind: "platform", userId: "u-bao" });
const mom = { token: "demo-minhanh-me" };
const dad = { token: "demo-minhanh-bo" };
const W5 = `${YEAR_A}-w5`;

async function code(p: Promise<unknown>) {
  try { await p; return "OK"; } catch (e) { return isRepoError(e) ? e.code : String(e); }
}

beforeEach(async () => {
  setScenario({ write: "normal", read: "normal", latencyMs: 0 });
  await resetStore();
});

describe("F02 / Q13 — one teacher, two different duties", () => {
  it("homeroom tabs in 10A1, subject-only in 10A2", async () => {
    const h1 = await classroomRepo.header(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1);
    const h2 = await classroomRepo.header(lan, SCHOOL_A, YEAR_A, CLASS_A_10A2);
    expect(h1.actions).toContain("seating.manage");
    expect(h2.actions).not.toContain("seating.manage");
    expect(h2.actions).not.toContain("guardian.view");
    expect(h2.actions).not.toContain("conduct.lock");
  });
  it("adapter refuses guardian edit for a 10A2 student even when called directly", async () => {
    const r = await classroomRepo.roster(lan, SCHOOL_A, YEAR_A, CLASS_A_10A2);
    expect(r.seeGuardians).toBe(false);
    expect(r.rows[0].guardian).toBeUndefined();
    const res = await code(studentsRepo.saveGuardian(lan, SCHOOL_A, { studentId: r.rows[0].id, fullName: "Nguyễn Văn Thử", relation: "Bố", phone: "0912345678", isPrimaryContact: false }));
    expect(res).toBe("FORBIDDEN");
    const p = await studentsRepo.profile(lan, SCHOOL_A, r.rows[0].id, CLASS_A_10A2);
    expect(p.level).toBe("subject-minimal");
    expect(p.relationships).toHaveLength(0);
  });
});

describe("NV-03 / Q17 — revoking an assignment blocks the next read/write", () => {
  it("revoked homeroom cannot lock or record morning attendance", async () => {
    const hr = getDB().assignments.find((a) => a.classId === CLASS_A_10A1 && a.kind === "homeroom")!;
    await staffRepo.revokeAssignment(hanh, SCHOOL_A, hr.id, "Kiểm thử thu hồi");
    expect(await code(conductRepo.lock(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5, false))).toBe("FORBIDDEN");
    expect(await code(attendanceRepo.save(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { date: "2026-10-05", slot: "morning", entries: [], linkConduct: false }))).toBe("FORBIDDEN");
  });
});

describe("Q15 / Q16 — school isolation and platform scope", () => {
  it("staff of B cannot open A's 10A1 and vice versa", async () => {
    expect(await code(classroomRepo.header(khang, SCHOOL_A, YEAR_A, CLASS_A_10A1))).toBe("FORBIDDEN");
    expect(await code(classroomRepo.header(lan, SCHOOL_B, YEAR_B, CLASS_B_10A1))).toBe("FORBIDDEN");
  });
  it("platform operator cannot list students", async () => {
    expect(await code(studentsRepo.list(platform, SCHOOL_A, {}))).toBe("FORBIDDEN");
    const o = await platformRepo.overview(platform);
    expect(o.totalSchools).toBe(8);
  });
});

describe("F03 / F04 / F05 — record → review → lock ≠ publish → adjust", () => {
  it("parent sees 97 only after publish, then 102 after an approved + published adjustment", async () => {
    const late = await conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "late", reason: "Đi muộn 10 phút", requestId: "t-late" });
    await conductRepo.createRecord(hung, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "speak", reason: "Phát biểu xây dựng bài", requestId: "t-speak" });
    // NV-10: same request retried → no duplicate
    const retry = await conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "late", reason: "Đi muộn 10 phút", requestId: "t-late" });
    expect(retry.idempotent).toBe(true);
    expect(await code(conductRepo.lock(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5, true))).toBe("VALIDATION"); // pending + duplicates block
    const recs = await conductRepo.records(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5);
    const dup = recs.records.find((r) => r.duplicateOf.length && r.createdBy === "u-hung")!;
    await conductRepo.review(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { recordIds: [dup.id], decision: "void", note: "Trùng sự việc" });
    const pending = (await conductRepo.records(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5)).records.filter((r) => r.status === "pending_review").map((r) => r.id);
    await conductRepo.review(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { recordIds: pending, decision: "approve" });
    expect((await parentRepo.conductList(mom, "binh-minh")).find((x) => x.weekIndex === 5)).toBeUndefined();
    await conductRepo.lock(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5, false);
    // Q23: locked but not published → parent still cannot see it
    expect((await parentRepo.conductList(mom, "binh-minh")).find((x) => x.weekIndex === 5)).toBeUndefined();
    await conductRepo.publish(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, W5);
    const w5 = (await parentRepo.conductList(mom, "binh-minh")).find((x) => x.weekIndex === 5)!;
    expect([w5.base, w5.minus, w5.plus, w5.total]).toEqual([100, -5, 2, 97]);

    const snapId = getDB().conductPeriods.find((p) => p.classId === CLASS_A_10A1 && p.weekId === W5)!.currentSnapshotId!;
    const adj = await conductRepo.requestAdjustment(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { snapshotId: snapId, studentId: MINH_ANH, kind: "remove_record", recordId: late.record.id, reason: "Ghi nhầm học sinh, đã xác minh lại" });
    expect(adj.afterTotal).toBe(102);
    expect(await code(conductRepo.decideAdjustment(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, adj.id, true, ""))).toBe("FORBIDDEN");
    await conductRepo.decideAdjustment(dung, SCHOOL_A, YEAR_A, CLASS_A_10A1, adj.id, true, "Đồng ý");
    expect((await parentRepo.conductList(mom, "binh-minh")).find((x) => x.weekIndex === 5)!.total).toBe(97); // ST18
    await conductRepo.publishAdjustment(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, adj.id);
    const after = await parentRepo.conductDetail(mom, "binh-minh", W5);
    expect(after.total).toBe(102);
    expect(after.history.map((h) => h.total)).toEqual([97, 102]);
  });

  it("NV-08 — publishing a new rule version does not change past snapshots", async () => {
    const before = getDB().snapshots.find((s) => s.id === `snap-${CLASS_A_10A1}-w4-v1`)!.rows.find((r) => r.studentId === MINH_ANH)!.total;
    await conductRepo.publishRuleSet(hanh, SCHOOL_A, "rs-a-3");
    const after = getDB().snapshots.find((s) => s.id === `snap-${CLASS_A_10A1}-w4-v1`)!;
    expect(after.rows.find((r) => r.studentId === MINH_ANH)!.total).toBe(before);
    expect(after.ruleSetVersionNo).toBe(1);
  });
});

describe("F07 / Q21 — attendance-linked conduct is never double counted", () => {
  it("late in attendance creates one record; manual late is refused; re-save does not duplicate", async () => {
    const sheet = await attendanceRepo.sheet(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, "2026-10-05", "morning");
    const entries = sheet.rows.map((r) => ({ studentId: r.studentId, status: r.studentId === MINH_ANH ? ("late" as const) : r.status, note: r.note }));
    await attendanceRepo.save(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { date: "2026-10-05", slot: "morning", entries, expectedVersion: sheet.session?.version, linkConduct: true });
    await attendanceRepo.save(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { date: "2026-10-05", slot: "morning", entries, linkConduct: true });
    const linked = getDB().conductRecords.filter((r) => r.studentId === MINH_ANH && r.date === "2026-10-05" && r.ruleId === "late" && r.status !== "void");
    expect(linked).toHaveLength(1);
    expect(await code(conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "late", reason: "Đi muộn", requestId: "x1" }))).toBe("DUPLICATE");
  });
  it("Q20 — unmarked is never counted as present and blocks publishing", async () => {
    const sheet = await attendanceRepo.sheet(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, "2026-10-05", "morning");
    const c = sheet.counts;
    expect(c.present + c.late + c.excused + c.unexcused + c.unmarked).toBe(c.total);
    const entries = sheet.rows.map((r, i) => ({ studentId: r.studentId, status: i === 0 ? ("unmarked" as const) : r.status }));
    await attendanceRepo.save(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { date: "2026-10-05", slot: "morning", entries, linkConduct: false });
    const again = await attendanceRepo.sheet(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, "2026-10-05", "morning");
    expect(again.counts.unmarked).toBe(1);
    expect(await code(attendanceRepo.publish(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, "2026-10-05", "morning"))).toBe("VALIDATION");
  });
});

describe("F06 / Q28–Q31 — private links without parent accounts", () => {
  it("revoking the mother's link blocks new reads; the father's link keeps working", async () => {
    expect((await parentRepo.context(mom, "binh-minh")).student.fullName).toBe("Nguyễn Minh Anh");
    await studentsRepo.revokeAccess(lan, SCHOOL_A, "pa-minhanh-me", "Kiểm thử thu hồi");
    expect(await code(parentRepo.overview(mom, "binh-minh"))).toBe("REVOKED");
    expect(await code(parentRepo.overview(dad, "binh-minh"))).toBe("OK");
  });
  it("cannot use a link on another school slug, nor read another student's records", async () => {
    expect(await code(parentRepo.context(mom, "an-hoa"))).toBe("NOT_FOUND");
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-9"))).toBe("NOT_FOUND"); // private notice for Bảo Châu
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-8"))).toBe("OK"); // her own
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-4"))).toBe("NOT_FOUND"); // draft
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-5"))).toBe("NOT_FOUND"); // withdrawn
  });
  it("expired / revoked / suspended / module-limited links", async () => {
    expect(await code(parentRepo.context({ token: "demo-expired" }, "binh-minh"))).toBe("EXPIRED");
    expect(await code(parentRepo.context({ token: "demo-revoked" }, "binh-minh"))).toBe("REVOKED");
    expect(await code(parentRepo.context({ token: "demo-truong-tam-dung" }, "tran-phu"))).toBe("SUSPENDED");
    expect(await code(parentRepo.conductList({ token: "demo-limited" }, "binh-minh"))).toBe("FORBIDDEN");
    expect(await code(parentRepo.context({ token: "nope" }, "binh-minh"))).toBe("NOT_FOUND");
  });
  it("Q27 — cannot issue a link to an unverified guardian", async () => {
    const trang = getDB().students.find((s) => s.fullName === "Đặng Thu Trang")!;
    const rel = getDB().relationships.find((r) => r.studentId === trang.id)!;
    expect(await code(studentsRepo.issueAccess(lan, SCHOOL_A, { relationshipId: rel.id, modules: ["attendance"], expiresOn: "2027-05-31" }))).toBe("UNVERIFIED");
  });
  it("Q34 — withdrawn announcement stops showing", async () => {
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-1"))).toBe("OK");
    await announcementsRepo.withdraw(hanh, SCHOOL_A, "an-1", "Kiểm thử thu hồi");
    expect(await code(parentRepo.announcement(mom, "binh-minh", "an-1"))).toBe("NOT_FOUND");
  });
});

describe("F12 / NV-14 / Q40 — network error and conflicts", () => {
  it("simulated network error saves nothing and a retry succeeds once", async () => {
    setScenario({ write: "fail-next" });
    const before = getDB().conductRecords.length;
    expect(await code(conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "speak", reason: "Phát biểu", requestId: "net-1" }))).toBe("NETWORK");
    expect(getDB().conductRecords.length).toBe(before);
    await conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "speak", reason: "Phát biểu", requestId: "net-1" });
    await conductRepo.createRecord(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1, { studentId: MINH_ANH, date: "2026-10-05", ruleId: "speak", reason: "Phát biểu", requestId: "net-1" });
    expect(getDB().conductRecords.length).toBe(before + 1);
  });
  it("stale version is rejected instead of overwriting", async () => {
    const s = getDB().students.find((x) => x.id === MINH_ANH)!;
    await studentsRepo.update(hanh, SCHOOL_A, MINH_ANH, { fullName: s.fullName, dob: s.dob, gender: s.gender, version: s.version });
    expect(await code(studentsRepo.update(hanh, SCHOOL_A, MINH_ANH, { fullName: "Tên Khác Hẳn", dob: s.dob, gender: s.gender, version: s.version }))).toBe("CONFLICT");
  });
});

describe("F09 / Q36 — import with errors never duplicates or overwrites", () => {
  it("previews row errors, commits valid rows, re-import skips", async () => {
    const rows = [
      { rowNo: 2, fullName: "Phan Thị Thử Nghiệm", dob: "01/02/2011", gender: "Nữ" },
      { rowNo: 3, fullName: "", dob: "01/02/2011", gender: "Nam" },
      { rowNo: 4, fullName: "Lý Văn Mẫu", dob: "2011-13-01", gender: "Nam" },
      { rowNo: 5, fullName: "Trần Bảo Châu", dob: "03/03/2011", gender: "Nữ" },
    ];
    const pre = await studentsRepo.importPreview(hanh, SCHOOL_A, CLASS_A_10A2, rows, "add_only");
    expect(pre.results.map((r) => r.result)).toEqual(["new", "error", "error", "warning"]);
    const before = getDB().students.length;
    await studentsRepo.importCommit(hanh, SCHOOL_A, { classId: CLASS_A_10A2, fileName: "t.csv", rows, mode: "add_only", includeWarnings: false });
    expect(getDB().students.length).toBe(before + 1);
    await studentsRepo.importCommit(hanh, SCHOOL_A, { classId: CLASS_A_10A2, fileName: "t.csv", rows, mode: "add_only", includeWarnings: false });
    expect(getDB().students.length).toBe(before + 1);
  });
});

describe("F08 / Q19 — transfer keeps history", () => {
  it("transfer ends the old enrollment and keeps past snapshots on the old class", async () => {
    const r = await classroomRepo.roster(hanh, SCHOOL_A, YEAR_A, CLASS_A_10A2);
    const sid = r.rows[1].id;
    await studentsRepo.requestTransfer(hanh, SCHOOL_A, { studentId: sid, kind: "transfer", toClassId: CLASS_A_10A1, effectiveDate: "2026-10-05", reason: "Kiểm thử chuyển lớp", applyNow: true });
    const ens = getDB().enrollments.filter((e) => e.studentId === sid);
    expect(ens.find((e) => e.classId === CLASS_A_10A2)!.endDate).toBe("2026-10-04");
    expect(ens.find((e) => e.classId === CLASS_A_10A1)!.startDate).toBe("2026-10-05");
    expect(getDB().snapshots.find((s) => s.id === `snap-${CLASS_A_10A2}-w4-v1`)!.rows.some((x) => x.studentId === sid)).toBe(true);
  });
});

describe("F04 — school B policy: only school leaders publish", () => {
  it("homeroom at B can lock but not publish; principal publishes", async () => {
    const hoa = makeCtx({ kind: "staff", userId: "u-hoa" });
    const loc = makeCtx({ kind: "staff", userId: "u-loc" });
    const W = `${YEAR_B}-w5`;
    const pending = (await conductRepo.records(hoa, SCHOOL_B, YEAR_B, CLASS_B_10A1, W)).records.filter((r) => r.status === "pending_review").map((r) => r.id);
    if (pending.length) await conductRepo.review(hoa, SCHOOL_B, YEAR_B, CLASS_B_10A1, { recordIds: pending, decision: "approve" });
    expect(await code(conductRepo.lock(hoa, SCHOOL_B, YEAR_B, CLASS_B_10A1, W, true))).toBe("FORBIDDEN");
    await conductRepo.lock(hoa, SCHOOL_B, YEAR_B, CLASS_B_10A1, W, false);
    expect(await code(conductRepo.publish(hoa, SCHOOL_B, YEAR_B, CLASS_B_10A1, W))).toBe("FORBIDDEN");
    expect(await code(conductRepo.publish(loc, SCHOOL_B, YEAR_B, CLASS_B_10A1, W))).toBe("OK");
  });
});

describe("SC07 / NV-13 — new school year rollover", () => {
  it("creates a year, enrols chosen students into new classes, leaves the old year untouched", async () => {
    const { schoolRepo } = await import("@/lib/repositories/demo-index");
    const y = await schoolRepo.createYear(hanh, SCHOOL_A, { label: "2027–2028", startDate: "2027-08-01", endDate: "2028-07-31", terms: [{ name: "Học kỳ 1", startDate: "2027-09-06", endDate: "2028-01-09" }], holidays: [], copyRules: false });
    const cls = await schoolRepo.saveClass(hanh, SCHOOL_A, { yearId: y.id, gradeId: "g-a-11", name: "11A1", capacity: 45 });
    const pre = await schoolRepo.rolloverPreview(hanh, SCHOOL_A, YEAR_A);
    const src = pre.classes.find((c) => c.id === CLASS_A_10A1)!;
    const before = getDB().enrollments.filter((e) => e.yearId === YEAR_A).length;
    const res = await schoolRepo.rolloverApply(hanh, SCHOOL_A, YEAR_A, y.id, src.students.map((s, i) => (i === 0 ? { studentId: s.id, action: "leave" as const } : { studentId: s.id, action: "promote" as const, targetClassId: cls.id })));
    expect(res).toEqual({ enrolled: src.students.length - 1, left: 1 });
    expect(getDB().enrollments.filter((e) => e.yearId === YEAR_A).length).toBe(before);
    const again = await schoolRepo.rolloverApply(hanh, SCHOOL_A, YEAR_A, y.id, src.students.slice(1).map((s) => ({ studentId: s.id, action: "promote" as const, targetClassId: cls.id })));
    expect(again.enrolled).toBe(0);
  });
});

describe("F11 / Q35 — lesson change with effective date and conflict detection", () => {
  it("detects a teacher already teaching another class; publishing is blocked; past dates refused", async () => {
    const { classroomRepo } = await import("@/lib/repositories/demo-index");
    const db = getDB();
    // Tuesday 06/10: find a period where Thầy Hùng teaches 10A2, then try to put him into 10A1 at that period
    const hungM = db.memberships.find((m) => m.userId === "u-hung" && m.schoolId === SCHOOL_A)!.id;
    const l = db.lessons.find((x) => x.classId === CLASS_A_10A2 && x.teacherMembershipId === hungM && x.weekday >= 2)!;
    const date = `2026-10-${String(4 + l.weekday).padStart(2, "0")}`; // Mon 05/10 + (weekday-1)
    const conflicts = await classroomRepo.checkLessonChange(hanh, SCHOOL_A, { classId: CLASS_A_10A1, date, period: l.period, teacherMembershipId: hungM });
    expect(conflicts.some((c) => c.kind === "teacher")).toBe(true);
    expect(await code(classroomRepo.saveLessonChange(hanh, SCHOOL_A, { classId: CLASS_A_10A1, date, period: l.period, kind: "substitute", teacherMembershipId: hungM, reason: "Dạy thay thử nghiệm", publish: true }))).toBe("VALIDATION");
    const draft = await classroomRepo.saveLessonChange(hanh, SCHOOL_A, { classId: CLASS_A_10A1, date, period: l.period, kind: "substitute", teacherMembershipId: hungM, reason: "Dạy thay thử nghiệm", publish: false });
    expect(draft.change.status).toBe("draft");
    expect(await code(classroomRepo.saveLessonChange(hanh, SCHOOL_A, { classId: CLASS_A_10A1, date: "2026-10-02", period: 1, kind: "cancel", reason: "Đổi lịch quá khứ", publish: true }))).toBe("VALIDATION");
  });
});

describe("Limitations closed in the final pass", () => {
  it("draft activities are visible only to people who can manage class activities", async () => {
    const { activitiesRepo } = await import("@/lib/repositories/demo-index");
    const own = await activitiesRepo.list(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1);
    expect(own.canManage).toBe(true);
    expect(own.items.some((a) => a.id === "act-4")).toBe(true);
    let checked = 0;
    for (const who of [dung, hanh, hung, makeCtx({ kind: "staff", userId: "u-quan" })]) {
      const r = await activitiesRepo.list(who, SCHOOL_A, YEAR_A, CLASS_A_10A1).catch(() => null);
      if (!r || r.canManage) continue;
      checked++;
      expect(r.items.some((a) => a.status === "draft")).toBe(false);
      expect(await code(activitiesRepo.detail(who, SCHOOL_A, YEAR_A, CLASS_A_10A1, "act-4"))).toBe("NOT_FOUND");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("notifications stop linking through when the school is suspended", async () => {
    const { sessionRepo } = await import("@/lib/repositories/demo-index");
    expect((await sessionRepo.notifications(lan, { schoolId: SCHOOL_A })).some((n) => n.accessible)).toBe(true);
    getDB().schools.find((s) => s.id === SCHOOL_A)!.status = "suspended";
    expect((await sessionRepo.notifications(lan, { schoolId: SCHOOL_A })).filter((n) => n.kind !== "system").every((n) => !n.accessible)).toBe(true);
  });

  it("a seating version effective today supersedes the one in force", async () => {
    const s = await classroomRepo.seating(lan, SCHOOL_A, YEAR_A, CLASS_A_10A1);
    const base = Math.max(...s.history.map((h) => h.version));
    await classroomRepo.saveSeating(lan, SCHOOL_A, CLASS_A_10A1, { rows: s.plan!.rows, cols: s.plan!.cols, seats: s.plan!.seats, effectiveDate: lan.today, basedOnVersion: base });
    const active = getDB().seatingPlans.filter((p) => p.classId === CLASS_A_10A1 && p.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(base + 1);
  });

  it("platform school history includes the admin invitation", async () => {
    const d = await platformRepo.school(platform, "sch-chuvanan");
    expect(d.history.some((h) => h.entityId === "inv-cva-admin")).toBe(true);
    expect(d.history.every((h) => h.level === "platform" || h.entityType === "invitation")).toBe(true);
  });
});
