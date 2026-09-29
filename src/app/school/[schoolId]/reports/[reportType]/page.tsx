"use client";
import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { SCHOOL_REPORTS } from "@/lib/repositories";
import { useCtx } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { SchoolReportView } from "@/features/reports/school-reports";

function Inner({ schoolId, reportType }: { schoolId: string; reportType: string }) {
  const sp = useSearchParams();
  const ctx = useCtx();
  const meta = SCHOOL_REPORTS.find((r) => r.type === reportType);
  const base = `/school/${schoolId}/reports`;
  if (!meta) return <div className="page"><div className="card"><EmptyState title="Không có loại báo cáo này" description="Báo cáo kết quả học tập không thuộc phạm vi đang bật." action={<ButtonLink href={base} size="sm">Về trung tâm báo cáo</ButtonLink>} /></div></div>;
  return (
    <div className="page">
      <div className="no-print"><PageHeader title={meta.title} subtitle={meta.description} breadcrumbs={[{ label: "Báo cáo", href: base }, { label: meta.title }]} /></div>
      <SchoolReportView schoolId={schoolId} type={reportType} today={ctx.today} initial={{ weekId: sp.get("weekId") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, gradeId: sp.get("gradeId") ?? undefined }} />
    </div>
  );
}

/** SC38 — Xem báo cáo trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string; reportType: string }> }) {
  const { schoolId, reportType } = use(params);
  return <Suspense fallback={<PageSkeleton />}><Inner schoolId={schoolId} reportType={reportType} /></Suspense>;
}
