"use client";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { DictionariesScreen } from "@/features/school-org/dictionaries";

/** SC08 — Danh mục khối, môn, phòng. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><DictionariesScreen /></Suspense>;
}
