"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { WeeklySummaryScreen } from "@/features/conduct/weekly-screen";

/** CL07 — Tổng hợp thi đua tuần. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><WeeklySummaryScreen /></Suspense>;
}
