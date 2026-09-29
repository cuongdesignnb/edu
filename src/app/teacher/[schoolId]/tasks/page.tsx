"use client";
import { use } from "react";
import { TeacherTasks } from "@/features/teacher/tasks";

/** TE04 — Việc cần xử lý. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherTasks schoolId={schoolId} />;
}
