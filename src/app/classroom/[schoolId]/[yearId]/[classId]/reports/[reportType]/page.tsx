"use client";
import { Suspense, use } from "react";
import { ClassReportDetailPage } from "@/features/class-comms/reports";

/** CL26 — Chi tiết báo cáo lớp. */
export default function Page({ params }: { params: Promise<{ reportType: string }> }) {
  const { reportType } = use(params);
  return <Suspense><ClassReportDetailPage reportType={reportType} /></Suspense>;
}
