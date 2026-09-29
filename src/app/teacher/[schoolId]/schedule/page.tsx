"use client";
import { use, Suspense } from "react";
import { TeacherSchedule } from "@/features/teacher/schedule";

/** TE03 — Lịch dạy của tôi. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <Suspense><TeacherSchedule schoolId={schoolId} /></Suspense>;
}
