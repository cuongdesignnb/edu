"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Send, Trash2, Lock } from "lucide-react";
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
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { ErrorSummary, SelectField, TextArea } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { EmptyState, QueryState } from "@/components/ui/states";

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
          const Cell = ({ l, date }: { l: Lesson; date: string }) => {
            const past = date < ctx.today;
            const inner = (
              <>
                <span className="flex items-center gap-1.5"><span className="size-2 flex-none rounded-full" style={{ background: l.color }} aria-hidden /><b className={clsx("text-ink", l.cancelled && "line-through")}>{l.subject}</b></span>
                <span className="block text-muted">{l.teacher}{l.teacherStatus && l.teacherStatus !== "active" ? " (tạm khóa)" : ""}</span>
                <span className="block text-muted">{roomLabel(l.room)}</span>
                {l.changed && <span className={clsx("mt-1 block rounded px-1.5 py-0.5 text-[11.5px] font-semibold", l.cancelled ? "bg-neutral-bg text-neutral-text" : "bg-warning-bg text-warning-text")}>{l.cancelled ? "Nghỉ" : KIND[l.changed.kind as LessonChange["kind"]] ?? "Thay đổi"}: {l.changed.reason}</span>}
              </>
            );
            const cls = clsx("block w-full rounded-lg border px-2.5 py-2 text-left text-[12.5px]", l.cancelled ? "border-dashed border-line-strong bg-neutral-bg" : "border-line bg-white");
            return d.canEdit && !past ? <button type="button" className={clsx(cls, "hover:border-primary")} onClick={() => setEdit({ lesson: l, date })} aria-label={`Đổi tiết ${l.period} ${fmtDateLong(date)}: ${l.subject}`}>{inner}</button> : <div className={cls}>{inner}</div>;
          };
          return (
            <>
              {!d.canEdit && <Callout tone="neutral" icon={<Lock />}>Bạn xem lịch ở chế độ chỉ đọc. Đổi tiết do giáo viên chủ nhiệm hoặc giáo vụ thực hiện.</Callout>}
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
                        {PERIODS.map((p) => (
                          <tr key={p.period}>
                            <td className="align-top !px-3"><b className="text-ink">Tiết {p.period}</b><span className="block text-[12px] text-muted">{p.start} – {p.end}</span></td>
                            {d.days.map((x) => {
                              if (x.holiday) return p.period === 1 ? <td key={x.date} rowSpan={PERIODS.length} className="bg-neutral-bg text-center align-middle text-[13px] font-semibold text-neutral-text">Nghỉ: {x.holiday}</td> : null;
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
              {d.canEdit && <ChangeDrawer target={edit} onClose={() => setEdit(null)} options={d.options} />}
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
  const pub = useCommand((c, id: string) => classroomRepo.publishLessonChange(c, schoolId, id), { success: "Đã công bố thay đổi lịch", onSuccess: () => setConfirm(null), onError: (e) => setErr(e.message) });
  const del = useCommand((c, id: string) => classroomRepo.deleteDraftChange(c, schoolId, id), { success: "Đã xóa bản nháp", onSuccess: () => setConfirm(null), onError: (e) => setErr(e.message) });
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
                  <td className="text-[13px]">{c.kind === "cancel" ? "Nghỉ tiết" : [c.subjectId && c.subject, c.teacherMembershipId && c.teacher, c.roomId && roomLabel(c.room)].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="max-w-[220px] text-[13px]">{c.reason}</td>
                  <td><Badge tone={PUBLICATION_STATUS[c.status].tone}>{PUBLICATION_STATUS[c.status].label}</Badge><span className="block text-[11.5px] text-muted">{c.createdByName}</span></td>
                  <td className="whitespace-nowrap">{c.status === "draft" && c.date >= ctx.today && <><Button size="sm" variant="secondary" icon={<Send className="size-3.5" />} onClick={() => { setErr(undefined); setConfirm({ kind: "publish", ch: c }); }}>Công bố</Button> <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setErr(undefined); setConfirm({ kind: "delete", ch: c }); }}>Xóa nháp</Button></>}</td>
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
        onConfirm={async () => { if (!confirm) return; if (confirm.kind === "publish") await pub.run(confirm.ch.id); else await del.run(confirm.ch.id); }} />
    </Card>
  );
}

/** O25 — change a lesson from a date: live conflict check, save draft or publish (blocked on conflicts). */
function ChangeDrawer({ target, onClose, options }: { target: { lesson: Lesson; date: string } | null; onClose: () => void; options: TT["options"] }) {
  const { schoolId, classId } = useClassroom();
  const [kind, setKind] = useState<LessonChange["kind"]>("substitute");
  const [subjectId, setSubjectId] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { if (target) { setKind("substitute"); setSubjectId(""); setTeacher(""); setRoom(""); setReason(""); setErr({}); } }, [target]);
  const dirty = !!target && (!!subjectId || !!teacher || !!room || !!reason);
  useUnsavedChanges(dirty);
  const needTeacher = kind === "substitute" || kind === "swap";
  const needRoom = kind === "room";
  const input = useMemo(() => target ? { classId, date: target.date, period: target.lesson.period, teacherMembershipId: needTeacher && teacher ? teacher : undefined, roomId: (needRoom || kind === "swap") && room ? room : undefined } : null, [target, classId, teacher, room, needTeacher, needRoom, kind]);
  const conflicts = useRepo(["lesson-conflicts", input], (c) => classroomRepo.checkLessonChange(c, schoolId, input!), { enabled: !!input && (!!input.teacherMembershipId || !!input.roomId) });
  const list = input && (input.teacherMembershipId || input.roomId) ? conflicts.data ?? [] : [];
  const save = useCommand((c, publish: boolean) => classroomRepo.saveLessonChange(c, schoolId, {
    classId, date: target!.date, period: target!.lesson.period, kind, subjectId: kind === "swap" && subjectId ? subjectId : undefined,
    teacherMembershipId: needTeacher && teacher ? teacher : undefined, roomId: (needRoom || kind === "swap") && room ? room : undefined, reason, publish,
  }), {
    success: (r) => r.change.status === "published" ? "Đã công bố thay đổi tiết" : "Đã lưu nháp thay đổi tiết",
    onSuccess: () => onClose(),
    onError: (e) => setErr(e.fieldErrors ?? { form: e.message }),
  });
  const submit = (publish: boolean) => {
    const e: Record<string, string> = {};
    if (kind === "substitute" && !teacher) e.teacher = "Chọn giáo viên dạy thay";
    if (kind === "swap" && !subjectId && !teacher) e.subjectId = "Chọn môn hoặc giáo viên mới";
    if (kind === "room" && !room) e.room = "Chọn phòng mới";
    if (reason.trim().length < 5) e.reason = "Ghi lý do đổi tiết (tối thiểu 5 ký tự)";
    setErr(e);
    if (Object.keys(e).length) return;
    void save.run(publish);
  };
  const l = target?.lesson;
  return (
    <Drawer open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} title="Đổi tiết / lịch nghỉ" description={target ? `${fmtDateLong(target.date)} · Tiết ${l!.period} (${l!.start} – ${l!.end})` : undefined} width={500} busy={save.pending}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={save.pending}>Hủy</Button>
        <Button variant="secondary" loading={save.pending} onClick={() => submit(false)}>Lưu nháp</Button>
        <Button variant="primary" icon={<Send className="size-4" />} loading={save.pending} disabled={list.length > 0} onClick={() => submit(true)}>Công bố</Button>
      </>}>
      {target && l && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-[#f7fbff] p-3 text-sm"><p className="font-semibold text-ink">Hiện tại: {l.subject} · {l.teacher} · {roomLabel(l.room)}</p>{l.changed && <p className="text-warning-text">Đã có thay đổi: {l.changed.reason}</p>}</div>
          <ErrorSummary errors={err} labels={{ teacher: "Giáo viên", subjectId: "Môn", room: "Phòng", reason: "Lý do", date: "Ngày", period: "Tiết", form: "Lỗi" }} />
          <SelectField label="Loại thay đổi" value={kind} onChange={(e) => setKind(e.target.value as LessonChange["kind"])} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
          {kind === "swap" && <div data-field="subjectId"><SelectField label="Môn mới" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Giữ môn hiện tại" options={options.subjects.map((s) => ({ value: s.id, label: s.name }))} error={err.subjectId} /></div>}
          {needTeacher && <div data-field="teacher"><SelectField label={kind === "substitute" ? "Giáo viên dạy thay" : "Giáo viên mới"} required={kind === "substitute"} value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Chọn giáo viên…" options={options.teachers.filter((t) => t.id !== l.teacherMembershipId).map((t) => ({ value: t.id, label: t.name }))} error={err.teacher} /></div>}
          {(needRoom || kind === "swap") && <div data-field="room"><SelectField label="Phòng mới" required={needRoom} value={room} onChange={(e) => setRoom(e.target.value)} placeholder={needRoom ? "Chọn phòng…" : "Giữ phòng hiện tại"} options={options.rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} chỗ)` }))} error={err.room} /></div>}
          {kind === "cancel" && <Callout tone="warning">Tiết sẽ hiển thị “Nghỉ” trong lịch lớp và lịch giáo viên sau khi công bố.</Callout>}
          <div data-field="reason"><TextArea label="Lý do" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={err.reason} maxChars={200} /></div>
          <div aria-live="polite">
            {conflicts.isFetching ? <p className="text-[13px] text-muted">Đang kiểm tra xung đột…</p> : list.length > 0 ? (
              <Callout tone="danger" icon={<AlertTriangle />} title="Có xung đột — không thể công bố">
                <ul className="list-disc pl-4">{list.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
                <p className="mt-1">Bạn vẫn có thể lưu nháp để xử lý sau.</p>
              </Callout>
            ) : (input?.teacherMembershipId || input?.roomId) ? <Callout tone="success">Không có xung đột giáo viên/phòng ở tiết này.</Callout> : null}
          </div>
        </div>
      )}
    </Drawer>
  );
}

