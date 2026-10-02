"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Eye, Pencil, Shuffle, FileSpreadsheet, FileText, GraduationCap, Users, ShieldAlert, Link2 } from "lucide-react";
import { studentsRepo } from "@/lib/repositories";
import { studentsExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, studentStatus } from "@/lib/formatters";
import { downloadBlob } from "@/lib/export";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Identity } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { BulkSelectionBar, DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { TransferDialog } from "./dialogs";

type Row = Awaited<ReturnType<typeof studentsRepo.list>>["items"][number];

/** SC16 — school-wide student list: real search/filter/sort/paging; same names distinguished by code/class/dob. */
export function StudentList({ schoolId }: { schoolId: string }) {
  const { can, school, yearId } = useSchool();
  const router = useRouter();
  const list = useListQuery({ pageSize: 10, sort: "name", dir: "asc" });
  const requested = {...list.query, filters:{...list.query.filters, yearId:list.query.filters?.yearId || yearId || undefined}};
  const q = useRepo(["students-list", schoolId, requested], (ctx) => studentsRepo.list(ctx, schoolId, requested));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectionScope = JSON.stringify(requested.filters) + (list.query.q ?? "");
  useEffect(() => { setSelected(new Set()); }, [selectionScope]);
  const [transfer, setTransfer] = useState<Row | null>(null);
  const exp = useCommand((ctx, ids: string[], format: "csv" | "xlsx") => studentsExtraRepo.exportStudents(ctx, schoolId, ids, requested.filters.yearId ?? "", format));
  const base = `/school/${schoolId}`;

  const doExport = async (fmt: "csv" | "xlsx") => {
    const file = await exp.run([...selected], fmt);
    if (!file) return;
    file.assertCurrent();
    downloadBlob(file.blob, file.filename);
  };

  const columns: Column<Row>[] = [
    { key: "name", header: "Học sinh", sortable: true, cell: (r) => <Identity name={r.fullName} sub={`${r.code} · sinh ${fmtDate(r.dob)}`} tone={r.avatarTone} size={34} className="min-w-[210px]" /> },
    { key: "code", header: "Mã HS", sortable: true, hideBelow: "lg", cell: (r) => <span className="tabular-nums">{r.code}</span> },
    { key: "class", header: "Lớp", sortable: true, cell: (r) => <span className="font-semibold text-ink">{r.className}</span> },
    { key: "gender", header: "Giới tính", hideBelow: "md", cell: (r) => r.gender ?? "Không hiển thị theo quyền" },
    { key: "guardians", header: "Người giám hộ", cell: (r) => r.guardianCount === null || r.verifiedGuardians === null ? <span className="text-muted">Không hiển thị theo quyền</span> : r.guardianCount === 0 ? <Badge tone="warning">Chưa có</Badge> : r.verifiedGuardians === 0 ? <Badge tone="warning">{r.guardianCount} · chưa xác minh</Badge> : <span className="text-[13px]">{r.verifiedGuardians}/{r.guardianCount} đã xác minh</span> },
    { key: "links", header: "Link tra cứu", hideBelow: "lg", cell: (r) => r.activeLinks === null ? <span className="text-muted">Không hiển thị theo quyền</span> : r.activeLinks ? <span className="inline-flex items-center gap-1 text-[13px]"><Link2 className="size-3.5 text-primary" aria-hidden />{r.activeLinks} đang hoạt động</span> : <span className="text-muted">—</span> },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={studentStatus} /> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "center", cell: (r) => (
      <ActionMenu label={`Thao tác với ${r.fullName}`} items={[
        { label: "Mở hồ sơ", icon: <Eye />, href: `${base}/students/${r.id}` },
        ...(q.data?.canCreate ? [{ label: "Sửa thông tin", icon: <Pencil />, href: `${base}/students/${r.id}/edit` }] : []),
        ...(q.data?.canTransfer && r.status === "studying" ? [{ label: "Chuyển lớp / ngừng theo học", icon: <Shuffle />, onSelect: () => setTransfer(r) }] : []),
      ]} />
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Học sinh" subtitle={`${q.data?.year?.name ?? "Năm học chưa được chọn"} — ${school.name}${q.data?.referenceDate ? ` · mốc ${fmtDate(q.data.referenceDate)}` : ""}`} breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Học sinh" }]}
        quote={["Mỗi học sinh là một tiềm năng", "cần được ghi nhận riêng"]} illustration="/assets/illustrations/students-trio.png"
        actions={<>
          {can("import.run") && <ButtonLink href={`${base}/imports/new`} icon={<Upload className="size-4" />}>Nhập từ tệp</ButtonLink>}
          {q.data?.canCreate && <ButtonLink href={`${base}/students/new`} variant="primary" icon={<Plus className="size-4" />}>Thêm học sinh</ButtonLink>}
        </>} />
      <Card>
        <CardHeader title={`Danh sách học sinh${q.data ? ` (${q.data.total})` : ""}`} icon={<GraduationCap className="size-5" />} subtitle="Học sinh trùng tên là hồ sơ riêng — phân biệt bằng mã, ngày sinh và lớp." />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo họ tên hoặc mã học sinh…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Năm học" allLabel="Năm học hiện tại" value={list.query.filters?.yearId ?? ""} onChange={(v) => list.setFilter("yearId", v)} options={(q.data?.yearOptions ?? []).map(y => ({value:y.id,label:y.name}))} />
          <InlineSelect label="Lọc theo lớp" allLabel="Tất cả lớp" value={list.query.filters?.classId ?? ""} onChange={(v) => list.setFilter("classId", v)} options={(q.data?.classOptions ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(studentStatus).map(([value, s]) => ({ value, label: s.label }))} />
          {q.data?.canSeeGuardians && <InlineSelect label="Lọc người giám hộ" allLabel="Mọi tình trạng giám hộ" value={list.query.filters?.guardian ?? ""} onChange={(v) => list.setFilter("guardian", v)} options={[{ value: "unverified", label: "Chưa xác minh giám hộ" }]} />}
        </FilterBar>
        {q.data && (
          <BulkSelectionBar selected={selected} pageIds={q.data.items.map((r) => r.id)} allIds={q.data.allIds} onChange={setSelected} what="học sinh">
            <Button size="sm" icon={<FileText className="size-4" />} disabled={!q.data?.canExport} loading={exp.pending} onClick={() => doExport("csv")}>Xuất CSV ({selected.size})</Button>
            <Button size="sm" icon={<FileSpreadsheet className="size-4" />} disabled={!q.data?.canExport} loading={exp.pending} onClick={() => doExport("xlsx")}>Xuất XLSX ({selected.size})</Button>
          </BulkSelectionBar>
        )}
        {q.isLoading ? <div className="space-y-2 px-4 py-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : q.data!.total === 0 && !list.active ? (
            <EmptyState icon={<Users className="size-6" />} title="Chưa có học sinh trong năm học này" description="Thêm từng học sinh hoặc nhập danh sách từ tệp CSV/XLSX."
              action={can("import.run") ? <ButtonLink href={`${base}/imports/new`} variant="primary" icon={<Upload className="size-4" />}>Nhập từ tệp</ButtonLink> : undefined} />
          ) : (
            <>
              <div className="px-4 pt-2">
                <DataTable caption="Danh sách học sinh" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort}
                  selectable selected={selected} onSelectedChange={setSelected} onRowClick={(r) => router.push(`${base}/students/${r.id}`)} empty={<EmptyFiltered onReset={list.reset} what="học sinh" />} minWidth={820} />
              </div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="học sinh" />
            </>
          )}
      </Card>
      {exp.error && <ErrorState error={exp.error} compact />}
      {list.query.filters?.guardian === "unverified" && q.data && q.data.total > 0 && (
        <p className="flex items-center gap-2 text-[13px] text-warning-text"><ShieldAlert className="size-4" aria-hidden />Học sinh chưa có người giám hộ đã xác minh chưa thể được cấp link tra cứu.</p>
      )}
      {transfer && <TransferDialog open onOpenChange={(o) => { if (!o) setTransfer(null); }} schoolId={schoolId} canDecide={q.data?.canTransfer === true} student={{ id: transfer.id, fullName: transfer.fullName, className: transfer.className, classId: transfer.classId }} />}
    </div>
  );
}
