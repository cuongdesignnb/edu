"use client";
import { use } from "react";
import { AccessDetailPage } from "@/features/students/parent-access";

export default function Page({ params }: { params: Promise<{ schoolId: string; accessId: string }> }) {
  const p = use(params);
  return <AccessDetailPage schoolId={p.schoolId} accessId={p.accessId} />;
}
