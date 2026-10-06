"use client";
import { useEffect, useState } from "react";
import { classroomRepo } from "@/lib/repositories";
import { teacherExtraRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { DateField, ErrorSummary, RadioGroup, SelectField, TextArea } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { inclusiveDate } from "@/lib/api/dates";

/** O23 quick — move one student to another group from an effective date. */
export function ChangeGroupDialog({ open, onOpenChange, schoolId, yearId, classId, expectedClassVersion, student, groups }: {
  open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; yearId: string; classId: string; expectedClassVersion:number;
  student: { id: string; fullName: string; groupId?: string } | null; groups: { id: string; name: string }[];
}) {
  const ctx = useCtx();
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState<string | undefined>(ctx.today);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setGroupId(student?.groupId ?? ""); setDate(ctx.today); setErr({}); } }, [open, student, ctx.today]);
  const dirty = open && (groupId !== (student?.groupId ?? "") || date !== ctx.today);
  useUnsavedChanges(dirty);
  const cmd = useCommand((c, input: Parameters<typeof classroomRepo.setGroup>[3]) => classroomRepo.setGroup(c, schoolId, classId, input), {
    success: "Đã đổi tổ", onSuccess: () => onOpenChange(false), onError: (e) => setErr(e.fieldErrors ?? (e.code === "VALIDATION" ? { groupId: e.message } : {})),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!date) e.effectiveDate = "Chọn ngày hiệu lực";
    if (groupId === (student?.groupId ?? "")) e.groupId = "Tổ mới trùng với tổ hiện tại";
    setErr(e);
    if (Object.keys(e).length || !student || !date) return;
    void cmd.run({ yearId, expectedClassVersion, studentIds: [student.id], groupId: groupId || null, effectiveDate: date });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Đổi tổ" description={student ? `Học sinh: ${student.fullName}` : undefined} size="sm" busy={cmd.pending}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Lưu</Button></>}>
      <div className="space-y-4">
        <ErrorSummary errors={err} labels={{ groupId: "Tổ", effectiveDate: "Ngày hiệu lực" }} />
        <div data-field="groupId"><SelectField label="Tổ mới" required value={groupId} onChange={(e) => setGroupId(e.target.value)} error={err.groupId} options={[{ value: "", label: "Chưa phân tổ" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} /></div>
        <div data-field="effectiveDate"><DateField label="Áp dụng từ ngày" required value={date} onChange={setDate} min={ctx.today} error={err.effectiveDate} /></div>
        <p className="text-[12.5px] text-muted">Lịch sử tổ cũ được giữ. Nếu học sinh đang là tổ trưởng, chức vụ này kết thúc khi rời tổ.</p>
      </div>
    </Modal>
  );
}

/** O11 — request a class transfer / leave (homeroom → school approves). History is never deleted. */
export function TransferDialog({ open, onOpenChange, schoolId, yearId, classId, preset }: {
  open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; yearId: string; classId: string;
  students: { id: string; fullName: string; code: string }[]; preset?: string | null;
}) {
  const ctx = useCtx();
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<"transfer" | "leave">("transfer");
  const [to, setTo] = useState("");
  const [date, setDate] = useState<string | undefined>(ctx.today);
  const [reason, setReason] = useState("");
  const targets = useRepo(["transfer-targets", schoolId, yearId, classId, date], (c) => teacherExtraRepo.transferTargets(c, schoolId, yearId, classId, date), { enabled: open&&!!date });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setStudentId(preset ?? ""); setKind("transfer"); setTo(""); setDate(ctx.today); setReason(""); setErr({}); } }, [open, preset, ctx.today]);
  const dirty = open && (!!reason || !!to || kind !== "transfer" || (!preset && !!studentId));
  useUnsavedChanges(dirty);
  const cmd = useCommand((c, input: Parameters<typeof classroomRepo.requestTransfer>[2]) => classroomRepo.requestTransfer(c, schoolId, input), {
    success: "Đã gửi đề nghị — chờ nhà trường duyệt", onSuccess: () => onOpenChange(false), onError: (e) => setErr(e.fieldErrors ?? (e.code === "VALIDATION" ? { studentId: e.message } : {})),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!studentId) e.studentId = "Chọn học sinh";
    if (kind === "transfer" && !to) e.toClassId = "Chọn lớp đích";
    if (!date) e.effectiveDate = "Chọn ngày hiệu lực";
    if (reason.trim().length < 5) e.reason = "Nêu lý do (tối thiểu 5 ký tự)";
    setErr(e);
    if (Object.keys(e).length || !date) return;
    if(targets.isError||targets.isFetching||!targets.data)return;
    const selected=targets.data.students.find(s=>s.id===studentId);
    if(!selected){setErr({studentId:'Học sinh không còn thuộc quá trình có thể chuyển tại ngày này.'});return;}
    if(kind==='transfer'&&!targets.data.targets.some(t=>t.id===to)){setErr({toClassId:'Chọn lớp nhận từ nguồn hiện tại.'});return;}
    void cmd.run({ studentId,enrollmentId:selected.enrollmentId,expectedEnrollmentVersion:selected.enrollmentVersion,kind,toClassId:kind==='transfer'?to:undefined,effectiveDate:date,reason });
  };
  const choices=targets.isError||targets.isFetching?undefined:targets.data;
  useEffect(() => {
    if (!choices) return;
    if (!preset && studentId && !choices.students.some(s => s.id === studentId)) setStudentId("");
    if (to && !choices.targets.some(t => t.id === to)) setTo("");
  }, [choices, preset, studentId, to]);
  const s = choices?.students.find((x) => x.id === studentId);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Đề nghị chuyển lớp / ngừng theo học" size="md" busy={cmd.pending}
      description="Đề nghị được gửi nhà trường duyệt. Lớp cũ, điểm danh và thi đua đã có vẫn được giữ nguyên."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} disabled={!choices} onClick={submit}>Gửi đề nghị</Button></>}>
      <div className="space-y-4">
        <ErrorSummary errors={err} labels={{ studentId: "Học sinh", toClassId: "Lớp đích", effectiveDate: "Ngày hiệu lực", reason: "Lý do" }} />
        {targets.isError?<ErrorState compact error={targets.error} onRetry={()=>void targets.refetch()} />:targets.isFetching?<Skeleton className="h-16" />:null}
        <div data-field="studentId">
          {preset ? <p className="rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 text-sm font-semibold text-ink">{s?`${s.fullName} · ${s.studentCode}`:choices?'Học sinh không còn đủ điều kiện tại ngày này.':'Đang xác nhận học sinh theo ngày hiệu lực…'}</p>
            : <SelectField label="Học sinh" required value={studentId} onChange={(e) => setStudentId(e.target.value)} error={err.studentId} placeholder="Chọn học sinh…" disabled={!choices} options={choices?.students.map(x=>({value:x.id,label:`${x.fullName} (${x.studentCode})`}))??[]} />}
          {preset && err.studentId && <p className="error-text mt-1">{err.studentId}</p>}
        </div>
        <RadioGroup label="Loại đề nghị" direction="row" value={kind} onChange={k => {setKind(k);setTo("");}} options={[{ value: "transfer", label: "Chuyển sang lớp khác" }, { value: "leave", label: "Ngừng theo học" }]} />
        {kind === "transfer" && (
          <div data-field="toClassId"><SelectField label="Lớp đích (cùng năm học)" required value={to} onChange={(e) => setTo(e.target.value)} error={err.toClassId} placeholder={targets.isLoading ? "Đang tải…" : "Chọn lớp…"}
            disabled={!choices} options={choices?.targets.map(t=>({value:t.id,label:`${t.name} — ${t.size}${t.capacity===null?'':`/${t.capacity}`} học sinh`,disabled:t.capacity!==null&&t.size>=t.capacity}))??[]} /></div>
        )}
        <div data-field="effectiveDate"><DateField label="Ngày hiệu lực" required value={date} onChange={v => {setDate(v);setTo("");if(!preset)setStudentId("");}} min={ctx.today} max={choices?inclusiveDate(choices.endsOn):undefined} error={err.effectiveDate} /></div>
        <div data-field="reason"><TextArea label="Lý do" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={err.reason} maxChars={300} /></div>
        <Callout tone="neutral">Đây là đề nghị. Nhà trường duyệt mới thay đổi lớp; hồ sơ và lịch sử ở lớp {"hiện tại"} không bị xóa.</Callout>
      </div>
    </Modal>
  );
}
