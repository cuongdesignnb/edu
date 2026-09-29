"use client";
import { use } from "react";
import { SupportOverview } from "@/features/school-ops/support";

/** SC42 — Hỗ trợ và ủy quyền hỗ trợ. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <SupportOverview schoolId={schoolId} />;
}
