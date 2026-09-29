"use client";
import { use } from "react";
import { TeacherClasses } from "@/features/teacher/classes";

/** TE02 — Lớp học của tôi. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherClasses schoolId={schoolId} />;
}
