"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { PublicationCenter } from "@/features/school-ops/publication-center";

/** SC36 — Trung tâm rà soát và công bố. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Rà soát và công bố" subtitle="Theo dõi tiến độ rà soát, chốt, công bố của các lớp theo tuần — mở từng lớp để xử lý"
        quote={["Minh bạch từng con số", "đúng người, đúng lúc"]} illustration="/assets/illustrations/girl-clipboard.png" />
      <PublicationCenter schoolId={schoolId} />
    </div>
  );
}
