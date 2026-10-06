"use client";
import { use } from "react";
import {useSearchParams} from 'next/navigation';
import { StudentCreateForm } from "@/features/students/student-form";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  const search=useSearchParams();
  return <StudentCreateForm schoolId={p.schoolId} initialClassId={search.get('classId')??undefined} />;
}
