"use client";
import { use } from "react";
import { YearDetail } from "@/features/school-org/year-detail";

/** SC05 — Chi tiết năm học (R03). */
export default function Page({ params }: { params: Promise<{ schoolId: string; yearId: string }> }) {
  const { yearId } = use(params);
  return <YearDetail yearId={yearId} />;
}
