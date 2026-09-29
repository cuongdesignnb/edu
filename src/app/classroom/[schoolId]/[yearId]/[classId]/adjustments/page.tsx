"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { AdjustmentsScreen } from "@/features/conduct/adjustments";

/** CL11 — Điều chỉnh sau chốt. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><AdjustmentsScreen /></Suspense>;
}
