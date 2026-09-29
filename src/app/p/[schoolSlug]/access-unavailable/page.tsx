"use client";
import { Suspense, use } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { ParentUnavailableView } from "@/features/parent/views/unavailable";

export default function Page({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const { schoolSlug } = use(params);
  return <Suspense fallback={<PageSkeleton variant="parent" />}><ParentUnavailableView slug={schoolSlug} /></Suspense>;
}
