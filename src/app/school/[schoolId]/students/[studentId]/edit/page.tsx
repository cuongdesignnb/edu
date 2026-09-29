"use client";
import { use } from "react";
import { StudentEditForm } from "@/features/students/student-form";

export default function Page({ params }: { params: Promise<{ schoolId: string; studentId: string }> }) {
  const p = use(params);
  return <StudentEditForm schoolId={p.schoolId} studentId={p.studentId} />;
}
