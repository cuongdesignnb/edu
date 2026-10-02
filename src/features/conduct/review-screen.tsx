"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, Search, ShieldCheck, Trophy, XCircle, Link2 } from "lucide-react";
import type { SnapshotRow } from "@/lib/model/types";
import { conductRepo, RepoError, type Ctx } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, matches } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DataTable, BulkSelectionBar, Pagination, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { ConductNav, PeriodBadge, PeriodStateBanner, Points, RECORD_STATUS, WeekSelect, dm, useWeeks, weekLabel } from "./shared";
import { ExplainDrawer, WeeklyConductTable } from "./week-table";
import { LockPublishButtons, PublishDialog, ReopenButton, type PublishMode, type WeekSummary } from "./publish";
import type { RecordView } from "./record-form";

/** CL08 — review & lock: checks, pending records (bulk), duplicate pairs, preview of the table that would be published. */
export function ReviewScreen() {
  const { schoolId, yearId, classId, can } = useClassroom();
  const { query, weeks, week, setWeek } = useWeeks();
  const wid = week?.id;
  const sum = useRepo(["conduct-summary", classId, wid], (ctx) => conductRepo.weekSummary(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid });
  const rec = useRepo(["conduct-records", classId, wid], (ctx) => conductRepo.records(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid && (can("conduct.review") || can("conduct.record")) });
  return (
    <div className="page">
      <ClassHeader title="Rà soát và chốt tuần" subtitle="Xử lý ghi nhận chờ rà soát và bản trùng, xem trước bảng sẽ công bố rồi chốt / công bố theo quyền" crumbs={[{ label: "Thi đua", href: `/classroom/${schoolId}/${yearId}/${classId}/conduct` }, { label: "Rà soát và chốt" }]} />
      <ConductNav weekId={wid} />
      {query.error ? <Card><ErrorState error={query.error} onRetry={() => query.refetch()} /></Card> : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3.5">
            {week ? <WeekSelect weeks={weeks} week={week} onChange={setWeek} className="flex-[1_1_320px]" /> : <Skeleton className="h-10 w-80" />}
            {week && <PeriodBadge status={week.status} />}
          </Card>
          <QueryState query={sum} skeleton="detail">
            {(s) => !s.summaryAvailable?<Card className="p-5"><Callout tone="neutral">Bạn không có quyền rà soát bảng điểm cả lớp.</Callout></Card>:rec.error?<Card><ErrorState error={rec.error} onRetry={()=>rec.refetch()} /></Card>:<ReviewBody s={s} records={rec.data?.records ?? []} loadingRecords={rec.isLoading} />}
          </QueryState>
        </>
      )}
    </div>
  );
}

function ReviewBody({ s, records, loadingRecords }: { s: WeekSummary; records: RecordView[]; loadingRecords: boolean }) {
  const { header } = useClassroom();
  const [mode, setMode] = useState<PublishMode | null>(null);
  const [explain, setExplain] = useState<SnapshotRow | null>(null);
  const open = s.period.status === "open";
  const official = !!s.snapshot;
  const rows = s.rows; // approved-only rows = what would be locked
  const statusById = new Map(records.map((r) => [r.id, r.status]));
  return (
    <>
      <PeriodStateBanner status={s.period.status} snapshot={s.snapshot} lockedAt={s.period.lockedAt} lockedByName={s.period.lockedByName} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Kiểm tra trước khi chốt" icon={<ClipboardCheck className="size-5 text-primary" />} subtitle={`Lớp ${header.class.name} — ${weekLabel(s.week)}`} />
          <ul className="space-y-2 px-5 pb-5 text-[13.5px]" data-testid="checks">
            {s.checks.blocking.map((b) => <li key={b} className="flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-danger-text"><XCircle className="mt-0.5 size-4 flex-none" aria-hidden /><span><b>Chặn chốt:</b> {b}</span></li>)}
            {s.checks.warnings.map((w) => <li key={w} className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-warning-text"><AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden /><span><b>Cảnh báo:</b> {w}</span></li>)}
            {s.checks.pending === 0 && <li className="flex items-start gap-2 rounded-lg bg-success-bg px-3 py-2 text-success-text"><CheckCircle2 className="mt-0.5 size-4 flex-none" aria-hidden />Không còn ghi nhận chờ rà soát</li>}
            {s.checks.duplicates === 0 && <li className="flex items-start gap-2 rounded-lg bg-success-bg px-3 py-2 text-success-text"><CheckCircle2 className="mt-0.5 size-4 flex-none" aria-hidden />Không còn cặp ghi nhận có thể trùng</li>}
            {s.checks.warnings.length === 0 && <li className="flex items-start gap-2 rounded-lg bg-success-bg px-3 py-2 text-success-text"><CheckCircle2 className="mt-0.5 size-4 flex-none" aria-hidden />Điểm danh các ngày đã qua trong tuần đầy đủ</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Chốt và công bố" icon={<ShieldCheck className="size-5 text-primary" />} />
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            <LockPublishButtons s={s} onMode={setMode} vertical />
            <ReopenButton s={s} />
            {!s.perms.lock && !s.perms.publish && <p className="text-[13px] text-muted">Bạn không có quyền chốt hoặc công bố lớp này.</p>}
            {s.perms.lock && !s.perms.publish && s.period.status !== "published" && (
              <Callout tone="neutral">Bạn được chốt nhưng không được công bố. Theo quy trình của trường ({s.policy?.publishBy === "school_leader" ? "Ban giám hiệu công bố" : "người được giao quyền công bố"}), bản chốt chờ người đủ quyền công bố.</Callout>
            )}
            {s.policy?.publishBy === "school_leader" && s.perms.publish && s.period.status !== "published" && (
              <Callout tone="warning">Quy trình của trường: Ban giám hiệu công bố kết quả thi đua. Nút công bố hiển thị theo quyền hệ thống đang cấp cho bạn — hãy làm theo quy trình của trường.</Callout>
            )}
            {s.period.status === "published" && <p className="flex items-center gap-2 text-[13px] font-semibold text-success-text"><CheckCircle2 className="size-4" aria-hidden />Đã công bố. Thay đổi đi qua điều chỉnh sau chốt.</p>}
            <p className="text-[12.5px] text-muted">“Chốt” khóa sửa trực tiếp và tạo bản chính thức; “Công bố” mới cho phụ huynh xem qua đường dẫn riêng. Hai thao tác khác nhau.</p>
          </div>
        </Card>
      </div>
      {open && (loadingRecords ? <Card className="p-5"><Skeleton className="h-40" /></Card> : <>
        <DuplicatePairs records={records} canReview={s.perms.review} source={s.source} />
        <PendingTable records={records} canReview={s.perms.review} source={s.source} />
      </>)}
      <Card>
        <CardHeader title={official ? `Bảng đã chốt — phiên bản ${s.snapshot!.versionNo}` : "Xem trước bảng sẽ chốt / công bố"} icon={<Trophy className="size-5 text-primary" />}
          subtitle={official ? "Bản chính thức, không đổi." : "Chỉ tính ghi nhận đã duyệt. Ghi nhận còn chờ rà soát chưa được tính — xử lý hết trước khi chốt."} />
        <WeeklyConductTable rows={rows} bands={s.ruleSet.bands} caption="Bảng sẽ công bố" detailsAvailable={s.snapshot?.detailsAvailable ?? true} onExplain={setExplain} />
      </Card>
      <ExplainDrawer row={explain} onClose={() => setExplain(null)} ruleSet={s.ruleSet} official weekText={weekLabel(s.week)} statusOf={(id) => statusById.get(id) ?? "approved"} />
      <PublishDialog mode={mode} onClose={() => setMode(null)} s={s} />
    </>
  );
}

function useReview(source:WeekSummary['source'],records:RecordView[],onDone?: () => void) {
  const { schoolId, yearId, classId } = useClassroom();
  return useCommand((ctx: Ctx, input: { recordIds: string[]; decision: "approve" | "reject" | "void"; note?: string }) => {const selected=input.recordIds.map(id=>records.find(r=>r.id===id));if(selected.some(r=>!r))throw new RepoError('CONFLICT','Hãy tải lại các ghi nhận trước khi rà soát.');return conductRepo.review(ctx, schoolId, yearId, classId,{source,records:selected.map(r=>({id:r!.id,version:r!.version})),decision:input.decision,note:input.note});}, {
    success: (n) => `Đã xử lý ${n} ghi nhận`, onSuccess: onDone,
  });
}

/* ------------------------------ duplicates side by side ------------------------------ */
function DuplicatePairs({ records, canReview,source }: { records: RecordView[]; canReview: boolean;source:WeekSummary['source'] }) {
  const pairs = useMemo(() => {
    const byId = new Map(records.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const out: [RecordView, RecordView][] = [];
    for (const r of records) for (const o of r.duplicateOf) {
      const k = [r.id, o].sort().join("|");
      const other = byId.get(o);
      if (seen.has(k) || !other) continue;
      seen.add(k);
      out.push(r.createdAt <= other.createdAt ? [r, other] : [other, r]);
    }
    return out;
  }, [records]);
  const [target, setTarget] = useState<RecordView | null>(null);
  const cmd = useReview(source,records,() => setTarget(null));
  if (!pairs.length) return null;
  return (
    <Card>
      <CardHeader title="Cặp ghi nhận có thể trùng" icon={<Copy className="size-5 text-danger" />} subtitle="Cùng học sinh, cùng quy định, cùng ngày hoặc cùng sự kiện nguồn. Giữ một bản, loại bản kia (kèm lý do)." />
      <div className="space-y-4 px-5 pb-5">
        {pairs.map(([a, b]) => (
          <div key={a.id + b.id} className="grid gap-3 md:grid-cols-2" data-testid="dup-pair">
            {[a, b].map((r, i) => (
              <div key={r.id} className="rounded-xl border border-line bg-[#f7fbff] p-3.5 text-[13.5px]">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{i === 0 ? "Ghi nhận trước" : "Ghi nhận sau"}</p>
                <p className="mt-1 font-semibold text-ink">{r.studentName} · {r.studentCode}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5">{r.ruleLabel}<Points value={r.points} /><Badge tone={RECORD_STATUS[r.status]?.tone}>{RECORD_STATUS[r.status]?.label}</Badge></p>
                <p className="mt-0.5 text-muted">Ngày {fmtDate(r.date)} · {r.createdByName} lúc {fmtDateTime(r.createdAt)}</p>
                <p className="mt-0.5 text-body">“{r.reason}”</p>
                <p className="mt-0.5 text-[12px] text-muted">Nguồn: {r.fromAttendance ? "điểm danh" : "ghi trực tiếp"}</p>
                {canReview && <Button className="mt-2" size="sm" variant="danger-soft" onClick={() => setTarget(r)} data-testid="void-btn">Loại bản trùng này</Button>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }} title="Loại bản trùng" variant="danger" confirmLabel="Loại bản này"
        object={target ? `${target.studentName} — ${target.ruleLabel} (${target.points}) · ${target.createdByName}` : undefined}
        consequence="Bản này chuyển sang “Đã loại”, không tính điểm, vẫn lưu trong lịch sử. Bản còn lại vẫn chờ rà soát."
        reasonLabel="Lý do loại" reasonRequired busy={cmd.pending} error={cmd.error?.fieldErrors?.note ?? cmd.error?.message}
        onConfirm={(note) => target ? cmd.run({ recordIds: [target.id], decision: "void", note }) : undefined} />
    </Card>
  );
}

/* ------------------------------ pending records ------------------------------ */
function PendingTable({ records, canReview,source }: { records: RecordView[]; canReview: boolean;source:WeekSummary['source'] }) {
  const pending = records.filter((r) => r.status === "pending_review");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reject, setReject] = useState<string[] | null>(null);
  const cmd = useReview(source,records,() => { setSel(new Set()); setReject(null); });
  const filtered = pending.filter((r) => matches(q, r.studentName, r.studentCode, r.ruleLabel, r.reason, r.createdByName));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const items = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const cols: Column<RecordView>[] = [
    { key: "d", header: "Ngày", cell: (r) => <span className="whitespace-nowrap tabular-nums">{dm(r.date)}</span> },
    { key: "s", header: "Học sinh", cell: (r) => <span><span className="block whitespace-nowrap font-semibold text-ink">{r.studentName}</span><span className="text-[12px] text-muted">{r.studentCode}</span></span> },
    { key: "r", header: "Quy định / nội dung", cell: (r) => <span><span className="text-ink">{r.ruleLabel}</span>{r.fromAttendance && <Badge tone="info" dot={false} icon={<Link2 className="size-3" />} className="ml-1.5">Ghi từ điểm danh</Badge>}{r.duplicateOf.length > 0 && <Badge tone="danger" dot={false} className="ml-1.5">Có thể trùng</Badge>}<span className="block text-[12px] text-muted">“{r.reason}”</span></span> },
    { key: "p", header: "Điểm", align: "right", cell: (r) => <Points value={r.points} /> },
    { key: "b", header: "Người ghi", cell: (r) => <span className="whitespace-nowrap">{r.createdByName}<span className="block text-[12px] text-muted">{fmtDateTime(r.createdAt)}</span></span>, hideBelow: "md" },
    ...(canReview ? [{ key: "a", header: <span className="sr-only">Thao tác</span>, align: "right" as const, cell: (r: RecordView) => (
      <span className="flex justify-end gap-1.5">
        <Button size="sm" variant="secondary" disabled={r.duplicateOf.length > 0 || cmd.pending} title={r.duplicateOf.length ? "Xử lý bản trùng trước" : undefined} onClick={() => cmd.run({ recordIds: [r.id], decision: "approve" })}>Duyệt</Button>
        <Button size="sm" variant="ghost" onClick={() => setReject([r.id])}>Từ chối</Button>
      </span>
    ) }] : []),
  ];
  const approvable = [...sel].filter((id) => !pending.find((r) => r.id === id)?.duplicateOf.length);
  return (
    <Card>
      <CardHeader title={`Ghi nhận chờ rà soát (${pending.length})`} icon={<ClipboardCheck className="size-5 text-warning" />} subtitle="Duyệt để tính vào bảng; từ chối cần lý do. Bản có thể trùng phải xử lý ở mục trên trước khi duyệt." />
      {pending.length > 0 && (
        <div className="px-4 pb-3">
          <div className="input-icon max-w-md">
            <Search className="size-4" aria-hidden />
            <input className="input" type="search" placeholder="Tìm học sinh, quy định, người ghi…" aria-label="Tìm ghi nhận chờ rà soát" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
      )}
      {canReview && (
        <BulkSelectionBar selected={sel} pageIds={items.map((r) => r.id)} allIds={filtered.map((r) => r.id)} onChange={setSel} what="ghi nhận">
          <Button size="sm" variant="primary" disabled={!approvable.length} loading={cmd.pending} onClick={() => cmd.run({ recordIds: approvable, decision: "approve" })} data-testid="bulk-approve">
            Duyệt {approvable.length}{approvable.length < sel.size ? ` (bỏ qua ${sel.size - approvable.length} bản trùng)` : ""}
          </Button>
          <Button size="sm" variant="danger-soft" onClick={() => setReject([...sel])}>Từ chối {sel.size}</Button>
        </BulkSelectionBar>
      )}
      <DataTable rows={items} columns={cols} rowKey={(r) => r.id} caption="Ghi nhận chờ rà soát" selectable={canReview} selected={sel} onSelectedChange={setSel} minWidth={760}
        empty={pending.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không còn ghi nhận chờ rà soát" /> : <EmptyFiltered onReset={() => setQ("")} what="ghi nhận" />} />
      {pending.length > 0 && <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="ghi nhận" />}
      <ConfirmDialog open={!!reject} onOpenChange={(o) => { if (!o) setReject(null); }} title="Từ chối ghi nhận" variant="danger" confirmLabel={`Từ chối ${reject?.length ?? 0} ghi nhận`}
        object={reject ? `${reject.length} ghi nhận: ${reject.map((id) => pending.find((r) => r.id === id)?.studentName).filter(Boolean).slice(0, 3).join(", ")}${reject.length > 3 ? "…" : ""}` : undefined}
        consequence="Ghi nhận bị từ chối không tính điểm; người ghi thấy lý do trong lịch sử ghi nhận." reasonLabel="Lý do từ chối" reasonRequired busy={cmd.pending}
        error={cmd.error?.fieldErrors?.note ?? cmd.error?.message} onConfirm={(note) => reject ? cmd.run({ recordIds: reject, decision: "reject", note }) : undefined} />
    </Card>
  );
}
