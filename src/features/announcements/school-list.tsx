"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, PenLine, Trash2, Megaphone, FileEdit, CalendarClock, CheckCircle2, Ban, Globe, School, Users } from "lucide-react";
import { announcementsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/formatters";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { SegmentTabs, StatTile } from "@/features/school-ops/ui";

type Row = Awaited<ReturnType<typeof announcementsRepo.schoolList>>["items"][number];
type StatusTab = "" | "draft" | "scheduled" | "published" | "withdrawn";

/** SC33 — school announcements (school + class origin for overseers). Status/origin filters, search, paging are real. */
export function SchoolAnnouncementList({ schoolId }: { schoolId: string }) {
  const list = useListQuery({ pageSize: 8 });
  const q = useRepo(["school-announcements", schoolId, list.query], (c) => announcementsRepo.schoolList(c, schoolId, list.query));
  const router = useRouter();
  const [del, setDel] = useState<Row | null>(null);
  const remove = useCommand((ctx, row: Row) => announcementsRepo.deleteDraft(ctx, schoolId, row.source), { success: "Đã xóa bản nháp", onSuccess: () => setDel(null) });
  const status = (list.query.filters?.status ?? "") as StatusTab;
  const base = `/school/${schoolId}/announcements`;
  const counts = q.data?.counts;
  const canCompose = q.data?.canCompose;

  const columns: Column<Row>[] = [
    { key: "title", header: "Thông báo", cell: (r) => (
      <div className="min-w-[240px] max-w-[420px]">
        <p className="font-semibold leading-snug text-ink">{r.title}</p>
        <p className="line-clamp-1 text-[12.5px] text-muted">{r.summary}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={r.origin === "school" ? "info" : "purple"} dot={false} icon={r.origin === "school" ? <School className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}>{r.origin === "school" ? "Nhà trường" : `Lớp ${r.className}`}</Badge>
          {r.isPublic && <Badge tone="success" dot={false} icon={<Globe className="size-3" aria-hidden />}>Công khai</Badge>}
        </div>
      </div>
    ) },
    { key: "scope", header: "Phạm vi · đối tượng", hideBelow: "md", cell: (r) => <div className="min-w-[150px] text-[13px]"><p className="text-ink">{r.scopeLabel}</p><p className="text-muted">{r.audienceLabel}</p></div> },
    { key: "est", header: "Ước tính nhận", align: "right", hideBelow: "lg", cell: (r) => <span className="text-[13px] tabular-nums">{r.estimate === null ? "—" : r.audience === "staff" ? `${fmtNumber(r.estimate.staff)} nhân sự` : `${fmtNumber(r.estimate.students)} gia đình`}</span> },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={PUBLICATION_STATUS} /> },
    { key: "time", header: "Thời điểm", hideBelow: "sm", cell: (r) => <span className="whitespace-nowrap text-[13px] text-body">{r.status === "published" ? `Công bố ${fmtDateTime(r.publishedAt)}` : r.status === "scheduled" ? `Hẹn ${fmtDateTime(r.scheduledAt)}` : r.status === "withdrawn" ? `Thu hồi ${fmtDateTime(r.withdrawnAt)}` : `Sửa ${fmtDateTime(r.updatedAt)}`}</span> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "center", cell: (r) => {
      const editable = r.origin === "school" && r.canEdit && (r.status === "draft" || r.status === "scheduled");
      return (
        <ActionMenu label={`Thao tác với ${r.title}`} items={[
          { label: "Xem chi tiết", icon: <Eye />, href: `${base}/${r.id}` },
          ...(editable ? [{ label: "Sửa", icon: <PenLine />, href: `${base}/${r.id}/edit` }] : []),
          ...(r.origin === "school" && r.canDelete && r.status === "draft" ? [{ label: "Xóa bản nháp", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setDel(r) }] : []),
        ]} />
      );
    } },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Bản nháp" value={counts ? fmtNumber(counts.draft) : "—"} icon={<FileEdit className="size-5" />} tone="neutral" />
        <StatTile label="Đã đặt lịch" value={counts ? fmtNumber(counts.scheduled) : "—"} icon={<CalendarClock className="size-5" />} tone="blue" />
        <StatTile label="Đã công bố" value={counts ? fmtNumber(counts.published) : "—"} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <StatTile label="Đã thu hồi" value={counts ? fmtNumber(counts.withdrawn) : "—"} icon={<Ban className="size-5" />} tone="pink" />
      </div>
      <section className="card">
        <div className="card-header"><h2 className="card-title"><Megaphone className="size-5" aria-hidden />Danh sách thông báo</h2></div>
        <div className="px-4 pb-3">
          <SegmentTabs label="Lọc theo trạng thái" value={status} onChange={(v) => list.setFilter("status", v)} items={[
            { value: "", label: "Tất cả" },
            { value: "draft", label: "Nháp", count: counts?.draft },
            { value: "scheduled", label: "Đã đặt lịch", count: counts?.scheduled },
            { value: "published", label: "Đã công bố", count: counts?.published },
            { value: "withdrawn", label: "Đã thu hồi", count: counts?.withdrawn },
          ]} />
        </div>
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tiêu đề, tóm tắt…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Lọc nguồn" allLabel="Mọi nguồn" value={list.query.filters?.origin ?? ""} onChange={(v) => list.setFilter("origin", v)} options={[{ value: "school", label: "Nhà trường" }, { value: "class", label: "Thông báo lớp" }]} />
          {canCompose && <ButtonLink href={`${base}/new`} variant="primary" icon={<PenLine className="size-4" />} className="!flex-none">Soạn thông báo</ButtonLink>}
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : (
            <>
              <div className="px-4">
                <DataTable caption="Thông báo nhà trường" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} minWidth={560} onRowClick={(r) => router.push(`${base}/${r.id}`)}
                  empty={list.active ? <EmptyFiltered onReset={list.reset} what="thông báo" /> : <EmptyState compact title="Chưa có thông báo" description="Thông báo nhà trường sẽ hiển thị ở đây." action={canCompose && <ButtonLink href={`${base}/new`} variant="primary" size="sm">Soạn thông báo</ButtonLink>} />} />
              </div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="thông báo" />
            </>
          )}
      </section>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Xóa bản nháp thông báo" object={del?.title} variant="danger" confirmLabel="Xóa bản nháp" busy={remove.pending}
        consequence="Bản nháp chưa từng công bố sẽ bị xóa khỏi danh sách. Thao tác được ghi vào nhật ký nhà trường. Thông báo đã công bố không xóa được — hãy thu hồi."
        onConfirm={async () => { if (del) await remove.run(del); }} />
    </div>
  );
}
