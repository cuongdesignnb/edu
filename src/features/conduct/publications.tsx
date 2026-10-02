"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileClock, GitCompare, History, Printer, ScrollText, Search, Trophy, FilePen } from "lucide-react";
import type { SnapshotRow } from "@/lib/model/types";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtPoints } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { InlineSelect } from "@/components/ui/form";
import { DataTable, Pagination, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { ConductNav, Points, SNAPSHOT_STATUS, limitsNote, weekLabel } from "./shared";
import { ExplainDrawer, ExportButtons, WeeklyConductTable } from "./week-table";
import { AdjustmentDialog } from "./adjustments";

type SnapItem = Awaited<ReturnType<typeof conductRepo.snapshots>>[number];

/** CL09 — history of locked / published snapshots. Opening never recomputes from the current rule set. */
export function PublicationsScreen() {
  const { schoolId, yearId, classId, base } = useClassroom();
  const q = useRepo(["conduct-snapshots", classId], (ctx) => conductRepo.snapshots(ctx, schoolId, yearId, classId));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"week" | "avg">("week");
  const [page, setPage] = useState(1);
  return (
    <div className="page">
      <ClassHeader title="Lịch sử kết quả công bố" subtitle="Mỗi lần chốt tạo một bản chính thức; điều chỉnh tạo phiên bản mới, bản cũ được giữ nguyên" crumbs={[{ label: "Thi đua", href: `${base}/conduct` }, { label: "Kết quả đã công bố" }]} />
      <ConductNav />
      <QueryState query={q} skeleton="table">
        {(items) => {
          const filtered = items.filter((s) => (!status || s.status === status) && (!search.trim() || `tuần ${s.weekIndex} ${s.ruleSetName} ${s.lockedByName} ${s.publishedByName}`.toLowerCase().includes(search.trim().toLowerCase())))
            .sort((a, b) => sort === "avg" ? b.avg - a.avg : b.weekIndex - a.weekIndex || b.versionNo - a.versionNo);
          const pageSize = 10;
          const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
          const cur = Math.min(page, pageCount);
          const cols: Column<SnapItem>[] = [
            { key: "w", header: "Tuần", cell: (s) => <Link href={`${base}/publications/${s.id}`} className="font-semibold text-primary-strong hover:underline">Tuần {s.weekIndex}</Link> },
            { key: "v", header: "Phiên bản", cell: (s) => <span>Bản {s.versionNo}{s.adjustmentNote && <span className="block max-w-[220px] truncate text-[12px] text-muted" title={s.adjustmentNote}>{s.adjustmentNote}</span>}</span> },
            { key: "st", header: "Trạng thái", cell: (s) => <Badge tone={SNAPSHOT_STATUS[s.status]?.tone}>{SNAPSHOT_STATUS[s.status]?.label ?? s.status}</Badge> },
            { key: "rs", header: "Nội quy", cell: (s) => <span className="whitespace-nowrap">bản {s.ruleSetVersionNo}</span>, hideBelow: "md" },
            { key: "l", header: "Chốt", cell: (s) => <span className="whitespace-nowrap">{s.lockedByName}<span className="block text-[12px] text-muted">{fmtDateTime(s.lockedAt)}</span></span>, hideBelow: "lg" },
            { key: "p", header: "Công bố", cell: (s) => s.publishedAt ? <span className="whitespace-nowrap">{s.publishedByName}<span className="block text-[12px] text-muted">{fmtDateTime(s.publishedAt)}</span></span> : <span className="text-muted">Chưa công bố</span> },
            { key: "a", header: "Điểm TB", align: "right", cell: (s) => <b className="tabular-nums text-ink">{s.avg.toLocaleString("vi-VN")}</b> },
            { key: "o", header: <span className="sr-only">Mở</span>, align: "right", cell: (s) => <ButtonLink size="sm" variant="secondary" href={`${base}/publications/${s.id}`}>Mở</ButtonLink> },
          ];
          return (
            <Card>
              <CardHeader title="Các bản kết quả thi đua" icon={<History className="size-5 text-primary" />} subtitle={`${items.length} bản`} />
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                <div className="input-icon min-w-[200px] flex-[2_1_240px]"><Search className="size-4" aria-hidden /><input className="input" type="search" placeholder="Tìm theo tuần, người chốt / công bố…" aria-label="Tìm bản kết quả" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
                <InlineSelect label="Lọc trạng thái" className="flex-[1_1_200px]" value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Tất cả trạng thái" options={Object.entries(SNAPSHOT_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
                <InlineSelect label="Sắp xếp" className="flex-[1_1_180px]" value={sort} onChange={(v) => setSort(v as "week" | "avg")} options={[{ value: "week", label: "Tuần mới nhất" }, { value: "avg", label: "Điểm TB cao nhất" }]} />
              </div>
              <DataTable rows={filtered.slice((cur - 1) * pageSize, cur * pageSize)} columns={cols} rowKey={(s) => s.id} caption="Lịch sử kết quả công bố" minWidth={640}
                empty={items.length === 0 ? <EmptyState compact title="Chưa có bản kết quả nào" description="Khi tuần được chốt, bản chính thức sẽ xuất hiện ở đây." /> : <EmptyFiltered onReset={() => { setSearch(""); setStatus(""); }} what="bản kết quả" />} />
              <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="bản" />
            </Card>
          );
        }}
      </QueryState>
    </div>
  );
}

/** CL10 — one immutable snapshot: table, rule version explanation, versions + diff, print/export, adjustment request. */
export function PublicationDetailScreen({ snapshotId }: { snapshotId: string }) {
  const { schoolId, yearId, classId, base, header } = useClassroom();
  const q = useRepo(["conduct-snapshot", classId, snapshotId], (ctx) => conductRepo.snapshot(ctx, schoolId, yearId, classId, snapshotId));
  const [explain, setExplain] = useState<SnapshotRow | null>(null);
  const [adj, setAdj] = useState(false);
  return (
    <div className="page">
      <div className="no-print"><ClassHeader title="Bản kết quả thi đua" crumbs={[{ label: "Thi đua", href: `${base}/conduct` }, { label: "Kết quả đã công bố", href: `${base}/publications` }, { label: "Chi tiết" }]} /></div>
      <div className="no-print"><ConductNav /></div>
      <QueryState query={q} skeleton="detail">
        {(d) => {
          const s = d.snapshot;
          const st = SNAPSHOT_STATUS[s.status];
          return (
            <>
              <div className="print-only">
                <p className="text-lg font-bold text-ink">{header.school.name}</p>
                <p className="text-xl font-extrabold text-ink">Kết quả thi đua lớp {d.className} — {weekLabel(d.week)}</p>
                <p className="text-sm">Phiên bản {s.versionNo} · {st?.label} · {s.ruleSetName} (bản {s.ruleSetVersionNo}) · Chốt {fmtDateTime(s.lockedAt)}{s.publishedAt ? ` · Công bố ${fmtDateTime(s.publishedAt)}` : ""}</p>
              </div>
              <Card className="no-print flex flex-wrap items-center gap-3 p-3.5">
                <ButtonLink href={`${base}/publications`} variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />}>Danh sách bản</ButtonLink>
                <span className="text-[15px] font-bold text-ink">{weekLabel(d.week)} · Bản {s.versionNo}</span>
                <Badge tone={st?.tone}>{st?.label ?? s.status}</Badge>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>In / lưu PDF</Button>
                  <ExportButtons rows={s.rows} fileBase={`thi-dua-${d.className}-tuan-${d.week.index}-ban-${s.versionNo}`} title={`Thi đua lớp ${d.className} — ${weekLabel(d.week)}`} subtitle={`Phiên bản ${s.versionNo} (${st?.label}) · ${s.ruleSetName} bản ${s.ruleSetVersionNo}`} />
                  {d.canRequestAdjustment && <Button size="sm" variant="primary" icon={<FilePen className="size-4" />} onClick={() => setAdj(true)}>Đề nghị điều chỉnh</Button>}
                </div>
              </Card>
              {!s.detailsAvailable && <Callout tone="warning" title="Bản lịch sử chỉ lưu tổng điểm">Chi tiết sự kiện chưa được lưu trong bản này. Tổng điểm giữ nguyên theo bản đã chốt; giải trình chi tiết không khả dụng.</Callout>}
              {s.status === "superseded" && <Callout className="no-print" tone="neutral" icon={<FileClock />} title="Bản này đã được thay bằng phiên bản mới">Giữ nguyên để tra cứu lịch sử. Phụ huynh hiện xem phiên bản mới nhất đã công bố.</Callout>}
              {s.status === "locked" && <Callout className="no-print" tone="info" title="Đã chốt, chưa công bố">{s.supersedesId ? "Đây là bản điều chỉnh đã duyệt. Phụ huynh vẫn thấy bản đang công bố trước đó cho đến khi bản này được công bố lại." : "Nhân sự đủ quyền đã thấy; phụ huynh chưa thấy."}</Callout>}
              {d.pendingAdjustments > 0 && s.status === "published" && <Callout className="no-print" tone="warning" title={`Có ${d.pendingAdjustments} đề nghị điều chỉnh đang xử lý`} action={<ButtonLink size="sm" variant="secondary" href={`${base}/adjustments`}>Xem điều chỉnh</ButtonLink>}>Phụ huynh vẫn xem bản này cho tới khi bản điều chỉnh được công bố.</Callout>}
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Card className="min-w-0">
                  <CardHeader title={`Bảng kết quả — ${s.rows.length} học sinh`} icon={<Trophy className="size-5 text-primary" />} subtitle="Bản chính thức, không đổi. Không tính lại theo nội quy hiện tại." />
                  <div className="no-print"><WeeklyConductTable rows={s.rows} bands={d.ruleSet.bands} caption="Bảng kết quả đã chốt" detailsAvailable={s.detailsAvailable} onExplain={setExplain} /></div>
                  <div className="print-only"><PrintTable rows={s.rows} /></div>
                </Card>
                <div className="space-y-5 no-print">
                  <Card>
                    <CardHeader title="Thông tin phiên bản" icon={<ScrollText className="size-5 text-primary" />} />
                    <dl className="px-5 pb-4">
                      <InfoRow label="Lớp">{d.className}</InfoRow>
                      <InfoRow label="Kỳ">{weekLabel(d.week)}</InfoRow>
                      <InfoRow label="Chốt">{fmtDateTime(s.lockedAt)} · {d.lockedByName}</InfoRow>
                      <InfoRow label="Công bố">{s.publishedAt ? `${fmtDateTime(s.publishedAt)} · ${d.publishedByName}` : "Chưa công bố"}</InfoRow>
                      {s.adjustmentNote && <InfoRow label="Ghi chú">{s.adjustmentNote}</InfoRow>}
                    </dl>
                  </Card>
                  <Card>
                    <CardHeader title="Nội quy theo phiên bản" icon={<ScrollText className="size-5 text-primary" />} />
                    <div className="space-y-2 px-5 pb-5 text-[13px]">
                      <p><b className="text-ink">{d.ruleSet.name}</b> — bản {d.ruleSet.versionNo}. Điểm gốc {d.ruleSet.baseScore}. {limitsNote(d.ruleSet)}</p>
                      <p className="text-muted">Bản kết quả giữ phiên bản nội quy tại thời điểm chốt. Nhà trường ban hành nội quy mới không làm thay đổi bản này.</p>
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {d.ruleSet.rules.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5"><span>{r.label}</span><Points value={r.points} /></li>)}
                      </ul>
                      <p className="flex flex-wrap gap-1.5">{d.ruleSet.bands.map((b) => <Badge key={b.label} tone={b.tone} dot={false}>{b.label}{b.min > -1000 ? ` ≥ ${b.min}` : ""}</Badge>)}</p>
                    </div>
                  </Card>
                  <Card>
                    <CardHeader title="Các phiên bản của tuần" icon={<GitCompare className="size-5 text-primary" />} />
                    <ul className="space-y-2 px-5 pb-4 text-[13px]" data-testid="versions">
                      {d.versions.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-2">
                          {v.id === s.id ? <b className="text-ink">Bản {v.versionNo} (đang xem)</b> : <Link className="font-semibold text-primary-strong hover:underline" href={`${base}/publications/${v.id}`}>Bản {v.versionNo}</Link>}
                          <Badge tone={SNAPSHOT_STATUS[v.status]?.tone}>{SNAPSHOT_STATUS[v.status]?.label}</Badge>
                          {v.publishedAt && <span className="text-muted">{fmtDateTime(v.publishedAt)}</span>}
                          {v.adjustmentNote && <span className="basis-full text-[12px] text-muted">{v.adjustmentNote}</span>}
                        </li>
                      ))}
                    </ul>
                    {d.diff.length > 0 && (
                      <div className="px-5 pb-5">
                        <p className="mb-1.5 text-[13px] font-semibold text-ink">Thay đổi so với bản trước</p>
                        <table className="table" data-testid="diff"><thead><tr><th>Học sinh</th><th className="num">Trước</th><th className="num">Sau</th><th className="num">Chênh</th></tr></thead>
                          <tbody>{d.diff.map((x) => <tr key={x.studentId}><td>{x.studentName}</td><td className="num">{x.before ?? "—"}</td><td className="num font-bold text-ink">{x.after}</td><td className="num">{x.before !== undefined ? fmtPoints(x.after - x.before) : "—"}</td></tr>)}</tbody></table>
                      </div>
                    )}
                    {s.supersedesId && d.diff.length === 0 && <p className="px-5 pb-5 text-[13px] text-muted">Không có thay đổi tổng điểm so với bản trước.</p>}
                  </Card>
                </div>
              </div>
              <ExplainDrawer row={explain} onClose={() => setExplain(null)} ruleSet={d.ruleSet} official weekText={`${weekLabel(d.week)} · bản ${s.versionNo}`} />
              {adj && <AdjustmentDialog open onOpenChange={setAdj} snapshotId={s.id} />}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

function PrintTable({ rows }: { rows: SnapshotRow[] }) {
  const sorted = useMemo(() => rows, [rows]);
  return (
    <table className="table">
      <thead><tr><th>#</th><th>Họ và tên</th><th>Mã HS</th><th className="num">Gốc</th><th className="num">Cộng</th><th className="num">Trừ</th><th className="num">Điểm</th><th>Xếp loại</th></tr></thead>
      <tbody>{sorted.map((r, i) => <tr key={r.studentId}><td>{i + 1}</td><td>{r.studentName}</td><td>{r.studentCode}</td><td className="num">{r.base}</td><td className="num">{fmtPoints(r.plus)}</td><td className="num">{fmtPoints(r.minus)}</td><td className="num">{r.total}</td><td>{r.grade}</td></tr>)}</tbody>
    </table>
  );
}
