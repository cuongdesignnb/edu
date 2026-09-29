"use client";
import { use } from "react";
import { ParentPreviewView } from "@/features/parent/views/preview";

/** SC25 — /school/:schoolId/parent-access/:accessId/preview[/<parent view>…] */
export default function Page({ params }: { params: Promise<{ schoolId: string; accessId: string; view?: string[] }> }) {
  const { schoolId, accessId, view } = use(params);
  return <ParentPreviewView schoolId={schoolId} accessId={decodeURIComponent(accessId)} view={view ?? []} />;
}
