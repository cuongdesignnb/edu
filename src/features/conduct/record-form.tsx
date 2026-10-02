"use client";
import { useMemo, useState } from "react";
import { Info, Link2, ShieldAlert, Copy } from "lucide-react";
import type {RuleItem,RuleEditorRule} from '@/lib/repositories/connected/conduct';
import type {ConductSource} from '@/lib/repositories/connected/conduct-workspace';
import { conductRepo, type Ctx, type RepoError } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtPoints } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateField, ErrorSummary, SelectField, TextArea, TextField } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { Points, RECORD_STATUS, RuleIcon } from "./shared";

export type RecordView = Awaited<ReturnType<typeof conductRepo.records>>["records"][number];
type Roster = { id: string; enrollmentId: string; fullName: string; code: string; startsOn:string; endsOn:string|null }[];

export interface RecordFormProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ruleSet: RuleItem;
  source:ConductSource;
  today:string;
  lessons:{id:string;date:string;subject:string;canRecord:boolean}[];
  records:RecordView[];
  roster: Roster;
  week: { startDate: string; endDate: string; index: number };
  studentId?: string;
  ruleId?: string;
  /** edit an own pending record (version-checked) */
  editing?: RecordView;
  onShowExisting?: (r: RecordView) => void;
  onSaved?: (studentId: string) => void;
}

const LABELS = { studentId: "Học sinh", date: "Ngày", ruleId: "Quy định", reason: "Nội dung sự việc", distinctNote: "Giải thích sự việc khác" };

function ruleOptions(rules: RuleEditorRule[]) {
  return rules.map((r) => ({ value: r.id, label: `${r.category} — ${r.label} (${fmtPoints(r.points)})${r.attendanceLink ? " · liên kết điểm danh" : ""}` }));
}

/** O17 — create / edit a conduct record. Mounted fresh for every opening so each opening has ONE requestId (NV-10). */
export function RecordDialog(props: RecordFormProps) {
  if (!props.open) return null;
  return <RecordDialogInner {...props} />;
}

function RecordDialogInner({ onOpenChange, ruleSet, roster, week, studentId, ruleId, editing, onShowExisting, onSaved,source,today,lessons,records }: RecordFormProps) {
  const { schoolId, yearId, classId } = useClassroom();
  const maxDate = week.endDate < today ? week.endDate : today;
  const initial = useMemo(() => ({
    studentId: editing?.studentId ?? studentId ?? "",
    date: editing?.date ?? (today >= week.startDate && today <= week.endDate ? today : maxDate),
    ruleId: editing?.ruleId ?? ruleId ?? "",
    reason: editing?.reason ?? "",
    lessonId:editing?.lessonId??'',
    manualDelta:editing?.points?.toString()??'',
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}`));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [dup, setDup] = useState<{ existing: RecordView; hard: boolean; message: string } | null>(null);
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const rule = ruleSet.rules.find((r) => r.id === form.ruleId);
  const student = roster.find((s) => s.id === form.studentId);

  const handleError = (e: RepoError) => {
    if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message });
    else if (e.code === "DUPLICATE") {
      const d = e.details as { existing: RecordView; hard: boolean } | undefined;
      if (d?.existing) setDup({ existing: d.existing, hard: !!d.hard, message: e.message });
      else {const existing=records.find(r=>r.studentId===form.studentId&&r.date===form.date&&r.ruleId===form.ruleId&&['pending_review','approved'].includes(r.status));if(existing)setDup({existing,hard:false,message:e.message});else setErrors({ form: e.message });}
    } else if (e.code === "CONFLICT") setConflict(e);
    else setErrors({ form: e.message });
  };

  const create = useCommand(
    (ctx: Ctx, input: Parameters<typeof conductRepo.createRecord>[4]) => conductRepo.createRecord(ctx, schoolId, yearId, classId, input),
    {
      success: (r) => (r.idempotent ? "Ghi nhận này đã được lưu trước đó — không tạo thêm" : "Đã lưu ghi nhận — trạng thái “Chờ rà soát”"),
      onError: handleError,
      onSuccess: (r) => { setDup(null); onSaved?.(r.record.studentId); onOpenChange(false); },
    },
  );
  const update = useCommand(
    (ctx: Ctx, patch: Parameters<typeof conductRepo.updateRecord>[5]) => conductRepo.updateRecord(ctx, schoolId, yearId, classId, editing!.id, patch),
    { success: "Đã cập nhật ghi nhận (vẫn chờ rà soát)", onError: handleError, onSuccess: () => { onSaved?.(editing!.studentId); onOpenChange(false); } },
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.studentId) e.studentId = "Chọn học sinh";
    if (!form.date) e.date = "Chọn ngày xảy ra sự việc";
    else if (form.date < week.startDate || form.date > maxDate) e.date = `Ngày trong tuần ${week.index}, không sau hôm nay`;
    if (!form.ruleId) e.ruleId = "Chọn quy định";
    if (form.reason.trim().length < 3) e.reason = "Ghi nội dung sự việc (tối thiểu 3 ký tự)";
    if(rule?.valueMode==='MANUAL'&&(!form.manualDelta.trim()||!Number.isFinite(Number(form.manualDelta))))e.manualDelta='Nhập điểm trong giới hạn nội quy';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (extra?: { confirmDistinct: boolean; distinctNote: string }) => {
    if (!validate()) return;
    const enrollment=roster.find(r=>r.id===form.studentId&&r.startsOn<=form.date&&(!r.endsOn||r.endsOn>form.date));if(!enrollment){setErrors({studentId:'Học sinh không thuộc lớp tại ngày đã chọn'});return;}
    const manualDelta=rule?.valueMode==='MANUAL'?Number(form.manualDelta):undefined;
    if (editing) await update.run({source, ruleId: form.ruleId, reason: form.reason, version: editing.version,manualDelta });
    else await create.run({source,enrollmentId:enrollment.enrollmentId,studentId: form.studentId, date: form.date, ruleId: form.ruleId, reason: form.reason, requestId,lessonId:form.lessonId||undefined,manualDelta, ...extra });
  };

  const busy = create.pending || update.pending;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })); };

  return (
    <>
      <Modal open onOpenChange={onOpenChange} busy={busy} size="md"
        title={editing ? "Sửa ghi nhận (chờ rà soát)" : "Ghi nhận thi đua"}
        description={editing ? "Chỉ sửa được ghi nhận của bạn khi chưa rà soát. Hệ thống kiểm tra phiên bản để không ghi đè thay đổi của người khác." : `Tuần ${week.index} · ${fmtDate(week.startDate)} – ${fmtDate(week.endDate)} · ${ruleSet.name} (bản ${ruleSet.versionNo})`}
        beforeClose={() => { if (dirty && !busy) { setAskDiscard(true); return false; } return true; }}
        footer={<>
          <Button variant="ghost" disabled={busy} onClick={() => (dirty ? setAskDiscard(true) : onOpenChange(false))}>Hủy</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()} data-testid="record-submit">{editing ? "Lưu thay đổi" : "Lưu ghi nhận"}</Button>
        </>}>
        <div className="space-y-4">
          {askDiscard && (
            <Callout tone="warning" title="Bỏ nội dung đang nhập?" action={<div className="flex flex-col gap-1.5 sm:flex-row"><Button size="sm" variant="ghost" onClick={() => setAskDiscard(false)}>Tiếp tục nhập</Button><Button size="sm" variant="danger-soft" onClick={() => onOpenChange(false)}>Bỏ nội dung</Button></div>}>
              Ghi nhận chưa được lưu.
            </Callout>
          )}
          <ErrorSummary errors={errors} labels={{ ...LABELS, form: "Lưu" }} />
          <div data-field="studentId">
            {editing ? (
              <div className="field"><span className="label">Học sinh</span><p className="font-semibold text-ink">{editing.studentName} · {editing.studentCode}</p></div>
            ) : (
              <Combobox label="Học sinh" required value={form.studentId} onChange={(v) => set("studentId", v as string)} error={errors.studentId}
                options={roster.map((s) => ({ value: s.id, label: s.fullName, hint: s.code }))} placeholder="Chọn học sinh trong lớp" />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="date">
              {editing ? <div className="field"><span className="label">Ngày</span><p className="font-semibold text-ink">{fmtDate(editing.date)}</p><p className="helper">Không đổi ngày của ghi nhận đã lưu.</p></div>
                : <DateField label="Ngày xảy ra" required value={form.date} min={week.startDate} max={maxDate} onChange={(v) => set("date", v ?? "")} error={errors.date} helper={`Trong tuần ${week.index}, không sau hôm nay`} />}
            </div>
            <div className="field">
              <span className="label">Điểm theo nội quy</span>
              <div className="flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-[#f7fbff] px-3">
                {rule ? <><RuleIcon icon={rule.icon} size={24} /><Points value={rule.points} /><span className="text-[12.5px] text-muted">bản {ruleSet.versionNo}</span></> : <span className="text-sm text-faint">Chọn quy định</span>}
              </div>
              <p className="helper">{rule?.valueMode==='MANUAL'?'Điểm trong giới hạn nội quy đã ban hành.':'Điểm lấy từ bộ nội quy, không nhập tay.'}</p>
            </div>
          </div>
          <div data-field="ruleId">
            <SelectField label="Quy định" required value={form.ruleId} onChange={(e) => set("ruleId", e.target.value)} error={errors.ruleId}
              options={ruleOptions(ruleSet.rules.filter(r=>!r.attendanceLink||editing?.ruleId===r.id))} placeholder="Chọn quy định" disabled={!!editing} />
          <p className="helper">{editing ? "Giữ quy định của ghi nhận đã lưu; có thể cập nhật nội dung và điểm thủ công theo nội quy." : ""}</p></div>
          {!editing && lessons.some(l=>l.date===form.date&&l.canRecord) && <SelectField label="Tiết học (khi ghi theo môn)" value={form.lessonId} onChange={e=>set('lessonId',e.target.value)} options={lessons.filter(l=>l.date===form.date&&l.canRecord).map(l=>({value:l.id,label:l.subject}))} placeholder="Ghi theo quyền chủ nhiệm / cả lớp" />}
          {rule?.valueMode==='MANUAL' && <TextField label="Điểm theo giới hạn nội quy" type="number" step="0.01" min={rule.minimumDelta??undefined} max={rule.maximumDelta??undefined} value={form.manualDelta} onChange={e=>set('manualDelta',e.target.value)} error={errors.manualDelta} required />}
          {rule?.attendanceLink && (
            <Callout tone="info" icon={<Link2 />}>
              Quy định này gắn với điểm danh. Nếu điểm danh đã ghi “{rule.attendanceLink === "late" ? "Đi muộn" : "Nghỉ không phép"}” cho em trong ngày này, hệ thống đã tự tạo ghi nhận và sẽ không trừ điểm lần hai.
            </Callout>
          )}
          <div data-field="reason">
            <TextArea label="Nội dung sự việc" required rows={3} maxChars={300} value={form.reason} onChange={(e) => set("reason", e.target.value)} error={errors.reason}
              placeholder="Ví dụ: Đến lớp lúc 07:12, tiết 1" />
          </div>
          <p className="flex items-start gap-2 text-[12.5px] text-muted"><Info className="mt-0.5 size-3.5 flex-none" aria-hidden />
            {editing ? `Phiên bản ghi nhận: ${editing.version}.` : <span>Ghi nhận được lưu ngay ở trạng thái “Chờ rà soát” (không có bước lưu tạm). Mã yêu cầu <code className="kbd">{requestId.slice(0, 8)}</code> giữ nguyên trong lần mở này: bấm lưu lại khi mạng chậm không tạo thêm ghi nhận.</span>}
          </p>
          {student && !editing && <p className="text-[12.5px] text-muted">Ghi cho: <b className="text-ink">{student.fullName}</b> ({student.code})</p>}
        </div>
      </Modal>
      <DuplicateDialog dup={dup} busy={create.pending} onClose={() => setDup(null)}
        onKeepOld={() => { setDup(null); onOpenChange(false); }}
        onShowExisting={dup && onShowExisting ? () => { const ex = dup.existing; setDup(null); onOpenChange(false); onShowExisting(ex); } : undefined}
        onDistinct={(note) => submit({ confirmDistinct: true, distinctNote: note })} noteError={errors.distinctNote} />
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={() => { setConflict(null); onOpenChange(false); }} mine={<p>{rule?.label} — {form.reason}</p>} />
    </>
  );
}

/** O18 — duplicate handling. Hard duplicates (from attendance) cannot be saved twice; soft ones need an explicit "different event" note. */
export function DuplicateDialog({ dup, busy, onClose, onKeepOld, onDistinct, onShowExisting, noteError }: {
  dup: { existing: RecordView; hard: boolean; message: string } | null; busy?: boolean; onClose: () => void; onKeepOld: () => void;
  onDistinct: (note: string) => void; onShowExisting?: () => void; noteError?: string;
}) {
  const [distinct, setDistinct] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const ex = dup?.existing;
  const short = note.trim().length < 5;
  const close = () => { setDistinct(false); setNote(""); setTouched(false); onClose(); };
  return (
    <Modal open={!!dup} onOpenChange={(o) => { if (!o) close(); }} busy={busy} size="md"
      title={dup?.hard ? "Sự việc đã được ghi từ điểm danh" : "Có thể trùng với ghi nhận đã có"}
      description={dup?.hard ? "Không trừ điểm hai lần cho cùng một sự việc." : "Không lưu hai lần cùng sự việc. Chọn cách xử lý bên dưới."}
      footer={dup?.hard ? <>
        {onShowExisting && <Button variant="secondary" onClick={() => { close(); onShowExisting(); }}>Xem ghi nhận đã có</Button>}
        <Button variant="primary" onClick={() => { close(); onKeepOld(); }}>Đã hiểu, không lưu</Button>
      </> : <>
        <Button variant="ghost" disabled={busy} onClick={() => { close(); onKeepOld(); }}>Hủy, giữ ghi nhận cũ</Button>
        {!distinct ? <Button variant="secondary" onClick={() => setDistinct(true)}>Đây là sự việc khác</Button>
          : <Button variant="primary" loading={busy} onClick={() => { setTouched(true); if (!short) onDistinct(note.trim()); }}>Lưu là sự việc khác</Button>}
      </>}>
      {ex && (
        <div className="space-y-3 text-sm">
          <div className="flex gap-2.5 text-body">{dup?.hard ? <ShieldAlert className="mt-0.5 size-4 flex-none text-danger" aria-hidden /> : <Copy className="mt-0.5 size-4 flex-none text-warning" aria-hidden />}<p>{dup?.message}</p></div>
          <div className="rounded-xl border border-line bg-[#f7fbff] p-3.5">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Ghi nhận đã có</p>
            <p className="font-semibold text-ink">{ex.studentName} · {ex.studentCode}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2"><span>{ex.ruleLabel}</span><Points value={ex.points} /><Badge tone={RECORD_STATUS[ex.status]?.tone}>{RECORD_STATUS[ex.status]?.label ?? ex.status}</Badge>{ex.fromAttendance && <Badge tone="info" dot={false}>Ghi từ điểm danh</Badge>}</p>
            <p className="mt-1 text-[12.5px] text-muted">Ngày {fmtDate(ex.date)} · ghi bởi {ex.createdByName ?? "—"} lúc {fmtDateTime(ex.createdAt)}</p>
            <p className="mt-1 text-[12.5px] text-body">“{ex.reason}”</p>
          </div>
          {dup?.hard ? (
            <p className="text-muted">Nếu điểm danh sai, hãy sửa ở màn hình điểm danh; ghi nhận thi đua liên kết sẽ đi theo sự việc gốc.</p>
          ) : distinct ? (
            <TextArea label="Vì sao đây là sự việc khác?" required rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              error={(touched && short ? "Giải thích tối thiểu 5 ký tự" : undefined) ?? noteError} placeholder="Ví dụ: Buổi chiều lại không mặc đồng phục khi chào cờ bổ sung" />
          ) : (
            <p className="text-muted">Nếu đây là cùng một sự việc, hãy giữ ghi nhận cũ. Chỉ chọn “Đây là sự việc khác” khi thật sự có hai sự việc riêng; lý do sẽ được lưu kèm để người rà soát kiểm tra.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
