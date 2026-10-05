"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarDays, Send, Trash2, Lock } from "lucide-react";
import type { LessonChange } from "@/lib/model/types";
import { classroomRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf, weekdayOf } from "@/lib/calendar";
import { PERIODS } from "@/lib/domain/timetable";
import { fmtDate, fmtDateLong, fmtDayMonth, weekdayLabel } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, QueryState } from "@/components/ui/states";
import { LessonChangeDrawer } from "@/features/school-ops/lesson-change-drawer";
import {TimetableImportDialog} from "@/features/school-ops/timetable-import-dialog";
import { TimetableDraftEditor } from "@/features/school-ops/timetable-draft-editor";

type TT = Awaited<ReturnType<typeof classroomRepo.timetable>>;
type Lesson = TT["days"][number]["lessons"][number];
const roomLabel = (r: string) => (/^phòng/i.test(r) ? r : `Phòng ${r}`);
const KIND: Record<LessonChange["kind"], string> = { swap: "Đổi môn / giáo viên", cancel: "Nghỉ tiết", substitute: "Dạy thay", room: "Đổi phòng" };

/** CL15 — class timetable (C067): week grid desktop / day list mobile, change markers, O25 drawer when allowed. */
export function ClassTimetable() {
  const { schoolId, yearId, classId } = useClassroom();
  const ctx = useCtx();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const w = sp.get("week");
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : undefined;
  const q = useRepo(["class-timetable", classId, monday ?? "cur"], (c) => classroomRepo.timetable(c, schoolId, yearId, classId, monday));
  const setWeek = (m: string) => router.replace(`${pathname}?week=${m}`, { scroll: false });
  const [edit, setEdit] = useState<{ lesson: Lesson; date: string } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <div className="page">
      <ClassHeader title="Lịch học của lớp" subtitle="Thời khóa biểu theo tuần; thay đổi có ngày áp dụng, không sửa lịch quá khứ" crumbs={[{ label: "Lịch lớp" }]} />
      <QueryState query={q} skeleton="table">
        {(d) => {
          const activeDay = day && d.days.some((x) => x.date === day) ? day : d.days.find((x) => x.date === ctx.today)?.date ?? d.monday;
          const periods = [...new Map([...PERIODS,...d.days.flatMap(x => x.lessons.map(l => ({ period:l.period,start:l.start,end:l.end,session:'morning' as const })))].map(p => [p.period,p])).values()].sort((a,b) => a.period-b.period);
          const Cell = ({ l, date }: { l: Lesson; date: string }) => {
            const past = date < ctx.today;
            const inner = (
              <>
                <span className="flex items-center gap-1.5"><span className="size-2 flex-none rounded-full" style={{ background: l.color }} aria-hidden /><b className={clsx("text-ink", l.cancelled && "line-through")}>{l.subject}</b></span>
                <span className="block text-muted">{l.teacher}{l.teacherStatus && l.teacherStatus !== "active" ? " (tạm khóa)" : ""}</span>
                <span className="block text-muted">{roomLabel(l.room)}</span>
                <span className="block text-[11.5px] text-muted">{l.start}–{l.end}</span>
                {l.changed && <span className={clsx("mt-1 block rounded px-1.5 py-0.5 text-[11.5px] font-semibold", l.cancelled ? "bg-neutral-bg text-neutral-text" : "bg-warning-bg text-warning-text")}>{l.cancelled ? "Nghỉ" : KIND[l.changed.kind as LessonChange["kind"]] ?? "Thay đổi"}: {l.changed.reason}</span>}
              </>
            );
            const cls = clsx("block w-full rounded-lg border px-2.5 py-2 text-left text-[12.5px]", l.cancelled ? "border-dashed border-line-strong bg-neutral-bg" : "border-line bg-white");
            return d.canEdit && !past ? <button type="button" className={clsx(cls, "hover:border-primary")} onClick={() => setEdit({ lesson: l, date })} aria-label={`Đổi tiết ${l.period} ${fmtDateLong(date)}: ${l.subject}`}>{inner}</button> : <div className={cls}>{inner}</div>;
          };
          return (
            <>
              {!d.canEdit && <Callout tone="neutral" icon={<Lock />}>Bạn xem lịch ở chế độ chỉ đọc. Đổi tiết do giáo viên chủ nhiệm hoặc giáo vụ thực hiện.</Callout>}
              {d.canEdit && <><TimetableImportDialog schoolId={schoolId} classId={classId} yearId={yearId} onSaved={()=>void q.refetch()}/><TimetableDraftEditor schoolId={schoolId} classId={classId} weekStart={d.monday} /></>}
              <Card>
                <CardHeader title={`Tuần ${d.week?.index ?? ""} · ${fmtDate(d.monday)} – ${fmtDate(addDays(d.monday, 5))}`} icon={<CalendarDays className="size-5 text-primary" />}
                  subtitle={d.canEdit ? "Bấm vào một tiết (từ hôm nay trở đi) để đổi tiết / đổi phòng / cho nghỉ." : undefined}
                  action={<>
                    <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(d.monday, -7))}>Tuần trước</Button>
                    <Button size="sm" variant="secondary" disabled={d.monday === mondayOf(ctx.today)} onClick={() => setWeek(mondayOf(ctx.today))}>Tuần này</Button>
                    <Button size="sm" variant="secondary" iconRight={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(d.monday, 7))}>Tuần sau</Button>
                  </>} />
                <div className="hidden px-4 pb-4 lg:block">
                  <div className="table-wrap">
                    <table className="table table-fixed [&_td]:!p-1.5" style={{ minWidth: 900 }}>
                      <caption className="sr-only">Thời khóa biểu tuần {fmtDate(d.monday)}</caption>
                      <thead><tr><th className="w-[88px]">Tiết</th>{d.days.map((x) => <th key={x.date} className={clsx(x.date === ctx.today && "!text-primary-strong")}>{weekdayLabel(weekdayOf(x.date))}<span className="block text-[12px] font-normal text-muted">{fmtDayMonth(x.date)}</span></th>)}</tr></thead>
                      <tbody>
                        {periods.map((p) => (
                          <tr key={p.period}>
                            <td className="align-top !px-3"><b className="text-ink">Tiết {p.period}</b><span className="block text-[12px] text-muted">{p.start} – {p.end}</span></td>
                            {d.days.map((x) => {
                              if (x.holiday) return p.period === periods[0].period ? <td key={x.date} rowSpan={periods.length} className="bg-neutral-bg text-center align-middle text-[13px] font-semibold text-neutral-text">Nghỉ: {x.holiday}</td> : null;
                              const l = x.lessons.find((y) => y.period === p.period);
                              return <td key={x.date} className={clsx("align-top", x.date === ctx.today && "bg-[#f8fbff]")}>{l ? <Cell l={l} date={x.date} /> : null}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="px-4 pb-4 lg:hidden">
                  <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Chọn ngày">
                    {d.days.map((x) => (
                      <button key={x.date} type="button" role="tab" aria-selected={x.date === activeDay} onClick={() => setDay(x.date)} className={clsx("flex min-w-[52px] flex-col items-center rounded-xl border px-2 py-1.5 text-[12px]", x.date === activeDay ? "border-primary bg-primary text-white" : "border-line bg-white text-body")}>
                        <span className="font-bold">{weekdayLabel(weekdayOf(x.date), true)}</span><span>{fmtDayMonth(x.date)}</span>
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const x = d.days.find((y) => y.date === activeDay)!;
                    if (x.holiday) return <p className="rounded-xl bg-neutral-bg p-4 text-sm font-semibold text-neutral-text">Nghỉ: {x.holiday}</p>;
                    if (!x.lessons.length) return <EmptyState compact title="Không có tiết học" />;
                    return <ul className="space-y-2">{x.lessons.map((l) => <li key={l.id} className="flex gap-3"><div className="w-[64px] flex-none pt-1 text-[12px]"><b className="block text-ink">Tiết {l.period}</b><span className="text-muted">{l.start}</span></div><div className="min-w-0 flex-1"><Cell l={l} date={x.date} /></div></li>)}</ul>;
                  })()}
                </div>
              </Card>
              {d.canEdit && <ChangesList changes={d.changes} />}
              {d.canEdit && <LessonChangeDrawer schoolId={schoolId} today={ctx.today} target={edit ? { classId, className: d.options.classes.find(c => c.id === classId)?.name ?? "", date: edit.date, period: edit.lesson.period } : null} onClose={() => setEdit(null)} />}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

function ChangesList({ changes }: { changes: TT["changes"] }) {
  const { schoolId } = useClassroom();
  const ctx = useCtx();
  const [confirm, setConfirm] = useState<{ kind: "publish" | "delete"; ch: TT["changes"][number] } | null>(null);
  const [err, setErr] = useState<string>();
  const pub = useCommand((c, change: TT["changes"][number]) => classroomRepo.publishLessonChange(c, schoolId, change.id, change), { success: "Đã công bố thay đổi lịch", onSuccess: () => setConfirm(null), onError: (e) => setErr(e.message) });
  const del = useCommand((c, change: TT["changes"][number]) => classroomRepo.deleteDraftChange(c, schoolId, change.id, change), { success: "Đã xóa bản nháp", onSuccess: () => setConfirm(null), onError: (e) => setErr(e.message) });
  return (
    <Card>
      <CardHeader title="Thay đổi lịch của lớp" subtitle="Bản nháp chỉ nhân sự thấy; phụ huynh chỉ thấy thay đổi đã công bố" />
      {changes.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa có thay đổi nào.</p> : (
        <div className="table-wrap px-4 pb-4">
          <table className="table" style={{ minWidth: 760 }}>
            <thead><tr><th>Ngày / tiết</th><th>Loại</th><th>Nội dung</th><th>Lý do</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{fmtDate(c.date)} · Tiết {c.period}</td>
                  <td>{KIND[c.kind]}</td>
                  <td className="text-[13px]">{c.kind === "cancel" ? "Nghỉ tiết" : [c.subjectId && c.subject, c.teacherMembershipId && c.teacher, c.room && roomLabel(c.room)].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="max-w-[220px] text-[13px]">{c.reason}</td>
                  <td><Badge tone={PUBLICATION_STATUS[c.status].tone}>{PUBLICATION_STATUS[c.status].label}</Badge><span className="block text-[11.5px] text-muted">{c.createdByName}</span></td>
                  <td className="whitespace-nowrap">{c.status === "draft" && c.canEdit && c.date >= ctx.today && <>{c.canPublish && <Button size="sm" variant="secondary" icon={<Send className="size-3.5" />} onClick={() => { setErr(undefined); setConfirm({ kind: "publish", ch: c }); }}>Công bố</Button>} <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setErr(undefined); setConfirm({ kind: "delete", ch: c }); }}>Xóa nháp</Button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }} busy={pub.pending || del.pending} error={err}
        title={confirm?.kind === "publish" ? "Công bố thay đổi lịch" : "Xóa bản nháp đổi tiết"}
        object={confirm ? `${fmtDateLong(confirm.ch.date)} · Tiết ${confirm.ch.period} · ${KIND[confirm.ch.kind]}` : undefined}
        consequence={confirm?.kind === "publish" ? "Lịch lớp và lịch của giáo viên liên quan sẽ cập nhật; phụ huynh có quyền xem lịch sẽ thấy thay đổi. Hệ thống kiểm tra lại xung đột trước khi công bố." : "Bản nháp bị xóa, lịch giữ nguyên như trước."}
        confirmLabel={confirm?.kind === "publish" ? "Công bố" : "Xóa nháp"} variant={confirm?.kind === "delete" ? "danger" : "primary"}
        onConfirm={async () => { if (!confirm) return; if (confirm.kind === "publish") await pub.run(confirm.ch); else await del.run(confirm.ch); }} />
    </Card>
  );
}

