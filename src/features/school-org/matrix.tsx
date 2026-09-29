"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Grid3x3, Plus, AlertTriangle, UserRound, Ban, RefreshCw, Search, CheckCircle2 } from "lucide-react";
import { staffRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool, SchoolYearBar } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, QueryState } from "@/components/ui/states";
import { classStatus, fmtDate, matches } from "@/lib/formatters";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";

type Matrix = Awaited<ReturnType<typeof staffRepo.assignmentMatrix>>;
type CellData = NonNullable<Matrix["rows"][number]["homeroom"]>;

/** SC12 — assignment matrix: classes × (homeroom + subjects), validity per cell, conflicts; empty cell → prefilled O06. */
export function AssignmentMatrix() {
  const { school, yearId } = useSchool();
  const q = useRepo(["school-matrix", school.id, yearId], (c) => staffRepo.assignmentMatrix(c, school.id, yearId));
  const [assign, setAssign] = useState<AssignPrefill | null>(null);
  const [revoke, setRevoke] = useState<{ cell: CellData; label: string } | null>(null);
  const [search, setSearch] = useState("");
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const cmd = useCommand((c, id: string, reason: string) => staffRepo.revokeAssignment(c, school.id, id, reason), { success: "Đã thu hồi phân công" });
  return (
    <div className="page">
      <PageHeader title="Ma trận phân công" subtitle="Ai phụ trách lớp nào, môn nào, trong thời gian nào" breadcrumbs={[{ label: "Nhà trường", href: `/school/${school.id}` }, { label: "Ma trận phân công" }]}>
        <SchoolYearBar />
      </PageHeader>
      <QueryState query={q} skeleton="table">
        {(d) => {
          const archived = d.year.status === "archived";
          const canAssign = d.canAssign && !archived;
          const rows = d.rows.filter((r) => matches(search, r.className, r.homeroom?.name, ...Object.values(r.bySubject).map((x) => x?.name)) && (!onlyConflicts || r.conflicts.length));
          const conflictCount = d.rows.filter((r) => r.conflicts.length).length;
          const cellMenu = (cell: CellData, label: string, classId: string, kind: "homeroom" | "subject"): MenuItem[] => [
            { label: "Xem hồ sơ & phân công", icon: <UserRound />, href: `/school/${school.id}/teachers/${cell.membershipId}` },
            ...(canAssign && kind === "homeroom" ? [{ label: "Bàn giao chủ nhiệm", icon: <RefreshCw />, href: `/school/${school.id}/handovers?class=${classId}` }] : []),
            ...(canAssign ? [{ label: "Thu hồi phân công", icon: <Ban />, danger: true, separatorBefore: true, onSelect: () => setRevoke({ cell, label }) }] : []),
          ];
          const renderCell = (cell: CellData | null, label: string, classId: string, kind: "homeroom" | "subject", subjectId?: string) => cell ? (
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className={clsx("truncate text-[13px] font-semibold", cell.memberStatus === "active" ? "text-ink" : "text-warning-text")}>{cell.name}</p>
                <p className="text-[11.5px] text-muted">từ {fmtDate(cell.validFrom)}{cell.validTo ? ` đến ${fmtDate(cell.validTo)}` : ""}</p>
                {cell.memberStatus !== "active" && <p className="text-[11.5px] font-medium text-warning-text">Thành viên bị khóa</p>}
              </div>
              <ActionMenu label={`Thao tác ${label}`} items={cellMenu(cell, label, classId, kind)} />
            </div>
          ) : canAssign ? (
            <button type="button" onClick={() => setAssign({ kind, classId, subjectId, yearId: d.year.id })} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong py-2 text-[12.5px] font-semibold text-primary-strong hover:bg-primary-light" aria-label={`Phân công ${label}`}>
              <Plus className="size-3.5" aria-hidden />Phân công
            </button>
          ) : <span className="text-[12.5px] text-muted">Chưa phân công</span>;
          return (
            <>
              {archived && <Callout tone="neutral">Năm học lưu trữ — ma trận chỉ xem theo thời điểm cuối năm.</Callout>}
              <Card>
                <CardHeader title={`Năm học ${d.year.label}`} icon={<Grid3x3 className="size-5 text-primary" />} subtitle={`${d.rows.length} lớp · ${d.subjects.length} môn · ${conflictCount} lớp có xung đột/thiếu`} />
                <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
                  <div className="input-icon min-w-[200px] flex-[1_1_260px]"><Search className="size-4" aria-hidden /><input className="input" type="search" placeholder="Tìm lớp hoặc giáo viên…" aria-label="Tìm lớp hoặc giáo viên" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                  <Checkbox label="Chỉ lớp có xung đột" checked={onlyConflicts} onChange={setOnlyConflicts} />
                </div>
                {d.rows.length === 0 ? <EmptyState compact title="Năm học chưa có lớp" description="Tạo lớp trước khi phân công." action={<Link className="btn btn-secondary btn-sm" href={`/school/${school.id}/classes`}>Danh sách lớp</Link>} />
                  : rows.length === 0 ? <EmptyState compact title="Không có lớp khớp bộ lọc" /> : (
                  <>
                    <div className="hidden px-4 pb-4 md:block">
                      <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Ma trận phân công" tabIndex={0}>
                        <table className="table" style={{ minWidth: 220 + 190 * (d.subjects.length + 1) + 200 }}>
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-[2] bg-[#f4f8fd]">Lớp</th>
                              <th>Chủ nhiệm</th>
                              {d.subjects.map((s) => <th key={s.id}><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />{s.name}</span></th>)}
                              <th>Xung đột</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.classId}>
                                <td className="sticky left-0 z-[1] bg-white"><p className="font-bold text-ink">{r.className}</p><StatusBadge status={r.status} map={classStatus} /></td>
                                <td className="min-w-[180px] align-top">{renderCell(r.homeroom, `chủ nhiệm ${r.className}`, r.classId, "homeroom")}</td>
                                {d.subjects.map((s) => <td key={s.id} className="min-w-[180px] align-top">{renderCell(r.bySubject[s.id], `${s.name} ${r.className}`, r.classId, "subject", s.id)}</td>)}
                                <td className="min-w-[200px] align-top">{r.conflicts.length ? <ul className="space-y-0.5">{r.conflicts.map((c) => <li key={c} className="flex items-start gap-1 text-[12.5px] text-danger-text"><AlertTriangle className="mt-0.5 size-3.5 flex-none" aria-hidden />{c}</li>)}</ul> : <span className="flex items-center gap-1 text-[12.5px] text-success-text"><CheckCircle2 className="size-3.5" aria-hidden />Không có</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[12.5px] text-muted">Cuộn ngang để xem đủ các môn. “Thiếu” được tính theo môn có trong thời khóa biểu của lớp.</p>
                    </div>
                    <ul className="space-y-3 px-4 pb-4 md:hidden">
                      {rows.map((r) => (
                        <li key={r.classId}>
                          <details className="rounded-xl border border-line" open={r.conflicts.length > 0}>
                            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
                              <span className="font-bold text-ink">{r.className}</span><StatusBadge status={r.status} map={classStatus} />
                              {r.conflicts.length > 0 && <Badge tone="danger" className="ml-auto">{r.conflicts.length} vấn đề</Badge>}
                            </summary>
                            <div className="space-y-3 border-t border-line px-4 py-3">
                              {r.conflicts.length > 0 && <ul className="space-y-0.5">{r.conflicts.map((c) => <li key={c} className="text-[12.5px] text-danger-text">{c}</li>)}</ul>}
                              <div><p className="mb-1 text-[12px] font-semibold uppercase text-muted">Chủ nhiệm</p>{renderCell(r.homeroom, `chủ nhiệm ${r.className}`, r.classId, "homeroom")}</div>
                              {d.subjects.map((s) => <div key={s.id}><p className="mb-1 text-[12px] font-semibold text-muted">{s.name}</p>{renderCell(r.bySubject[s.id], `${s.name} ${r.className}`, r.classId, "subject", s.id)}</div>)}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </>
          );
        }}
      </QueryState>
      <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
      <ConfirmDialog open={!!revoke} onOpenChange={(o) => { if (!o) setRevoke(null); }} busy={cmd.pending} title="Thu hồi phân công" variant="danger" confirmLabel="Thu hồi"
        object={revoke ? `${revoke.cell.name} — ${revoke.label}` : undefined} reasonLabel="Lý do thu hồi" reasonRequired
        consequence="Quyền theo phân công này dừng ở lần đọc/ghi kế tiếp. Dữ liệu đã ghi và tác giả lịch sử được giữ nguyên."
        onConfirm={async (reason) => { if (!revoke) return; const r = await cmd.run(revoke.cell.assignmentId, reason); if (r) setRevoke(null); }} />
    </div>
  );
}

export type { Matrix };
