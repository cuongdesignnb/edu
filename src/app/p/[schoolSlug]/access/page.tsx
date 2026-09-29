"use client";
import { Suspense, use } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { ParentAccessView } from "@/features/parent/views/access";

export default function Page({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const { schoolSlug } = use(params);
  return <Suspense fallback={<PageSkeleton variant="parent" />}><ParentAccessView slug={schoolSlug} /></Suspense>;
}
