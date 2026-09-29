"use client";
import { use } from "react";
import { ImportWizard } from "@/features/students/imports";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <ImportWizard schoolId={p.schoolId} />;
}
