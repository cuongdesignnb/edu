"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { ClassesScreen } from "@/features/school-org/classes";

/** SC09 — Danh sách lớp. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><ClassesScreen /></Suspense>;
}
