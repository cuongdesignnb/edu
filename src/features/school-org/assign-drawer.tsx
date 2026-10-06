"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MinusCircle, PlusCircle, ShieldCheck } from "lucide-react";
import { schoolRepo, staffRepo } from "@/lib/repositories";
import {QuickCreate} from '@/features/forms/quick-create';
import {validPickerValue} from '@/lib/query/form-options';
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateField, ErrorSummary, RadioGroup, SelectField, TextArea } from "@/components/ui/form";
import { Callout } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { nativeActionLabel } from "@/lib/api/action-labels";
import { FormError, fmtRange, useDirtyClose, useFormErrors } from "./common";

export interface AssignPrefill { membershipId?: string; kind?: "homeroom" | "subject"; classId?: string; subjectId?: string; yearId?: string }
const LABELS = { yearId: "Năm học", membershipId: "Giáo viên", classId: "Lớp", subjectId: "Môn", validFrom: "Hiệu lực từ", validTo: "Hiệu lực đến" };

/** O06 — create a grant (person → duty → class/subject → validity) with the O07 permission preview before saving. */
export function AssignDrawer({prefill,onClose}:{prefill:AssignPrefill|null;onClose:()=>void}) { return prefill ? <AssignForm key={JSON.stringify(prefill)} prefill={prefill} onClose={onClose} /> : null; }
function AssignForm({ prefill, onClose }: { prefill: AssignPrefill; onClose: () => void }) {
  const { school,can, yearId: ctxYear } = useSchool();
  const ctx = useCtx();
  const profiles=useRepo(['teacher-permission-profiles',school.id],c=>staffRepo.permissionProfiles(c,school.id),{enabled:can('role.manage')});
  const open = !!prefill;
  const [yearId,setYearId] = useState(prefill?.yearId ?? ctxYear);
  const opts = useRepo(["school-form-options", school.id], (c) => schoolRepo.formOptions(c, school.id), { enabled: open });
  const classes = useRepo(["school-assignment-classes", school.id, yearId], (c) => staffRepo.assignmentClasses(c, school.id, yearId), { enabled: open && !!yearId });
  const [initial] = useState(() => ({
    membershipId: prefill?.membershipId ?? "", kind: prefill?.kind ?? "subject" as "homeroom" | "subject", classId: prefill?.classId ?? "", subjectId: prefill?.subjectId ?? "",
    roleId:'',validFrom: ctx.today as string | undefined, validTo: undefined as string | undefined, reason: "",
  }));
  const [v, setV] = useState(initial);
  useEffect(()=>{if(classes.data&&!classes.isFetching&&!validPickerValue(v.classId,classes.data))setV(old=>({...old,classId:''}));},[classes.data,classes.isFetching,v.classId]);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [attempt, setAttempt] = useState(0);
  const [reviewed, setReviewed] = useState<Awaited<ReturnType<typeof staffRepo.previewAssignment>> | null>(null);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = open && (yearId !== (prefill.yearId ?? ctxYear) || JSON.stringify(v) !== JSON.stringify(initial));
  const close = () => { setErrors({}); setStep("form"); onClose(); };
  const { beforeClose, confirmNode } = useDirtyClose(dirty, close);

  const preview = useRepo(["assign-preview", school.id, v, attempt], (c) => staffRepo.previewAssignment(c, school.id, { membershipId: v.membershipId, kind: v.kind, classId: v.classId, subjectId: v.kind === "subject" ? v.subjectId : undefined, roleId:v.roleId||undefined,validFrom: v.validFrom!, validTo: v.validTo, reason: v.reason.trim() || undefined }), { enabled: open && step === "preview" });
  useEffect(() => { if (step === "preview" && preview.data && !reviewed) setReviewed(preview.data); }, [step, preview.data, reviewed]);
  const cmd = useCommand((c, input: Parameters<typeof staffRepo.assign>[2]) => staffRepo.assign(c, school.id, input), { success: "Đã lưu phân công", onError: (e) => { onError(e); setErrors(s => ({ ...s, _form: e.message })); }, });

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); clear(k as string); };
  const toPreview = () => {
    const local: Record<string, string> = {};
    if (!yearId) local.yearId = "Chọn năm học";
    if (!v.membershipId) local.membershipId = "Chọn giáo viên";
    else if (!opts.data?.teachers?.some(t => t.membershipId === v.membershipId)) local.membershipId = "Giáo viên không còn thuộc lựa chọn được phép phân công.";
    if (!v.classId) local.classId = "Chọn lớp";
    else if (classes.isFetching || classes.error || !classes.data?.some(c => c.id === v.classId)) local.classId = "Tải lại lớp thuộc năm học đang chọn.";
    if (v.kind === "subject" && !v.subjectId) local.subjectId = "Chọn môn";
    if (!v.validFrom) local.validFrom = "Chọn ngày bắt đầu";
    if (v.validFrom && v.validTo && v.validTo < v.validFrom) local.validTo = "Ngày kết thúc phải sau ngày bắt đầu";
    if (v.reason.trim() && v.reason.trim().length < 5) local._form = "Ghi chú tối thiểu 5 ký tự hoặc để trống.";
    setErrors(local);
    if (!Object.keys(local).length) { setReviewed(null); setAttempt(n => n + 1); setStep("preview"); }
  };
  const save = async () => {
    if (!reviewed || preview.error) return;
    const r = await cmd.run({ membershipId: v.membershipId, kind: v.kind, classId: v.classId, subjectId: v.kind === "subject" ? v.subjectId : undefined, roleId:v.roleId||undefined,validFrom: reviewed.validFrom, validTo: reviewed.validTo, reason: v.reason.trim() || undefined, memberVersion: reviewed.memberVersion, classVersion: reviewed.classVersion });
    if (r) close();
  };

  const teacher = opts.data?.teachers?.find((t) => t.membershipId === v.membershipId);
  const cls = classes.data?.find((c) => c.id === v.classId);
  const subject = opts.data?.subjects?.find((s) => s.id === v.subjectId);
  return (
    <>
      <Drawer open={open} onOpenChange={(o) => { if (!o) close(); }} beforeClose={beforeClose} busy={cmd.pending} width={480}
        title={step === "form" ? "Gán phân công" : "Xem thay đổi quyền"} description={step === "form" ? "Người → nhiệm vụ → lớp/môn → thời gian hiệu lực." : "Kiểm tra quyền được thêm trước khi xác nhận."}
        footer={step === "form"
          ? <><Button variant="ghost" onClick={() => { if (beforeClose()) close(); }}>Hủy</Button><Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={toPreview}>Xem trước quyền</Button></>
          : <><Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => { setReviewed(null); setStep("form"); }} disabled={cmd.pending}>Quay lại sửa</Button><Button variant="primary" loading={cmd.pending} disabled={!reviewed || !!preview.error} onClick={save}>Xác nhận phân công</Button></>}>
        {opts.error || classes.error ? <ErrorState error={opts.error ?? classes.error} onRetry={() => { opts.refetch(); classes.refetch(); }} compact /> : !opts.data || (!!yearId && !classes.data) ? <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div> : !opts.data.canAssign || !opts.data.teachers || !opts.data.subjects ? <Callout tone="neutral">Bạn không có quyền phân công giáo viên.</Callout> : step === "form" ? (
          <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); toPreview(); }}>
            <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={LABELS} />
            <FormError message={errors._form} />
            <SelectField label="Năm học" required placeholder="Chọn năm học" value={yearId} onChange={e=>{setYearId(e.target.value);setV(old=>({...old,classId:'',subjectId:''}));}} options={opts.data.years.filter(y=>y.status!=='archived').map(y=>({value:y.id,label:`${y.label}${y.status==='draft'?' (Nháp)':''}`}))} labelAction={<QuickCreate kind="year" schoolId={school.id} onCreated={async r=>{const fresh=await opts.refetch();if(fresh.error)throw fresh.error;if(!fresh.data?.years.some(y=>y.id===r.id&&y.status!=='archived'))throw new Error('Đã tạo năm học nhưng chưa thuộc lựa chọn được phép phân công.');setYearId(r.id);setV(old=>({...old,classId:'',subjectId:''}));}}/>}/>
            <div data-field="membershipId"><Combobox label="Giáo viên" labelAction={<QuickCreate kind="teacher" schoolId={school.id} onCreated={async r=>{const fresh=await opts.refetch();if(fresh.error)throw fresh.error;if(fresh.data?.teachers?.some(t=>t.membershipId===r.id))set('membershipId',r.id);else throw new Error('Giáo viên mới chưa thuộc danh sách được phép phân công.');}}/>} required placeholder="Chọn giáo viên" value={v.membershipId} onChange={(x) => set("membershipId", x as string)} error={errors.membershipId}
              options={opts.data.teachers.map((t) => ({ value: t.membershipId, label: t.name, hint: t.department }))} emptyText="Không có giáo viên đang hoạt động phù hợp" /></div>
            <RadioGroup label="Nhiệm vụ" value={v.kind} onChange={(k) => {set('kind',k);set('subjectId','');set('roleId','');}} direction="row" options={[
              { value: "subject", label: "Giáo viên bộ môn", description: "Theo đúng lớp và môn" },
              { value: "homeroom", label: "Giáo viên chủ nhiệm", description: "Một lớp tại một thời điểm" },
            ]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-field="classId"><SelectField label="Lớp" labelAction={<QuickCreate kind="class" schoolId={school.id} yearId={yearId} onCreated={async r=>{const fresh=await classes.refetch();if(fresh.error)throw fresh.error;if(r.yearId===yearId&&fresh.data?.some(c=>c.id===r.id))set('classId',r.id);else throw new Error('Đã tạo lớp nhưng không thuộc năm học đang chọn.');}}/>} required placeholder="Chọn lớp" value={v.classId} onChange={(e) => set("classId", e.target.value)} error={errors.classId}
                disabled={!yearId} options={(classes.data??[]).filter((c) => c.status !== "archived").map((c) => ({ value: c.id, label: `${c.name}${c.status === "draft" ? " (nháp)" : ""}` }))} helper={!yearId?'Chọn năm học trước.':!classes.data?.length?'Chưa có lớp trong năm học này.':undefined} /></div>
              {v.kind === "subject" && <div data-field="subjectId"><SelectField label="Môn" labelAction={<QuickCreate kind="subject" schoolId={school.id} onCreated={async r=>{const fresh=await opts.refetch();if(fresh.error)throw fresh.error;if(fresh.data?.subjects?.some(s=>s.id===r.id))set('subjectId',r.id);else throw new Error('Môn mới chưa thuộc lựa chọn phân công hiện tại.');}}/>} required placeholder="Chọn môn" value={v.subjectId} onChange={(e) => set("subjectId", e.target.value)} error={errors.subjectId}
                options={opts.data.subjects.map((s) => ({ value: s.id, label: s.name }))} /></div>}
            </div>
            {profiles.data&&<SelectField label="Mẫu quyền phân công" value={v.roleId} onChange={e=>set('roleId',e.target.value)} options={[{value:'',label:'Dùng mẫu mặc định của trường'},...profiles.data.roles.filter(r=>r.code!=='SCHOOL_ADMIN'&&r.permissions.some(p=>p.scopes.includes(v.kind==='homeroom'?'CLASS':'SUBJECT'))).map(r=>({value:r.id!,label:r.label}))]}/>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-field="validFrom"><DateField label="Hiệu lực từ" required value={v.validFrom} onChange={(d) => set("validFrom", d)} error={errors.validFrom} /></div>
              <div data-field="validTo"><DateField label="Hiệu lực đến" value={v.validTo} min={v.validFrom} onChange={(d) => set("validTo", d)} error={errors.validTo} helper="Để trống = đến khi thu hồi" /></div>
            </div>
            <TextArea label="Ghi chú (tùy chọn)" rows={2} value={v.reason} onChange={(e) => set("reason", e.target.value)} maxChars={200} />
            <Callout tone="neutral">Quyền chỉ áp dụng cho đúng lớp{v.kind === "subject" ? " và môn" : ""} đã chọn trong thời gian hiệu lực — không cộng dồn thành quyền toàn trường.</Callout>
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-[#f7fbff] p-3.5 text-sm">
              <p className="font-semibold text-ink">{teacher?.name}</p>
              <p className="text-body">{v.kind === "homeroom" ? "Chủ nhiệm" : "Bộ môn"} · {cls?.name}{v.kind === "subject" && subject ? ` — ${subject.name}` : ""}</p>
              <p className="text-muted">Hiệu lực: {fmtRange(reviewed?.validFrom ?? v.validFrom, reviewed?.validTo ?? v.validTo)}</p>
            </div>
            <FormError message={errors._form} />
            {preview.isLoading ? <Skeleton className="h-40" /> : preview.error ? <ErrorState error={preview.error} onRetry={() => { setReviewed(null); setAttempt(n => n + 1); }} compact /> : reviewed && (
              <>
                <PermList title={`Quyền được thêm (${reviewed.added.length})`} tone="add" items={reviewed.added} empty="Không có quyền mới — người này đã có các quyền này trong lớp." />
                {reviewed.kept.length > 0 && <PermList title={`Đã có, giữ nguyên (${reviewed.kept.length})`} tone="keep" items={reviewed.kept} />}
                {reviewed.notIncluded.length > 0 && <PermList title="Không bao gồm (chỉ dành cho GVCN)" tone="none" items={reviewed.notIncluded} />}
                {reviewed.warnings.map(w => <Callout key={w} tone="warning">{w}</Callout>)}
                <Callout tone="info">Phạm vi: <b>{reviewed.scope}</b>. Giáo viên nhận thông báo phân công; lớp xuất hiện trong “Lớp học của tôi” từ ngày hiệu lực.</Callout>
              </>
            )}
          </div>
        )}
      </Drawer>
      {confirmNode}
    </>
  );
}

function PermList({ title, items, tone, empty }: { title: string; items: string[]; tone: "add" | "keep" | "none"; empty?: string }) {
  const Icon = tone === "add" ? PlusCircle : tone === "keep" ? CheckCircle2 : MinusCircle;
  const color = tone === "add" ? "text-success-text" : tone === "keep" ? "text-primary" : "text-faint";
  return (
    <div>
      <p className="mb-1.5 text-[13.5px] font-semibold text-ink">{title}</p>
      {items.length === 0 ? <p className="text-[13px] text-muted">{empty}</p> : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((i) => <li key={i} className="flex items-start gap-2 text-[13px] text-body"><Icon className={`mt-0.5 size-4 flex-none ${color}`} aria-hidden />{nativeActionLabel(i).label}</li>)}
        </ul>
      )}
    </div>
  );
}
