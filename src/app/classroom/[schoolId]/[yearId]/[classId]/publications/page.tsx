"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { PublicationsScreen } from "@/features/conduct/publications";

/** CL09 — Lịch sử kết quả công bố. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><PublicationsScreen /></Suspense>;
}
