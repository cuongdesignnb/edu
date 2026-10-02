"use client";
import { useState } from "react";
import { Download, XCircle, FileSpreadsheet, FileText, Printer, Info, Clock } from "lucide-react";
import { reportsRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber, fmtRelative } from "@/lib/formatters";
import { demoNowISO } from "@/lib/calendar";
import { DataTable, FilterBar, Pagination, useClientList, type Column } from "@/components/data/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import type { Tone } from "@/lib/formatters";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { InlineSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { isRepoError } from "@/lib/repositories";
import { downloadBlob } from "@/lib/export";
import { captureStaffAccess } from "@/lib/api/client";

type Row = Awaited<ReturnType<typeof reportsRepo.exports>>[number];
const FORMAT: Record<string, { label: string; icon: React.ReactNode }> = {
  xlsx: { label: "Excel", icon: <FileSpreadsheet className="size-3.5" aria-hidden /> },
  csv: { label: "CSV", icon: <FileText className="size-3.5" aria-hidden /> },
  pdf: { label: "PDF", icon: <Printer className="size-3.5" aria-hidden /> },
};
const EXPORT_STATUS: Record<string, {label:string;tone:Tone}> = {queued:{label:"Đang chờ",tone:"neutral"},running:{label:"Đang tạo",tone:"info"},ready:{label:"Sẵn sàng tải",tone:"success"},failed:{label:"Tạo tệp thất bại",tone:"danger"},cancelled:{label:"Đã hủy",tone:"neutral"},expired:{label:"Hết hạn",tone:"neutral"}};
const REPORT_PATH: Record<string, string> = { attendance: "attendance", conduct: "conduct", activities: "activities", "class-progress": "class-progress", links: "links" };

/** SC39 — actual owned jobs and captured server files. */
export function ExportsList({ schoolId }: { schoolId: string }) {
  const q = useRepo(["school-exports", schoolId], (c) => reportsRepo.exports(c, schoolId), {refetchInterval:(query)=>query.state.data?.some(r=>r.status==="queued"||r.status==="running")?1500:false});
  const ctx = useCtx();
  const toast = useToast();
  const [statusF, setStatusF] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cancel, setCancel] = useState<Row | null>(null);
  const cancelCmd = useCommand((c, id: string, version: number) => reportsRepo.cancelExport(c, schoolId, id, version), { success: "Đã hủy bản xuất", onSuccess: () => {setCancel(null);void q.refetch();} });
  const effective = (r: Row) => (r.status === "cancelled" ? "cancelled" : r.expired ? "expired" : r.status);
  const rows = (q.data ?? []).filter((r) => !statusF || effective(r) === statusF);
  const list = useClientList(rows, { search: (r) => `${r.title} ${r.fileName} ${r.createdByName}`, pageSize: 10 });

  const redownload = async (r: Row) => {
    if (busy) return;
    const owner = captureStaffAccess();
    setBusy(r.id);
    try {
      const file = await reportsRepo.downloadExport(ctx, schoolId, r.id);
      file.assertCurrent();
      downloadBlob(file.blob, file.filename);
      toast.push({ tone: "success", title: `Đã tải ${file.filename}`, detail: `${r.rowCount} dòng theo bản chụp khi tạo công việc xuất.` });
    } catch (e) {
      try {owner.assertCurrent();} catch {return;}
      toast.push({ tone: "error", title: "Không tải được tệp", detail: isRepoError(e) ? e.message : "Vui lòng thử lại." });
    } finally { setBusy(null); }
  };
  const reportHref = (r: Row) => {
    if (r.reportType === "student-directory") return `/school/${schoolId}/students`;
    const sp = new URLSearchParams(Object.entries(r.params).filter(([k]) => ["weekId", "from", "to", "gradeId", "studentId"].includes(k)));
    if (r.classId && r.yearId) return `/classroom/${schoolId}/${r.yearId}/${r.classId}/reports/${r.reportType}${sp.toString() ? `?${sp}` : ""}`;
    return `/school/${schoolId}/reports/${REPORT_PATH[r.reportType] ?? r.reportType}${sp.toString() ? `?${sp}` : ""}`;
  };

  const columns: Column<Row>[] = [
    { key: "title", header: "Bản xuất", cell: (r) => <div className="min-w-[220px]"><p className="font-semibold text-ink">{r.title}</p><p className="text-[12.5px] text-muted">{r.fileName}</p></div> },
    { key: "format", header: "Định dạng", cell: (r) => <Badge tone="neutral" dot={false} icon={FORMAT[r.format]?.icon}>{FORMAT[r.format]?.label ?? r.format}</Badge> },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={effective(r)} map={EXPORT_STATUS} /> },
    { key: "rows", header: "Số dòng", align: "right", hideBelow: "sm", cell: (r) => fmtNumber(r.rowCount) },
    { key: "by", header: "Người tạo", hideBelow: "md", cell: (r) => <div className="text-[13px]"><p className="text-ink">{r.createdByName}</p><p className="text-muted">{fmtDateTime(r.createdAt)}</p></div> },
    { key: "exp", header: "Hạn tải", hideBelow: "lg", cell: (r) => <span className={r.expired ? "text-danger-text" : "text-body"}>{r.expired ? `Hết hạn ${fmtDateTime(r.expiresAt)}` : `Còn đến ${fmtDateTime(r.expiresAt)}`}<span className="block text-[12px] text-muted">{fmtRelative(r.expiresAt, demoNowISO())}</span></span> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, cell: (r) => {
      const st = effective(r);
      return (
        <div className="flex flex-wrap justify-end gap-1.5">
          {st === "ready" && <Button size="sm" icon={<Download className="size-4" />} loading={busy === r.id} onClick={() => redownload(r)}>Tải tệp</Button>}
          {["queued", "running", "failed"].includes(st) && <Button size="sm" variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setCancel(r)}>Hủy</Button>}
          {["expired", "cancelled", "failed"].includes(st) && <ButtonLink size="sm" variant="ghost" href={reportHref(r)}>Tạo lại từ báo cáo</ButtonLink>}
        </div>
      );
    } },
  ];

  return (
    <div className="space-y-4">
      <Callout tone="info" icon={<Info />}>Tệp được tạo trên máy chủ theo bản chụp dữ liệu và bộ lọc khi yêu cầu xuất. Quyền được kiểm tra lại khi tải. Tệp hết hạn sau 24 giờ; tạo bản xuất mới từ trang báo cáo khi cần.</Callout>
      <section className="card">
        <div className="card-header"><h2 className="card-title"><Clock className="size-5" aria-hidden />Công việc xuất dữ liệu</h2></div>
        <FilterBar q={list.q} onQ={list.setQ} placeholder="Tìm theo tên bản xuất, tệp, người tạo…" onReset={() => { list.setQ(""); setStatusF(""); }} active={!!list.q || !!statusF}>
          <InlineSelect label="Lọc trạng thái" allLabel="Mọi trạng thái" value={statusF} onChange={setStatusF} options={Object.entries(EXPORT_STATUS).map(([value,s])=>({value,label:s.label}))} />
          <ButtonLink href={`/school/${schoolId}/reports`} variant="primary" className="!flex-none">Tạo bản xuất từ báo cáo</ButtonLink>
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : <>
            <div className="px-4"><DataTable caption="Các bản xuất dữ liệu" rows={list.items} columns={columns} rowKey={(r) => r.id} minWidth={620}
              empty={(q.data ?? []).length === 0 ? <EmptyState compact title="Chưa có bản xuất" description="Mở một báo cáo và chọn Tải CSV / Excel để tạo bản xuất." /> : <EmptyFiltered onReset={() => { list.setQ(""); setStatusF(""); }} what="bản xuất" />} /></div>
            <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="bản xuất" />
          </>}
      </section>
      <ConfirmDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)} title="Hủy bản xuất" object={cancel?.title} variant="danger" confirmLabel="Hủy bản xuất" busy={cancelCmd.pending}
        consequence="Bản xuất chuyển sang “Đã hủy” và không tải lại được từ danh sách. Tệp đã tải về máy trước đó không bị ảnh hưởng. Có thể tạo lại từ trang báo cáo."
        onConfirm={async () => { if (cancel) await cancelCmd.run(cancel.id, cancel.version); }} />
      {cancelCmd.error && <ErrorState error={cancelCmd.error} onRetry={() => q.refetch()} compact />}
    </div>
  );
}
