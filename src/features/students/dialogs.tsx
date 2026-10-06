"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldOff, Info } from "lucide-react";
import type { GuardianRelationship } from "@/lib/model/types";
import { teacherExtraRepo, studentsRepo } from "@/lib/repositories";
import { studentsExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, verificationStatus } from "@/lib/formatters";
import { Modal, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Checkbox, DateField, ErrorSummary, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton, ErrorState, QueryState } from "@/components/ui/states";
import { SchoolSourceState } from "@/features/school-org/common";
import { ConflictDialog } from "@/components/ui/guards";
import { RELATIONS, fieldErrorsOf } from "./shared";
import type {ParentRevokeSource} from '@/lib/repositories/connected/parent-access';

/** First close attempt with unsaved input shows a warning; the second closes (O32 inside dialogs). */
function useDirtyClose(dirty: boolean, open: boolean) {
  const [warn, setWarn] = useState(false);
  useEffect(() => { if (!open) setWarn(false); }, [open]);
  useEffect(() => { if (!dirty) setWarn(false); }, [dirty]);
  const beforeClose = () => { if (dirty && !warn) { setWarn(true); return false; } return true; };
  const banner = warn ? <Callout tone="warning" icon={<AlertTriangle />} title="Bạn có thay đổi chưa lưu">Đóng lần nữa để bỏ thay đổi, hoặc bấm Lưu để giữ lại.</Callout> : null;
  return { beforeClose, banner };
}

/* ------------------------------ O09 — add / edit guardian ------------------------------ */
export interface GuardianEditTarget { guardianId: string; relationshipId: string; fullName?: string; relation?: string; phoneMasked?: string | null; email?: string | null; isPrimaryContact?: boolean }
type GuardianSource = Awaited<ReturnType<typeof studentsExtraRepo.guardianForm>>;
type GuardianProps = {open:boolean;onOpenChange:(o:boolean)=>void;schoolId:string;studentId:string;studentName:string;existing?:GuardianEditTarget|null;onSaved?:()=>void|Promise<void>};

export function GuardianDialog(props:GuardianProps) {
  const {schoolId,studentId,existing,open}=props;
  const q=useRepo(["guardian-form",schoolId,studentId,existing?.relationshipId],c=>studentsExtraRepo.guardianForm(c,schoolId,studentId,existing?.relationshipId),{enabled:open});
  if(!q.data || q.error && q.error.code!=="READ_ERROR")return <Modal open={open} onOpenChange={props.onOpenChange} title={existing?"Sửa người giám hộ":"Thêm người giám hộ"}><QueryState query={q} skeleton="form">{()=>null}</QueryState></Modal>;
  return <SchoolSourceState query={q}>{source=><GuardianBody key={`${studentId}:${existing?.relationshipId??'new'}`} {...props} current={source} reload={async()=>(await q.refetch()).data}/>}</SchoolSourceState>;
}

function GuardianBody({open,onOpenChange,schoolId,studentId,studentName,existing,current,reload,onSaved}:GuardianProps&{current:GuardianSource;reload:()=>Promise<GuardianSource|undefined>}) {
  const [source,setSource]=useState(current);
  const snapshot=(view:GuardianSource)=>({fullName:view.target?.guardian.fullName??"",relation:view.target?.relationship.relationshipLabel??"Mẹ",phone:view.target?.guardian.phoneMasked??"",email:view.target?.guardian.email??"",isPrimaryContact:view.target?.relationship.isPrimary??false});
  const [init,setInit]=useState(()=>snapshot(source));
  const [f,setF]=useState(init);
  const dirty=JSON.stringify(f)!==JSON.stringify(init);
  const {beforeClose,banner}=useDirtyClose(dirty,open);
  const cmd=useCommand((ctx,input:Parameters<typeof studentsRepo.saveGuardian>[2])=>studentsRepo.saveGuardian(ctx,schoolId,input),{success:existing?"Đã cập nhật người giám hộ":"Đã thêm người giám hộ (chưa xác minh)"});
  const fe=fieldErrorsOf(cmd.error);
  const submit=async()=>{const result=await cmd.run({studentId,guardianId:source.target?.guardian.id,relationshipId:source.target?.relationship.id,...f,email:f.email.trim()||null,source});if(result){await onSaved?.();onOpenChange(false);}};
  const contactLocked=!!current.target&&!current.target.canEditContact;
  return <Modal open={open} onOpenChange={onOpenChange} busy={cmd.pending} beforeClose={beforeClose} title={existing?"Sửa người giám hộ":"Thêm người giám hộ"} description={`Học sinh: ${studentName}`}
    footer={<><Button variant="ghost" onClick={()=>{if(beforeClose())onOpenChange(false);}} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Lưu</Button></>}>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();submit();}}>
      {banner}
      <p className="text-[12.5px] text-muted">Hồ sơ học sinh v{source.student.version}{source.target?` · giám hộ v${source.target.guardian.version} · quan hệ v${source.target.relationship.version}`:""}</p>
      {contactLocked&&<Callout tone="neutral">Liên hệ dùng chung: bạn được sửa quan hệ với học sinh này. Thông tin liên hệ cần người có quyền quản lý tất cả lớp liên quan sửa.</Callout>}
      <ErrorSummary errors={fe} labels={{fullName:"Họ tên",phone:"Số điện thoại",email:"Email",relation:"Quan hệ"}}/>
      {cmd.error&&!['VALIDATION','CONFLICT'].includes(cmd.error.code)&&<ErrorState error={cmd.error} compact/>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div data-field="fullName" className="sm:col-span-2"><TextField label="Họ và tên người giám hộ" required value={f.fullName} disabled={contactLocked} onChange={e=>setF({...f,fullName:e.target.value})} error={fe.fullName} autoComplete="off"/></div>
        <SelectField label="Quan hệ với học sinh" required value={f.relation} onChange={e=>setF({...f,relation:e.target.value})} options={[...RELATIONS,...(!RELATIONS.includes(f.relation as GuardianRelationship['relation'])?[f.relation]:[])].map(r=>({value:r,label:r}))}/>
        <div data-field="phone"><TextField label="Số điện thoại liên hệ" required inputMode="tel" disabled={contactLocked} value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} error={fe.phone} helper={source.target?"Giữ nguyên số đã che để không đổi liên hệ. Nhập số đầy đủ nếu cần đổi.":"Hiển thị dạng đã che cho nhân sự."}/></div>
        <div data-field="email" className="sm:col-span-2"><TextField label="Email (không bắt buộc)" type="email" disabled={contactLocked} value={f.email} onChange={e=>setF({...f,email:e.target.value})} error={fe.email}/></div>
      </div>
      <Checkbox label="Liên hệ ưu tiên" description="Người được nhà trường liên hệ trước. Không liên quan đến quyền xem thông tin." checked={f.isPrimaryContact} onChange={v=>setF({...f,isPrimaryContact:v})}/>
      <Callout tone="info" icon={<Info/>}>Lưu liên hệ không tự xác minh quan hệ hoặc cấp quyền nhận thông tin. Nhà trường xác minh riêng, có ghi căn cứ.</Callout>
    </form>
    <ConflictDialog error={cmd.error} onClose={()=>cmd.reset()} onReload={async()=>{const view=await reload();if(view){const next=snapshot(view);setSource(view);setInit(next);setF(next);cmd.reset();}}} mine={<p>{f.fullName} · {f.relation}</p>}/>
  </Modal>;
}

/* ------------------------------ O10 — verify / revoke relationship ------------------------------ */
export function VerifyDialog({target,onClose,schoolId}:{target:{relationshipId:string;version:number;to:"verified"|"revoked";guardianName:string;relation:string;studentName:string;activeLinks:number|null}|null;onClose:()=>void;schoolId:string}) {
  const [receive,setReceive]=useState<"yes"|"no"|"">("");
  const [missing,setMissing]=useState(false);
  useEffect(()=>{setReceive("");setMissing(false);},[target?.relationshipId,target?.version,target?.to]);
  const cmd=useCommand((ctx,id:string,version:number,st:"verified"|"revoked",note:string,canReceiveInfo?:boolean)=>studentsRepo.setVerification(ctx,schoolId,id,st,note,{version,canReceiveInfo}),{success:r=>r.verification==="verified"?"Đã xác minh quan hệ giám hộ":"Đã thu hồi quan hệ giám hộ",onSuccess:onClose});
  const verify=target?.to==="verified";
  return <ConfirmDialog open={!!target} onOpenChange={o=>{if(!o){cmd.reset();onClose();}}} busy={cmd.pending} title={verify?"Xác minh quan hệ giám hộ":"Thu hồi quan hệ giám hộ"} object={target?`${target.guardianName} — ${target.relation} của ${target.studentName} · v${target.version}`:undefined}
    consequence={verify?"Xác minh chỉ áp dụng cho học sinh này. Chọn riêng việc được nhận thông tin; không tạo tài khoản.":<>Quan hệ chuyển sang “Đã thu hồi”. {target?.activeLinks===null?"Các link còn hiệu lực của quan hệ này sẽ bị thu hồi ngay.":target?.activeLinks?`${target.activeLinks} link đang hoạt động sẽ bị thu hồi ngay.`:"Quan hệ này hiện không có link đang hoạt động."} Lịch sử được giữ.</>}
    confirmLabel={verify?"Xác minh":"Thu hồi quan hệ"} variant={verify?"primary":"danger"} reasonRequired reasonLabel={verify?"Căn cứ xác minh (ví dụ: đối chiếu hồ sơ nhập học, gặp trực tiếp)":"Lý do thu hồi"} error={fieldErrorsOf(cmd.error).note}
    onConfirm={reason=>{if(!target)return;if(verify&&!receive){setMissing(true);return;}return cmd.run(target.relationshipId,target.version,target.to,reason,verify?receive==='yes':undefined);}}>
    {verify&&<RadioGroup label="Quyền nhận thông tin đã công bố" value={receive} onChange={v=>{setReceive(v);setMissing(false);}} options={[{value:'yes',label:'Được nhận thông tin'},{value:'no',label:'Chưa được nhận thông tin'}]} error={missing?'Chọn quyền nhận thông tin trước khi xác minh.':undefined}/>}
    {cmd.error&&cmd.error.code!=='VALIDATION'&&<ErrorState error={cmd.error} compact/>}
  </ConfirmDialog>;
}

/* ------------------------------ O11 — transfer / leave ------------------------------ */
export function TransferDialog({ open, onOpenChange, schoolId, student, canDecide }: { open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; student?: { id: string; fullName: string; className: string; classId?: string } | null; canDecide: boolean }) {
  const studentsQ = useRepo(["students-options", schoolId], (ctx) => studentsExtraRepo.studentOptions(ctx, schoolId,student?.id), { enabled: open });
  const blank = { studentId: student?.id ?? "", kind: "transfer" as "transfer" | "leave", toClassId: "", effectiveDate: undefined as string | undefined, reason: "", applyNow: false };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF({ ...blank }); }, [open, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!(f.reason || f.toClassId || (!student && f.studentId));
  const { beforeClose, banner } = useDirtyClose(dirty, open);
  const cmd = useCommand((ctx, input: Parameters<typeof studentsRepo.requestTransfer>[2]) => studentsRepo.requestTransfer(ctx, schoolId, input),
    { success: (t) => t.status === "approved" ? (t.kind === "leave" ? "Đã ghi nhận ngừng theo học" : "Đã chuyển lớp") : "Đã gửi đề nghị chuyển lớp", onSuccess: () => onOpenChange(false) });
  const fe = { ...fieldErrorsOf(cmd.error) };
  const [local, setLocal] = useState<Record<string, string>>({});
  const picked = studentsQ.data?.find((s) => s.id === f.studentId);
  const currentClassId = picked?.classId;
  const classesQ=useRepo(["transfer-targets",schoolId,picked?.yearId,currentClassId,f.effectiveDate],ctx=>teacherExtraRepo.transferTargets(ctx,schoolId,picked!.yearId,currentClassId!,f.effectiveDate),{enabled:open&&!!picked&&!!currentClassId&&!!f.effectiveDate&&f.kind==='transfer'});
  const targets=classesQ.data?.targets??[];
  useEffect(()=>{if(classesQ.data&&!classesQ.isFetching&&f.toClassId&&!targets.some(t=>t.id===f.toClassId))setF(old=>({...old,toClassId:""}));},[classesQ.data,classesQ.isFetching,f.toClassId]);
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.studentId || !picked) e.studentId = "Chọn học sinh";
    if (!f.effectiveDate) e.effectiveDate = "Chọn ngày hiệu lực";
    if (f.kind === "transfer" && !f.toClassId) e.toClassId = "Chọn lớp đích";
    if (f.reason.trim().length < 5) e.reason = "Nêu lý do (tối thiểu 5 ký tự)";
    setLocal(e);
    if (Object.keys(e).length) return;
    cmd.run({ studentId: f.studentId, kind: f.kind, toClassId: f.kind === "transfer" ? f.toClassId : undefined, effectiveDate: f.effectiveDate!, reason: f.reason, applyNow: canDecide && f.applyNow,source:{id:picked!.id,enrollmentId:picked!.enrollmentId,enrollmentVersion:picked!.enrollmentVersion} });
  };
  const errs = { ...local, ...fe };
  const toName = targets.find((c) => c.id === f.toClassId)?.name;
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) { cmd.reset(); setLocal({}); } onOpenChange(o); }} busy={cmd.pending} beforeClose={beforeClose} size="md"
      title="Chuyển lớp / ngừng theo học" description={student ? `${student.fullName} — lớp hiện tại ${student.className}` : "Tạo yêu cầu cho một học sinh đang theo học"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant={f.kind === "leave" && f.applyNow ? "danger" : "primary"} loading={cmd.pending} onClick={submit}>{canDecide && f.applyNow ? (f.kind === "leave" ? "Ghi nhận ngừng theo học" : "Chuyển lớp ngay") : "Gửi đề nghị"}</Button></>}>
      <div className="space-y-4">
        {banner}
        <ErrorSummary errors={errs} labels={{ studentId: "Học sinh", toClassId: "Lớp đích", effectiveDate: "Ngày hiệu lực", reason: "Lý do" }} />
        {!student && (
          <div data-field="studentId">
            {studentsQ.error?<ErrorState error={studentsQ.error} onRetry={()=>void studentsQ.refetch()} compact/>:studentsQ.isLoading ? <Skeleton className="h-11" /> : (
              <Combobox label="Học sinh" required value={f.studentId} onChange={(v) => setF({ ...f, studentId: String(v), toClassId: "" })} error={errs.studentId}
                options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.code})`, hint: `Lớp ${s.className}${s.pendingTransfer ? " · đang có yêu cầu chờ" : ""}`, disabled: s.pendingTransfer }))} placeholder="Tìm theo tên hoặc mã…" />
            )}
          </div>
        )}
        <RadioGroup label="Loại thay đổi" value={f.kind} onChange={(v) => setF({ ...f, kind: v,toClassId:"" })} direction="row"
          options={[{ value: "transfer", label: "Chuyển lớp trong năm học", description: "Sang lớp khác cùng năm" }, { value: "leave", label: "Ngừng theo học", description: "Kết thúc theo học tại trường" }]} />
        {f.kind === "transfer" && (
          <div data-field="toClassId">
            {classesQ.error&&<ErrorState error={classesQ.error} onRetry={()=>void classesQ.refetch()} compact/>}{classesQ.isFetching&&<p role="status">Đang tải lớp đích…</p>}
            <SelectField label="Lớp đích" required value={f.toClassId} onChange={(e) => setF({ ...f, toClassId: e.target.value })} error={errs.toClassId} placeholder="Chọn lớp"
              disabled={!f.effectiveDate||classesQ.isFetching||!!classesQ.error} options={targets.map(c=>({value:c.id,label:`${c.name} (${c.size}${c.capacity===null?"":`/${c.capacity}`} học sinh)`,disabled:c.capacity!==null&&c.size>=c.capacity}))} helper={!f.effectiveDate?"Chọn ngày hiệu lực để tải lớp đích cùng năm học.":!targets.length?"Chưa có lớp đích hợp lệ ở ngày này.":undefined} />
          </div>
        )}
        <div data-field="effectiveDate"><DateField label="Ngày hiệu lực" required value={f.effectiveDate} onChange={(v) => setF({ ...f, effectiveDate: v,toClassId:"" })} error={errs.effectiveDate} helper="Ngày hiệu lực thuộc quá trình theo học; áp dụng lùi ngày cần quyền cấp trường" /></div>
        <div data-field="reason"><TextArea label="Lý do" required rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={errs.reason} maxChars={300} /></div>
        {canDecide && <Checkbox label="Áp dụng ngay (bạn có quyền duyệt)" description="Nếu không chọn, yêu cầu sẽ ở trạng thái Chờ duyệt." checked={f.applyNow} onChange={(v) => setF({ ...f, applyNow: v })} />}
        <Callout tone="neutral" icon={<Info />} title="Điều gì thay đổi">
          <ul className="list-disc space-y-0.5 pl-5">
            {f.kind === "transfer" ? <li>Lớp cũ kết thúc trước ngày hiệu lực; học sinh vào {toName ? `lớp ${toName}` : "lớp đích"} từ ngày hiệu lực và nằm trong “chưa phân tổ”.</li> : <li>Học sinh chuyển sang “Ngừng theo học”; các link tra cứu đang hoạt động bị thu hồi.</li>}
            <li>Lịch sử lớp cũ được giữ; báo cáo, điểm danh, thi đua đã có không đổi lớp.</li>
          </ul>
        </Callout>
      </div>
    </Modal>
  );
}

export {IssueAccessDialog} from "./issue-access-dialog";

/* ------------------------------ O14 — revoke a link ------------------------------ */
export type ParentLinkRevokeTarget={accessId:string;label:string;source:ParentRevokeSource};
export function RevokeAccessDialog({ target, onClose, schoolId }: { target: ParentLinkRevokeTarget | null; onClose: () => void; schoolId: string }) {
  const cmd = useCommand((ctx, id: string, reason: string,source:ParentRevokeSource) => studentsRepo.revokeAccess(ctx, schoolId, id, reason,source), { success: "Đã thu hồi link", onSuccess: onClose });
  const fe = fieldErrorsOf(cmd.error);
  if(cmd.error&&['FORBIDDEN','NO_SESSION','NOT_FOUND','SUSPENDED'].includes(cmd.error.code))return <Modal open={!!target} onOpenChange={o=>{if(!o){cmd.reset();onClose();}}} title="Thu hồi link tra cứu"><ErrorState error={cmd.error} compact/></Modal>;
  return (
    <ConfirmDialog key={target?.accessId??'closed'} open={!!target} onOpenChange={(o) => { if (!o) { cmd.reset(); onClose(); } }} busy={cmd.pending} title="Thu hồi link tra cứu" object={target?.label}
      consequence={<>Mọi lần mở mới bằng link này bị chặn ngay. Link của người giám hộ khác <b>không</b> thay đổi. Nhật ký cũ được giữ.</>}
      confirmLabel="Thu hồi link" variant="danger" reasonRequired reasonLabel="Lý do thu hồi" error={fe.reason}
      onConfirm={(reason) => target ? cmd.run(target.accessId, reason,target.source) : undefined}>
      {cmd.error&&<Callout tone="warning">{cmd.error.message}{cmd.error.code==='CONFLICT'&&<p className="mt-2">Đóng hộp thoại và tải lại màn hình để xem phiên bản hiện tại trước khi thu hồi.</p>}</Callout>}
    </ConfirmDialog>
  );
}

export const VerifyIcons = { verify: <ShieldCheck />, revoke: <ShieldOff /> };
