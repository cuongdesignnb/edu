import type { AttendanceRecord, AttendanceStatus } from "@/lib/model/types";

export type AttendanceCounts = Record<AttendanceStatus, number> & { total: number; presentAll: number };

/**
 * Counts always add up to the roster size. "Chưa điểm danh" is its own state and is
 * never counted as present. presentAll = đúng giờ + đi muộn ("hiện diện").
 */
export function countAttendance(rosterIds: string[], records: Pick<AttendanceRecord, "studentId" | "status">[]): AttendanceCounts {
  const byStudent = new Map(records.map((r) => [r.studentId, r.status]));
  const c: AttendanceCounts = { unmarked: 0, present: 0, late: 0, excused: 0, unexcused: 0, total: rosterIds.length, presentAll: 0 };
  for (const id of rosterIds) {
    const st = byStudent.get(id) ?? "unmarked";
    c[st] += 1;
  }
  c.presentAll = c.present + c.late;
  return c;
}

export const ATTENDANCE_ORDER: AttendanceStatus[] = ["present", "late", "excused", "unexcused", "unmarked"];
