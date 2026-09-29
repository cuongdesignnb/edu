"use client";
import { use } from "react";
import { ImportsCenter } from "@/features/students/imports";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <ImportsCenter schoolId={p.schoolId} />;
}
