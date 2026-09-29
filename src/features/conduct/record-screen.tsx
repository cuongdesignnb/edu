"use client";
import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, ClipboardList, Lock, Pencil, Search, Trophy, Link2, Copy } from "lucide-react";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtTime, matches, nameCompare } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, CardLink, Callout } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { InlineSelect } from "@/components/ui/form";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { DataTable, Pagination, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { ConductNav, GradeBadge, ModeToggle, PeriodBadge, Points, RECORD_STATUS, RuleIcon, WeekSelect, dm, useWeeks, weekLabel } from "./shared";
import { RecordDialog, type RecordView } from "./record-form";
import { ExplainDrawer, WeeklyConductTable } from "./week-table";
import { ActionsPanel, type WeekSummary } from "./publish";
import type { GradeBand, SnapshotRow } from "@/lib/model/types";

type RecordsData = Awaited<ReturnType<typeof conductRepo.records>>;

/** CL06 — record conduct (R08 right panel + bottom weekly table + “Thao tác”). */
export function ConductRecordScreen() {
  const { schoolId, yearId, classId } = useClassroom();
  const { query, weeks, week, setWeek } = useWeeks();
  const wid = week?.id;
  const rec = useRepo(["conduct-records", classId, wid], (ctx) => conductRepo.records(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid });
  const sum = useRepo(["conduct-summary", classId, wid], (ctx) => conductRepo.weekSummary(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid });
  return (
    <div className="page">
      <ClassHeader title="Thi đua theo tuần" subtitle="Ghi nhận vi phạm / khen thưởng theo nội quy, rà soát rồi chốt và công bố" actions={<ModeToggle />} crumbs={[{ label: "Ghi nhận thi đua" }]} />
      <ConductNav weekId={wid} />
      {query.error ? <Card><ErrorState error={query.error} onRetry={() => query.refetch()} /></Card> : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3.5">
            {week ? <WeekSelect weeks={weeks} week={week} onChange={setWeek} className="flex-[1_1_320px]" /> : <Skeleton className="h-10 w-80" />}
            {week && <PeriodBadge status={week.status} />}
            {rec.data?.ruleSet && <span className="text-[13px] text-muted">Nội quy: <b className="text-ink">{rec.data.ruleSet.name}</b> (bản {rec.data.ruleSet.versionNo})</span>}
          </Card>
          <QueryState query={rec} skeleton="detail">
            {(d) => <Body d={d} sum={sum} />}
          </QueryState>
        </>
      )}
    </div>
  );
}

function Body({ d, sum }: { d: RecordsData; sum: ReturnType<typeof useRepo<WeekSummary>> }) {
  const { base } = useClassroom();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const roster = useMemo(() => d.roster.slice().sort((a, b) => nameCompare(a.fullName, b.fullName)), [d.roster]);
  const sid = sp.get("hs") && roster.some((s) => s.id === sp.get("hs")) ? sp.get("hs")! : roster[0]?.id;
  const tab = sp.get("tab") ?? "rules";
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); n.set(k, v); router.replace(`${pathname}?${n.toString()}`, { scroll: false }); };
  const [form, setForm] = useState<{ ruleId?: string; editing?: RecordView; key: number } | null>(null);
  const [explain, setExplain] = useState<SnapshotRow | null>(null);
  const open = d.period.status === "open";
  const s = sum.data;
  const official = !!s?.snapshot;
  const rows = s ? (official ? s.rows : s.preview) : [];
  const statusById = useMemo(() => new Map(d.records.map((r) => [r.id, r.status])), [d.records]);
  const versionById = useMemo(() => new Map(d.records.map((r) => [r.id, r.ruleSetVersion])), [d.records]);
  if (!d.ruleSet) return <Card><EmptyState title="Chưa có nội quy ban hành cho tuần này" description="Nhà trường cần ban hành bộ nội quy thi đua trước khi ghi nhận." /></Card>;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)]">
        <WeekRecords d={d} onPick={(id) => setParam("hs", id)} />
        <StudentPanel d={d} roster={roster} sid={sid} tab={tab} setParam={setParam} open={open} row={rows.find((r) => r.studentId === sid)} official={official} bands={d.ruleSet.bands}
          onRecord={(ruleId) => setForm({ ruleId, key: Date.now() })} onEdit={(r) => setForm({ editing: r, key: Date.now() })} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title={`Tổng kết thi đua ${weekLabel(d.week)}`} icon={<Trophy className="size-5 text-primary" />}
            subtitle={official ? <Badge tone="success">Bản chính thức — phiên bản {s!.snapshot!.versionNo}</Badge> : <Badge tone="warning" className="!whitespace-normal">Bản xem trước (gồm ghi nhận chờ rà soát) — chưa chính thức</Badge>}
            action={<CardLink href={`${base}/conduct/weekly?week=${d.week.id}`}>Xem chi tiết</CardLink>} />
          {sum.isLoading ? <div className="p-5"><Skeleton className="h-40" /></div> : sum.error ? <ErrorState compact error={sum.error} onRetry={() => sum.refetch()} /> : s && (
            <WeeklyConductTable rows={rows} bands={s.ruleSet.bands} compact pageSize={5} caption="Tổng kết thi đua tuần" onExplain={setExplain} onSelect={(r) => setParam("hs", r.studentId)} selectedId={sid} />
          )}
        </Card>
        {s ? <ActionsPanel s={s} /> : <Card className="p-5"><Skeleton className="h-48" /></Card>}
      </div>
      {s && <ExplainDrawer row={explain} onClose={() => setExplain(null)} ruleSet={s.ruleSet} official={official} weekText={weekLabel(d.week)}
        statusOf={(id) => statusById.get(id) ?? (official ? "approved" : "pending_review")} versionOf={(id) => versionById.get(id) ?? undefined} />}
      {form && <RecordDialog key={form.key} open onOpenChange={(o) => { if (!o) setForm(null); }} ruleSet={d.ruleSet} roster={roster} week={d.week} studentId={sid} ruleId={form.ruleId} editing={form.editing}
        onSaved={(id) => setParam("hs", id)}
        onShowExisting={(r) => { const n = new URLSearchParams(sp.toString()); n.set("hs", r.studentId); n.set("tab", "history"); router.replace(`${pathname}?${n.toString()}`, { scroll: false }); }} />}
    </>
  );
}

/* ------------------------------ left: records of the week ------------------------------ */
function WeekRecords({ d, onPick }: { d: RecordsData; onPick: (studentId: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const counts = { pending: 0, approved: 0, closed: 0, dup: 0 };
  d.records.forEach((r) => {
    if (r.status === "pending_review") counts.pending++;
    else if (r.status === "approved") counts.approved++;
    else counts.closed++;
    if (r.duplicateOf.length) counts.dup++;
  });
  const filtered = d.records.filter((r) => (!status || (status === "dup" ? r.duplicateOf.length > 0 : status === "closed" ? r.status === "rejected" || r.status === "void" : r.status === status)) && matches(q, r.studentName, r.studentCode, r.ruleLabel, r.reason, r.createdByName));
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const items = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const chips = [
    { k: "pending_review", n: counts.pending, label: "Chờ rà soát", cls: "bg-warning-bg text-warning-text" },
    { k: "approved", n: counts.approved, label: "Đã duyệt", cls: "bg-success-bg text-success-text" },
    { k: "closed", n: counts.closed, label: "Từ chối / đã loại", cls: "bg-neutral-bg text-neutral-text" },
    { k: "dup", n: counts.dup, label: "Có thể trùng", cls: "bg-danger-bg text-danger-text" },
  ];
  const cols: Column<RecordView>[] = [
    { key: "date", header: "Ngày", cell: (r) => <span className="whitespace-nowrap tabular-nums">{dm(r.date)}<span className="block text-[11.5px] text-muted">{fmtTime(r.createdAt)}</span></span> },
    { key: "student", header: "Học sinh", cell: (r) => <button type="button" className="text-left" onClick={() => onPick(r.studentId)}><span className="block whitespace-nowrap font-semibold text-ink hover:text-primary-strong hover:underline">{r.studentName}</span><span className="text-[12px] text-muted">{r.studentCode}</span></button> },
    { key: "rule", header: "Quy định", cell: (r) => <span><span className="block text-ink">{r.ruleLabel}</span><span className="text-[11.5px] text-muted">{r.createdByName ?? "—"}</span>{r.fromAttendance && <Badge tone="info" dot={false} icon={<Link2 className="size-3" />} className="ml-1.5">Ghi từ điểm danh</Badge>}</span> },
    { key: "pts", header: "Điểm", align: "right", cell: (r) => <Points value={r.points} /> },
    { key: "st", header: "Trạng thái", cell: (r) => <span className="flex flex-col items-start gap-1"><Badge tone={RECORD_STATUS[r.status]?.tone}>{RECORD_STATUS[r.status]?.label}</Badge>{r.duplicateOf.length > 0 && <Badge tone="danger" dot={false} icon={<Copy className="size-3" />}>Có thể trùng</Badge>}</span> },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader title={`Ghi nhận trong ${weekLabel(d.week)}`} icon={<ClipboardList className="size-5 text-primary" />}
        subtitle={d.isReviewer ? "Tất cả ghi nhận của lớp trong tuần" : "Ghi nhận của bạn và các ghi nhận đã duyệt"} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <div className="input-icon min-w-[200px] flex-[2_1_220px]">
          <Search className="size-4" aria-hidden />
          <input className="input" type="search" placeholder="Tìm theo tên, mã học sinh, nội dung…" aria-label="Tìm ghi nhận" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => { setStatus(status === c.k ? "" : c.k); setPage(1); }} aria-pressed={status === c.k}
              className={clsx("flex min-h-10 items-center gap-2 rounded-xl px-3 text-left text-[12px] font-medium ring-offset-1", c.cls, status === c.k && "ring-2 ring-primary")}>
              <span className="text-lg font-extrabold tabular-nums">{c.n}</span><span className="leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <DataTable rows={items} columns={cols} rowKey={(r) => r.id} caption="Ghi nhận trong tuần" minWidth={620} dense
        empty={d.records.length === 0 ? <EmptyState compact title="Chưa có ghi nhận trong tuần" description={d.canRecord ? "Chọn học sinh ở bảng bên phải rồi bấm “Ghi nhận” theo quy định." : "Ghi nhận đã duyệt của tuần sẽ hiện ở đây."} /> : <EmptyFiltered onReset={() => { setQ(""); setStatus(""); }} what="ghi nhận" />} />
      <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="ghi nhận" />
    </Card>
  );
}

/* ------------------------------ right: student card + rules / history ------------------------------ */
function StudentPanel({ d, roster, sid, tab, setParam, open, row, official, bands, onRecord, onEdit }: {
  d: RecordsData; roster: RecordsData["roster"]; sid?: string; tab: string; setParam: (k: string, v: string) => void; open: boolean; row?: SnapshotRow; official: boolean;
  bands: GradeBand[]; onRecord: (ruleId: string) => void; onEdit: (r: RecordView) => void;
}) {
  const { base } = useClassroom();
  const idx = roster.findIndex((s) => s.id === sid);
  const st = roster[idx];
  const prev = roster[idx - 1];
  const next = roster[idx + 1];
  const rs = d.ruleSet!;
  const mine = d.records.filter((r) => r.studentId === sid);
  const cats = [...new Set(rs.rules.map((r) => r.category))];
  if (!st) return <Card><EmptyState title="Lớp chưa có học sinh trong tuần" /></Card>;
  return (
    <Card className="min-w-0">
      <CardHeader title="Ghi nhận thi đua" icon={<Trophy className="size-5 text-primary" />} action={<CardLink href={`${base}/rules`}>Xem nội quy</CardLink>} />
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-[#f7fbff] p-3">
          <button type="button" className="btn btn-secondary btn-icon flex-none" disabled={!prev} onClick={() => prev && setParam("hs", prev.id)} aria-label="Học sinh trước"><ChevronLeft className="size-4" /></button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={st.fullName} tone={st.avatarTone} size={60} />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold text-ink" data-testid="student-name">{st.fullName}</p>
              <p className="text-[13px] text-muted">{st.code} · {idx + 1}/{roster.length}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-body">
                {official ? "Điểm tuần (chính thức):" : "Điểm tuần (tạm tính):"} <b className="text-lg text-ink tabular-nums" data-testid="student-total">{row?.total ?? "—"}</b>
                {row && <GradeBadge label={row.grade} bands={bands} />}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon flex-none" disabled={!next} onClick={() => next && setParam("hs", next.id)} aria-label="Học sinh sau"><ChevronRight className="size-4" /></button>
        </div>
        <div className="mt-3">
          <Combobox label={<span className="sr-only">Tìm học sinh</span>} value={st.id} onChange={(v) => setParam("hs", v as string)} options={roster.map((s) => ({ value: s.id, label: s.fullName, hint: s.code }))} placeholder="Tìm học sinh" />
        </div>
        {!open && (
          <Callout className="mt-3" tone="neutral" icon={<Lock />} title={`Tuần ${d.week.index} đã ${d.period.status === "published" ? "công bố" : "chốt"} — chỉ xem`}
            action={<ButtonLink size="sm" variant="secondary" href={`${base}/adjustments`}>Đề nghị điều chỉnh</ButtonLink>}>
            Không ghi hoặc sửa trực tiếp tuần đã chốt. Thay đổi đi qua đề nghị điều chỉnh sau chốt.
          </Callout>
        )}
        {open && !d.canRecord && <Callout className="mt-3" tone="neutral">Bạn đang xem theo quyền theo dõi — không có quyền ghi nhận ở lớp này.</Callout>}
        <div className="mt-3">
          <Tabs variant="underline" value={tab} onChange={(v) => setParam("tab", v)} tabs={[{ value: "rules", label: "Ghi nhận vi phạm / khen thưởng" }, { value: "history", label: "Lịch sử ghi nhận", count: mine.length }]}>
            <TabPanel value="rules" className="!mt-2">
              <div className="table-wrap">
                <table className="table [&_td]:!py-1.5" style={{ minWidth: 360 }}>
                  <thead><tr><th>Quy định</th><th className="num">Điểm</th><th className="center">Thao tác</th></tr></thead>
                  <tbody>
                    {cats.map((c) => [
                      <tr key={`h-${c}`}><td colSpan={3} className="!bg-[#f7fbff] !py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">{c}</td></tr>,
                      ...rs.rules.filter((r) => r.category === c).map((r) => (
                        <tr key={r.id}>
                          <td><span className="flex items-center gap-2.5"><RuleIcon icon={r.icon} /><span className="min-w-0"><span className="block text-ink">{r.label}</span>{r.attendanceLink && <span className="text-[11.5px] text-primary-strong">Ghi từ điểm danh · không trừ lần hai</span>}</span></span></td>
                          <td className="num"><Points value={r.points} /></td>
                          <td className="center">{d.canRecord && open ? <Button size="sm" variant="secondary" onClick={() => onRecord(r.id)} aria-label={`Ghi nhận ${r.label} cho ${st.fullName}`}>Ghi nhận</Button> : <span className="text-[12px] text-faint">—</span>}</td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
            </TabPanel>
            <TabPanel value="history" className="!mt-2">
              {mine.length === 0 ? <EmptyState compact title="Chưa có ghi nhận trong tuần" description={`${st.fullName} chưa có ghi nhận nào trong tuần ${d.week.index}.`} /> : (
                <ul className="divide-y divide-line" data-testid="history-list">
                  {mine.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-2.5">
                      <RuleIcon icon={d.ruleSet?.rules.find((x) => x.id === r.ruleId)?.icon ?? ""} />
                      <div className="min-w-0 flex-1 text-[13px]">
                        <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold text-ink">{r.ruleLabel}</span><Points value={r.points} /><Badge tone={RECORD_STATUS[r.status]?.tone}>{RECORD_STATUS[r.status]?.label}</Badge>{r.fromAttendance && <Badge tone="info" dot={false}>Ghi từ điểm danh</Badge>}{r.duplicateOf.length > 0 && <Badge tone="danger" dot={false}>Có thể trùng</Badge>}</p>
                        <p className="text-muted">{fmtDate(r.date)} · {r.createdByName} · nội quy bản {r.ruleSetVersion}</p>
                        <p className="text-body">“{r.reason}”</p>
                        {r.reviewNote && <p className="text-[12px] text-muted">Rà soát: {r.reviewNote}</p>}
                      </div>
                      {open && r.status === "pending_review" && (d.canRecord || d.isReviewer) && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(r)}>Sửa</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </Card>
  );
}
