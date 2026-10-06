"use client";
import {QuickActivity} from "@/features/forms/quick-activity";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, FileWarning, RotateCcw, XCircle } from "lucide-react";
import type { FileAsset } from "@/lib/model/types";
import { activitiesRepo, UPLOAD_LIMITS } from "@/lib/repositories";
import { useCommand,useCtx } from "@/lib/query/hooks";
import { fmtBytes, fmtDateTime } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout, InfoRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { ErrorSummary, SelectField, TextArea, Toggle } from "@/components/ui/form";
import { FileDropzone, FilePreview, downloadFileAsset } from "@/components/ui/file";
import { useUnsavedChanges } from "@/components/ui/guards";
import { useToast } from "@/components/ui/toast";
import { EVIDENCE_STATUS, SHARE_LABEL } from "./shared";
import {errorMessage} from '@/lib/repositories/errors';

export function DiscardBar({ onDiscard, onKeep, text = "Đóng hộp thoại sẽ bỏ tệp và ghi chú vừa chọn." }: { onDiscard: () => void; onKeep: () => void; text?: string }) {
  return (
    <Callout tone="warning" title="Bạn có nội dung chưa lưu">
      <p>{text}</p>
      <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onKeep}>Tiếp tục nhập</Button><Button size="sm" variant="danger-soft" onClick={onDiscard}>Bỏ thay đổi</Button></div>
    </Callout>
  );
}

/* ------------------------------ O27 — Ghi nhận minh chứng ------------------------------ */
export function RecordEvidenceDialog({ open, onOpenChange, activities, students, activityId: fixedActivity, studentId: fixedStudent }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  activities: { id: string; title: string; assigned: string[] }[];
  students: { id: string; fullName: string }[];
  activityId?: string; studentId?: string;
}) {
  const { schoolId, yearId, classId } = useClassroom();
  const ctx=useCtx(schoolId);
  const [activityId, setActivityId] = useState(fixedActivity ?? "");
  const [studentId, setStudentId] = useState(fixedStudent ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => { if (open) { setActivityId(fixedActivity ?? ""); setStudentId(fixedStudent ?? ""); setFile(null); setNote(""); setErrors({}); setAskDiscard(false); } }, [open, fixedActivity, fixedStudent]);
  const dirty = open && (!!file || !!note.trim() || (!fixedStudent && !!studentId));
  useUnsavedChanges(dirty);
  const [created,setCreated]=useState<{id:string;title:string;assigned:string[]}[]>([]);
  const available=[...activities,...created.filter(a=>!activities.some(x=>x.id===a.id))];
  const act = available.find((a) => a.id === activityId);
  useEffect(()=>{if(studentId&&act&&!act.assigned.includes(studentId))setStudentId('');},[act,studentId]);
  const options = useMemo(() => students.filter((s) => !act || act.assigned.includes(s.id)).map((s) => ({ value: s.id, label: s.fullName })), [students, act]);
  const cmd = useCommand((ctx, input: Parameters<typeof activitiesRepo.addEvidence>[4]) => activitiesRepo.addEvidence(ctx, schoolId, yearId, classId, input), {
    success: "Đã ghi nhận minh chứng — chờ duyệt",
    onError: (e) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); },
  });
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!activityId) errs.activityId = "Chọn hoạt động";
    if (!studentId) errs.studentId = "Chọn học sinh";
    if (!file) errs.file = "Chọn tệp ảnh hoặc PDF";
    if (note.length > 500) errs.note = "Ghi chú tối đa 500 ký tự";
    setErrors(errs);
    if (Object.keys(errs).length || !file) return;
    const r = await cmd.run({ activityId, studentId, file: { name: file.name, type: file.type, size: file.size, blob: file }, note: note.trim() || undefined });
    if (r) onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" busy={cmd.pending} title="Ghi nhận minh chứng"
      description="Giáo viên ghi nhận minh chứng nhận được từ học sinh. Phụ huynh không tải tệp lên hệ thống."
      beforeClose={() => { if (dirty) { setAskDiscard(true); return false; } return true; }}
      footer={<><Button variant="ghost" onClick={() => (dirty ? setAskDiscard(true) : onOpenChange(false))} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Ghi nhận</Button></>}>
      <div className="space-y-4" data-testid="record-evidence">
        {askDiscard && <DiscardBar onKeep={() => setAskDiscard(false)} onDiscard={() => { setAskDiscard(false); setFile(null); setNote(""); onOpenChange(false); }} />}
        <ErrorSummary errors={errors} labels={{ activityId: "Hoạt động", studentId: "Học sinh", file: "Tệp", note: "Ghi chú", form: "Biểu mẫu" }} />
        {fixedActivity ? (
          <InfoRow label="Hoạt động">{act?.title ?? "—"}</InfoRow>
        ) : (
          <div data-field="activityId"><SelectField label="Hoạt động" labelAction={<QuickActivity onCreated={async row=>{const detail=await activitiesRepo.detail(ctx,schoolId,yearId,classId,row.id);if(detail.activity.status==='draft'||detail.activity.status==='closed')throw new Error("Đã lưu hoạt động. Giao hoạt động trước khi ghi nhận minh chứng.");setCreated(old=>[...old,{id:row.id,title:detail.activity.title,assigned:detail.activity.assignedStudentIds}]);setActivityId(row.id);setStudentId('');}}/>} required value={activityId} placeholder="Chọn hoạt động" error={errors.activityId}
            options={available.map((a) => ({ value: a.id, label: a.title }))} onChange={(e) => { setActivityId(e.target.value); setStudentId(""); }} /></div>
        )}
        <div data-field="studentId">
          <Combobox label="Học sinh" required value={studentId} onChange={(v) => setStudentId(String(v))} options={options} error={errors.studentId} disabled={!!fixedStudent || (!fixedActivity && !activityId)}
            helper={act ? `Chỉ học sinh được giao hoạt động này (${act.assigned.length} em).` : "Chọn hoạt động trước."} placeholder="Tìm học sinh…" />
        </div>
        <div data-field="file">
          <p className="label mb-1.5">Tệp minh chứng<span className="req" aria-hidden>*</span></p>
          {file ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{file.name}</span>
              <span className="text-muted">{fmtBytes(file.size)}</span>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Chọn tệp khác</Button>
            </div>
          ) : (
            <FileDropzone accept={UPLOAD_LIMITS.types} maxBytes={UPLOAD_LIMITS.maxBytes} onFiles={(f) => { setFile(f[0] ?? null); setErrors((e) => ({ ...e, file: "" })); }}
              label="Kéo thả ảnh hoặc PDF vào đây" hint={`Ảnh PNG/JPEG/WebP hoặc PDF, tối đa ${fmtBytes(UPLOAD_LIMITS.maxBytes)}.`} error={errors.file || undefined} />
          )}
          <p className="mt-1.5 text-[12.5px] text-muted">Tệp được tải lên kho riêng của trường và kiểm tra trước khi ghi nhận.</p>
        </div>
        <TextArea label="Ghi chú của giáo viên" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxChars={500} error={errors.note} helper="Ví dụ: nguồn nhận minh chứng, nội dung cần lưu ý." />
        <p className="text-[12.5px] text-muted">Minh chứng mới ở trạng thái “Chờ duyệt”. Hoàn thành hoạt động không tự cộng điểm thi đua.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------ Duyệt / từ chối / yêu cầu bổ sung ------------------------------ */
export type ReviewDecision = "approved" | "rejected" | "supplement";

export function ReviewEvidenceDialog({ open, onOpenChange, evidenceIds, evidenceVersions, decision, subject, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; evidenceIds: string[]; evidenceVersions:Record<string,number>; decision: ReviewDecision; subject: string; onDone?: () => void;
}) {
  const { schoolId, yearId, classId } = useClassroom();
  const ctx=useCtx(schoolId);
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [error, setError] = useState<string>();
  const [versions,setVersions]=useState(evidenceVersions);
  useEffect(() => { if (open) { setNote(""); setShare(false); setError(undefined); setVersions({...evidenceVersions}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = useCommand((ctx, input: Parameters<typeof activitiesRepo.reviewEvidence>[4]) => activitiesRepo.reviewEvidence(ctx, schoolId, yearId, classId, input), {
    success: (n) => (decision === "approved" ? `Đã duyệt ${n} minh chứng` : decision === "rejected" ? `Đã từ chối ${n} minh chứng` : `Đã yêu cầu bổ sung ${n} minh chứng`),
    onError: (e) => { if (e.code === "VALIDATION") setError(e.fieldErrors?.note ?? e.message); },
  });
  const title = decision === "approved" ? "Duyệt minh chứng" : decision === "rejected" ? "Từ chối minh chứng" : "Yêu cầu bổ sung minh chứng";
  const submit = async () => {
    if (decision !== "approved" && note.trim().length < 5) { setError("Ghi lý do (tối thiểu 5 ký tự)"); return; }
    const r = await cmd.run({ evidenceIds,versions, decision, note: note.trim() || undefined, shareWithParent: decision === "approved" && share });
    if (r !== undefined) { onOpenChange(false); onDone?.(); }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" busy={cmd.pending} title={title}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button>
        <Button variant={decision === "approved" ? "success" : decision === "rejected" ? "danger" : "primary"} loading={cmd.pending} onClick={submit}
          icon={decision === "approved" ? <CheckCircle2 className="size-4" /> : decision === "rejected" ? <XCircle className="size-4" /> : <RotateCcw className="size-4" />}>{decision === "approved" ? "Duyệt" : decision === "rejected" ? "Từ chối" : "Gửi yêu cầu bổ sung"}</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 font-semibold text-ink">{subject}</div>
        {decision === "approved" ? (
          <>
            <Toggle checked={share} onChange={setShare} label={evidenceIds.length > 1 ? "Chia sẻ với phụ huynh của từng em" : "Chia sẻ với phụ huynh của em này"}
              description="Chỉ phụ huynh đúng học sinh thấy tệp sau khi công bố lại hoạt động. Không có thư viện ảnh chung của lớp." />
            <TextArea label="Nhận xét (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxChars={300} />
            <p className="text-[12.5px] text-muted">Duyệt minh chứng cập nhật tình trạng hoạt động thành “Đã duyệt”, không tự cộng điểm thi đua.</p>
          </>
        ) : (
          <TextArea label={decision === "rejected" ? "Lý do từ chối" : "Nội dung cần bổ sung"} required value={note} onChange={(e) => { setNote(e.target.value); setError(undefined); }} rows={3} maxChars={300} error={error} />
        )}
        {decision === "approved" && error && <p className="error-text" role="alert">{error}</p>}
        {cmd.error?.code!=='VALIDATION'&&cmd.error&&<p className="error-text" role="alert">{cmd.error.message}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------ O28 — Xem tệp / ảnh ------------------------------ */
export function FileViewerDialog({ open, onOpenChange, file, meta, actions }: {
  open: boolean; onOpenChange: (o: boolean) => void; file?: FileAsset | null;
  meta?: { label: string; value: ReactNode }[]; actions?: ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const revoked = !!file&&file.status!=='active';
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={file?.name ?? "Xem tệp"} description="Xem trước tệp của lớp — chỉ nhân sự có quyền của lớp mới mở được."
      footer={<>
        {actions}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Đóng</Button>
        {file && !revoked && <Button variant="primary" icon={<Download className="size-4" />} loading={busy} onClick={async () => {
          setBusy(true);
          try{await downloadFileAsset(file);}catch(error){toast.push({tone:'error',title:'Không tải được tệp',detail:errorMessage(error)});}finally{setBusy(false);}
        }}>Tải xuống</Button>}
      </>}>
      {file ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <FilePreview file={file} revoked={revoked} className="min-h-[220px]" />
          <dl className="text-sm">
            <InfoRow label="Loại">{file.mime}</InfoRow>
            <InfoRow label="Dung lượng">{fmtBytes(file.size)}</InfoRow>
            <InfoRow label="Tải lên lúc">{fmtDateTime(file.createdAt)}</InfoRow>
            <InfoRow label="Chia sẻ">{SHARE_LABEL[file.share] ?? file.share}</InfoRow>
            <InfoRow label="Lưu trữ">{file.source.kind === 'staff_api'?'Kho tệp riêng của trường':file.source.kind === "blob" ? "Trên trình duyệt này (mô phỏng)" : "Tệp minh họa của bản demo"}</InfoRow>
            {meta?.map((m) => <InfoRow key={m.label} label={m.label}>{m.value}</InfoRow>)}
          </dl>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted"><FileWarning className="size-7" aria-hidden /><p>Không tìm thấy tệp.</p></div>
      )}
    </Modal>
  );
}

export function EvidenceStatusBadge({ status }: { status: string }) {
  const s = EVIDENCE_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
