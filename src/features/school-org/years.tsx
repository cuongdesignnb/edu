"use client";
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CalendarDays, Plus, ArrowRight, CalendarRange, Power, Archive, RefreshCw, CheckCircle2, Eye } from "lucide-react";
import type { AcademicYear } from "@/lib/model/types";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, QueryState } from "@/components/ui/states";
import { fmtDate, fmtNumber } from "@/lib/formatters";
import { yearStatus } from "./common";

/** SC03 — academic years: current, drafts and archived years; open, choose as working context, activate/archive with confirmation. */
export function YearsScreen() {
  const { school, yearId, setYearId, can } = useSchool();
  const ctx = useCtx();
  const q = useRepo(["school-years", school.id], (c) => schoolRepo.years(c, school.id));
  const [confirm, setConfirm] = useState<{ year: AcademicYear; to: "active" | "archived" } | null>(null);
  const [err, setErr] = useState<string>();
  const cmd = useCommand((c, row: AcademicYear, to: "active" | "archived", reason?: string) => schoolRepo.setYearStatus(c, school.id, row.id, to, row.version, reason), {
    success: (y) => y.status === "active" ? `Năm học ${y.label} đã hoạt động` : `Đã lưu trữ năm học ${y.label}`,
    onError: (e) => setErr(e.message), silentError: true,
  });
  const b = `/school/${school.id}`;
  return (
    <div className="page">
      <PageHeader title="Năm học" subtitle="Năm học hiện tại, năm học đang chuẩn bị và các năm đã lưu trữ"
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học" }]}
        actions={can("year.manage") ? <ButtonLink href={`${b}/academic-years/new`} variant="primary" icon={<Plus className="size-4" />}>Tạo năm học</ButtonLink> : undefined} />
      <QueryState query={q} skeleton="cards">
        {(rows) => rows.length === 0 ? <Card><EmptyState title="Chưa có năm học" description="Tạo năm học đầu tiên để khai báo học kỳ, tuần và lớp." action={can("year.manage") ? <ButtonLink href={`${b}/academic-years/new`} variant="primary">Tạo năm học</ButtonLink> : undefined} /></Card> : (
          <>
            {!rows.some((y) => y.status === "draft") && can("year.manage") && (
              <Callout tone="info" icon={<RefreshCw />} title="Chuẩn bị năm học mới" action={<ButtonLink href={`${b}/academic-years/new`} size="sm">Tạo năm học mới</ButtonLink>}>
                Tạo năm học mới ở trạng thái Nháp trước, sau đó dùng “Kết thúc năm & chuẩn bị năm mới” để xếp lớp. Năm cũ không bị ghi đè.
              </Callout>
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {rows.map((y) => {
                const working = y.id === yearId;
                const items: MenuItem[] = [
                  { label: "Mở chi tiết năm học", icon: <Eye />, href: `${b}/academic-years/${y.id}` },
                  { label: "Học kỳ, tuần & ngày nghỉ", icon: <CalendarRange />, href: `${b}/academic-years/${y.id}/calendar` },
                  ...(can("year.manage") && y.status === "active" ? [{ label: "Kết thúc năm & chuẩn bị năm mới", icon: <RefreshCw />, href: `${b}/academic-years/${y.id}/rollover` }] : []),
                  ...(can("year.manage") && y.status === "draft" ? [{ label: "Kích hoạt năm học", icon: <Power />, separatorBefore: true, onSelect: () => { setErr(undefined); setConfirm({ year: y, to: "active" }); } }] : []),
                  ...(can("year.manage") && y.status === "active" ? [{ label: "Lưu trữ năm học", icon: <Archive />, danger: true, separatorBefore: true, onSelect: () => { setErr(undefined); setConfirm({ year: y, to: "archived" }); } }] : []),
                ];
                const isCurrent = y.startDate <= ctx.today && y.endDate >= ctx.today;
                return (
                  <Card key={y.id} className={clsx("flex flex-col gap-3 p-5", working && "ring-2 ring-[#9cc7f5]")}>
                    <div className="flex items-start gap-3">
                      <span className={clsx("icon-tile !size-14", y.status === "archived" ? "tone-neutral" : "tone-blue")} aria-hidden><CalendarDays className="size-7" /></span>
                      <div className="min-w-0 flex-1">
                        <Link href={`${b}/academic-years/${y.id}`} className="text-[19px] font-extrabold text-ink hover:text-primary-strong">Năm học {y.label}</Link>
                        <div className="mt-1 flex flex-wrap gap-1.5"><StatusBadge status={y.status} map={yearStatus} />{working && <Badge tone="info" icon={<CheckCircle2 className="size-3.5" />}>Đang làm việc</Badge>}{isCurrent && y.status !== "archived" && <Badge tone="purple" dot={false}>Theo lịch hôm nay</Badge>}</div>
                      </div>
                      <ActionMenu label={`Thao tác với năm học ${y.label}`} items={items} />
                    </div>
                    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-[#f7fbff] p-3 text-center">
                      <div><dt className="text-[12px] text-muted">Học kỳ</dt><dd className="text-[18px] font-bold text-ink">{y.terms.length}</dd></div>
                      <div><dt className="text-[12px] text-muted">Lớp</dt><dd className="text-[18px] font-bold text-ink">{fmtNumber(y.classCount)}</dd></div>
                      <div title="Tính cả học sinh đã chuyển lớp/nghỉ trong năm"><dt className="text-[12px] text-muted">HS đã ghi danh</dt><dd className="text-[18px] font-bold text-ink">{fmtNumber(y.studentCount)}</dd></div>
                    </dl>
                    <p className="text-[13.5px] text-body">{fmtDate(y.startDate)} – {fmtDate(y.endDate)}</p>
                    {y.terms.length > 0 && <ul className="space-y-0.5 text-[12.5px] text-muted">{[...y.terms].sort((a, c) => a.startDate.localeCompare(c.startDate)).map((t) => <li key={t.id}>{t.name}: {fmtDate(t.startDate)} – {fmtDate(t.endDate)}</li>)}</ul>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <ButtonLink href={`${b}/academic-years/${y.id}`} size="sm" iconRight={<ArrowRight className="size-4" />}>Mở năm học</ButtonLink>
                      {!working && <Button size="sm" variant="ghost" onClick={() => setYearId(y.id)}>Chọn làm năm làm việc</Button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </QueryState>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }} busy={cmd.pending}
        title={confirm?.to === "active" ? "Kích hoạt năm học" : "Lưu trữ năm học"} object={confirm ? `Năm học ${confirm.year.label}` : undefined}
        variant={confirm?.to === "archived" ? "danger" : "primary"} confirmLabel={confirm?.to === "active" ? "Kích hoạt" : "Lưu trữ năm học"}
        consequence={confirm?.to === "active" ? "Năm học trở thành năm hoạt động. Chỉ một năm hoạt động tại một thời điểm — nếu đang có năm hoạt động, hãy kết thúc năm đó trước." : "Tất cả lớp của năm này chuyển sang Lưu trữ (chỉ xem). Dữ liệu, học sinh và báo cáo được giữ nguyên. Nên dùng quy trình chuẩn bị năm mới trước khi lưu trữ."}
        error={err} reasonLabel={confirm?.to === "archived" ? "Lý do lưu trữ (ít nhất 3 ký tự)" : undefined} reasonRequired={confirm?.to === "archived"}
        onConfirm={async (reason) => { if (!confirm) return; const r = await cmd.run(confirm.year, confirm.to, reason); if (r) setConfirm(null); }} />
    </div>
  );
}
