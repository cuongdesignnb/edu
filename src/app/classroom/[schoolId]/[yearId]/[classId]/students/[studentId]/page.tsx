"use client";
import { use } from "react";
import { ClassStudentProfile } from "@/features/class-org/student-profile";

/** CL03 — Hồ sơ học sinh trong phạm vi lớp. */
export default function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return <ClassStudentProfile studentId={studentId} />;
}
