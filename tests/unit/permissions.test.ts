import { describe, expect, it } from "vitest";
import { buildSeed, SCHOOL_A, SCHOOL_B, CLASS_A_10A1, CLASS_A_10A2, CLASS_B_10A1 } from "@/lib/fixtures/seed";
import { can, type Actor } from "@/lib/permissions/can";
import type { ActionKey } from "@/lib/model/types";

const db = buildSeed();
const T = "2026-10-05";
const staff = (userId: string): Actor => ({ kind: "staff", userId });
const c = (u: string, a: ActionKey, schoolId = SCHOOL_A, classId?: string, subjectId?: string) => can(db, staff(u), a, { schoolId, classId, subjectId }, T);

describe("Q14 — school roles are distinct and consistent", () => {
  it("admin organises the school but does not record class attendance or publish conduct", () => {
    expect(c("u-hanh", "class.manage")).toBe(true);
    expect(c("u-hanh", "assignment.manage")).toBe(true);
    expect(c("u-hanh", "attendance.record", SCHOOL_A, CLASS_A_10A1)).toBe(false);
    expect(c("u-hanh", "conduct.publish", SCHOOL_A, CLASS_A_10A1)).toBe(false);
  });
  it("BGH oversees and approves adjustments but does not edit students", () => {
    expect(c("u-dung", "report.school")).toBe(true);
    expect(c("u-dung", "adjustment.approve", SCHOOL_A, CLASS_A_10A1)).toBe(true);
    expect(c("u-dung", "student.edit")).toBe(false);
    expect(c("u-dung", "class.manage")).toBe(false);
  });
  it("giáo vụ edits student records and timetable, cannot touch conduct results", () => {
    expect(c("u-quan", "student.edit")).toBe(true);
    expect(c("u-quan", "timetable.manage")).toBe(true);
    expect(c("u-quan", "conduct.lock", SCHOOL_A, CLASS_A_10A1)).toBe(false);
    expect(c("u-quan", "adjustment.approve", SCHOOL_A, CLASS_A_10A1)).toBe(false);
  });
});

describe("Q13 — grants never spread across classes", () => {
  it("Cô Lan: homeroom powers in 10A1 only; Ngữ văn only in 10A2", () => {
    expect(c("u-lan", "seating.manage", SCHOOL_A, CLASS_A_10A1)).toBe(true);
    expect(c("u-lan", "seating.manage", SCHOOL_A, CLASS_A_10A2)).toBe(false);
    expect(c("u-lan", "guardian.view", SCHOOL_A, CLASS_A_10A2)).toBe(false);
    expect(c("u-lan", "conduct.record", SCHOOL_A, CLASS_A_10A2)).toBe(true);
    expect(c("u-lan", "attendance.record", SCHOOL_A, CLASS_A_10A2, "sub-a-van")).toBe(true);
    expect(c("u-lan", "attendance.record", SCHOOL_A, CLASS_A_10A2, "sub-a-toan")).toBe(false);
    expect(c("u-lan", "class.manage")).toBe(false);
  });
  it("subject teacher: no guardians, seating, lock, or parent links", () => {
    for (const a of ["guardian.view", "seating.manage", "conduct.lock", "parentAccess.issue"] as ActionKey[]) expect(c("u-hung", a, SCHOOL_A, CLASS_A_10A1)).toBe(false);
    expect(c("u-hung", "conduct.record", SCHOOL_A, CLASS_A_10A1)).toBe(true);
  });
});

describe("Q15 — two schools, same class label, independent", () => {
  it("staff of one school has nothing in the other", () => {
    expect(c("u-lan", "class.view", SCHOOL_B, CLASS_B_10A1)).toBe(false);
    expect(c("u-khang", "class.view", SCHOOL_A, CLASS_A_10A1)).toBe(false);
  });
  it("teacher in both schools holds independent memberships", () => {
    expect(c("u-nam", "class.view", SCHOOL_A, CLASS_A_10A1)).toBe(true);
    expect(c("u-nam", "class.view", SCHOOL_B, CLASS_B_10A1)).toBe(true);
    expect(c("u-nam", "class.view", SCHOOL_A, CLASS_B_10A1)).toBe(false);
  });
  it("platform operator has no default school/student access", () => {
    expect(can(db, { kind: "platform", userId: "u-bao" }, "student.view.all", { schoolId: SCHOOL_A }, T)).toBe(false);
  });
  it("suspended membership and suspended school block everything", () => {
    expect(c("u-huong", "class.view", SCHOOL_A, CLASS_A_10A1)).toBe(false);
    expect(can(db, staff("u-tp-admin"), "school.view", { schoolId: "sch-tranphu" }, T)).toBe(false);
  });
});
