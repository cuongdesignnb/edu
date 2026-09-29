"use client";
import { useState } from "react";
import Link from "next/link";
import { Activity, DatabaseBackup, ListChecks, RefreshCw, HardDrive, CheckCircle2, AlertTriangle, Wrench, RotateCcw, ArrowRight, FlaskConical } from "lucide-react";
import { platformExtraRepo, type ServiceState } from "@/lib/repositories/platform-extra";
import { useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/formatters";
import type { StatusLabel } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, DemoTag } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { QueryState } from "@/components/ui/states";

const STATE: Record<ServiceState, StatusLabel> = {
  operational: { label: "Hoạt động (mô phỏng)", tone: "success" },
  degraded: { label: "Hạn chế (mô phỏng)", tone: "warning" },
  maintenance: { label: "Chưa kết nối", tone: "neutral" },
};

/** PL10 — operations status. Services/backups are SIMULATED and labelled; no backup/restore is executed. */
export function Operations() {
  const q = useRepo(["platform-operations"], (ctx) => platformExtraRepo.operations(ctx));
  const [explain, setExplain] = useState<null | "backup" | "restore">(null);
  return (
    <QueryState query={q} skeleton="dashboard">
      {(d) => (
        <div className="page">
          <PageHeader title="Tình trạng vận hành" subtitle="Trạng thái dịch vụ, sao lưu và checklist vận hành" badge={<DemoTag>Mô phỏng</DemoTag>}
            breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Tình trạng vận hành" }]}
            actions={<Button icon={<RefreshCw className="size-4" />} loading={q.isFetching} onClick={() => q.refetch()}>Kiểm tra lại</Button>} />
          <Callout tone="warning" icon={<FlaskConical />} title="Số liệu dịch vụ và sao lưu là mô phỏng">
            Bản demo chạy hoàn toàn trên trình duyệt: không có máy chủ, không có sao lưu hay khôi phục thật. Checklist bên dưới được tính từ dữ liệu demo hiện tại. Lần kiểm tra: {fmtDateTime(d.checkedAt)}.
          </Callout>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Dịch vụ" icon={<Activity className="size-5" />} action={<DemoTag />} />
              <ul className="divide-y divide-line border-t border-line">
                {d.services.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-[1_1_220px]">
                      <p className="font-semibold text-ink">{s.name}</p>
                      <p className="text-[13px] text-muted">{s.description}</p>
                      <p className="mt-0.5 text-[12.5px] text-body">{s.note}</p>
                    </div>
                    <StatusBadge status={s.state} map={STATE} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Sao lưu" icon={<DatabaseBackup className="size-5" />} action={<DemoTag />} />
              <ul className="space-y-2.5 px-5">
                {d.backups.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{b.kind === "weekly" ? "Bản tuần" : "Bản ngày"} — {fmtDateTime(b.at)}</span><span className="block text-[12.5px] text-muted">{b.retention}</span></span>
                    <StatusBadge status="sim" map={{ sim: { label: "Mô phỏng hoàn tất", tone: "neutral" } }} />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 p-5">
                <Button icon={<DatabaseBackup className="size-4" />} onClick={() => setExplain("backup")}>Sao lưu ngay</Button>
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setExplain("restore")}>Khôi phục</Button>
              </div>
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Checklist vận hành" icon={<ListChecks className="size-5" />} subtitle="Tính từ dữ liệu demo hiện tại" />
              <ul className="divide-y divide-line border-t border-line">
                {d.checklist.map((c) => (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-3.5">
                    {c.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-5 flex-none text-success" aria-label="Ổn" /> : <AlertTriangle className="mt-0.5 size-5 flex-none text-warning" aria-label="Cần chú ý" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{c.label}: <span className="tabular-nums">{fmtNumber(c.count)}</span></p>
                      <p className="text-[13px] text-muted">{c.hint}</p>
                    </div>
                    <Link href={c.href} className="card-link flex-none">Xem<ArrowRight className="size-3.5" aria-hidden /></Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Kho dữ liệu demo" icon={<HardDrive className="size-5" />} subtitle="Thông tin thật của bản demo trên trình duyệt này" />
              <dl className="divide-y divide-line px-5 pb-5">
                <InfoRow label="Lược đồ">{d.store.schema}</InfoRow>
                <InfoRow label="Khởi tạo lúc">{fmtDateTime(d.store.seededAt)}</InfoRow>
                <InfoRow label="Số lần ghi">{fmtNumber(d.store.revision)}</InfoRow>
                <InfoRow label="Trường · người dùng">{fmtNumber(d.store.schools)} · {fmtNumber(d.store.users)}</InfoRow>
                <InfoRow label="Sự kiện nhật ký">{fmtNumber(d.store.auditEvents)}</InfoRow>
              </dl>
            </Card>
          </div>
          <Modal open={!!explain} onOpenChange={(o) => !o && setExplain(null)} size="sm" title={explain === "restore" ? "Khôi phục chưa khả dụng trong bản demo" : "Sao lưu chưa khả dụng trong bản demo"}
            footer={<Button variant="primary" onClick={() => setExplain(null)}>Đã hiểu</Button>}>
            <div className="space-y-3 text-sm text-body">
              <p className="flex gap-2.5"><Wrench className="mt-0.5 size-4 flex-none text-primary" aria-hidden />Bản demo không có máy chủ, nên không có gì để {explain === "restore" ? "khôi phục" : "sao lưu"}. Nút này không thực hiện thao tác nào.</p>
              <p>Quy trình dự kiến khi có backend: sao lưu tự động theo lịch; khôi phục chỉ thực hiện khi có yêu cầu bằng văn bản, được nhà trường ủy quyền, ghi nhật ký và kiểm tra lại dữ liệu sau khôi phục.</p>
              <p className="text-muted">Muốn làm mới dữ liệu demo trên trình duyệt, dùng “Đặt lại demo” trong trang chọn vai trò.</p>
            </div>
          </Modal>
        </div>
      )}
    </QueryState>
  );
}
