"use client";
import { use } from "react";
import { Rollover } from "@/features/school-org/rollover";

/** SC07 — Kết thúc năm và chuẩn bị năm mới. */
export default function Page({ params }: { params: Promise<{ schoolId: string; yearId: string }> }) {
  const { yearId } = use(params);
  return <Rollover yearId={yearId} />;
}
