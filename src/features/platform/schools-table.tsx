"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Eye, UserCog, Power, PauseCircle, Archive } from "lucide-react";
import type { SchoolStatus } from "@/lib/model/types";
import { platformRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { schoolStatus, fmtNumber } from "@/lib/formatters";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { SchoolMark } from "@/components/ui/avatar";
import { EmptyFiltered, ErrorState, Skeleton } from "@/components/ui/states";
import { SchoolStatusDialog } from "./school-status-dialog";

type Row = Awaited<ReturnType<typeof platformRepo.listSchools>>["items"][number];

/** Shared by PL01 and PL02: search/filter/sort/page are real (repository). */
export function SchoolsTable({ pageSize = 8, showCreate = true }: { pageSize?: number; showCreate?: boolean }) {
  const list = useListQuery({ pageSize, sort: "name", dir: "asc" });
  const q = useRepo(["platform-schools", list.query], (ctx) => platformRepo.listSchools(ctx, list.query));
  const [status, setStatus] = useState<{ id: string; name: string; to: SchoolStatus } | null>(null);
  const router = useRouter();

  const columns: Column<Row>[] = [
    { key: "idx", header: "#", cell: (r) => <span className="text-muted">{(q.data!.page - 1) * q.data!.pageSize + q.data!.items.indexOf(r) + 1}</span> },
    { key: "name", header: "Tên trường", sortable: true, cell: (r) => <span className="flex items-center gap-2.5"><SchoolMark name={r.name} color={r.status === "active" ? "#0a72e6" : "#8a9bb6"} size={30} /><span className="min-w-[190px]"><span className="block font-semibold text-ink">{r.name}</span><span className="block text-[12px] text-muted">{r.code} · {r.province}</span></span></span> },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={schoolStatus} /> },
    { key: "admin", header: "Quản trị trường", cell: (r) => r.adminNames.length ? r.adminNames.join(", ") : <span className="text-warning-text">Chưa có</span>, hideBelow: "lg" },
    { key: "classCount", header: "Số lớp", sortable: true, align: "right", cell: (r) => fmtNumber(r.classCount) },
    { key: "staffCount", header: "Số nhân sự", sortable: true, align: "right", cell: (r) => fmtNumber(r.staffCount), hideBelow: "sm" },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (r) => (
      <ActionMenu label={`Thao tác với ${r.name}`} items={[
        { label: "Mở hồ sơ trường", icon: <Eye />, href: `/platform/schools/${r.id}` },
        { label: "Quản trị trường", icon: <UserCog />, href: `/platform/schools/${r.id}/admins` },
        ...(r.status !== "active" && r.status !== "archived" ? [{ label: "Kích hoạt", icon: <Power />, onSelect: () => setStatus({ id: r.id, name: r.name, to: "active" }), separatorBefore: true }] : []),
        ...(r.status === "active" ? [{ label: "Tạm dừng", icon: <PauseCircle />, danger: true, onSelect: () => setStatus({ id: r.id, name: r.name, to: "suspended" }), separatorBefore: true }] : []),
        ...(r.status === "suspended" ? [{ label: "Lưu trữ", icon: <Archive />, danger: true, onSelect: () => setStatus({ id: r.id, name: r.name, to: "archived" }) }] : []),
      ]} />
    ) },
  ];

  return (
    <>
      <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tên trường, mã, tỉnh/thành, quản trị viên…" onReset={list.reset} active={list.active}>
        <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(schoolStatus).map(([value, s]) => ({ value, label: s.label }))} />
        <InlineSelect label="Lọc tỉnh/thành" allLabel="Tất cả tỉnh/thành" value={list.query.filters?.province ?? ""} onChange={(v) => list.setFilter("province", v)} options={(q.data?.provinces ?? []).map((p) => ({ value: p, label: p }))} />
        {showCreate && <ButtonLink href="/platform/schools/new" variant="primary" icon={<Plus className="size-4" />} className="!flex-none">Thêm trường</ButtonLink>}
      </FilterBar>
      {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
        : (
          <>
            <div className="px-4">
              <DataTable caption="Danh sách trường học" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort}
                onRowClick={(r) => router.push(`/platform/schools/${r.id}`)} empty={<EmptyFiltered onReset={list.reset} what="trường" />} minWidth={640} />
            </div>
            <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} what="trường" />
          </>
        )}
      <SchoolStatusDialog target={status} onClose={() => setStatus(null)} />
    </>
  );
}
