"use client";
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, ListTree, Search } from "lucide-react";
import type { SnapshotRow } from "@/lib/model/types";
import { fmtDate, fmtPoints, nameCompare } from "@/lib/formatters";
import { downloadCSV, downloadXLSX, slugFile, type ExportColumn } from "@/lib/export";
import { DataTable, Pagination, useClientList, type Column } from "@/components/data/table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyFiltered, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { GradeBadge, Points, RECORD_STATUS, limitsNote } from "./shared";

type GradeBand=import('@/lib/repositories/connected/conduct').RuleItem['bands'][number];
export interface ExplainRuleSet { name: string; versionNo: number; baseScore: number; cap?: number; floor?: number; bands: GradeBand[] }

/** O19 — explanation of one student's score: base + every counted item = total (with cap/floor note). */
export function ExplainDrawer({ row, ruleSet, statusOf, versionOf, official, onClose, weekText }: {
  row: SnapshotRow | null; ruleSet: ExplainRuleSet; statusOf?: (recordId: string) => string | undefined; versionOf?: (recordId: string) => number | undefined;
  official: boolean; onClose: () => void; weekText: string;
}) {
  const raw = row ? row.base + row.plus + row.minus : 0;
  return (
    <Drawer open={!!row} onOpenChange={(o) => { if (!o) onClose(); }} width={520} title={row ? `Giải trình điểm — ${row.studentName}` : "Giải trình điểm"}
      description={row ? `${row.studentCode} · ${weekText} · ${official ? "Bản chính thức (snapshot)" : "Bản xem trước — gồm ghi nhận chờ rà soát, chưa chính thức"}` : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {row && (
        <div className="space-y-4 text-sm">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 420 }}>
              <thead><tr><th>Ngày</th><th>Nội dung</th><th className="num">Điểm</th><th>Nội quy</th>{!official && <th>Trạng thái</th>}</tr></thead>
              <tbody>
                <tr><td>—</td><td className="font-semibold text-ink">Điểm gốc</td><td className="num font-semibold text-ink">{row.base}</td><td>bản {ruleSet.versionNo}</td>{!official && <td />}</tr>
                {row.items.map((i) => {
                  const st = statusOf?.(i.recordId) ?? (official ? "approved" : "pending_review");
                  return (
                    <tr key={i.recordId}>
                      <td className="tabular-nums">{fmtDate(i.date)}</td>
                      <td>{i.label}{!i.shareWithParent && <Badge tone="neutral" dot={false} className="ml-1.5">Không chia sẻ phụ huynh</Badge>}</td>
                      <td className="num"><Points value={i.points} /></td>
                      <td>bản {versionOf?.(i.recordId) ?? ruleSet.versionNo}</td>
                      {!official && <td><Badge tone={RECORD_STATUS[st]?.tone}>{RECORD_STATUS[st]?.label ?? st}</Badge></td>}
                    </tr>
                  );
                })}
                {row.items.length === 0 && <tr><td colSpan={official ? 4 : 5} className="text-center text-muted">Không có ghi nhận cộng/trừ trong tuần.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-line bg-[#f7fbff] p-4">
            <p className="text-[13px] text-muted">Phép tính</p>
            <p className="mt-1 text-lg font-bold text-ink tabular-nums" data-testid="explain-formula">
              {row.base}{row.items.map((i) => ` ${i.points < 0 ? "−" : "+"} ${Math.abs(i.points)}`).join("")} = {raw}
              {raw !== row.total && <> → <span className="text-primary-strong">{row.total}</span></>}
            </p>
            <p className="mt-1 text-[13px] text-body">Tổng cộng {fmtPoints(row.plus)}, tổng trừ {fmtPoints(row.minus)}. Điểm thi đua: <b className="text-ink">{row.total}</b> — xếp loại <GradeBadge label={row.grade} bands={ruleSet.bands} /></p>
            <p className="mt-1 text-[12.5px] text-muted">{raw !== row.total ? `Tổng thô ${raw} đã được giới hạn theo nội quy. ` : ""}{limitsNote(ruleSet)}</p>
          </div>
          <p className="text-[12.5px] text-muted">Theo {ruleSet.name} (bản {ruleSet.versionNo}). {official ? "Bản đã chốt giữ nguyên phiên bản nội quy tại thời điểm chốt — đổi nội quy sau này không làm thay đổi số liệu." : "Ghi nhận chờ rà soát có thể bị từ chối hoặc loại khi rà soát."}</p>
        </div>
      )}
    </Drawer>
  );
}

type SortKey = "name" | "code" | "plus" | "minus" | "total";

/** C062 — weekly conduct table (preview or official snapshot) with search, sort, paging and explanation. */
export function WeeklyConductTable({ rows, bands, compact, pageSize = 10, onExplain, onSelect, selectedId, caption, detailsAvailable = true }: {
  rows: SnapshotRow[]; bands: GradeBand[]; compact?: boolean; pageSize?: number; onExplain: (r: SnapshotRow) => void; onSelect?: (r: SnapshotRow) => void; selectedId?: string; caption: string; detailsAvailable?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(() => {
    const cmp: Record<SortKey, (a: SnapshotRow, b: SnapshotRow) => number> = {
      name: (a, b) => nameCompare(a.studentName, b.studentName), code: (a, b) => a.studentCode.localeCompare(b.studentCode),
      plus: (a, b) => a.plus - b.plus, minus: (a, b) => a.minus - b.minus, total: (a, b) => a.total - b.total,
    };
    const out = rows.slice().sort(cmp[sort]);
    return dir === "desc" ? out.reverse() : out;
  }, [rows, sort, dir]);
  const list = useClientList(sorted, { search: (r) => `${r.studentName} ${r.studentCode}`, pageSize });
  const indexOf = new Map(sorted.map((r, i) => [r.studentId, i + 1]));
  const onSort = (k: string) => { if (k === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k as SortKey); setDir(k === "name" || k === "code" ? "asc" : "desc"); } };
  const cols: Column<SnapshotRow>[] = [
    { key: "idx", header: "#", cell: (r) => <span className="text-muted">{indexOf.get(r.studentId)}</span>, className: "w-10" },
    { key: "name", header: "Họ và tên", sortable: true, cell: (r) => onSelect ? <button type="button" className="whitespace-nowrap text-left font-semibold text-ink hover:text-primary-strong hover:underline" onClick={() => onSelect(r)}>{r.studentName}</button> : <span className="whitespace-nowrap font-semibold text-ink">{r.studentName}</span> },
    { key: "code", header: "Mã HS", sortable: true, cell: (r) => r.studentCode },
    ...(compact ? [] : [{ key: "base", header: "Điểm gốc", align: "right" as const, cell: (r: SnapshotRow) => r.base, hideBelow: "md" as const }]),
    { key: "plus", header: "Tổng cộng", sortable: true, align: "right", cell: (r) => <Points value={r.plus} /> },
    { key: "minus", header: "Tổng trừ", sortable: true, align: "right", cell: (r) => <Points value={r.minus} /> },
    { key: "total", header: "Điểm thi đua", sortable: true, align: "right", cell: (r) => <span className="font-bold text-ink tabular-nums">{r.total}</span> },
    { key: "grade", header: "Xếp loại", align: "center", cell: (r) => <GradeBadge label={r.grade} bands={bands} /> },
    ...(compact ? [] : [{ key: "n", header: "Số ghi nhận", align: "right" as const, cell: (r: SnapshotRow) => detailsAvailable ? r.items.length : "—", hideBelow: "lg" as const }]),
    { key: "x", header: <span className="sr-only">Giải trình</span>, align: "right", cell: (r) => <Button size="sm" variant="ghost" icon={<ListTree className="size-4" />} disabled={!detailsAvailable} onClick={() => onExplain(r)} aria-label={`Xem giải trình điểm của ${r.studentName}`}>{compact ? "" : "Xem giải trình"}</Button> },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <div className="input-icon min-w-[200px] flex-[1_1_240px]">
          <Search className="size-4" aria-hidden />
          <input className="input" type="search" placeholder="Tìm theo tên, mã học sinh…" aria-label="Tìm học sinh trong bảng thi đua" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        </div>
        <p className="text-[12.5px] text-muted">{rows.length} học sinh</p>
      </div>
      <DataTable rows={list.items} columns={cols} rowKey={(r) => r.studentId} sort={sort} dir={dir} onSort={onSort} caption={caption} minWidth={compact ? 560 : 760} rowSelectedKey={selectedId} dense={compact}
        empty={rows.length === 0 ? <EmptyState compact title="Chưa có học sinh trong tuần" /> : <EmptyFiltered onReset={() => list.setQ("")} what="học sinh" />} />
      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="học sinh" />
    </div>
  );
}

const EXPORT_COLS: ExportColumn[] = [
  { key: "idx", label: "STT" }, { key: "name", label: "Họ và tên" }, { key: "code", label: "Mã HS" }, { key: "base", label: "Điểm gốc" },
  { key: "plus", label: "Tổng cộng" }, { key: "minus", label: "Tổng trừ" }, { key: "total", label: "Điểm thi đua" }, { key: "grade", label: "Xếp loại" }, { key: "items", label: "Chi tiết ghi nhận" },
];

/** CSV / XLSX export of a weekly table (real files, generated locally). */
export function ExportButtons({ rows, fileBase, title, subtitle }: { rows: SnapshotRow[]; fileBase: string; title: string; subtitle: string }) {
  const toast = useToast();
  const data = () => rows.slice().sort((a, b) => nameCompare(a.studentName, b.studentName)).map((r, i) => ({
    idx: i + 1, name: r.studentName, code: r.studentCode, base: r.base, plus: r.plus, minus: r.minus, total: r.total, grade: r.grade,
    items: r.items.map((x) => `${fmtDate(x.date)} ${x.label} ${fmtPoints(x.points)}`).join("; "),
  }));
  return (
    <>
      <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => { downloadCSV(EXPORT_COLS, data(), slugFile(fileBase)); toast.push({ tone: "success", title: "Đã tạo tệp CSV", detail: `${rows.length} dòng — tạo cục bộ trên trình duyệt.` }); }}>Xuất CSV</Button>
      <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={async () => { await downloadXLSX(EXPORT_COLS, data(), slugFile(fileBase), { title, subtitle }); toast.push({ tone: "success", title: "Đã tạo tệp XLSX", detail: `${rows.length} dòng — tạo cục bộ trên trình duyệt.` }); }}>Xuất XLSX</Button>
    </>
  );
}
