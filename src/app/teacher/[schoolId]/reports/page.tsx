"use client";
import { use } from "react";
import { TeacherReports } from "@/features/teacher/reports";

/** TE06 — Báo cáo được phép. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherReports schoolId={schoolId} />;
}
