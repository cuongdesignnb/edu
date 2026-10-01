"use client";
import { useState } from "react";
import { ScrollText, FileSpreadsheet, FileDown, Eye } from "lucide-react";
import type { AuditEvent } from "@/lib/model/types";
import { platformRepo, RepoError, errorMessage } from "@/lib/repositories";
import { useRepo, useSession } from "@/lib/query/hooks";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, schoolStatus } from "@/lib/formatters";
import { demoToday } from "@/lib/calendar";
import { downloadCSV, downloadXLSX, type ExportColumn } from "@/lib/export";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, InfoRow } from "@/components/ui/card";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineSelect, DateField } from "@/components/ui/form";
import { Drawer } from "@/components/ui/dialog";
import { AuditDiff } from "@/components/ui/timeline";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

type Row = Awaited<ReturnType<typeof platformRepo.audit>>["items"][number];

const ENTITY: Record<string, string> = { school: "Trường", invitation: "Lời mời", membership: "Thành viên", ticket: "Yêu cầu hỗ trợ", supportGrant: "Quyền hỗ trợ", platformSettings: "Cấu hình" };
const COLUMNS: ExportColumn[] = [
  { key: "at", label: "Thời điểm" }, { key: "actor", label: "Người thao tác" }, { key: "action", label: "Hành động" }, { key: "entityType", label: "Loại đối tượng" },
  { key: "entity", label: "Đối tượng" }, { key: "reason", label: "Lý do" }, { key: "before", label: "Trước" }, { key: "after", label: "Sau" },
];

const FIELD: Record<string, string> = { status: "Trạng thái", name: "Tên", province: "Tỉnh/thành", address: "Địa chỉ", brandName: "Tên hiển thị", supportEmail: "Email hỗ trợ", supportPhone: "Điện thoại hỗ trợ", assignee: "Người xử lý" };
const VALUE: Record<string, string> = { ...Object.fromEntries(Object.entries(schoolStatus).map(([k, v]) => [k, v.label])), requested: "Chờ nhà trường cho phép", revoked: "Đã thu hồi" };
function readable(o?: Record<string, unknown>) {
  if (!o) return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [FIELD[k] ?? k, typeof v === "string" && k === "status" ? VALUE[v] ?? v : v]));
}

/** PL09 — platform audit: filters, detail drawer with before/after, CSV/XLSX of the filtered rows. */
export function AuditLog() {
  const { actor } = useSession();
  const toast = useToast();
  const list = useListQuery({ pageSize: 10 });
  const q = useRepo(["platform-audit", list.query], (ctx) => platformRepo.audit(ctx, list.query));
  const [open, setOpen] = useState<Row | null>(null);
  const [exporting, setExporting] = useState<"" | "csv" | "xlsx">("");
  const f = list.query.filters ?? {};

  const exportRows = async (kind: "csv" | "xlsx") => {
    setExporting(kind);
    try {
      throw new RepoError('READ_ERROR','Chức năng xuất nhật ký chưa được nối API. Nội dung đang xem được giữ nguyên.');
    } catch (error) {
      toast.push({ tone: "error", title: "Chưa xuất được tệp", detail: errorMessage(error) });
    } finally { setExporting(""); }
  };

  const cols: Column<Row>[] = [
    { key: "at", header: "Thời điểm", cell: (a) => <span className="whitespace-nowrap">{fmtDateTime(a.at)}</span> },
    { key: "action", header: "Hành động", cell: (a) => <span className="block min-w-[200px]"><span className="block font-semibold text-ink">{a.action}</span><span className="block text-[12.5px] text-muted">{a.entityLabel}</span></span> },
    { key: "type", header: "Đối tượng", cell: (a) => <Badge tone="neutral" dot={false}>{ENTITY[a.entityType] ?? a.entityType}</Badge>, hideBelow: "md" },
    { key: "actor", header: "Người thao tác", cell: (a) => a.actorName || "—", hideBelow: "sm" },
    { key: "diff", header: "Trước/sau", cell: (a) => a.before || a.after ? <Badge tone="info" dot={false}>Có</Badge> : <span className="text-muted">—</span>, hideBelow: "lg" },
    { key: "open", header: <span className="sr-only">Chi tiết</span>, align: "center", cell: (a) => <IconButton label={`Xem chi tiết: ${a.action}`} icon={<Eye className="size-4" />} onClick={() => setOpen(a)} /> },
  ];

  return (
    <div className="page">
      <PageHeader title="Nhật ký nền tảng" subtitle="Hành động vận hành: ai làm, lúc nào, trước và sau thay đổi" breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Nhật ký nền tảng" }]}
        actions={<>
          <Button icon={<FileDown className="size-4" />} loading={exporting === "csv"} disabled={!!exporting || !q.data?.total} onClick={() => exportRows("csv")}>Xuất CSV</Button>
          <Button icon={<FileSpreadsheet className="size-4" />} loading={exporting === "xlsx"} disabled={!!exporting || !q.data?.total} onClick={() => exportRows("xlsx")}>Xuất XLSX</Button>
        </>} />
      <Card>
        <CardHeader title="Sự kiện vận hành" icon={<ScrollText className="size-5" />} subtitle={q.data ? `${q.data.total} sự kiện theo bộ lọc` : undefined} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo hành động, đối tượng, người thao tác…" onReset={list.reset} active={list.active}
          advanced={<>
            <DateField label="Từ ngày" value={f.from} onChange={(v) => list.setFilter("from", v)} />
            <DateField label="Đến ngày" value={f.to} onChange={(v) => list.setFilter("to", v)} min={f.from} />
          </>}>
          <InlineSelect label="Lọc người thao tác" allLabel="Mọi người thao tác" value={f.actor ?? ""} onChange={(v) => list.setFilter("actor", v)} options={(q.data?.actors ?? []).map((a) => ({ value: a.id, label: a.name }))} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : q.data!.total === 0 && !list.active ? <EmptyState compact icon={<ScrollText className="size-6" />} title="Chưa có sự kiện vận hành" />
          : (
            <>
              <div className="px-4"><DataTable caption="Nhật ký nền tảng" rows={q.data!.items} columns={cols} rowKey={(a) => a.id} onRowClick={setOpen} empty={<EmptyFiltered what="sự kiện" onReset={list.reset} />} minWidth={620} /></div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="sự kiện" />
            </>
          )}
      </Card>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} width={520} title={open?.action ?? ""} description="Chi tiết sự kiện vận hành (chỉ đọc)">
        {open && (
          <div className="space-y-4">
            <dl className="divide-y divide-line">
              <InfoRow label="Thời điểm">{fmtDateTime(open.at)}</InfoRow>
              <InfoRow label="Người thao tác">{open.actorName || "—"}</InfoRow>
              <InfoRow label="Loại đối tượng">{ENTITY[open.entityType] ?? open.entityType}</InfoRow>
              <InfoRow label="Đối tượng">{open.entityLabel}</InfoRow>
              <InfoRow label="Lý do">{open.reason || "—"}</InfoRow>
            </dl>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Trước và sau</p>
              <AuditDiff before={readable(open.before)} after={readable(open.after)} />
            </div>
            <details className="rounded-xl border border-line px-3 py-2 text-[12.5px] text-muted">
              <summary className="cursor-pointer font-semibold">Chi tiết kỹ thuật</summary>
              <p className="mt-1">Mã sự kiện: {open.id} · Mã đối tượng: {open.entityId}</p>
            </details>
            <p className="text-[12.5px] text-muted">Nhật ký chỉ đọc; không sửa hoặc xóa được từ giao diện.</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
