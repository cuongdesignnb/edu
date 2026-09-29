"use client";
import { Suspense } from "react";
import { AttendanceWeekly } from "@/features/attendance/weekly";

/** CL05 — Chuyên cần theo tuần. ?week=YYYY-MM-DD */
export default function Page() {
  return <Suspense><AttendanceWeekly /></Suspense>;
}
