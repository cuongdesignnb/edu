"use client";
import { use } from "react";
import { AccessListPage } from "@/features/students/parent-access";

export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const p = use(params);
  return <AccessListPage schoolId={p.schoolId} />;
}
