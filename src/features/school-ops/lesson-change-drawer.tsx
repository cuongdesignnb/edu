"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Save, Send, CalendarClock, Info } from "lucide-react";
import type { LessonChange } from "@/lib/model/types";
import { classroomRepo, type RepoError } from "@/lib/repositories";
import { schoolOpsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateLong } from "@/lib/formatters";
import { PERIODS } from "@/lib/domain/timetable";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { DateField, ErrorSummary, RadioGroup, SelectField, TextArea } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

export interface LessonTarget { classId: string; className: string; date: string; period: number }
type Kind = LessonChange["kind"];
const KIND_LABEL: Record<Kind, string> = { swap: "Đổi môn / giáo viên", substitute: "Dạy thay", room: "Đổi phòng", cancel: "Nghỉ tiết (hủy)" };
export { KIND_LABEL as LESSON_KIND_LABEL };

/** O25 — lesson change with live conflict check; effective for the chosen date only, past lessons never rewritten. */
export function LessonChangeDrawer({ schoolId, target, today, onClose }: { schoolId: string; target: LessonTarget | null; today: string; onClose: () => void }) {
  return target ? <Inner key={`${target.classId}-${target.date}-${target.period}`} schoolId={schoolId} target={target} today={today} onClose={onClose} /> : null;
}

function Inner({ schoolId, target, today, onClose }: { schoolId: string; target: LessonTarget; today: string; onClose: () => void }) {
  const [date, setDate] = useState<string | undefined>(target.date < today ? today : target.date);
  const [period, setPeriod] = useState(target.period);
  const [kind, setKind] = useState<Kind>("substitute");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [askClose, setAskClose] = useState(false);
  const slot = useRepo(["lesson-slot", schoolId, target.classId, date, period], (c) => schoolOpsRepo.lessonSlot(c, schoolId, target.classId, date ?? today, period), { enabled: !!date });
  const prefilled = useRef("");
  useEffect(() => {
    const dr = slot.data?.draft;
    const key = `${date}-${period}`;
    if (!dr || prefilled.current === key) return;
    prefilled.current = key;
    setKind(dr.kind); setSubjectId(dr.subjectId ?? ""); setTeacherId(dr.teacherMembershipId ?? ""); setRoomId(dr.roomId ?? ""); setReason(dr.reason);
  }, [slot.data,date,period]);
  const needTeacher = kind === "swap" || kind === "substitute";
  const needSubject = kind === "swap";
  const needRoom = kind === "room";
  const shouldCheck = !!date && kind !== "cancel" && ((needTeacher && !!teacherId) || (needRoom && !!roomId) || (needSubject && !!subjectId));
  const check = useRepo(["lesson-check", schoolId, target.classId, date, period, needTeacher ? teacherId : "", needRoom ? roomId : "",needSubject ? subjectId : ""],
    (c) => classroomRepo.checkLessonChange(c, schoolId, { classId: target.classId, date: date!, period, teacherMembershipId: needTeacher && teacherId ? teacherId : undefined, roomId: needRoom && roomId ? roomId : undefined,subjectId:needSubject && subjectId ? subjectId : undefined }),
    { enabled: shouldCheck });
  const conflicts = kind === "cancel" ? [] : check.data ?? [];
  const dirty = !!(reason || teacherId || subjectId || roomId || date !== target.date || period !== target.period);
  const save = useCommand((ctx, publish: boolean) => classroomRepo.saveLessonChange(ctx, schoolId, {
    classId: target.classId, date: date!, period, kind, subjectId: needSubject ? subjectId || undefined : undefined, teacherMembershipId: needTeacher ? teacherId || undefined : undefined, roomId: needRoom ? roomId || undefined : undefined, reason, publish,source:slot.data?.lesson?.source,expectedPublicationId:slot.data?.publicationId,
  }), {
    success: (r) => r.change.status === "published" ? "Đã công bố đổi tiết" : "Đã lưu nháp đổi tiết (chưa hiển thị cho lớp/phụ huynh)",
    onSuccess: () => onClose(),
    onError: (e: RepoError) => { setErrors(e.fieldErrors ?? { form: e.message }); },
  });
  const validate = () => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Chọn ngày áp dụng";
    else if (date < today) e.date = "Không đổi lịch của ngày đã qua";
    if (!slot.data?.lesson) e.period = "Không có tiết này trong lịch ngày đã chọn";
    if (needTeacher && !teacherId) e.teacher = "Chọn giáo viên";
    if (needSubject && !subjectId) e.subject = "Chọn môn";
    if (needRoom && !roomId) e.room = "Chọn phòng";
    if (reason.trim().length < 5) e.reason = "Ghi lý do đổi tiết (tối thiểu 5 ký tự)";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const submit = (publish: boolean) => { if (validate()) void save.run(publish); };
  const s = slot.data;
  return (
    <>
      <Drawer open onOpenChange={(o) => !o && onClose()} busy={save.pending} beforeClose={() => { if (dirty) { setAskClose(true); return false; } return true; }} width={520}
        title="Đổi tiết" description={`Lớp ${target.className} — chỉ áp dụng cho ngày được chọn`}
        footer={<>
          <Button variant="ghost" onClick={() => (dirty ? setAskClose(true) : onClose())} disabled={save.pending}>Hủy</Button>
          <Button icon={<Save className="size-4" />} loading={save.pending} disabled={!s?.lesson?.canEdit || slot.isFetching || !!slot.error} onClick={() => submit(false)}>Lưu nháp</Button>
          {s?.canPublish && <Button variant="primary" icon={<Send className="size-4" />} disabled={save.pending || !s.lesson?.canEdit || slot.isFetching || !!slot.error || conflicts.length > 0 || shouldCheck && (check.isFetching || !!check.error)} onClick={() => submit(true)} title={conflicts.length ? "Còn xung đột — không thể công bố" : undefined}>Công bố</Button>}
        </>}>
        <div className="space-y-4">
          <ErrorSummary errors={errors} labels={{ date: "Ngày", period: "Tiết", teacher: "Giáo viên", subject: "Môn", room: "Phòng", reason: "Lý do", form: "Biểu mẫu" }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div data-field="date"><DateField label="Ngày áp dụng" required value={date} min={today} onChange={(v) => { setDate(v); setErrors({}); }} error={errors.date} helper={date ? fmtDateLong(date) : undefined} /></div>
            <div data-field="period"><SelectField label="Tiết" required value={String(period)} onChange={(e) => { setPeriod(Number(e.target.value)); setErrors({}); }} error={errors.period}
              options={[...PERIODS.map((p) => ({ value: String(p.period), label: `Tiết ${p.period} (${p.start}–${p.end})` })),...(!PERIODS.some(p => p.period === period) ? [{value:String(period),label:`Tiết ${period}${s?.start ? ` (${s.start}–${s.end})` : ""}`}] : [])]} /></div>
          </div>
          <div className="rounded-xl border border-line bg-[#f7fbff] px-4 py-3 text-sm">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Tiết hiện tại (đã công bố)</p>
            {slot.isLoading ? <Skeleton className="mt-2 h-10" /> : slot.error ? <p className="mt-1 text-danger-text">{slot.error.message}</p> : s?.lesson ? (
              <p className="mt-1 text-ink"><b>{s.lesson.subject}</b> · {s.lesson.teacher} · Phòng {s.lesson.room}{s.lesson.cancelled ? " · đang nghỉ tiết" : ""}{s.lesson.changed ? ` · đã đổi: ${s.lesson.changed.reason}` : ""}</p>
            ) : <p className="mt-1 text-warning-text">Không có tiết {period} trong lịch ngày này.</p>}
            {s?.draft && <p className="mt-1 text-[12.5px] text-warning-text">Đã có bản nháp đổi tiết cho ô này — lưu mới sẽ thay bản nháp đó.</p>}
          </div>
          <RadioGroup label="Loại thay đổi" value={kind} onChange={(v) => { setKind(v); setErrors({}); }} direction="row" options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          {needSubject && <div data-field="subject"><SelectField label="Môn thay" required value={subjectId} placeholder="Chọn môn" onChange={(e) => setSubjectId(e.target.value)} error={errors.subject} options={(s?.options.subjects ?? []).map((x) => ({ value: x.id, label: x.name }))} /></div>}
          {needTeacher && <div data-field="teacher"><SelectField label={kind === "substitute" ? "Giáo viên dạy thay" : "Giáo viên"} required value={teacherId} placeholder="Chọn giáo viên" onChange={(e) => setTeacherId(e.target.value)} error={errors.teacher} options={(s?.options.teachers ?? []).filter((t) => t.id !== s?.lesson?.teacherMembershipId || kind === "swap").map((x) => ({ value: x.id, label: x.name }))} /></div>}
          {needRoom && <div data-field="room"><SelectField label="Phòng mới" required value={roomId} placeholder="Chọn phòng" onChange={(e) => setRoomId(e.target.value)} error={errors.room} options={(s?.options.rooms ?? []).filter((r) => r.id !== s?.lesson?.roomId).map((x) => ({ value: x.id, label: x.name }))} /></div>}
          <div aria-live="polite">
            {kind === "cancel" ? <Callout tone="info" icon={<Info />}>Tiết sẽ hiển thị “Nghỉ tiết” trong lịch lớp và lịch phụ huynh sau khi công bố.</Callout>
              : check.isFetching ? <Skeleton className="h-12" />
              : shouldCheck && check.error ? <Callout tone="danger">Không kiểm tra được xung đột: {check.error.message}</Callout>
              : conflicts.length ? <Callout tone="danger" icon={<AlertTriangle />} title="Phát hiện xung đột">{<ul className="list-disc pl-5">{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}<p className="mt-1">Có thể lưu nháp để xử lý sau; không công bố được khi còn xung đột.</p></Callout>
              : (needTeacher && teacherId) || (needRoom && roomId) ? <Callout tone="success" icon={<CheckCircle2 />}>Không có xung đột giáo viên/phòng ở tiết này.</Callout> : null}
          </div>
          <div data-field="reason"><TextArea label="Lý do" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder="Ví dụ: Thầy Hùng dự tập huấn — cô Hòa dạy thay" /></div>
          <p className="flex gap-2 text-[12.5px] text-muted"><CalendarClock className="mt-0.5 size-4 flex-none" aria-hidden />Thay đổi chỉ có hiệu lực cho ngày/tiết đã chọn; lịch các ngày đã qua không bị ghi đè. Bản nháp chưa hiển thị cho giáo viên và phụ huynh.</p>
        </div>
      </Drawer>
      <ConfirmDialog open={askClose} onOpenChange={setAskClose} title="Bỏ thay đổi chưa lưu?" object={`Đổi tiết lớp ${target.className}`} confirmLabel="Bỏ thay đổi" variant="danger"
        consequence="Nội dung đang nhập trong biểu mẫu đổi tiết sẽ mất. Lịch hiện tại không thay đổi." onConfirm={() => { setAskClose(false); onClose(); }} />
    </>
  );
}
