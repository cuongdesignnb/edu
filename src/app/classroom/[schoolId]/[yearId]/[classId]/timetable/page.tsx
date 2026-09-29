"use client";
import { Suspense } from "react";
import { ClassTimetable } from "@/features/class-org/timetable";

/** CL15 — Lịch học của lớp. ?week=YYYY-MM-DD */
export default function Page() {
  return <Suspense><ClassTimetable /></Suspense>;
}
