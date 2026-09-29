"use client";
import { use } from "react";
import { TeacherHome } from "@/features/teacher/home";

/** TE01 — Việc cần làm của giáo viên (R05). */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherHome schoolId={schoolId} />;
}
