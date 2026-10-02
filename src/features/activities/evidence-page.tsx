"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, FileImage, Info, LayoutGrid, List, RotateCcw, Upload, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { activitiesRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineSelect } from "@/components/ui/form";
import { FileThumb } from "@/components/ui/file";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { BulkSelectionBar, DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";
import { ActivitySectionTabs } from "./shared";
import { EvidenceStatusBadge, FileViewerDialog, RecordEvidenceDialog, ReviewEvidenceDialog, type ReviewDecision } from "./evidence-dialogs";

type Data = Awaited<ReturnType<typeof activitiesRepo.evidence>>;
type Item = Data["items"][number];

const STATUS = [{ value: "pending", label: "Chờ duyệt" }, { value: "approved", label: "Đã duyệt" }, { value: "supplement", label: "Cần bổ sung" }, { value: "rejected", label: "Từ chối" }];

/** CL20 — class evidence: gallery / table, filters, bulk approve, review dialogs. Teachers record evidence; parents never upload. */
export function EvidencePage() {
  const { schoolId, yearId, classId, header } = useClassroom();
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [activityId, setActivityId] = useState(sp.get("activity") ?? "");
  const [q, setQ] = useState("");
  const query = useRepo(["evidence", classId, status, activityId, q], (ctx) => activitiesRepo.evidence(ctx, schoolId, yearId, classId, { status: status || undefined, activityId: activityId || undefined, q }));
  return (
    <div className="page">
      <ClassHeader variant="compact" title="Minh chứng của lớp" subtitle={<>Minh chứng hoạt động lớp {header.class.name} do giáo viên ghi nhận và duyệt</>} />
      <ActivitySectionTabs />
      <QueryState query={query} skeleton="cards">
        {(d) => <Body d={d} status={status} setStatus={setStatus} activityId={activityId} setActivityId={setActivityId} q={q} setQ={setQ} />}
      </QueryState>
    </div>
  );
}

function Body({ d, status, setStatus, activityId, setActivityId, q, setQ }: { d: Data; status: string; setStatus: (v: string) => void; activityId: string; setActivityId: (v: string) => void; q: string; setQ: (v: string) => void }) {
  const { base, readOnly } = useClassroom();
  const [mode, setMode] = useState<"gallery" | "table">("gallery");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<Item | null>(null);
  const [review, setReview] = useState<{ ids: string[]; decision: ReviewDecision; subject: string } | null>(null);
  const [record, setRecord] = useState(false);
  const canManage = d.canManage && !readOnly;
  const pageSize = mode === "gallery" ? 12 : 10;
  const pageCount = Math.max(1, Math.ceil(d.items.length / pageSize));
  const cur = Math.min(page, pageCount);
  const rows = d.items.slice((cur - 1) * pageSize, cur * pageSize);
  const active = !!(status || activityId || q);
  const reset = () => { setStatus(""); setActivityId(""); setQ(""); setPage(1); };
  const pendingSelected = useMemo(() => d.items.filter((e) => selected.has(e.id) && e.status === "pending").map((e) => e.id), [d.items, selected]);
  const actions = (e: Item, compact?: boolean) => canManage && e.status === "pending" ? (
    <div className={clsx("flex flex-wrap gap-1.5", compact && "justify-end")}>
      <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "approved", subject: `${e.studentName} — ${e.activityTitle}` })}>Duyệt</Button>
      <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "supplement", subject: `${e.studentName} — ${e.activityTitle}` })}>Yêu cầu bổ sung</Button>
      <Button size="sm" variant="danger-soft" icon={<XCircle className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "rejected", subject: `${e.studentName} — ${e.activityTitle}` })}>Từ chối</Button>
    </div>
  ) : null;
  const cols: Column<Item>[] = [
    { key: "thumb", header: "Tệp", cell: (e) => <button type="button" className="block w-16" onClick={() => setView(e)} aria-label={`Xem minh chứng của ${e.studentName}`}><FileThumb file={e.file} /></button> },
    { key: "student", header: "Học sinh", cell: (e) => <span className="font-semibold text-ink">{e.studentName}</span> },
    { key: "activity", header: "Hoạt động", cell: (e) => <Link href={`${base}/activities/${e.activityId}`} className="hover:underline">{e.activityTitle}</Link> },
    { key: "by", header: "Giáo viên ghi nhận", cell: (e) => <span className="text-[13px]">{e.uploadedByName}<br /><span className="text-muted tabular-nums">{fmtDateTime(e.uploadedAt)}</span></span>, hideBelow: "md" },
    { key: "status", header: "Trạng thái", cell: (e) => <div className="flex flex-col items-start gap-1"><EvidenceStatusBadge status={e.status} />{e.sharedWithParent && <Badge tone="info" dot={false}>Đã chia sẻ phụ huynh</Badge>}</div> },
    { key: "act", header: "Thao tác", align: "right", cell: (e) => actions(e, true) ?? <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setView(e)}>Xem</Button> },
  ];
  return (
    <>
      <Callout tone="info" icon={<Info />} title="Minh chứng do giáo viên ghi nhận">Phụ huynh và học sinh không tải tệp lên hệ thống. Tệp chỉ được chia sẻ với phụ huynh của đúng em khi giáo viên duyệt và bật chia sẻ; lớp không có thư viện ảnh công khai.</Callout>
      <Card>
        <CardHeader title="Danh sách minh chứng" icon={<FileImage className="size-5 text-primary" />} subtitle={`${d.items.length} minh chứng${active ? " khớp bộ lọc" : ""}`}
          action={<>
            <div className="flex rounded-xl border border-line p-0.5" role="group" aria-label="Kiểu hiển thị">
              <button type="button" className={clsx("btn btn-sm !border-0", mode === "gallery" ? "btn-primary" : "btn-ghost")} aria-pressed={mode === "gallery"} onClick={() => { setMode("gallery"); setPage(1); }}><LayoutGrid className="size-4" aria-hidden />Thư viện</button>
              <button type="button" className={clsx("btn btn-sm !border-0", mode === "table" ? "btn-primary" : "btn-ghost")} aria-pressed={mode === "table"} onClick={() => { setMode("table"); setPage(1); }}><List className="size-4" aria-hidden />Bảng</button>
            </div>
            {canManage && <Button size="sm" variant="primary" icon={<Upload className="size-4" />} onClick={() => setRecord(true)}>Ghi nhận minh chứng</Button>}
          </>} />
        <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder="Tìm theo học sinh hoặc hoạt động" active={active} onReset={reset}>
          <InlineSelect label="Lọc trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS} allLabel="Tất cả trạng thái" />
          <InlineSelect label="Lọc hoạt động" value={activityId} onChange={(v) => { setActivityId(v); setPage(1); }} options={d.activities.map((a) => ({ value: a.id, label: a.title }))} allLabel="Tất cả hoạt động" />
        </FilterBar>
        {canManage && (
          <BulkSelectionBar selected={selected} pageIds={rows.map((r) => r.id)} allIds={d.items.map((r) => r.id)} onChange={setSelected} what="minh chứng">
            <Button size="sm" variant="primary" disabled={!pendingSelected.length} onClick={() => setReview({ ids: pendingSelected, decision: "approved", subject: `${pendingSelected.length} minh chứng chờ duyệt đã chọn` })}>Duyệt {pendingSelected.length} minh chứng chờ duyệt</Button>
          </BulkSelectionBar>
        )}
        {!d.items.length ? (
          active ? <EmptyFiltered what="minh chứng" onReset={reset} /> : <EmptyState compact icon={<FileImage className="size-6" />} title="Chưa có minh chứng" description="Minh chứng giáo viên ghi nhận cho các hoạt động của lớp sẽ hiện ở đây." action={canManage ? <Button size="sm" variant="primary" icon={<Upload className="size-4" />} onClick={() => setRecord(true)}>Ghi nhận minh chứng</Button> : undefined} />
        ) : mode === "table" ? (
          <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} selectable={canManage} selected={selected} onSelectedChange={setSelected} caption="Minh chứng của lớp" minWidth={760} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((e) => (
              <li key={e.id} className={clsx("flex flex-col rounded-2xl border bg-white p-2.5", selected.has(e.id) ? "border-primary ring-2 ring-primary/20" : "border-line")}>
                <div className="relative">
                  <button type="button" onClick={() => setView(e)} className="block w-full rounded-lg" aria-label={`Xem minh chứng của ${e.studentName}`}><FileThumb file={e.file} /></button>
                  {canManage && (
                    <label className="absolute left-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-lg bg-white/90 shadow">
                      <input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label={`Chọn minh chứng của ${e.studentName}`} checked={selected.has(e.id)} onChange={() => { const n = new Set(selected); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); setSelected(n); }} />
                    </label>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-ink">{e.studentName}</p>
                <Link href={`${base}/activities/${e.activityId}`} className="truncate text-[13px] text-primary-strong hover:underline">{e.activityTitle}</Link>
                <p className="text-[12px] text-muted">Giáo viên ghi nhận: {e.uploadedByName} · {fmtDate(e.uploadedAt)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5"><EvidenceStatusBadge status={e.status} />{e.sharedWithParent && <Badge tone="info" dot={false}>Đã chia sẻ phụ huynh</Badge>}</div>
                {e.reviewNote && <p className="mt-1 line-clamp-2 text-[12px] text-body">Ghi chú: {e.reviewNote}</p>}
                <div className="mt-auto pt-2">{actions(e) ?? <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setView(e)}>Xem</Button>}</div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={cur} pageCount={pageCount} total={d.items.length} pageSize={pageSize} onPage={setPage} what="minh chứng" />
      </Card>
      <FileViewerDialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }} file={view?.file}
        meta={view ? [{ label: "Học sinh", value: view.studentName }, { label: "Hoạt động", value: view.activityTitle }, { label: "Giáo viên ghi nhận", value: view.uploadedByName }, { label: "Trạng thái", value: <EvidenceStatusBadge status={view.status} /> }] : undefined}
        actions={view && canManage && view.status === "pending" ? <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => { setReview({ ids: [view.id], decision: "approved", subject: `${view.studentName} — ${view.activityTitle}` }); setView(null); }}>Duyệt</Button> : undefined} />
      <ReviewEvidenceDialog open={!!review} onOpenChange={(o) => { if (!o) setReview(null); }} evidenceIds={review?.ids ?? []} evidenceVersions={Object.fromEntries(d.items.map(e=>[e.id,e.version]))} decision={review?.decision ?? "approved"} subject={review?.subject ?? ""} onDone={() => setSelected(new Set())} />
      <RecordEvidenceDialog open={record} onOpenChange={setRecord} activities={d.activities.filter((a) => a.assigned.length)} students={d.students} activityId={activityId || undefined} />
    </>
  );
}
