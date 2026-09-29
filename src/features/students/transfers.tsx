"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Check, X, Shuffle, Info } from "lucide-react";
import { studentsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { TRANSFER_STATUS } from "./shared";
import { TransferDialog } from "./dialogs";

type Row = Awaited<ReturnType<typeof studentsRepo.transfers>>["items"][number];

/** SC20 — transfer / leave requests. Approving never rewrites past reports; history is kept. */
export function TransfersPage({ schoolId }: { schoolId: string }) {
  const { can } = useSchool();
  const list = useListQuery({ pageSize: 10 });
  const q = useRepo(["transfers", schoolId, list.query], (ctx) => studentsRepo.transfers(ctx, schoolId, list.query));
  const [create, setCreate] = useState(false);
  const [decide, setDecide] = useState<{ row: Row; approve: boolean } | null>(null);
  const cmd = useCommand((ctx, id: string, approve: boolean, note: string) => studentsRepo.decideTransfer(ctx, schoolId, id, approve, note), { success: (t) => t.status === "approved" ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu", onSuccess: () => setDecide(null) });
  const base = `/school/${schoolId}`;
  const canDecide = q.data?.canDecide ?? can("student.transfer");

  const columns: Column<Row>[] = [
    { key: "student", header: "Học sinh", cell: (r) => <Link href={`${base}/students/${r.studentId}`} className="block min-w-[170px] hover:underline"><span className="block font-semibold text-ink">{r.studentName}</span><span className="block text-[12px] text-muted">{r.studentCode}</span></Link> },
    { key: "kind", header: "Loại", cell: (r) => r.kind === "leave" ? <Badge tone="neutral">Ngừng theo học</Badge> : <Badge tone="info">Chuyển lớp</Badge> },
    { key: "classes", header: "Lớp cũ → mới", cell: (r) => <span className="whitespace-nowrap font-medium text-ink">{r.fromName} → {r.kind === "leave" ? "—" : r.toName}</span> },
    { key: "date", header: "Ngày hiệu lực", cell: (r) => <span className="tabular-nums">{fmtDate(r.effectiveDate)}</span> },
    { key: "reason", header: "Lý do", hideBelow: "lg", cell: (r) => <span className="line-clamp-2 max-w-[260px] text-[13px]">{r.reason}</span> },
    { key: "by", header: "Người đề nghị", hideBelow: "md", cell: (r) => <span className="text-[13px]">{r.requestedByName}<span className="block text-[12px] text-muted">{fmtDateTime(r.requestedAt)}</span></span> },
    { key: "status", header: "Trạng thái", cell: (r) => <span><StatusBadge status={r.status} map={TRANSFER_STATUS} />{r.decidedAt && <span className="mt-0.5 block text-[12px] text-muted">{r.decidedByName} · {fmtDate(r.decidedAt)}</span>}</span> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "right", cell: (r) => r.status === "pending" && canDecide ? (
      <span className="flex justify-end gap-1.5">
        <Button size="sm" variant="success" icon={<Check className="size-4" />} onClick={() => setDecide({ row: r, approve: true })}>Duyệt</Button>
        <Button size="sm" variant="danger-soft" icon={<X className="size-4" />} onClick={() => setDecide({ row: r, approve: false })}>Từ chối</Button>
      </span>
    ) : null },
  ];

  return (
    <div className="page">
      <PageHeader title="Chuyển lớp và trạng thái theo học" subtitle="Yêu cầu chuyển lớp trong năm học và ghi nhận ngừng theo học. Lịch sử lớp cũ luôn được giữ."
        breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Chuyển lớp" }]}
        actions={(can("student.transfer")) && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Tạo yêu cầu</Button>} />
      <Card>
        <CardHeader title={`Yêu cầu${q.data ? ` (${q.data.total})` : ""}`} icon={<Shuffle className="size-5" />} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tên hoặc mã học sinh…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(TRANSFER_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : q.data!.total === 0 && !list.active ? <EmptyState icon={<Shuffle className="size-6" />} title="Chưa có yêu cầu chuyển lớp" description="Yêu cầu do giáo viên chủ nhiệm đề nghị hoặc nhà trường tạo sẽ hiện ở đây." />
          : (
            <>
              <div className="px-4"><DataTable caption="Yêu cầu chuyển lớp" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} empty={<EmptyFiltered onReset={list.reset} what="yêu cầu" />} minWidth={880} /></div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} what="yêu cầu" />
            </>
          )}
      </Card>
      <Callout tone="info" icon={<Info />}>Duyệt chuyển lớp: lớp cũ kết thúc trước ngày hiệu lực, lớp mới bắt đầu từ ngày hiệu lực. Điểm danh, thi đua và báo cáo đã có vẫn thuộc lớp cũ. Ngừng theo học sẽ thu hồi các link tra cứu đang hoạt động của học sinh.</Callout>

      {create && <TransferDialog open onOpenChange={(o) => { if (!o) setCreate(false); }} schoolId={schoolId} canDecide={canDecide} />}
      <ConfirmDialog open={!!decide} onOpenChange={(o) => { if (!o) { cmd.reset(); setDecide(null); } }} busy={cmd.pending}
        title={decide?.approve ? "Duyệt yêu cầu" : "Từ chối yêu cầu"}
        object={decide ? `${decide.row.studentName} (${decide.row.studentCode}): ${decide.row.fromName} → ${decide.row.kind === "leave" ? "ngừng theo học" : decide.row.toName} · hiệu lực ${fmtDate(decide.row.effectiveDate)}` : undefined}
        consequence={decide?.approve ? (decide.row.kind === "leave" ? "Học sinh chuyển sang “Ngừng theo học” từ ngày hiệu lực; link tra cứu đang hoạt động bị thu hồi. Lịch sử được giữ." : "Học sinh chuyển sang lớp mới từ ngày hiệu lực; lịch sử lớp cũ và báo cáo quá khứ không đổi.") : "Yêu cầu chuyển sang “Từ chối”. Học sinh giữ nguyên lớp hiện tại."}
        confirmLabel={decide?.approve ? "Duyệt" : "Từ chối"} variant={decide?.approve ? "primary" : "danger"} reasonLabel={decide?.approve ? "Ghi chú (không bắt buộc)" : "Lý do từ chối"} reasonRequired={!decide?.approve}
        onConfirm={(note) => decide ? cmd.run(decide.row.id, decide.approve, note) : undefined} />
    </div>
  );
}
