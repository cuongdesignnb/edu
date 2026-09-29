"use client";
import { use } from "react";
import { TransfersPage } from "@/features/students/transfers";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <TransfersPage schoolId={p.schoolId} />;
}
