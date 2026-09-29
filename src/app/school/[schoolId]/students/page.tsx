"use client";
import { use } from "react";
import { StudentList } from "@/features/students/student-list";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <StudentList schoolId={p.schoolId} />;
}
