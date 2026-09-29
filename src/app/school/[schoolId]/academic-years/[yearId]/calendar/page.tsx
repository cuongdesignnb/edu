"use client";
import { Suspense, use } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { YearCalendar } from "@/features/school-org/calendar";

/** SC06 — Học kỳ, tuần và ngày nghỉ. */
export default function Page({ params }: { params: Promise<{ schoolId: string; yearId: string }> }) {
  const { yearId } = use(params);
  return <Suspense fallback={<PageSkeleton variant="table" />}><YearCalendar yearId={yearId} /></Suspense>;
}
