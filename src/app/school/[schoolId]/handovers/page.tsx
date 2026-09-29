"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { HandoverWizard } from "@/features/school-org/handover";

/** SC15 — Bàn giao giáo viên chủ nhiệm. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="form" />}><HandoverWizard /></Suspense>;
}
