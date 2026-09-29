"use client";
import { School, CheckCircle2, PauseCircle, Hourglass } from "lucide-react";
import { platformRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtNumber } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";
import { SchoolsTable } from "@/features/platform/schools-table";

/** PL02 — all schools: search/filter/sort/paging via repository; activate/suspend with confirmation (O01). */
export default function SchoolsPage() {
  const o = useRepo(["platform-overview"], (ctx) => platformRepo.overview(ctx));
  return (
    <div className="page">
      <PageHeader title="Danh sách trường" subtitle="Các trường trên nền tảng, trạng thái vận hành và đầu mối quản trị" breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Danh sách trường" }]}
        quote={["Mỗi trường một không gian", "riêng và an toàn"]} illustration="/assets/illustrations/school-header.png" />
      {o.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Tổng số trường" value={fmtNumber(o.data.totalSchools)} icon={<School className="size-7" />} tone="blue" hint="Mọi trạng thái" />
          <KpiCard label="Đang hoạt động" value={fmtNumber(o.data.activeSchools)} icon={<CheckCircle2 className="size-7" />} tone="green" hint={`${fmtNumber(o.data.activeStaff)} nhân sự đang hoạt động`} />
          <KpiCard label="Chờ kích hoạt" value={fmtNumber(o.data.draftSchools)} icon={<Hourglass className="size-7" />} tone="purple" hint="Cần quản trị đầu tiên trước khi kích hoạt" />
          <KpiCard label="Tạm dừng" value={fmtNumber(o.data.suspendedSchools)} icon={<PauseCircle className="size-7" />} tone="amber" hint="Dữ liệu giữ nguyên, không xóa" />
        </div>
      ) : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[14px]" />)}</div>}
      <Card>
        <CardHeader title="Tất cả trường học" icon={<School className="size-6" />} subtitle="Bấm vào một dòng để mở hồ sơ vận hành của trường" />
        <SchoolsTable pageSize={10} />
      </Card>
    </div>
  );
}
