"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { ReportCatalog } from "@/features/reports/school-reports";

/** SC37 — Trung tâm báo cáo trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Trung tâm báo cáo" subtitle="Chuyên cần, thi đua, hoạt động, tiến độ lớp và sử dụng link tra cứu — theo đúng phạm vi của bạn"
        quote={["Số liệu rõ ràng", "giúp quyết định đúng đắn"]} illustration="/assets/illustrations/teacher-board.png" />
      <ReportCatalog schoolId={schoolId} />
    </div>
  );
}
