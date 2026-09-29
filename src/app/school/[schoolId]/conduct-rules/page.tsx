"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { RuleSetList } from "@/features/school-ops/rule-sets";

/** SC29 — Nội quy và phiên bản. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Nội quy thi đua" subtitle="Phiên bản nội quy, ngày hiệu lực và bảng đã chốt đang dùng từng phiên bản"
        quote={["Kỷ luật hôm nay", "kiến tạo công dân tốt cho ngày mai"]} illustration="/assets/illustrations/school-header.png" />
      <RuleSetList schoolId={schoolId} />
    </div>
  );
}
