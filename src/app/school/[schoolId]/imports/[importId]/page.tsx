"use client";
import { use } from "react";
import { ImportResult } from "@/features/students/imports";

export default function Page({ params }: { params: Promise<{ schoolId: string; importId: string }> }) {
  const p = use(params);
  return <ImportResult schoolId={p.schoolId} importId={p.importId} />;
}
