"use client";
import { Suspense } from "react";
import { AttendanceScreen } from "@/features/attendance/sheet";

/** CL04 — Điểm danh theo ngày/tiết (R08). ?date=YYYY-MM-DD&slot=morning|period-N */
export default function Page() {
  return <Suspense><AttendanceScreen /></Suspense>;
}
