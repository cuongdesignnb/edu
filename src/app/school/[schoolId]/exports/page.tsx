"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { ExportsList } from "@/features/reports/exports-list";

/** SC39 — Các bản xuất dữ liệu. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Các bản xuất dữ liệu" subtitle="Theo dõi bản xuất, tải lại tệp cục bộ hoặc hủy — không gửi email" breadcrumbs={[{ label: "Báo cáo", href: `/school/${schoolId}/reports` }, { label: "Bản xuất" }]} />
      <ExportsList schoolId={schoolId} />
    </div>
  );
}
