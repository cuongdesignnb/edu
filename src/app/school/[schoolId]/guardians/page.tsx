"use client";
import { use } from "react";
import { GuardiansPage } from "@/features/students/guardians";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <GuardiansPage schoolId={p.schoolId} />;
}
