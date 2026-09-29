"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { AuditLog } from "@/features/school-ops/audit-log";

/** SC40 — Nhật ký nhà trường (chỉ đọc). */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Nhật ký nhà trường" subtitle="Ai đã làm gì, lúc nào, trên đối tượng nào — kèm giá trị trước/sau và lý do" />
      <AuditLog schoolId={schoolId} />
    </div>
  );
}
