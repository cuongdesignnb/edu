"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Printer, ShieldCheck, ShieldOff, Info, ExternalLink } from "lucide-react";
import type { GuardianRelationship, ParentModule } from "@/lib/model/types";
import { schoolRepo, studentsRepo } from "@/lib/repositories";
import { studentsExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, parentModuleLabel, verificationStatus } from "@/lib/formatters";
import { Modal, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Checkbox, DateField, ErrorSummary, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton, ErrorState, QueryState } from "@/components/ui/states";
import { SchoolSourceState } from "@/features/school-org/common";
import { ConflictDialog } from "@/components/ui/guards";
import { ALL_MODULES, MODULE_HINT, QrImage, LinkBox, QrPrintCard, RELATIONS, accessUrl, fieldErrorsOf, usePrintQr } from "./shared";

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
type GuardianProps = {open:boolean;onOpenChange:(o:boolean)=>void;schoolId:string;studentId:string;studentName:string;existing?:GuardianEditTarget|null};

export function GuardianDialog(props:GuardianProps) {
  const {schoolId,studentId,existing,open}=props;
  const q=useRepo(["guardian-form",schoolId,studentId,existing?.relationshipId],c=>studentsExtraRepo.guardianForm(c,schoolId,studentId,existing?.relationshipId),{enabled:open});
  if(!q.data || q.error && q.error.code!=="READ_ERROR")return <Modal open={open} onOpenChange={props.onOpenChange} title={existing?"Sửa người giám hộ":"Thêm người giám hộ"}><QueryState query={q} skeleton="form">{()=>null}</QueryState></Modal>;
  return <SchoolSourceState query={q}>{source=><GuardianBody key={`${studentId}:${existing?.relationshipId??'new'}`} {...props} current={source} reload={async()=>(await q.refetch()).data}/>}</SchoolSourceState>;
}

function GuardianBody({open,onOpenChange,schoolId,studentId,studentName,existing,current,reload}:GuardianProps&{current:GuardianSource;reload:()=>Promise<GuardianSource|undefined>}) {
  const [source,setSource]=useState(current);
  const snapshot=(view:GuardianSource)=>({fullName:view.target?.guardian.fullName??"",relation:view.target?.relationship.relationshipLabel??"Mẹ",phone:view.target?.guardian.phoneMasked??"",email:view.target?.guardian.email??"",isPrimaryContact:view.target?.relationship.isPrimary??false});
  const [init,setInit]=useState(()=>snapshot(source));
  const [f,setF]=useState(init);
  const dirty=JSON.stringify(f)!==JSON.stringify(init);
  const {beforeClose,banner}=useDirtyClose(dirty,open);
  const cmd=useCommand((ctx,input:Parameters<typeof studentsRepo.saveGuardian>[2])=>studentsRepo.saveGuardian(ctx,schoolId,input),{success:existing?"Đã cập nhật người giám hộ":"Đã thêm người giám hộ (chưa xác minh)",onSuccess:()=>onOpenChange(false)});
  const fe=fieldErrorsOf(cmd.error);
  const submit=()=>cmd.run({studentId,guardianId:source.target?.guardian.id,relationshipId:source.target?.relationship.id,...f,email:f.email.trim()||null,source});
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
  const ctxQ = useRepo(["students-issue-ctx", schoolId], (ctx) => studentsExtraRepo.issueContext(ctx, schoolId), { enabled: open });
  const classesQ = useRepo(["class-options", schoolId], (ctx) => schoolRepo.classOptions(ctx, schoolId), { enabled: open });
  const studentsQ = useRepo(["students-options", schoolId], (ctx) => studentsExtraRepo.studentOptions(ctx, schoolId), { enabled: open && !student });
  const blank = { studentId: student?.id ?? "", kind: "transfer" as "transfer" | "leave", toClassId: "", effectiveDate: undefined as string | undefined, reason: "", applyNow: false };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF({ ...blank, effectiveDate: ctxQ.data?.today }); }, [open, student?.id, ctxQ.data?.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!(f.reason || f.toClassId || (!student && f.studentId));
  const { beforeClose, banner } = useDirtyClose(dirty, open);
  const cmd = useCommand((ctx, input: Parameters<typeof studentsRepo.requestTransfer>[2]) => studentsRepo.requestTransfer(ctx, schoolId, input),
    { success: (t) => t.status === "approved" ? (t.kind === "leave" ? "Đã ghi nhận ngừng theo học" : "Đã chuyển lớp") : "Đã gửi đề nghị chuyển lớp", onSuccess: () => onOpenChange(false) });
  const fe = { ...fieldErrorsOf(cmd.error) };
  const [local, setLocal] = useState<Record<string, string>>({});
  const picked = student ?? studentsQ.data?.find((s) => s.id === f.studentId);
  const currentClassId = student?.classId ?? (picked && "classId" in picked ? picked.classId : undefined);
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.studentId) e.studentId = "Chọn học sinh";
    if (!f.effectiveDate) e.effectiveDate = "Chọn ngày hiệu lực";
    if (f.kind === "transfer" && !f.toClassId) e.toClassId = "Chọn lớp đích";
    if (f.reason.trim().length < 5) e.reason = "Nêu lý do (tối thiểu 5 ký tự)";
    setLocal(e);
    if (Object.keys(e).length) return;
    cmd.run({ studentId: f.studentId, kind: f.kind, toClassId: f.kind === "transfer" ? f.toClassId : undefined, effectiveDate: f.effectiveDate!, reason: f.reason, applyNow: canDecide && f.applyNow });
  };
  const errs = { ...local, ...fe };
  const toName = classesQ.data?.find((c) => c.id === f.toClassId)?.name;
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) { cmd.reset(); setLocal({}); } onOpenChange(o); }} busy={cmd.pending} beforeClose={beforeClose} size="md"
      title="Chuyển lớp / ngừng theo học" description={student ? `${student.fullName} — lớp hiện tại ${student.className}` : "Tạo yêu cầu cho một học sinh đang theo học"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant={f.kind === "leave" && f.applyNow ? "danger" : "primary"} loading={cmd.pending} onClick={submit}>{canDecide && f.applyNow ? (f.kind === "leave" ? "Ghi nhận ngừng theo học" : "Chuyển lớp ngay") : "Gửi đề nghị"}</Button></>}>
      <div className="space-y-4">
        {banner}
        <ErrorSummary errors={errs} labels={{ studentId: "Học sinh", toClassId: "Lớp đích", effectiveDate: "Ngày hiệu lực", reason: "Lý do" }} />
        {!student && (
          <div data-field="studentId">
            {studentsQ.isLoading ? <Skeleton className="h-11" /> : (
              <Combobox label="Học sinh" required value={f.studentId} onChange={(v) => setF({ ...f, studentId: String(v), toClassId: "" })} error={errs.studentId}
                options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.code})`, hint: `Lớp ${s.className} · sinh ${fmtDate(s.dob)}${s.pendingTransfer ? " · đang có yêu cầu chờ" : ""}`, disabled: s.pendingTransfer }))} placeholder="Tìm theo tên hoặc mã…" />
            )}
          </div>
        )}
        <RadioGroup label="Loại thay đổi" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} direction="row"
          options={[{ value: "transfer", label: "Chuyển lớp trong năm học", description: "Sang lớp khác cùng năm" }, { value: "leave", label: "Ngừng theo học", description: "Kết thúc theo học tại trường" }]} />
        {f.kind === "transfer" && (
          <div data-field="toClassId">
            <SelectField label="Lớp đích" required value={f.toClassId} onChange={(e) => setF({ ...f, toClassId: e.target.value })} error={errs.toClassId} placeholder="Chọn lớp"
              options={(classesQ.data ?? []).filter((c) => c.id !== currentClassId && c.status !== "archived").map((c) => ({ value: c.id, label: `${c.name}${c.status === "draft" ? " (nháp)" : ""}` }))} />
          </div>
        )}
        <div data-field="effectiveDate"><DateField label="Ngày hiệu lực" required value={f.effectiveDate} onChange={(v) => setF({ ...f, effectiveDate: v })} error={errs.effectiveDate} max={ctxQ.data?.yearEnd} helper="dd/MM/yyyy — không áp dụng lùi quá 7 ngày" /></div>
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

/* ------------------------------ O12 / O13 — issue (or reissue) a private link ------------------------------ */
export function IssueAccessDialog({ open, onOpenChange, schoolId, studentId: fixedStudent, relationshipId: preRel, replace }: {
  open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; studentId?: string; relationshipId?: string; replace?: { accessId: string; relationshipId: string; modules: ParentModule[]; label: string } | null;
}) {
  const ctxQ = useRepo(["students-issue-ctx", schoolId], (ctx) => studentsExtraRepo.issueContext(ctx, schoolId), { enabled: open });
  const studentsQ = useRepo(["students-options", schoolId], (ctx) => studentsExtraRepo.studentOptions(ctx, schoolId), { enabled: open && !fixedStudent });
  const [studentId, setStudentId] = useState(fixedStudent ?? "");
  const candQ = useRepo(["issue-candidates", schoolId, studentId], (ctx) => studentsExtraRepo.issueCandidates(ctx, schoolId, studentId), { enabled: open && !!studentId });
  const [relId, setRelId] = useState("");
  const [modules, setModules] = useState<ParentModule[]>([]);
  const [expires, setExpires] = useState<string | undefined>();
  const [reason, setReason] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<{ token: string; expiresAt: string; modules: ParentModule[]; id: string; relation: string } | null>(null);
  const { print, node } = usePrintQr();

  useEffect(() => {
    if (!open) return;
    setStudentId(fixedStudent ?? ""); setRelId(replace?.relationshipId ?? preRel ?? ""); setReason(""); setLocal({}); setIssued(null);
  }, [open, fixedStudent, preRel, replace?.relationshipId]);
  useEffect(() => {
    if (open && ctxQ.data) { setModules(replace?.modules ?? ctxQ.data.defaultModules); setExpires(ctxQ.data.suggestedExpiry); }
  }, [open, ctxQ.data, replace?.modules]);

  const cmd = useCommand((ctx, input: Parameters<typeof studentsRepo.issueAccess>[2]) => studentsRepo.issueAccess(ctx, schoolId, input), { success: replace ? "Đã cấp lại link — link cũ đã bị thu hồi" : "Đã cấp link tra cứu riêng" });
  const fe = fieldErrorsOf(cmd.error);
  const rels = candQ.data?.relationships ?? [];
  const rel = rels.find((r) => r.id === relId);
  const dirty = !issued && (!!reason || (!replace && !preRel && !!relId));
  const { beforeClose, banner } = useDirtyClose(dirty, open);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!studentId) e.studentId = "Chọn học sinh";
    if (!relId) e.relationshipId = "Chọn người giám hộ đã xác minh";
    else if (rel && rel.verification !== "verified") e.relationshipId = "Cần xác minh trước khi cấp link";
    if (!modules.length) e.modules = "Chọn ít nhất một mục được xem";
    if (!expires) e.expiresOn = "Chọn hạn sử dụng";
    if (replace && reason.trim().length < 3) e.reason = "Ghi lý do cấp lại";
    setLocal(e);
    if (Object.keys(e).length) return;
    const pa = await cmd.run({ relationshipId: relId, modules, expiresOn: expires!, replaceAccessId: replace?.accessId, reason: replace ? reason : undefined });
    if (pa) setIssued({ token: pa.token, expiresAt: pa.expiresAt, modules: pa.modules, id: pa.id, relation: rel?.relation ?? "" });
  };
  const errs: Record<string, string> = { ...local, ...fe, ...(cmd.error?.code === "UNVERIFIED" ? { relationshipId: "Cần xác minh trước khi cấp link" } : {}) };
  const url = issued && ctxQ.data ? accessUrl(ctxQ.data.slug, issued.token) : "";
  const student = candQ.data?.student;

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) cmd.reset(); onOpenChange(o); }} busy={cmd.pending} beforeClose={beforeClose} size="lg"
      title={issued ? "Đã cấp link tra cứu" : replace ? "Cấp lại link tra cứu" : "Cấp đường dẫn riêng cho phụ huynh"}
      description={issued ? "Link và mã QR chỉ hiển thị đầy đủ ở bước này. Hãy trao tận tay người được cấp." : "Một link cho một học sinh, một người giám hộ đã xác minh, trong năm học hiện tại."}
      footer={issued ? <>
        <Link href={`/school/${schoolId}/parent-access/${issued.id}`} className="btn btn-ghost">Xem chi tiết quyền</Link>
        <Button icon={<Printer className="size-4" />} onClick={() => student && ctxQ.data && print(<QrPrintCard url={url} studentName={student.fullName} className={student.className} relation={issued.relation} schoolName={ctxQ.data.schoolName} expiresAt={issued.expiresAt} />)}>In QR</Button>
        <Button variant="primary" onClick={() => onOpenChange(false)}>Xong</Button>
      </> : <>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button>
        <Button variant="primary" loading={cmd.pending} onClick={submit} disabled={!!rel && rel.verification !== "verified"}>{replace ? "Thu hồi link cũ và cấp link mới" : "Cấp link"}</Button>
      </>}>
      {node}
      {issued ? (
        <div className="space-y-4">
          <Callout tone="success" icon={<CheckCircle2 />} title={`Link cấp cho ${issued.relation.toLowerCase()} của ${student?.fullName ?? ""}`}>Hiệu lực đến {fmtDate(issued.expiresAt)} · {issued.modules.length} mục được xem.{replace ? " Link cũ đã bị chặn ngay." : ""}</Callout>
          <div className="grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center">
            <div className="mx-auto rounded-xl border border-line bg-white p-3"><QrImage url={url} size={148} /></div>
            <div className="min-w-0 space-y-3">
              <LinkBox url={url} />
              <a href={url} target="_blank" rel="noreferrer" className="card-link">Mở thử link demo <ExternalLink className="size-3.5" aria-hidden /></a>
              <p className="text-[13px] text-muted">Mục được xem: {issued.modules.map((m) => parentModuleLabel[m]).join(", ")}.</p>
            </div>
          </div>
          <Callout tone="warning" icon={<AlertTriangle />} title="Không đăng vào nhóm chung">Ai có link đều mở được trang tra cứu trong thời hạn. Chỉ gửi riêng cho người được cấp. Nếu lộ link, thu hồi và cấp lại. Đây là link demo, không phải thiết kế bảo mật cho bản chính thức.</Callout>
        </div>
      ) : (
        <div className="space-y-4">
          {banner}
          <ErrorSummary errors={errs} labels={{ studentId: "Học sinh", relationshipId: "Người giám hộ", modules: "Mục được xem", expiresOn: "Hạn sử dụng", reason: "Lý do" }} />
          {replace && <Callout tone="info" icon={<Info />}>Cấp lại sẽ <b>thu hồi link cũ</b> ({replace.label}) và tạo link mới. Link của người giám hộ khác không thay đổi.</Callout>}
          {!fixedStudent && (
            <div data-field="studentId">
              {studentsQ.isLoading ? <Skeleton className="h-11" /> : (
                <Combobox label="Học sinh" required value={studentId} onChange={(v) => { setStudentId(String(v)); setRelId(""); }} error={errs.studentId} placeholder="Tìm theo tên hoặc mã…"
                  options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.code})`, hint: `Lớp ${s.className} · sinh ${fmtDate(s.dob)}` }))} />
              )}
            </div>
          )}
          {studentId && (candQ.isLoading ? <Skeleton className="h-24" /> : candQ.error ? <ErrorState error={candQ.error} onRetry={() => candQ.refetch()} compact /> : (
            <fieldset data-field="relationshipId" className="field">
              <legend className="label mb-1.5">Người giám hộ được cấp<span className="req" aria-hidden>*</span></legend>
              {rels.length === 0 ? <p className="text-sm text-muted">Học sinh chưa có người giám hộ. Thêm và xác minh người giám hộ trước.</p> : (
                <div className="space-y-2" role="radiogroup">
                  {rels.map((r) => {
                    const ok = r.verification === "verified";
                    const locked = !!replace && r.id !== replace.relationshipId;
                    return (
                      <label key={r.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${relId === r.id ? "border-[#9cc7f5] bg-primary-light" : "border-line"} ${ok && !locked ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                        <input type="radio" name="issue-rel" className="mt-1 size-4 accent-[var(--color-primary)]" checked={relId === r.id} disabled={!ok || locked} onChange={() => setRelId(r.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2"><b className="text-ink">{r.guardianName}</b><span className="text-muted">{r.relation}</span><StatusBadge status={r.verification} map={verificationStatus} /></span>
                          <span className="block text-[12.5px] text-muted">{r.phoneMasked}{r.activeAccessIds.length ? ` · đang có ${r.activeAccessIds.length} link hoạt động` : ""}</span>
                          {!ok && <span className="mt-0.5 block text-[12.5px] font-semibold text-warning-text">Cần xác minh trước khi cấp link</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {errs.relationshipId && <p className="error-text mt-1">{errs.relationshipId}</p>}
            </fieldset>
          ))}
          {candQ.data && candQ.data.student.status !== "studying" && <Callout tone="warning" icon={<AlertTriangle />}>Học sinh không còn theo học — không cấp link mới.</Callout>}
          <fieldset data-field="modules" className="field">
            <legend className="label mb-1.5">Mục phụ huynh được xem<span className="req" aria-hidden>*</span></legend>
            <p className="helper mb-2">Mặc định theo chính sách chia sẻ của trường. Chỉ dữ liệu đã công bố mới hiển thị.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_MODULES.map((m) => <Checkbox key={m} label={parentModuleLabel[m]} description={MODULE_HINT[m]} checked={modules.includes(m)} onChange={(v) => setModules(v ? [...modules, m] : modules.filter((x) => x !== m))} className="rounded-lg border border-line px-3 py-2" />)}
            </div>
            {errs.modules && <p className="error-text mt-1">{errs.modules}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="expiresOn"><DateField label="Hạn sử dụng" required value={expires} onChange={setExpires} min={ctxQ.data?.tomorrow} max={ctxQ.data?.yearEnd} error={errs.expiresOn} helper={ctxQ.data ? `Tối đa hết năm học ${ctxQ.data.yearLabel} (${fmtDate(ctxQ.data.yearEnd)})` : undefined} /></div>
            <div className="field"><span className="label">Năm học</span><p className="input flex items-center bg-neutral-bg">{ctxQ.data?.yearLabel ?? "—"}</p></div>
          </div>
          {replace && <div data-field="reason"><TextArea label="Lý do cấp lại" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errs.reason} /></div>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ O14 — revoke a link ------------------------------ */
export function RevokeAccessDialog({ target, onClose, schoolId }: { target: { accessId: string; label: string } | null; onClose: () => void; schoolId: string }) {
  const cmd = useCommand((ctx, id: string, reason: string) => studentsRepo.revokeAccess(ctx, schoolId, id, reason), { success: "Đã thu hồi link", onSuccess: onClose });
  const fe = fieldErrorsOf(cmd.error);
  return (
    <ConfirmDialog open={!!target} onOpenChange={(o) => { if (!o) { cmd.reset(); onClose(); } }} busy={cmd.pending} title="Thu hồi link tra cứu" object={target?.label}
      consequence={<>Mọi lần mở mới bằng link này bị chặn ngay. Link của người giám hộ khác <b>không</b> thay đổi. Nhật ký cũ được giữ.</>}
      confirmLabel="Thu hồi link" variant="danger" reasonRequired reasonLabel="Lý do thu hồi" error={fe.reason}
      onConfirm={(reason) => target ? cmd.run(target.accessId, reason) : undefined} />
  );
}

export const VerifyIcons = { verify: <ShieldCheck />, revoke: <ShieldOff /> };
