"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { TeachersScreen } from "@/features/school-org/teachers";

/** SC10 — Danh sách giáo viên & phân quyền (R04). */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><TeachersScreen /></Suspense>;
}
