"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { ConductRecordScreen } from "@/features/conduct/record-screen";

/** CL06 — Ghi nhận thi đua (R08). */
export default function ConductRecordPage() {
  return <Suspense fallback={<PageSkeleton variant="detail" />}><ConductRecordScreen /></Suspense>;
}
