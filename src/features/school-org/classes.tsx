"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Eye, Pencil, UserCog, Power, Archive, RotateCcw, Layers, AlertTriangle } from "lucide-react";
type ClassRow = Awaited<ReturnType<typeof schoolRepo.classes>>["items"][number];
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { classStatus } from "@/lib/formatters";
import { ClassDrawer, type ClassDrawerTarget, type ClassEditTarget } from "./class-drawer";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";

/** SC09 — class list: filters year/grade/homeroom/status, search, sort, paging; O03 drawer; activate/archive. */
export function ClassesScreen() {
  const { school, yearId, years, can } = useSchool();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const list = useListQuery({ pageSize: 10, sort: "name", dir: "asc", q: sp.get("q") ?? "", filters: { yearId: sp.get("year") ?? yearId } });
  const q = useRepo(["school-classes", school.id, list.query], (c) => schoolRepo.classes(c, school.id, list.query));
  const opts = useRepo(["school-form-options", school.id], (c) => schoolRepo.formOptions(c, school.id), { enabled: can("class.manage") || can("assignment.manage") });
  const [target, setTarget] = useState<ClassDrawerTarget | ClassEditTarget | null>(null);
  const [assign, setAssign] = useState<AssignPrefill | null>(null);
  const [archive, setArchive] = useState<ClassRow | null>(null);
  const setStatus = useCommand((c, row: ClassRow, status: ClassRow["status"], reason?: string) => schoolRepo.setClassStatus(c, school.id, row.id, status, row.version, reason), {
    success: (r) => r.status === "active" ? `Đã kích hoạt lớp ${r.name}` : r.status === "archived" ? `Đã lưu trữ lớp ${r.name}` : `Đã chuyển lớp ${r.name} về nháp`,
  });
  const selectedYear = years?.find((y) => y.id === list.query.filters?.yearId);
  const writable = can("class.manage") && selectedYear?.status !== "archived";

  // ?new=1 (from SC01 quick action) opens the create drawer once.
  useEffect(() => {
    if (sp.get("new") === "1" && can("class.manage")) {
      setTarget({ mode: "create", yearId: selectedYear?.status === "archived" ? undefined : list.query.filters?.yearId });
      const next = new URLSearchParams(sp.toString()); next.delete("new");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (r: ClassRow): MenuItem[] => {
    const rowWritable = can("class.manage") && years?.find((y) => y.id === r.yearId)?.status !== "archived";
    return [
      { label: "Mở không gian lớp", icon: <Eye />, href: `/classroom/${school.id}/${r.yearId}/${r.id}` },
      ...(rowWritable && r.status !== "archived" ? [{ label: "Sửa thông tin lớp", icon: <Pencil />, onSelect: () => setTarget({ mode: "edit", row: r }) }] : []),
      ...(can("assignment.manage") && !r.homeroomName && r.status !== "archived" ? [{ label: "Phân công GVCN", icon: <UserCog />, onSelect: () => setAssign({ kind: "homeroom", classId: r.id, yearId: r.yearId }) }] : []),
      ...(rowWritable && r.status === "draft" ? [{ label: "Kích hoạt lớp", icon: <Power />, disabled: !r.homeroomName, hint: r.homeroomName ? "Lớp xuất hiện với giáo viên được phân công" : "Cần GVCN trước khi kích hoạt", onSelect: () => setStatus.run(r, "active") }] : []),
      ...(rowWritable && r.status === "active" ? [{ label: "Chuyển về nháp", icon: <RotateCcw />, onSelect: () => setStatus.run(r, "draft") }] : []),
      ...(rowWritable && r.status !== "archived" ? [{ label: "Lưu trữ lớp", icon: <Archive />, danger: true, separatorBefore: true, onSelect: () => setArchive(r) }] : []),
    ];
  };

  const columns: Column<ClassRow>[] = [
    { key: "name", header: "Lớp", sortable: true, cell: (r) => <Link href={`/classroom/${school.id}/${r.yearId}/${r.id}`} className="font-bold text-primary-strong hover:underline">{r.name}</Link> },
    { key: "grade", header: "Khối", cell: (r) => r.gradeName },
    { key: "year", header: "Năm học", hideBelow: "lg", cell: (r) => r.yearLabel },
    { key: "homeroom", header: "GVCN", sortable: true, cell: (r) => r.homeroomName ?? <span className="font-medium text-danger-text">Chưa phân công</span> },
    { key: "size", header: "Sĩ số", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{r.size ?? "—"}<span className="text-muted">/{r.capacity}</span></span> },
    { key: "subjects", header: "GV bộ môn", align: "right", hideBelow: "md", cell: (r) => r.subjectTeacherCount },
    { key: "room", header: "Phòng", hideBelow: "lg", cell: (r) => r.roomCode ?? <span className="text-muted">—</span> },
    { key: "setup", header: "Khởi tạo", hideBelow: "md", cell: (r) => r.issues.length ? <span className="flex items-start gap-1.5 text-[12.5px] text-warning-text" title={r.issues.join("\n")}><AlertTriangle className="mt-0.5 size-3.5 flex-none" aria-hidden /><span className="line-clamp-2 max-w-[190px]">{r.issues.join("; ")}</span></span> : <span className="text-[12.5px] text-success-text">Đủ thông tin</span> },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={classStatus} /> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "center", cell: (r) => <ActionMenu label={`Thao tác với lớp ${r.name}`} items={menu(r)} /> },
  ];

  return (
    <div className="page">
      <PageHeader title="Danh sách lớp" subtitle="Lớp học theo năm, khối, giáo viên chủ nhiệm và tình trạng khởi tạo"
        breadcrumbs={[{ label: "Nhà trường", href: `/school/${school.id}` }, { label: "Danh sách lớp" }]}
        actions={writable ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setTarget({ mode: "create", yearId: list.query.filters?.yearId })}>Tạo lớp</Button> : undefined} />
      <Card>
        <CardHeader title="Lớp học" icon={<Layers className="size-6 text-primary" />} subtitle={q.data ? `${q.data.total} lớp theo bộ lọc` : undefined} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tên lớp, GVCN…" onReset={() => { list.reset(); list.setFilter("yearId", yearId); }} active={list.active && (!!list.query.q || Object.entries(list.query.filters ?? {}).some(([k, v]) => k !== "yearId" && v) || list.query.filters?.yearId !== yearId)}>
          <InlineSelect label="Năm học" allLabel="Tất cả năm học" value={list.query.filters?.yearId ?? ""} onChange={(v) => list.setFilter("yearId", v)} disabled={years===null} options={(years ?? []).map((y) => ({ value: y.id, label: `${y.label}${y.status === "archived" ? " (lưu trữ)" : y.status === "draft" ? " (nháp)" : ""}` }))} />
          <InlineSelect label="Khối" disabled={!opts.data} allLabel="Tất cả khối" value={list.query.filters?.gradeId ?? ""} onChange={(v) => list.setFilter("gradeId", v)} options={(opts.data?.grades ?? []).map((g) => ({ value: g.id, label: g.name }))} />
          <InlineSelect label="Giáo viên chủ nhiệm" disabled={!opts.data?.teachers} allLabel="Tất cả GVCN" value={list.query.filters?.homeroom ?? ""} onChange={(v) => list.setFilter("homeroom", v)} options={[{ value: "none", label: "Chưa có GVCN" }, ...(opts.data?.teachers ?? []).map((t) => ({ value: t.userId, label: t.name }))]} />
          <InlineSelect label="Trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(classStatus).map(([value, s]) => ({ value, label: s.label }))} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : (
            <>
              <div className="px-4">
                <DataTable caption="Danh sách lớp" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort} minWidth={680}
                  empty={q.data!.total === 0 && !list.query.q && !list.query.filters?.gradeId && !list.query.filters?.homeroom && !list.query.filters?.status
                    ? <EmptyState compact title="Năm học chưa có lớp" description="Tạo lớp đầu tiên để phân công giáo viên và nhập học sinh." action={writable ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setTarget({ mode: "create", yearId: list.query.filters?.yearId })}>Tạo lớp</Button> : undefined} />
                    : <EmptyFiltered onReset={() => { list.reset(); list.setFilter("yearId", yearId); }} what="lớp" />} />
              </div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="lớp" />
            </>
          )}
      </Card>
      <ClassDrawer target={target} onClose={() => setTarget(null)} />
      <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
      <ConfirmDialog open={!!archive} onOpenChange={(o) => { if (!o) setArchive(null); }} busy={setStatus.pending} title="Lưu trữ lớp" variant="danger" confirmLabel="Lưu trữ lớp"
        object={archive ? `Lớp ${archive.name} — ${archive.yearLabel} (${archive.size} học sinh)` : undefined}
        consequence="Lớp chuyển sang chỉ xem: không điểm danh, ghi nhận hay công bố mới. Học sinh, lịch sử và báo cáo cũ được giữ nguyên, không bị xóa."
        reasonLabel="Lý do lưu trữ (ít nhất 3 ký tự)" reasonRequired error={setStatus.error?.message}
        onConfirm={async (reason) => { if (!archive) return; const r = await setStatus.run(archive, "archived", reason); if (r) setArchive(null); }} />
    </div>
  );
}
