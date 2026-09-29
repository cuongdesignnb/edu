"use client";
import { use } from "react";
import { StudentProfile } from "@/features/students/student-profile";

export default function Page({ params }: { params: Promise<{ schoolId: string; studentId: string }> }) {
  const p = use(params);
  return <StudentProfile schoolId={p.schoolId} studentId={p.studentId} />;
}
