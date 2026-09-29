"use client";
import { use } from "react";
import { ParentConductDetailView } from "@/features/parent/views/conduct";

export default function Page({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = use(params);
  return <ParentConductDetailView periodId={decodeURIComponent(periodId)} />;
}
