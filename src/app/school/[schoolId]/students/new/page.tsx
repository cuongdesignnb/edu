"use client";
import { use } from "react";
import { StudentCreateForm } from "@/features/students/student-form";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <StudentCreateForm schoolId={p.schoolId} />;
}
