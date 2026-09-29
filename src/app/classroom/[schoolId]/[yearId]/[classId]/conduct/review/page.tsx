"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { ReviewScreen } from "@/features/conduct/review-screen";

/** CL08 — Rà soát và chốt tuần. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><ReviewScreen /></Suspense>;
}
