"use client";
import { StickyActionBar } from "@/components/ui/sticky-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, UserPlus, Users, Info, FlaskConical, Lock } from "lucide-react";
import type { Gender, GuardianRelationship } from "@/lib/model/types";
import { schoolRepo, studentsRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { addDays } from "@/lib/demo/clock";
import { IS_DEMO } from "@/lib/demo/session";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, DateField, ErrorSummary, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { ConflictDialog, useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";
import { DeniedState, QueryState } from "@/components/ui/states";
import { DemoTag } from "@/components/ui/badge";
import { RELATIONS, fieldErrorsOf } from "./shared";

const LABELS: Record<string, string> = { fullName: "Họ và tên", dob: "Ngày sinh", gender: "Giới tính", code: "Mã học sinh", classId: "Lớp", startDate: "Ngày vào lớp", "guardian.fullName": "Họ tên người giám hộ", "guardian.phone": "SĐT người giám hộ" };

/* ------------------------------ SC17 — add student ------------------------------ */
export function StudentCreateForm({ schoolId }: { schoolId: string }) {
  const { can } = useSchool();
  const ctx = useCtx();
  const router = useRouter();
  const leave = useLeaveGuard();
  const base = `/school/${schoolId}`;
  const classes = useRepo(["class-options", schoolId], (c) => schoolRepo.classOptions(c, schoolId));
  const init = useMemo(() => ({ fullName: "", dob: undefined as string | undefined, gender: "" as Gender | "", code: "", classId: "", startDate: ctx.today as string | undefined, withGuardian: false, gName: "", gRelation: "Mẹ" as GuardianRelationship["relation"], gPhone: "" }), [ctx.today]);
  const [f, setF] = useState(init);
  const [local, setLocal] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const cmd = useCommand((c, input: Parameters<typeof studentsRepo.create>[2]) => studentsRepo.create(c, schoolId, input), { success: (s) => `Đã thêm học sinh ${s.fullName} (${s.code})` });

  const save = useCallback(async () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().split(/\s+/).filter(Boolean).length < 2) e.fullName = "Nhập đầy đủ họ và tên";
    if (!f.dob) e.dob = "Chọn ngày sinh";
    if (!f.gender) e.gender = "Chọn giới tính";
    if (f.code && !/^[A-Za-z0-9-]{3,20}$/.test(f.code.trim())) e.code = "Mã chỉ gồm chữ, số, gạch nối (3–20 ký tự)";
    if (!f.classId) e.classId = "Chọn lớp";
    if (!f.startDate) e.startDate = "Chọn ngày vào lớp";
    if (f.withGuardian) {
      if (f.gName.trim().split(/\s+/).filter(Boolean).length < 2) e["guardian.fullName"] = "Nhập đầy đủ họ tên người giám hộ";
      if (!/^[0-9 .+-]{8,15}$/.test(f.gPhone.trim())) e["guardian.phone"] = "Số điện thoại chưa hợp lệ";
    }
    setLocal(e);
    if (Object.keys(e).length) return false;
    const s = await cmd.run({ fullName: f.fullName, dob: f.dob!, gender: f.gender as Gender, code: f.code.trim() || undefined, classId: f.classId, startDate: f.startDate!,
      guardian: f.withGuardian ? { fullName: f.gName, relation: f.gRelation, phone: f.gPhone.trim() } : undefined });
    if (s) { setF(init); router.push(`${base}/students/${s.id}`); return true; }
    return false;
  }, [f, cmd, init, router, base]);
  useUnsavedChanges(dirty && !cmd.pending, save);
  if (!can("student.edit")) return <div className="page"><DeniedState message="Bạn không có quyền thêm học sinh." /></div>;
  const errs = { ...local, ...fieldErrorsOf(cmd.error) };

  return (
    <div className="page">
      <PageHeader title="Thêm học sinh" subtitle="Chỉ nhập thông tin tối thiểu cần cho quản lý lớp. Không thu CCCD, dân tộc, địa chỉ hay liên hệ riêng của học sinh."
        breadcrumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: "Thêm học sinh" }]} />
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="space-y-5">
          <ErrorSummary errors={errs} labels={LABELS} />
          <Card>
            <CardHeader title="Thông tin học sinh" icon={<UserPlus className="size-5" />} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div data-field="fullName" className="sm:col-span-2"><TextField label="Họ và tên" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={errs.fullName} autoComplete="off" /></div>
              <div data-field="dob"><DateField label="Ngày sinh" required value={f.dob} onChange={(v) => setF({ ...f, dob: v })} max={addDays(ctx.today, -365 * 5)} error={errs.dob} /></div>
              <div data-field="gender"><RadioGroup label="Giới tính" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} direction="row" error={errs.gender} options={[{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }]} /></div>
              <div data-field="code"><TextField label="Mã học sinh (tùy chọn)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} error={errs.code} helper="Để trống để hệ thống tự cấp mã. Mã phải là duy nhất trong trường." /></div>
              <div data-field="classId"><SelectField label="Lớp" required value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })} error={errs.classId} placeholder={classes.isLoading ? "Đang tải…" : "Chọn lớp"}
                options={(classes.data ?? []).filter((c) => c.status !== "archived").map((c) => ({ value: c.id, label: `${c.name}${c.status === "draft" ? " (nháp)" : ""}` }))} /></div>
              <div data-field="startDate"><DateField label="Ngày vào lớp" required value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} error={errs.startDate} /></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Người giám hộ (tùy chọn)" icon={<Users className="size-5" />} subtitle="Được lưu ở trạng thái “Chưa xác minh”." />
            <div className="space-y-4 px-5 pb-5">
              <Checkbox label="Thêm người giám hộ ngay" checked={f.withGuardian} onChange={(v) => setF({ ...f, withGuardian: v })} />
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
            <Button variant="ghost" onClick={() => leave(() => router.push(`${base}/students`))} disabled={cmd.pending}>Hủy</Button>
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
  const q = useRepo(["student-profile", schoolId, studentId], (c) => studentsRepo.profile(c, schoolId, studentId));
  return <QueryState query={q} skeleton="form">{(d) => <EditBody d={d} schoolId={schoolId} reload={async () => (await q.refetch()).data} />}</QueryState>;
}

function EditBody({ d, schoolId, reload }: { d: Awaited<ReturnType<typeof studentsRepo.profile>>; schoolId: string; reload: () => Promise<Awaited<ReturnType<typeof studentsRepo.profile>> | undefined> }) {
  const router = useRouter();
  const leave = useLeaveGuard();
  const ctx = useCtx();
  const s = d.student;
  const base = `/school/${schoolId}`;
  const snapshot = (x: typeof s) => ({ fullName: x.fullName, dob: x.dob as string | undefined, gender: x.gender as Gender, internalNote: x.internalNote ?? "" });
  // Baseline = the version the form was opened with. Background refetches never replace the form (no silent overwrite).
  const [init, setInit] = useState(() => snapshot(s));
  const [version, setVersion] = useState(s.version ?? 1);
  const [f, setF] = useState(init);
  const [local, setLocal] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const cmd = useCommand((c, patch: Parameters<typeof studentsRepo.update>[3]) => studentsRepo.update(c, schoolId, s.id, patch), { success: "Đã lưu hồ sơ học sinh" });
  // Demo only: another save of the current server record bumps its version, so this open form becomes stale.
  const other = useCommand((c) => studentsRepo.update(c, schoolId, s.id, { fullName: s.fullName, dob: s.dob!, gender: s.gender!, internalNote: s.internalNote, version: s.version ?? 1 }), { success: "Mô phỏng: hồ sơ vừa được lưu ở phiên khác" });
  const [simulated, setSimulated] = useState(false);

  const save = useCallback(async () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().split(/\s+/).filter(Boolean).length < 2) e.fullName = "Nhập đầy đủ họ và tên";
    if (!f.dob) e.dob = "Chọn ngày sinh";
    if (f.internalNote.length > 300) e.internalNote = "Tối đa 300 ký tự";
    setLocal(e);
    if (Object.keys(e).length) return false;
    const r = await cmd.run({ fullName: f.fullName, dob: f.dob!, gender: f.gender, internalNote: f.internalNote.trim() || undefined, version });
    if (r) { setF({ fullName: r.fullName, dob: r.dob, gender: r.gender, internalNote: r.internalNote ?? "" }); router.push(`${base}/students/${s.id}`); return true; }
    return false;
  }, [f, cmd, version, router, base, s.id]);
  useUnsavedChanges(dirty && !cmd.pending, save);
  if (!d.perms.edit) return <div className="page"><DeniedState message="Bạn không có quyền sửa hồ sơ học sinh." /></div>;
  const errs = { ...local, ...fieldErrorsOf(cmd.error) };

  return (
    <div className="page">
      <PageHeader title="Sửa thông tin học sinh" subtitle={`${s.fullName} — ${s.code}`} breadcrumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: s.fullName, href: `${base}/students/${s.id}` }, { label: "Sửa" }]} />
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="space-y-5">
          <ErrorSummary errors={errs} labels={{ ...LABELS, internalNote: "Ghi chú nội bộ" }} />
          <Card>
            <CardHeader title="Thông tin được phép sửa" icon={<UserPlus className="size-5" />} subtitle={`Phiên bản dữ liệu v${version}${s.updatedAt ? ` · cập nhật ${fmtDateTime(s.updatedAt)}` : ""}`} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div data-field="fullName" className="sm:col-span-2"><TextField label="Họ và tên" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={errs.fullName} /></div>
              <div data-field="dob"><DateField label="Ngày sinh" required value={f.dob} onChange={(v) => setF({ ...f, dob: v })} max={addDays(ctx.today, -365 * 5)} error={errs.dob} /></div>
              <RadioGroup label="Giới tính" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} direction="row" options={[{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }]} />
              <div data-field="internalNote" className="sm:col-span-2"><TextArea label="Ghi chú nội bộ (chỉ nhân sự có quyền xem)" rows={3} maxChars={300} value={f.internalNote} onChange={(e) => setF({ ...f, internalNote: e.target.value })} error={errs.internalNote} helper="Không ghi thông tin nhạy cảm không cần thiết." /></div>
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
          {IS_DEMO && (
            <Callout tone="neutral" icon={<FlaskConical />} title={<span className="flex items-center gap-2">Kiểm tra xung đột phiên bản <DemoTag /></span>}
              action={<Button size="sm" loading={other.pending} disabled={simulated} onClick={async () => { if (await other.run()) setSimulated(true); }}>{simulated ? "Đã mô phỏng" : "Mô phỏng"}</Button>}>
              Mô phỏng một phiên khác vừa lưu hồ sơ này (phiên bản tăng lên). Khi bạn bấm Lưu, hệ thống phát hiện xung đột và không ghi đè.
            </Callout>
          )}
        </div>
      </form>
      <ConflictDialog error={cmd.error} onClose={() => cmd.reset()} onReload={async () => { cmd.reset(); const nd = await reload(); if (nd) { const snap = snapshot(nd.student); setInit(snap); setF(snap); setVersion(nd.student.version ?? 1); setSimulated(false); } }}
        mine={<dl><InfoRow label="Họ và tên">{f.fullName}</InfoRow><InfoRow label="Ngày sinh">{fmtDate(f.dob)}</InfoRow><InfoRow label="Giới tính">{f.gender}</InfoRow>{f.internalNote && <InfoRow label="Ghi chú">{f.internalNote}</InfoRow>}</dl>} />
    </div>
  );
}
