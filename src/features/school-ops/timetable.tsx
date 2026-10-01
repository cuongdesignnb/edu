"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Filter, History, Send, Trash2, PenLine } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { schoolOpsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf } from "@/lib/calendar";
import { fmtDate, fmtDayMonth, weekdayLabel } from "@/lib/formatters";
import { PERIODS } from "@/lib/domain/timetable";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { InlineSelect } from "@/components/ui/form";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { LessonChangeDrawer, LESSON_KIND_LABEL, type LessonTarget } from "./lesson-change-drawer";

type TT = Awaited<ReturnType<typeof classroomRepo.schoolTimetable>>;
type Cell = TT["cells"][number];
type Change = Awaited<ReturnType<typeof schoolOpsRepo.weekLessonChanges>>[number];

function LessonChip({ c, show, onClick, disabled }: { c: Cell; show: { cls: boolean; teacher: boolean; room: boolean }; onClick?: () => void; disabled?: boolean }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5"><span className="size-2 flex-none rounded-full" style={{ background: c.color }} aria-hidden />
        <span className={clsx("truncate font-semibold", c.cancelled ? "text-muted line-through" : "text-ink")}>{show.cls ? `${c.className} · ` : ""}{c.subject}</span></span>
      <span className="block truncate text-[11.5px] text-muted">{[show.teacher && c.teacher, show.room && `P. ${c.room}`].filter(Boolean).join(" · ")}</span>
      {(c.changed || c.cancelled) && <span className="block truncate text-[11px] font-semibold text-warning-text">{c.cancelled ? "Nghỉ tiết" : LESSON_KIND_LABEL[c.changed!.kind as keyof typeof LESSON_KIND_LABEL] ?? "Đã đổi"}</span>}
    </>
  );
  const cls = clsx("block w-full min-w-0 rounded-lg border px-2 py-1.5 text-left text-[12.5px] leading-snug", c.changed || c.cancelled ? "border-[#f5d9a6] bg-warning-bg/60" : "border-line bg-white");
  return onClick && !disabled ? <button type="button" className={clsx(cls, "hover:border-[#9cc7f5] hover:bg-primary-light")} onClick={onClick} aria-label={`Đổi tiết ${c.className} ${c.subject} tiết ${c.period} ngày ${fmtDate(c.date)}`}>{body}</button> : <div className={cls}>{body}</div>;
}

/** SC32 — school-wide timetable: filters, week navigation, desktop grid / mobile agenda, clashes, lesson changes (O25). */
export function SchoolTimetable({ schoolId, today }: { schoolId: string; today: string }) {
  const [week, setWeek] = useState(mondayOf(today));
  const [classId, setClassId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [day, setDay] = useState(today);
  const [target, setTarget] = useState<LessonTarget | null>(null);
  const [pending, setPending] = useState<{ ch: Change; action: "publish" | "delete" } | null>(null);
  const q = useRepo(["school-timetable", schoolId, week, classId, membershipId, roomId], (c) => classroomRepo.schoolTimetable(c, schoolId, { weekStart: week, classId: classId || undefined, membershipId: membershipId || undefined, roomId: roomId || undefined }));
  const changes = useRepo(["week-lesson-changes", schoolId, week], (c) => schoolOpsRepo.weekLessonChanges(c, schoolId, week));
  const publishCmd = useCommand((ctx, id: string) => classroomRepo.publishLessonChange(ctx, schoolId, id), { success: "Đã công bố đổi tiết", onSuccess: () => setPending(null) });
  const deleteCmd = useCommand((ctx, id: string) => classroomRepo.deleteDraftChange(ctx, schoolId, id), { success: "Đã xóa bản nháp đổi tiết", onSuccess: () => setPending(null) });
  const d = q.data;
  const show = { cls: !classId, teacher: !membershipId, room: !roomId };
  const byKey = useMemo(() => {
    const m = new Map<string, Cell[]>();
    (d?.cells ?? []).forEach((c) => { const k = `${c.date}|${c.period}`; m.set(k, [...(m.get(k) ?? []), c]); });
    return m;
  }, [d]);
  const days = d?.days ?? [0, 1, 2, 3, 4, 5].map((i) => addDays(week, i));
  const activeDay = days.includes(day) ? day : days[0];
  const open = (c: Cell) => setTarget({ classId: c.classId, className: c.className, date: c.date, period: c.period });
  const canClick = (c: Cell) => !!d?.canManage && c.date >= today;
  const moveWeek = (n: number) => { const w = addDays(week, 7 * n); setWeek(w); setDay(w); };
  const clashes = d?.clashes ?? [];
  const filterLabel = [classId && d?.options.classes.find((x) => x.id === classId)?.name, membershipId && d?.options.teachers.find((x) => x.id === membershipId)?.name, roomId && `Phòng ${d?.options.rooms.find((x) => x.id === roomId)?.name}`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => moveWeek(-1)} aria-label="Tuần trước" />
          <span className="flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink"><CalendarDays className="size-4 text-primary" aria-hidden />{fmtDate(week)} – {fmtDate(addDays(week, 6))}</span>
          <Button size="sm" variant="secondary" icon={<ChevronRight className="size-4" />} onClick={() => moveWeek(1)} aria-label="Tuần sau" />
          {week !== mondayOf(today) && <Button size="sm" variant="ghost" onClick={() => { setWeek(mondayOf(today)); setDay(today); }}>Tuần này</Button>}
        </div>
        <div className="flex flex-[1_1_480px] flex-wrap items-center gap-2 [&>select]:min-w-[150px] [&>select]:flex-1">
          <Filter className="size-4 flex-none text-primary" aria-hidden />
          <InlineSelect label="Lọc lớp" allLabel="Tất cả lớp" value={classId} onChange={setClassId} options={(d?.options.classes ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <InlineSelect label="Lọc giáo viên" allLabel="Tất cả giáo viên" value={membershipId} onChange={setMembershipId} options={(d?.options.teachers ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <InlineSelect label="Lọc phòng" allLabel="Tất cả phòng" value={roomId} onChange={setRoomId} options={(d?.options.rooms ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          {(classId || membershipId || roomId) && <Button size="sm" variant="ghost" onClick={() => { setClassId(""); setMembershipId(""); setRoomId(""); }}>Xóa lọc</Button>}
        </div>
      </Card>

      {clashes.length > 0 && <Callout tone="danger" icon={<AlertTriangle />} title={`${clashes.length} xung đột giáo viên trong tuần`}><ul className="list-disc pl-5">{clashes.slice(0, 6).map((c) => <li key={c}>{c.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")}</li>)}</ul>{clashes.length > 6 && <p>… và {clashes.length - 6} xung đột khác.</p>}</Callout>}
      {d?.canManage ? <p className="text-[13px] text-muted">Bấm vào một tiết từ hôm nay trở đi để đổi tiết. Lịch các ngày đã qua chỉ xem, không bị ghi đè.</p>
        : <p className="text-[13px] text-muted">Bạn đang xem lịch — đổi tiết cần quyền quản lý lịch toàn trường.</p>}

      <Card>
        <CardHeader title={`Lịch tuần ${fmtDayMonth(week)} – ${fmtDayMonth(addDays(week, 5))}`} icon={<CalendarDays className="size-5" />} subtitle={filterLabel ? `Đang lọc: ${filterLabel}` : "Tất cả lớp đang hoạt động — lịch đã công bố"} />
        {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-96" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : !d!.cells.length ? (
          <EmptyState compact title="Không có tiết học khớp bộ lọc" description="Đổi lớp/giáo viên/phòng hoặc tuần khác." />
        ) : (
          <>
            <div className="hidden px-4 pb-4 lg:block">
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Lưới lịch toàn trường">
                <table className="table table-fixed" style={{ minWidth: 980 }}>
                  <thead><tr><th className="w-24">Tiết</th>{days.map((x, i) => <th key={x} className={clsx(x === today && "!bg-primary-light !text-primary-strong")}>{weekdayLabel(i + 1)}<span className="block text-[12px] font-normal text-muted">{fmtDate(x)}</span></th>)}</tr></thead>
                  <tbody>
                    {PERIODS.map((p) => (
                      <tr key={p.period} className={clsx(p.period === 6 && "border-t-2 border-line-strong")}>
                        <td className="align-top"><p className="font-semibold text-ink">Tiết {p.period}</p><p className="text-[11.5px] text-muted">{p.start}–{p.end}</p></td>
                        {days.map((x) => {
                          const list = byKey.get(`${x}|${p.period}`) ?? [];
                          return <td key={x} className={clsx("align-top !p-1.5", x < today && "bg-[#fafbfd]")}><div className="space-y-1">{list.map((c) => <LessonChip key={c.id} c={c} show={show} onClick={() => open(c)} disabled={!canClick(c)} />)}</div></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-4 pb-4 lg:hidden">
              <div className="tabbar mb-3" role="tablist" aria-label="Chọn ngày">
                {days.map((x, i) => <button key={x} type="button" role="tab" aria-selected={x === activeDay} className="tab flex-col !gap-0 !px-3" onClick={() => setDay(x)}><span>{weekdayLabel(i + 1, true)}</span><span className="text-[11px] font-normal">{fmtDayMonth(x)}</span></button>)}
              </div>
              <ol className="space-y-2">
                {PERIODS.map((p) => {
                  const list = byKey.get(`${activeDay}|${p.period}`) ?? [];
                  if (!list.length) return null;
                  return (
                    <li key={p.period} className="flex gap-3 rounded-xl border border-line p-2.5">
                      <div className="w-16 flex-none"><p className="text-sm font-semibold text-ink">Tiết {p.period}</p><p className="text-[11.5px] text-muted">{p.start}–{p.end}</p></div>
                      <div className="min-w-0 flex-1 space-y-1">{list.map((c) => <LessonChip key={c.id} c={c} show={show} onClick={() => open(c)} disabled={!canClick(c)} />)}</div>
                    </li>
                  );
                })}
              </ol>
              {![...byKey.keys()].some((k) => k.startsWith(activeDay)) && <p className="py-6 text-center text-sm text-muted">Không có tiết học trong ngày này.</p>}
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Đổi tiết trong tuần" icon={<History className="size-5" />} subtitle="Bản nháp chưa hiển thị cho lớp/phụ huynh. Bản đã công bố không sửa lại — tạo thay đổi mới nếu cần." />
        {changes.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-20" /></div> : changes.error ? <ErrorState error={changes.error} onRetry={() => changes.refetch()} compact /> : changes.data!.length ? (
          <ul className="divide-y divide-line px-5 pb-3">
            {changes.data!.map((ch) => (
              <li key={ch.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-semibold text-ink">{ch.className} · {fmtDate(ch.date)} · tiết {ch.period} — {LESSON_KIND_LABEL[ch.kind]}</p>
                  <p className="text-[12.5px] text-muted">{[ch.subject, ch.teacher, ch.room && `Phòng ${ch.room}`].filter(Boolean).join(" · ") || "Nghỉ tiết"} · {ch.reason} · {ch.createdByName}</p>
                </div>
                <StatusBadge status={ch.status} map={PUBLICATION_STATUS} />
                {ch.isPast && <Badge tone="neutral" dot={false}>Đã qua</Badge>}
                {ch.canEdit && ch.status === "draft" && !ch.isPast && <div className="flex gap-1.5">
                  <Button size="sm" icon={<PenLine className="size-4" />} onClick={() => setTarget({ classId: ch.classId, className: ch.className, date: ch.date, period: ch.period })}>Sửa</Button>
                  <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => setPending({ ch, action: "publish" })}>Công bố</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setPending({ ch, action: "delete" })} aria-label="Xóa bản nháp đổi tiết" />
                </div>}
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="Tuần này chưa có đổi tiết" />}
      </Card>

      <LessonChangeDrawer schoolId={schoolId} target={target} today={today} onClose={() => setTarget(null)} />
      <ConfirmDialog open={pending?.action === "publish"} onOpenChange={(o) => !o && setPending(null)} title="Công bố đổi tiết" confirmLabel="Công bố" busy={publishCmd.pending}
        object={pending && `${pending.ch.className} · ${fmtDate(pending.ch.date)} · tiết ${pending.ch.period}`}
        error={publishCmd.error?.code === "VALIDATION" ? publishCmd.error.message : undefined}
        consequence="Lịch lớp, lịch giáo viên và lịch phụ huynh hiển thị thay đổi cho đúng ngày/tiết này. Hệ thống kiểm tra lại xung đột trước khi công bố."
        onConfirm={async () => { if (pending) await publishCmd.run(pending.ch.id); }} />
      <ConfirmDialog open={pending?.action === "delete"} onOpenChange={(o) => !o && setPending(null)} title="Xóa bản nháp đổi tiết" variant="danger" confirmLabel="Xóa bản nháp" busy={deleteCmd.pending}
        object={pending && `${pending.ch.className} · ${fmtDate(pending.ch.date)} · tiết ${pending.ch.period}`}
        consequence="Bản nháp chưa công bố sẽ bị xóa; lịch đã công bố không thay đổi." onConfirm={async () => { if (pending) await deleteCmd.run(pending.ch.id); }} />
    </div>
  );
}
