"use client";
import { StickyActionBar } from "@/components/ui/sticky-bar";
import { useCallback, useState, useEffect } from "react";
import {QuickCreate} from '@/features/forms/quick-create';
import { useRouter } from "next/navigation";
import { Save, UserPlus, Users, Info, Lock } from "lucide-react";
import type { Gender, GuardianRelationship } from "@/lib/model/types";
import { schoolRepo, studentsExtraRepo, studentsRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { addDays } from "@/lib/calendar";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useSchool, useOptionalSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, DateField, ErrorSummary, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { ConflictDialog, useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";
import { DeniedState, ErrorState } from "@/components/ui/states";
import { RELATIONS, fieldErrorsOf } from "./shared";
import { SchoolSourceState } from "@/features/school-org/common";

const LABELS: Record<string, string> = { fullName: "Họ và tên", dob: "Ngày sinh", gender: "Giới tính", code: "Mã học sinh", classId: "Lớp", startDate: "Ngày vào lớp", "guardian.fullName": "Họ tên người giám hộ", "guardian.phone": "SĐT người giám hộ" };

/* ------------------------------ SC17 — add student ------------------------------ */
type CreateProps={schoolId:string;initialYearId?:string;initialClassId?:string;embedded?:boolean;onDirtyChange?:(dirty:boolean)=>void;onCancel?:()=>void;onCreated?:(row:Awaited<ReturnType<typeof studentsRepo.create>>)=>void|Promise<void>};
export function StudentCreateForm(props:CreateProps) {
  const {schoolId}=props;
  const q = useRepo(["student-create-options", schoolId], (c) => studentsExtraRepo.createOptions(c, schoolId));
  return <SchoolSourceState query={q}>{(source) => <CreateBody {...props} source={source} />}</SchoolSourceState>;
}

function CreateBody({schoolId,source,initialYearId,initialClassId,embedded=false,onCreated,onDirtyChange,onCancel}:CreateProps&{source:Awaited<ReturnType<typeof studentsExtraRepo.createOptions>>}) {
  const ctx=useCtx(schoolId);
  const school=useOptionalSchool();
  const router = useRouter();
  const leave = useLeaveGuard();
  const base = `/school/${schoolId}`;
  const [createdYears,setCreatedYears]=useState<{id:string;name:string}[]>([]);
  const [yearId,setYearId]=useState(initialYearId??source.classes.find(c=>c.id===initialClassId)?.yearId??school?.yearId??'');
  const [init] = useState(() => ({ fullName: "", dob: undefined as string | undefined, gender: "" as Gender | "", code: "", classId: initialClassId??"", startDate: source.today as string | undefined, withGuardian: false, gName: "", gRelation: "Mẹ" as GuardianRelationship["relation"], gPhone: "" }));
  const [f, setF] = useState(init);
  const chosen = source.classes.find((c) => c.id === f.classId);
  const classes=source.classes.filter(c=>c.yearId===yearId);
  const years=[...new Map([...createdYears,...(school?.years??[]).filter(y=>y.status!=='archived').map(y=>({id:y.id,name:y.label})),...source.classes.map(c=>({id:c.yearId,name:c.yearName}))].map(y=>[y.id,y])).values()];
  useEffect(()=>{if(f.classId&&!classes.some(c=>c.id===f.classId))setF(old=>({...old,classId:'',withGuardian:false}));},[yearId,source.classes,f.classId]);
  const [local, setLocal] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  const cmd = useCommand((c, input: Parameters<typeof studentsRepo.create>[2]) => studentsRepo.create(c, schoolId, input), { success: (s) => `Đã thêm học sinh ${s.fullName} (${s.code})` });

  const save = useCallback(async () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().split(/\s+/).filter(Boolean).length < 2) e.fullName = "Nhập đầy đủ họ và tên";
    if (!f.dob) e.dob = "Chọn ngày sinh";
    if (!f.gender) e.gender = "Chọn giới tính";
    if (f.code && !/^[A-Za-z0-9-]{3,20}$/.test(f.code.trim())) e.code = "Mã chỉ gồm chữ, số, gạch nối (3–20 ký tự)";
    if (!f.classId) e.classId = "Chọn lớp";
    if (!chosen) e.classId = "Chọn lớp thuộc phạm vi được phép thêm học sinh";
    if (!f.startDate) e.startDate = "Chọn ngày vào lớp";
    else if(chosen && (f.startDate < chosen.yearStartsOn || f.startDate > chosen.yearEndsOn)) e.startDate = "Ngày vào lớp phải thuộc năm học của lớp đã chọn";
    if(f.withGuardian && !chosen?.canAddGuardian) e["guardian.fullName"] = "Bạn chưa có quyền quản lý giám hộ của lớp đã chọn";
    if (f.withGuardian) {
      if (f.gName.trim().split(/\s+/).filter(Boolean).length < 2) e["guardian.fullName"] = "Nhập đầy đủ họ tên người giám hộ";
      if (!/^[0-9 .+-]{8,15}$/.test(f.gPhone.trim())) e["guardian.phone"] = "Số điện thoại chưa hợp lệ";
    }
    setLocal(e);
    if (Object.keys(e).length) return false;
    const s = await cmd.run({ fullName: f.fullName, dob: f.dob!, gender: f.gender as Gender, code: f.code.trim() || undefined, classId: f.classId, startDate: f.startDate!,
      guardian: f.withGuardian ? { fullName: f.gName, relation: f.gRelation, phone: f.gPhone.trim() } : undefined });
    if (s) { setF(init);if(onCreated)await onCreated(s);else router.push(`${base}/students/${s.id}`); return true; }
    return false;
  }, [f, cmd, init, router, base, chosen,onCreated]);
  useUnsavedChanges(dirty && !cmd.pending&&!embedded, save);
  const errs = { ...local, ...fieldErrorsOf(cmd.error) };

  return (
    <div className="page">
      <PageHeader title="Thêm học sinh" subtitle="Chỉ nhập thông tin tối thiểu cần cho quản lý lớp. Không thu CCCD, dân tộc, địa chỉ hay liên hệ riêng của học sinh."
        breadcrumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: "Thêm học sinh" }]} />
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="space-y-5">
          <ErrorSummary errors={errs} labels={LABELS} />
          {cmd.error && cmd.error.code !== "VALIDATION" && <ErrorState error={cmd.error} compact />}
          {source.classes.length === 0 && <Callout tone="neutral">Không có lớp thuộc phạm vi được phép thêm học sinh.</Callout>}
          <Card>
            <CardHeader title="Thông tin học sinh" icon={<UserPlus className="size-5" />} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div data-field="fullName" className="sm:col-span-2"><TextField label="Họ và tên" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={errs.fullName} autoComplete="off" /></div>
              <div data-field="dob"><DateField label="Ngày sinh" required value={f.dob} onChange={(v) => setF({ ...f, dob: v })} max={addDays(source.today, -365 * 5)} error={errs.dob} /></div>
              <div data-field="gender"><RadioGroup label="Giới tính" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} direction="row" error={errs.gender} options={[{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }]} /></div>
              <div data-field="code"><TextField label="Mã học sinh (tùy chọn)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} error={errs.code} helper="Để trống để hệ thống tự cấp mã. Mã phải là duy nhất trong trường." /></div>
              <SelectField label="Năm học" required value={yearId} placeholder="Chọn năm học" onChange={e=>{setYearId(e.target.value);setF(old=>({...old,classId:'',withGuardian:false}));}} options={years.map(y=>({value:y.id,label:y.name}))} labelAction={<QuickCreate kind="year" schoolId={schoolId} onCreated={async r=>{const fresh=await schoolRepo.years(ctx,schoolId),year=fresh.find(y=>y.id===r.id&&y.status!=='archived');if(!year)throw new Error('Đã tạo năm học nhưng chưa thuộc lựa chọn hợp lệ.');setCreatedYears(old=>[...old.filter(y=>y.id!==year.id),{id:year.id,name:year.label}]);setYearId(r.id);setF(old=>({...old,classId:'',withGuardian:false}));}}/>}/>
              <div data-field="classId"><SelectField label="Lớp" required value={f.classId} disabled={!yearId} onChange={(e) => setF({ ...f, classId: e.target.value,withGuardian:false })} error={errs.classId} placeholder="Chọn lớp" labelAction={<QuickCreate kind="class" schoolId={schoolId} yearId={yearId} disabled={!yearId} onCreated={async r=>{const fresh=await studentsExtraRepo.createOptions(ctx,schoolId);if(r.yearId===yearId&&fresh.classes.some(c=>c.id===r.id&&c.yearId===yearId))setF(old=>({...old,classId:r.id,withGuardian:false}));else throw new Error('Đã tạo lớp ở năm học khác hoặc lớp chưa thuộc lựa chọn hiện tại. Chọn đúng năm học trước khi chọn lớp.');}}/>}
                options={classes.map((c) => ({ value: c.id, label: `${c.name} · ${c.yearName}${c.status === "DRAFT" ? " (nháp)" : ""}` }))} /></div>
              <div data-field="startDate"><DateField label="Ngày vào lớp" required min={chosen?.yearStartsOn} max={chosen?.yearEndsOn} value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} error={errs.startDate} /></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Người giám hộ (tùy chọn)" icon={<Users className="size-5" />} subtitle="Được lưu ở trạng thái “Chưa xác minh”." />
            <div className="space-y-4 px-5 pb-5">
              <Checkbox label="Thêm người giám hộ ngay" disabled={!chosen?.canAddGuardian && !f.withGuardian} description={chosen && !chosen.canAddGuardian ? "Bạn chưa có quyền quản lý giám hộ của lớp này." : undefined} checked={f.withGuardian} onChange={(v) => setF({ ...f, withGuardian: v })} />
              {f.withGuardian && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-field="guardian.fullName" className="sm:col-span-2"><TextField label="Họ và tên người giám hộ" required value={f.gName} onChange={(e) => setF({ ...f, gName: e.target.value })} error={errs["guardian.fullName"]} /></div>
                  <SelectField label="Quan hệ" required value={f.gRelation} onChange={(e) => setF({ ...f, gRelation: e.target.value as GuardianRelationship["relation"] })} options={RELATIONS.map((r) => ({ value: r, label: r }))} />
                  <div data-field="guardian.phone"><TextField label="Số điện thoại" required inputMode="tel" value={f.gPhone} onChange={(e) => setF({ ...f, gPhone: e.target.value })} error={errs["guardian.phone"]} helper="Hiển thị dạng đã che cho nhân sự." /></div>
                </div>
              )}
            </div>
          </Card>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => embedded?onCancel?.():leave(() => router.push(`${base}/students`))} disabled={cmd.pending}>Hủy</Button>
            <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={cmd.pending}>Lưu học sinh</Button>
          </div>
        </div>
        <div className="space-y-4">
          <Callout tone="info" icon={<Info />} title="Dữ liệu tối thiểu">Chỉ thu họ tên, ngày sinh, giới tính, lớp và ngày vào lớp. Hồ sơ học sinh trùng tên luôn được tạo riêng, phân biệt bằng mã học sinh.</Callout>
          <Callout tone="warning" icon={<Lock />} title="Người giám hộ chưa được xác minh">Nhập số điện thoại không tự xác minh quan hệ. Chỉ sau khi nhà trường xác minh (có ghi căn cứ) mới cấp được link tra cứu.</Callout>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ SC19 — edit with version ------------------------------ */
export function StudentEditForm({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const {yearId} = useSchool();
  const q = useRepo(["student-profile", schoolId, studentId, yearId], (c) => studentsRepo.profile(c, schoolId, studentId, undefined, yearId || undefined));
  return <SchoolSourceState query={q}>{(d) => d.perms.edit ? <EditBody d={d} schoolId={schoolId} reload={async () => (await q.refetch()).data} /> : <div className="page"><DeniedState message="Bạn không có quyền sửa hồ sơ học sinh." /></div>}</SchoolSourceState>;
}

function EditBody({ d, schoolId, reload }: { d: Awaited<ReturnType<typeof studentsRepo.profile>>; schoolId: string; reload: () => Promise<Awaited<ReturnType<typeof studentsRepo.profile>> | undefined> }) {
  const router = useRouter();
  const leave = useLeaveGuard();
  const s = d.student;
  const base = `/school/${schoolId}`;
  const snapshot = useCallback((x: typeof s) => ({ fullName: x.fullName, dob: x.dob ?? undefined, gender: x.gender ?? "" as Gender | "", internalNote: x.internalNote ?? "" }), []);
  // Baseline = the version the form was opened with. Background refetches never replace the form (no silent overwrite).
  const [init, setInit] = useState(() => snapshot(s));
  const [version, setVersion] = useState(s.version);
  const [f, setF] = useState(init);
  const [local, setLocal] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const cmd = useCommand((c, patch: Parameters<typeof studentsRepo.update>[3]) => studentsRepo.update(c, schoolId, s.id, patch), { success: "Đã lưu hồ sơ học sinh" });
  const save = useCallback(async () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().split(/\s+/).filter(Boolean).length < 2) e.fullName = "Nhập đầy đủ họ và tên";
    if (!f.dob) e.dob = "Chọn ngày sinh";
    if (!f.gender) e.gender = "Chọn giới tính";
    if (f.internalNote.length > 300) e.internalNote = "Tối đa 300 ký tự";
    setLocal(e);
    if (Object.keys(e).length) return false;
    const r = await cmd.run({ fullName: f.fullName, dob: f.dob!, gender: f.gender as Gender, ...(d.perms.seeInternalNote ? {internalNote: f.internalNote.trim() || null} : {}), version });
    if (r) { setF(snapshot(r)); router.push(`${base}/students/${s.id}`); return true; }
    return false;
  }, [f, cmd, version, router, base, s.id, d.perms.seeInternalNote, snapshot]);
  useUnsavedChanges(dirty && !cmd.pending, save);
  if (!d.perms.edit) return <div className="page"><DeniedState message="Bạn không có quyền sửa hồ sơ học sinh." /></div>;
  const errs = { ...local, ...fieldErrorsOf(cmd.error) };

  return (
    <div className="page">
      <PageHeader title="Sửa thông tin học sinh" subtitle={`${s.fullName} — ${s.code}`} breadcrumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: s.fullName, href: `${base}/students/${s.id}` }, { label: "Sửa" }]} />
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="space-y-5">
          <ErrorSummary errors={errs} labels={{ ...LABELS, internalNote: "Ghi chú nội bộ" }} />
          {cmd.error && !["VALIDATION", "CONFLICT"].includes(cmd.error.code) && <ErrorState error={cmd.error} compact />}
          <Card>
            <CardHeader title="Thông tin được phép sửa" icon={<UserPlus className="size-5" />} subtitle={`Phiên bản dữ liệu v${version}${s.updatedAt ? ` · cập nhật ${fmtDateTime(s.updatedAt)}` : ""}`} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div data-field="fullName" className="sm:col-span-2"><TextField label="Họ và tên" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={errs.fullName} /></div>
              <div data-field="dob"><DateField label="Ngày sinh" required value={f.dob} onChange={(v) => setF({ ...f, dob: v })} max={addDays(d.today, -365 * 5)} error={errs.dob} /></div>
              <RadioGroup label="Giới tính" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} direction="row" options={[{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }]} />
              {d.perms.seeInternalNote && <div data-field="internalNote" className="sm:col-span-2"><TextArea label="Ghi chú nội bộ (chỉ nhân sự có quyền xem)" rows={3} maxChars={300} value={f.internalNote} onChange={(e) => setF({ ...f, internalNote: e.target.value })} error={errs.internalNote} helper="Không ghi thông tin nhạy cảm không cần thiết." /></div>}
            </div>
          </Card>
          <StickyActionBar className="!mx-0 rounded-xl border !px-4" tone={dirty ? "warning" : "default"} status={cmd.pending ? "Đang lưu…" : dirty ? "Có thay đổi chưa lưu" : "Không có thay đổi"}>
            <Button variant="ghost" onClick={() => leave(() => router.push(`${base}/students/${s.id}`))} disabled={cmd.pending}>Hủy</Button>
            <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={cmd.pending} disabled={!dirty}>Lưu thay đổi</Button>
          </StickyActionBar>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Không sửa ở đây" icon={<Lock className="size-5" />} />
            <dl className="px-5 pb-4">
              <InfoRow label="Mã học sinh">{s.code}</InfoRow>
              <InfoRow label="Lớp hiện tại">{d.currentClass?.name ?? "—"}</InfoRow>
              <InfoRow label="Năm học">{d.currentClass?.yearLabel ?? "—"}</InfoRow>
              <InfoRow label="Ngày sinh đang lưu">{fmtDate(s.dob)}</InfoRow>
            </dl>
            <p className="px-5 pb-4 text-[13px] text-muted">Đổi lớp hoặc ngừng theo học dùng chức năng “Chuyển lớp” để giữ lịch sử.</p>
          </Card>

        </div>
      </form>
      <ConflictDialog error={cmd.error} onClose={() => cmd.reset()} onReload={async () => { cmd.reset(); const nd = await reload(); if (nd) { const snap = snapshot(nd.student); setInit(snap); setF(snap); setVersion(nd.student.version); } }}
        mine={<dl><InfoRow label="Họ và tên">{f.fullName}</InfoRow><InfoRow label="Ngày sinh">{fmtDate(f.dob)}</InfoRow><InfoRow label="Giới tính">{f.gender}</InfoRow>{d.perms.seeInternalNote && f.internalNote && <InfoRow label="Ghi chú">{f.internalNote}</InfoRow>}</dl>} />
    </div>
  );
}
