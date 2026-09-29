"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { RulesScreen } from "@/features/conduct/rules-screen";

/** CL12 — Nội quy áp dụng tại lớp. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><RulesScreen /></Suspense>;
}
