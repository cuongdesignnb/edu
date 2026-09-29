"use client";
import { use } from "react";
import { GuardianDetail } from "@/features/students/guardians";

export default function Page({ params }: { params: Promise<{ schoolId: string; guardianId: string }> }) {
  const p = use(params);
  return <GuardianDetail schoolId={p.schoolId} guardianId={p.guardianId} />;
}
