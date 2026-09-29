"use client";
import { use } from "react";
import { useCtx } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { SchoolTimetable } from "@/features/school-ops/timetable";

/** SC32 — Lịch toàn trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const ctx = useCtx();
  return (
    <div className="page">
      <PageHeader title="Lịch toàn trường" subtitle="Lọc theo lớp, giáo viên, phòng; phát hiện trùng lịch và đổi tiết có ngày hiệu lực" />
      <SchoolTimetable schoolId={schoolId} today={ctx.today} />
    </div>
  );
}
