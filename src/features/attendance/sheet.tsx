"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarCheck, Trophy, Save, Send, Info, Link2, History, CalendarRange, AlertTriangle, Lock, Search } from "lucide-react";
import type { AttendanceStatus } from "@/lib/model/types";
import { attendanceRepo, type RepoError } from "@/lib/repositories";
import { teacherExtraRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { addDays, weekdayOf } from "@/lib/calendar";
import { attendanceStatus, fmtDate, fmtDateLong, fmtDayMonth, fmtPoints, fmtTime, matches } from "@/lib/formatters";
import { countAttendance } from "@/lib/domain/attendance";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox, DateField, InlineSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ConflictDialog, useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";
import { BulkSelectionBar, Pagination } from "@/components/data/table";
import { EmptyFiltered, QueryState, Skeleton } from "@/components/ui/states";
import { StatusButtons, STATUS_ORDER, STATUS_STYLE } from "./status";
import { RecordHistoryDrawer } from "./history-drawer";

type Sheet = Awaited<ReturnType<typeof attendanceRepo.sheet>>;
type Row = Sheet["rows"][number];
type Entry = { status: AttendanceStatus; note: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 20;
const CONDUCT_STATUS: Record<string, string> = { pending_review: "chờ rà soát", approved: "đã duyệt", rejected: "đã từ chối", void: "đã loại" };

/** CL04 — attendance by day / session / period (R08, left part). */
export function AttendanceScreen() {
  const { schoolId, yearId, classId, base } = useClassroom();
  const ctx = useCtx();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const leave = useLeaveGuard();
  const dp = sp.get("date");
  const date = dp && ISO.test(dp) ? dp : ctx.today;
  const slots = useRepo(["att-slots", classId, date], (c) => teacherExtraRepo.attendanceSlots(c, schoolId, yearId, classId, date));
  const slotParam = sp.get("slot");
  const slot = slotParam ?? (slots.data ? (slots.data.find((s) => s.canRecord)?.slot ?? "morning") : null);
  const go = useCallback((d: string, s?: string | null) => leave(() => router.replace(`${pathname}?date=${d}${s ? `&slot=${s}` : ""}`, { scroll: false })), [leave, router, pathname]);

  return (
    <div className="page">
      <ClassHeader title="Điểm danh" subtitle="Điểm danh theo buổi (chủ nhiệm) hoặc theo tiết (giáo viên bộ môn). “Chưa điểm danh” không bao giờ được tính là có mặt." crumbs={[{ label: "Điểm danh" }]} />
      <Card as="div" className="flex flex-wrap items-end gap-3 p-3.5">
        <div className="flex w-full items-end gap-1.5 sm:w-auto">
          <Button variant="secondary" className="btn-icon" aria-label="Ngày trước" onClick={() => go(addDays(date, weekdayOf(date) === 1 ? -2 : -1), slot === "morning" ? "morning" : null)}><ChevronLeft className="size-4" /></Button>
          <DateField label="Ngày điểm danh" value={date} onChange={(v) => v && go(v, slot === "morning" ? "morning" : null)} helper={<span className="sr-only">Định dạng dd/MM/yyyy</span>} className="min-w-0 flex-1 sm:w-[200px] sm:flex-none" />
          <Button variant="secondary" className="btn-icon" aria-label="Ngày sau" onClick={() => go(addDays(date, weekdayOf(date) === 6 ? 2 : 1), slot === "morning" ? "morning" : null)}><ChevronRight className="size-4" /></Button>
        </div>
        <div className="field min-w-[220px] max-w-[300px] flex-[1_1_220px]">
          <label className="label" htmlFor="att-slot">Buổi / tiết</label>
          {slots.isLoading || !slot ? <Skeleton className="h-10" /> : (
            <select id="att-slot" className="select" value={slot} onChange={(e) => go(date, e.target.value)}>
              {!slots.data?.some((s) => s.slot === slot) && <option value={slot}>{slot.startsWith("period-") ? `Tiết ${slot.slice(7)} (không có trong lịch ngày này)` : slot}</option>}
              {slots.data?.map((s) => <option key={s.slot} value={s.slot}>{s.label}{s.canRecord ? "" : " — chỉ xem"}</option>)}
            </select>
          )}
        </div>
        {date !== ctx.today && <Button variant="ghost" size="sm" onClick={() => go(ctx.today, null)}>Về hôm nay</Button>}
        <nav className="ml-auto hidden flex-wrap gap-2 sm:flex" aria-label="Chế độ xem">
          <span className="btn btn-primary" aria-current="page"><CalendarCheck className="size-4" aria-hidden />Điểm danh trong ngày</span>
          <Link href={`${base}/conduct/weekly`} className="btn btn-secondary"><Trophy className="size-4" aria-hidden />Thi đua theo tuần</Link>
        </nav>
      </Card>
      {slot ? <SheetLoader date={date} slot={slot} /> : <Skeleton className="h-96" />}
    </div>
  );
}

function SheetLoader({ date, slot }: { date: string; slot: string }) {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["att-sheet", classId, date, slot], (c) => attendanceRepo.sheet(c, schoolId, yearId, classId, date, slot as Sheet["slot"]));
  const [nonce, setNonce] = useState(0);
  return (
    <QueryState query={q} skeleton="table">
      {(s) => <SheetEditor key={`${s.date}|${s.slot}|${s.session?.version ?? 0}|${s.sessionStatus}|${nonce}`} sheet={s} onReload={() => { void q.refetch().then(() => setNonce((n) => n + 1)); }} />}
    </QueryState>
  );
}

function SheetEditor({ sheet, onReload }: { sheet: Sheet; onReload: () => void }) {
  const { schoolId, yearId, classId, base, readOnly, header } = useClassroom();
  const initial = useMemo(() => new Map<string, Entry>(sheet.rows.map((r) => [r.studentId, { status: r.status, note: r.note }])), [sheet]);
  const [draft, setDraft] = useState(() => new Map(initial));
  const [linkConduct, setLinkConduct] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<AttendanceStatus | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const [saveError, setSaveError] = useState<string>();
  const [hist, setHist] = useState<string | null>(null);

  const future = sheet.date > sheet.today;
  const blockedReason = readOnly ? "Năm học đã lưu trữ — chỉ xem." : sheet.holiday ? `Ngày nghỉ theo lịch nhà trường: ${sheet.holiday}.` : sheet.isSunday ? "Chủ nhật không có buổi học." : future ? "Ngày chưa tới — chưa thể điểm danh." : sheet.slot.startsWith("period-") && !sheet.lesson ? "Không có tiết này trong lịch ngày đã chọn." : !sheet.canRecord ? (header.viaSchoolRole ? "Bạn xem theo quyền nhà trường: chỉ xem, không điểm danh thay giáo viên được phân công." : sheet.slot === "morning" ? "Điểm danh buổi do giáo viên chủ nhiệm thực hiện. Giáo viên bộ môn chọn tiết mình dạy." : "Bạn không được phân công điểm danh tiết này (chỉ đúng môn và lớp được giao).") : null;
  const editable = !blockedReason;

  const changed = useMemo(() => sheet.rows.filter((r) => { const a = draft.get(r.studentId)!; const b = initial.get(r.studentId)!; return a.status !== b.status || a.note.trim() !== b.note.trim(); }), [draft, initial, sheet.rows]);
  const dirty = changed.length > 0;
  const counts = useMemo(() => countAttendance(sheet.rows.map((r) => r.studentId), sheet.rows.map((r) => ({ studentId: r.studentId, status: draft.get(r.studentId)!.status }))), [draft, sheet.rows]);
  const rules = useMemo(() => new Map(sheet.linkRules.map((r) => [r.link, r])), [sheet.linkRules]);

  const setEntry = (id: string, patch: Partial<Entry>) => setDraft((m) => { const n = new Map(m); n.set(id, { ...n.get(id)!, ...patch }); return n; });

  const save = useCommand((c, reason?: string) => attendanceRepo.save(c, schoolId, yearId, classId, {
    date: sheet.date, slot: sheet.slot, expectedVersion: sheet.session?.version, linkConduct, reason,
    entries: sheet.rows.filter((r) => draft.get(r.studentId)!.status !== "unmarked" || r.status !== "unmarked" || draft.get(r.studentId)!.note.trim()).map((r) => ({ studentId: r.studentId, status: draft.get(r.studentId)!.status, note: draft.get(r.studentId)!.note })),
  }), {
    success: (r) => `Đã lưu điểm danh: ${r.changed} thay đổi${r.linkedCreated ? `, tạo ${r.linkedCreated} ghi nhận chờ rà soát` : ""}${r.linkedVoided ? `, loại ${r.linkedVoided} ghi nhận` : ""}${r.blockedLinks.length ? ` — ${r.blockedLinks.length} ghi nhận không đổi vì tuần đã chốt` : ""}`,
    onSuccess: () => { setReasonOpen(false); setSaveError(undefined); },
    onError: (e) => { if (e.code === "CONFLICT") setConflict(e); else if (e.code === "VALIDATION") setSaveError(e.fieldErrors?.reason ?? e.fieldErrors?.date ?? e.message); },
  });
  const publish = useCommand((c) => attendanceRepo.publish(c, schoolId, yearId, classId, sheet.date, sheet.slot), {
    success: `Đã công bố chuyên cần ngày ${fmtDate(sheet.date)} cho phụ huynh`, onSuccess: () => setPublishOpen(false),
    onError: (e) => { if (e.code === "VALIDATION") setSaveError(e.message); if (e.code === "CONFLICT") setConflict(e); },
  });
  const published = sheet.sessionStatus === "published";
  const runSave = async () => { if (published) { setReasonOpen(true); return false; } return !!(await save.run(undefined)); };
  useUnsavedChanges(dirty, published ? undefined : async () => !!(await save.run(undefined)));

  const filtered = useMemo(() => sheet.rows.filter((r) => matches(q, r.fullName, r.code)), [sheet.rows, q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const pageIds = pageRows.map((r) => r.studentId);
  const allIds = filtered.map((r) => r.studentId);
  const bulkChanges = bulk ? [...selected].filter((id) => draft.get(id)?.status !== bulk).length : 0;
  const scopeLabel = allIds.length > pageIds.length && allIds.every((id) => selected.has(id)) ? `tất cả ${allIds.length} kết quả lọc (nhiều trang)` : pageIds.length && pageIds.every((id) => selected.has(id)) && selected.size === pageIds.length ? "toàn bộ học sinh trên trang này" : "các học sinh được đánh dấu";

  const linkInfo = (r: Row) => {
    const e = draft.get(r.studentId)!;
    const violation = e.status === "late" || e.status === "unexcused";
    if (r.linkedConduct && e.status === r.status) return { tone: "text-warning-text", text: `Đã tạo ghi nhận ${fmtPoints(r.linkedConduct.points)}, ${CONDUCT_STATUS[r.linkedConduct.status] ?? r.linkedConduct.status}` };
    if (r.linkedConduct && !violation) return { tone: "text-muted", text: "Ghi nhận liên kết sẽ được loại khi lưu" };
    if (r.linkedConduct && violation) return { tone: "text-warning-text", text: `Ghi nhận sẽ đổi theo trạng thái mới (${fmtPoints(rules.get(e.status as "late")?.points ?? 0)})` };
    if (violation && linkConduct && rules.get(e.status as "late")) return { tone: "text-primary-strong", text: `Sẽ tạo ghi nhận ${fmtPoints(rules.get(e.status as "late")!.points)} khi lưu` };
    return null;
  };

  const chips: { key: AttendanceStatus; label: string }[] = [
    { key: "present", label: "Có mặt" }, { key: "late", label: "Đi muộn" }, { key: "excused", label: "Nghỉ có phép" }, { key: "unexcused", label: "Nghỉ không phép" }, { key: "unmarked", label: "Chưa điểm danh" },
  ];
  const status = PUBLICATION_STATUS[sheet.sessionStatus === "none" ? "none" : sheet.sessionStatus];
  const slotLabel = sheet.slot === "morning" ? "buổi sáng" : sheet.slot === "afternoon" ? "buổi chiều" : sheet.lesson ? `tiết ${sheet.lesson.period} – ${sheet.lesson.subject}` : `tiết ${sheet.slot.slice(7)}`;

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0">
        <CardHeader title={`Danh sách học sinh – Điểm danh ngày ${fmtDate(sheet.date)}`} icon={<CalendarCheck className="size-5 text-primary" />}
          subtitle={<>{fmtDateLong(sheet.date)} · {slotLabel}{sheet.week ? ` · Tuần ${sheet.week.index} (${fmtDayMonth(addDays(sheet.date, 1 - weekdayOf(sheet.date)))} – ${fmtDate(addDays(sheet.date, 6 - weekdayOf(sheet.date)))})` : ""}</>}
          action={<><Badge tone={status.tone}>{sheet.sessionStatus === "none" ? "Chưa điểm danh" : status.label}</Badge><Link href={`${base}/attendance/weekly?week=${addDays(sheet.date, 1 - weekdayOf(sheet.date))}`} className="card-link"><CalendarRange className="size-3.5" aria-hidden />Chuyên cần theo tuần</Link></>} />
        {blockedReason && <div className="px-5 pb-3"><Callout tone={sheet.holiday || sheet.isSunday ? "neutral" : "warning"} icon={<Lock />}>{blockedReason}{sheet.sessionStatus !== "none" ? " Dữ liệu đã lưu được hiển thị để tra cứu." : ""}</Callout></div>}
        {sheet.periodLocked && editable && <div className="px-5 pb-3"><Callout tone="warning" icon={<AlertTriangle />}>Thi đua tuần này đã chốt — sửa điểm danh vẫn được, nhưng ghi nhận liên kết không tự đổi (cần đề nghị điều chỉnh).</Callout></div>}
        {published && editable && <div className="px-5 pb-3"><Callout tone="info" icon={<Info />}>Buổi này đã công bố cho phụ huynh. Sửa sẽ yêu cầu lý do và được ghi lịch sử.</Callout></div>}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <div className="input-icon min-w-[200px] flex-[1_1_240px]"><Search className="size-4" aria-hidden /><input className="input" type="search" placeholder="Tìm theo tên, mã học sinh…" aria-label="Tìm học sinh" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <ul className="flex flex-wrap gap-2" aria-label={`Tổng ${counts.total} học sinh`} aria-live="polite">
            {chips.map((c) => (
              <li key={c.key} className={clsx("flex min-w-[76px] flex-col items-center rounded-xl px-2.5 py-1.5", STATUS_STYLE[c.key].chip)}>
                <span className="text-[20px] font-extrabold leading-tight tabular-nums">{counts[c.key]}</span><span className="text-[11.5px] font-medium">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="px-5 pb-2 text-[12.5px] text-muted">Sĩ số {counts.total} = {counts.present} có mặt + {counts.late} đi muộn + {counts.excused} có phép + {counts.unexcused} không phép + {counts.unmarked} chưa điểm danh · Hiện diện {counts.presentAll}/{counts.total}</p>
        {editable && (
          <BulkSelectionBar selected={selected} pageIds={pageIds} allIds={allIds} onChange={setSelected} what="học sinh">
            <span className="text-[13px] text-body">Đặt trạng thái:</span>
            {STATUS_ORDER.map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => setBulk(s)}>{attendanceStatus[s].label}</Button>)}
          </BulkSelectionBar>
        )}
        {filtered.length === 0 ? <EmptyFiltered onReset={() => setQ("")} what="học sinh" /> : (
          <>
            {/* desktop table */}
            <div className="hidden md:block">
              <div className="table-wrap" role="region" aria-label="Bảng điểm danh" tabIndex={0}>
                <table className="table" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      {editable && <th className="w-10"><input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label="Chọn tất cả học sinh trên trang này" checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))} onChange={(e) => { const n = new Set(selected); pageIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); setSelected(n); }} /></th>}
                      <th className="w-10">#</th><th>Học sinh</th><th>Trạng thái điểm danh</th><th className="w-[180px]">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const e = draft.get(r.studentId)!;
                      const li = linkInfo(r);
                      const isChanged = changed.includes(r);
                      return (
                        <tr key={r.studentId} aria-selected={selected.has(r.studentId) || undefined} className={clsx(isChanged && "bg-[#fffbeb]")}>
                          {editable && <td><input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label={`Chọn ${r.fullName}`} checked={selected.has(r.studentId)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.studentId)) n.delete(r.studentId); else n.add(r.studentId); return n; })} /></td>}
                          <td className="tabular-nums text-muted">{sheet.rows.indexOf(r) + 1}</td>
                          <td>
                            <div className="flex min-w-[180px] items-center gap-2.5">
                              <Avatar name={r.fullName} tone={r.avatarTone} size={32} />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-ink">{r.fullName}</p>
                                <p className="text-[12px] text-muted">{r.code}{r.groupName ? ` · ${r.groupName}` : ""}</p>
                                {li && <p className={clsx("text-[11.5px] font-medium", li.tone)}><Link2 className="mr-1 inline size-3" aria-hidden />{li.text}</p>}
                              </div>
                            </div>
                          </td>
                          <td><StatusButtons name={r.fullName} value={e.status} onChange={(s) => setEntry(r.studentId, { status: s })} disabled={!editable} /></td>
                          <td>
                            <input className="input !min-h-9 text-[13px]" aria-label={`Ghi chú cho ${r.fullName}`} placeholder="Nhập ghi chú…" value={e.note} maxLength={200} disabled={!editable} onChange={(ev) => setEntry(r.studentId, { note: ev.target.value })} />
                            {r.history.length > 0 && <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary-strong hover:underline" onClick={() => setHist(r.studentId)}><History className="size-3.5" aria-hidden />Lịch sử ({r.history.length})</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* C059 mobile cards */}
            <ul className="space-y-3 px-4 pb-2 md:hidden">
              {pageRows.map((r) => {
                const e = draft.get(r.studentId)!;
                const li = linkInfo(r);
                return (
                  <li key={r.studentId} className={clsx("rounded-2xl border p-3.5", changed.includes(r) ? "border-[#f5d9a6] bg-[#fffbeb]" : "border-line bg-white")}>
                    <div className="mb-2.5 flex items-center gap-2.5">
                      {editable && <input type="checkbox" className="size-5 accent-[var(--color-primary)]" aria-label={`Chọn ${r.fullName}`} checked={selected.has(r.studentId)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.studentId)) n.delete(r.studentId); else n.add(r.studentId); return n; })} />}
                      <Avatar name={r.fullName} tone={r.avatarTone} size={36} />
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{sheet.rows.indexOf(r) + 1}. {r.fullName}</p><p className="text-[12px] text-muted">{r.code}{r.groupName ? ` · ${r.groupName}` : ""}</p></div>
                      <Badge tone={attendanceStatus[e.status].tone}>{attendanceStatus[e.status].short}</Badge>
                    </div>
                    <StatusButtons large name={r.fullName} value={e.status} onChange={(s) => setEntry(r.studentId, { status: s })} disabled={!editable} />
                    <input className="input mt-2.5" aria-label={`Ghi chú cho ${r.fullName}`} placeholder="Ghi chú (tuỳ chọn)" value={e.note} maxLength={200} disabled={!editable} onChange={(ev) => setEntry(r.studentId, { note: ev.target.value })} />
                    {li && <p className={clsx("mt-1.5 text-[12px] font-medium", li.tone)}><Link2 className="mr-1 inline size-3" aria-hidden />{li.text}</p>}
                    {r.history.length > 0 && <button type="button" className="mt-1 inline-flex min-h-9 items-center gap-1 text-[12.5px] font-semibold text-primary-strong" onClick={() => setHist(r.studentId)}><History className="size-3.5" aria-hidden />Lịch sử ({r.history.length})</button>}
                  </li>
                );
              })}
            </ul>
            {pageCount > 1 && <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={PAGE} onPage={setPage} what="học sinh" />}
          </>
        )}
        {editable && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur 2xl:hidden">
            <span className="text-[13px] text-body">{dirty ? `${changed.length} thay đổi chưa lưu` : "Không có thay đổi"}</span>
            <Button className="ml-auto" variant="primary" icon={<Save className="size-4" />} loading={save.pending} disabled={!dirty} onClick={() => void runSave()}>Lưu điểm danh</Button>
          </div>
        )}
      </Card>

      <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 2xl:grid-cols-1">
        <Card>
          <CardHeader title="Thao tác" />
          <div className="space-y-3 px-5 pb-5">
            {saveError && <p className="error-text" role="alert"><AlertTriangle className="size-3.5" aria-hidden />{saveError}</p>}
            <Button block variant="primary" icon={<Save className="size-4" />} loading={save.pending} disabled={!editable || !dirty} onClick={() => void runSave()}>
              {dirty ? `Lưu điểm danh (${changed.length} thay đổi)` : "Lưu điểm danh"}
            </Button>
            {sheet.canPublish && (
              <Button block variant="secondary" icon={<Send className="size-4" />} loading={publish.pending} disabled={readOnly || dirty || sheet.sessionStatus === "none" || published || counts.unmarked > 0 || !!sheet.holiday}
                onClick={() => setPublishOpen(true)}>{published ? "Đã công bố cho phụ huynh" : "Công bố cho phụ huynh"}</Button>
            )}
            {sheet.canPublish && !published && (dirty ? <p className="text-[12.5px] text-muted">Lưu thay đổi trước khi công bố.</p> : counts.unmarked > 0 ? <p className="text-[12.5px] text-warning-text">Còn {counts.unmarked} học sinh chưa điểm danh — hoàn tất trước khi công bố.</p> : null)}
            <p className="text-[12.5px] text-muted">{sheet.session ? <>Lưu gần nhất {fmtTime(sheet.session.updatedAt)} {fmtDate(sheet.session.updatedAt)} · {sheet.updatedByName}{sheet.session.publishedAt ? <><br />Công bố {fmtTime(sheet.session.publishedAt)} {fmtDate(sheet.session.publishedAt)}</> : null}</> : "Chưa có bản lưu cho buổi/tiết này."}</p>
            <Callout tone="info" icon={<Info />}>Chỉ dữ liệu sau khi công bố mới hiển thị với phụ huynh qua link tra cứu. “Đã lưu” chưa phải “Đã công bố”.</Callout>
          </div>
        </Card>
        <Card>
          <CardHeader title="Liên kết thi đua" icon={<Trophy className="size-5 text-warning" />} action={<Link href={`${base}/conduct/weekly`} className="card-link">Thi đua theo tuần</Link>} />
          <div className="space-y-3 px-5 pb-5">
            <Checkbox label="Tạo ghi nhận thi đua liên kết cho Đi muộn / Không phép (không trừ trùng)" checked={linkConduct} onChange={setLinkConduct} disabled={!editable}
              description="Mỗi lượt vi phạm chỉ tạo tối đa một ghi nhận, ở trạng thái chờ rà soát." />
            {sheet.linkRules.length === 0 ? <p className="text-[13px] text-muted">Bộ nội quy hiện hành chưa có quy định liên kết điểm danh.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {sheet.linkRules.map((r) => (
                  <li key={r.link} className="flex items-center gap-2 px-3 py-2 text-[13px]"><Badge tone={attendanceStatus[r.link].tone}>{attendanceStatus[r.link].label}</Badge><span className="min-w-0 flex-1 truncate text-body">{r.label}</span><b className="tabular-nums text-danger-text">{fmtPoints(r.points)}</b></li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog open={bulk !== null} onOpenChange={(o) => { if (!o) setBulk(null); }} title="Điểm danh hàng loạt"
        object={`${selected.size} học sinh — ${scopeLabel}`}
        consequence={<>Đặt trạng thái <b>{bulk ? attendanceStatus[bulk].label : ""}</b>. Số dòng thay đổi thực tế: <b>{bulkChanges}</b> (các dòng đã ở trạng thái này giữ nguyên; học sinh ngoài lựa chọn không bị đổi). Thay đổi chỉ được lưu khi bấm “Lưu điểm danh”.</>}
        confirmLabel={`Đổi ${bulkChanges} dòng`} onConfirm={() => { if (bulk) setDraft((m) => { const n = new Map(m); selected.forEach((id) => n.set(id, { ...n.get(id)!, status: bulk })); return n; }); setBulk(null); setSelected(new Set()); }} />
      <ConfirmDialog open={reasonOpen} onOpenChange={setReasonOpen} title="Sửa điểm danh đã công bố" busy={save.pending}
        object={`${sheet.className} · ${fmtDateLong(sheet.date)} · ${changed.length} dòng thay đổi`}
        consequence="Phụ huynh đã thấy dữ liệu này. Thay đổi sẽ hiển thị ngay sau khi lưu và được ghi vào lịch sử kèm lý do."
        reasonLabel="Lý do sửa (tối thiểu 5 ký tự)" reasonRequired confirmLabel="Lưu thay đổi" error={saveError}
        onConfirm={async (reason) => { if (reason.length < 5) { setSaveError("Lý do tối thiểu 5 ký tự"); return; } await save.run(reason); }} />
      <ConfirmDialog open={publishOpen} onOpenChange={setPublishOpen} title="Công bố chuyên cần cho phụ huynh" busy={publish.pending}
        object={`${sheet.className} · ${fmtDateLong(sheet.date)} · ${counts.total} học sinh`}
        consequence={<>Phụ huynh có link tra cứu sẽ thấy trạng thái của con: {counts.present} có mặt, {counts.late} đi muộn, {counts.excused} nghỉ có phép, {counts.unexcused} nghỉ không phép. Sau khi công bố, mọi sửa đổi cần ghi lý do.</>}
        confirmLabel="Công bố" onConfirm={async () => { await publish.run(); }} />
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={() => { setConflict(null); onReload(); }}
        mine={<p>{changed.length} dòng bạn đã sửa: {changed.slice(0, 6).map((r) => `${r.fullName} → ${attendanceStatus[draft.get(r.studentId)!.status].label}`).join("; ")}{changed.length > 6 ? "…" : ""}</p>} />
      <RecordHistoryDrawer open={!!hist} onOpenChange={(o) => { if (!o) setHist(null); }} schoolId={schoolId} yearId={yearId} classId={classId} target={hist ? { studentId: hist, date: sheet.date, slot: sheet.slot } : null} />
    </div>
  );
}
