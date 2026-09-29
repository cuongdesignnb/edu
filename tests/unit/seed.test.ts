import { describe, it, expect } from "vitest";
import { buildSeed, MINH_ANH, CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1, CLASS_B_10A1 } from "@/lib/fixtures/seed";
import { countAttendance } from "@/lib/domain/attendance";

const db = buildSeed();
const activeIn = (classId: string, date = "2026-10-05") =>
  db.enrollments.filter((e) => e.classId === classId && e.startDate <= date && (!e.endDate || e.endDate >= date)).map((e) => e.studentId);

describe("demo seed invariants", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(db));
  });
  it("has the class sizes from the spec (153 students)", () => {
    expect(activeIn(CLASS_A_10A1)).toHaveLength(42);
    expect(activeIn(CLASS_A_10A2)).toHaveLength(40);
    expect(activeIn(CLASS_A_11A1)).toHaveLength(36);
    expect(activeIn(CLASS_B_10A1)).toHaveLength(35);
  });
  it("today's 10A1 attendance = 38 + 2 + 1 + 1 = 42", () => {
    const recs = db.attendanceRecords.filter((r) => r.sessionId === `as-${CLASS_A_10A1}-2026-10-05-m`);
    const c = countAttendance(activeIn(CLASS_A_10A1), recs);
    expect([c.present, c.late, c.excused, c.unexcused, c.unmarked, c.presentAll]).toEqual([38, 2, 1, 1, 0, 40]);
  });
  it("Minh Anh week 4 published total = 100 - 5 + 2 = 97", () => {
    const snap = db.snapshots.find((s) => s.id === `snap-${CLASS_A_10A1}-w4-v1`)!;
    const row = snap.rows.find((r) => r.studentId === MINH_ANH)!;
    expect([row.base, row.minus, row.plus, row.total, row.grade]).toEqual([100, -5, 2, 97, "Tốt"]);
  });
  it("same-name students keep different ids", () => {
    const chau = db.students.filter((s) => s.fullName === "Trần Bảo Châu");
    expect(chau).toHaveLength(2);
    expect(new Set(chau.map((c) => c.id)).size).toBe(2);
  });
  it("timetable has no teacher double booking", () => {
    const seen = new Set<string>();
    for (const l of db.lessons.filter((x) => x.teacherMembershipId && !x.subjectId.endsWith("shl"))) {
      const key = `${l.teacherMembershipId}-${l.weekday}-${l.period}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
  it("prints sizes", () => {
    console.log({ students: db.students.length, att: db.attendanceRecords.length, conduct: db.conductRecords.length, lessons: db.lessons.length, bytes: JSON.stringify(db).length });
  });
});
