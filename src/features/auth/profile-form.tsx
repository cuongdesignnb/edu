"use client";
import { useEffect, useState, type FormEvent } from "react";
import { UserRound, Building2, Save, Lock, Info } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import type { Me } from "@/lib/repositories/session";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { membershipStatus, schoolStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextField, TextArea, ErrorSummary, Field } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { QueryState } from "@/components/ui/states";

/** AU06 — personal profile: only personal fields are editable; assignments are read-only. */
export function ProfilePage() {
  const [formRevision,setFormRevision]=useState(0);
  const q = useRepo(["me"], (ctx) => sessionRepo.me(ctx));
  return (
    <QueryState query={q} skeleton="form">
      {(me) => (
        <div className="page">
          <PageHeader title="Hồ sơ cá nhân" subtitle="Thông tin hiển thị với đồng nghiệp trong các trường bạn tham gia" breadcrumbs={[{ label: "Tài khoản", href: "/account/profile" }, { label: "Hồ sơ cá nhân" }]}
            quote={["Mỗi thầy cô", "là một ngọn lửa thắp sáng tương lai"]} illustration="/assets/illustrations/teachers-trio.png" />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ProfileForm key={formRevision} me={me} onReload={async()=>{const result=await q.refetch();if(result.data&&!result.error)setFormRevision(value=>value+1);}} />
            <Memberships me={me} />
          </div>
        </div>
      )}
    </QueryState>
  );
}

function ProfileForm({ me, onReload }: { me: Me; onReload: () => void }) {
  const [u,setReviewed]=useState(me.user);
  const initial = { fullName: u.fullName, workPhone: u.workPhone, bio: u.bio ?? "" };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = form.fullName !== initial.fullName || form.workPhone !== initial.workPhone || form.bio !== initial.bio;
  const save = useCommand((ctx, f: typeof form) => sessionRepo.updateProfile(ctx, { ...f, version: u.version }), {
    success: "Đã lưu hồ sơ cá nhân",
    onSuccess:r=>{setReviewed(r);setForm({fullName:r.fullName,workPhone:r.workPhone,bio:r.bio??""});},
    onError: (e) => { if (e.fieldErrors) setErrors(e.fieldErrors); },
  });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 3) errs.fullName = "Họ tên tối thiểu 3 ký tự";
    if (form.workPhone.trim()&&!/^[0-9 *+().-]{8,20}$/.test(form.workPhone.trim())) errs.workPhone = "Số liên hệ công việc chưa hợp lệ (8–20 ký tự số, khoảng trắng, dấu *)";
    if (form.bio.length > 300) errs.bio = "Giới thiệu tối đa 300 ký tự";
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    return !!(await save.run(form));
  };
  useUnsavedChanges(dirty, submit);
  return (
    <Card>
      <CardHeader title="Thông tin cá nhân" icon={<UserRound className="size-5" />} subtitle={`Phiên bản hồ sơ: ${u.version}`} />
      <form className="space-y-4 px-5 pb-5" onSubmit={submit} noValidate>
        <div className="flex items-center gap-4">
          <Avatar name={form.fullName || u.fullName} tone={u.avatarTone} size={64} />
          <p className="text-[13px] text-muted">Ảnh đại diện dùng chữ viết tắt của họ tên.</p>
        </div>
        <ErrorSummary errors={errors} labels={{ fullName: "Họ và tên", workPhone: "Số liên hệ công việc", bio: "Giới thiệu" }} />
        <div className="grid gap-4 md:grid-cols-2">
          <div data-field="fullName"><TextField label="Họ và tên" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} autoComplete="name" /></div>
          <Field label="Email công việc" helper="Email do nhà trường dùng để mời — không tự đổi được.">
            <div className="input-icon"><Lock className="size-4" aria-hidden /><input className="input" value={u.email} readOnly aria-readonly="true" aria-label="Email công việc (chỉ đọc)" /></div>
          </Field>
          <div data-field="workPhone"><TextField label="Số liên hệ công việc" value={form.workPhone} onChange={(e) => setForm({ ...form, workPhone: e.target.value })} error={errors.workPhone} helper="Số liên hệ dùng trong công việc và hiển thị với đồng nghiệp." inputMode="tel" /></div>
          <Field label="Danh xưng" helper="Theo hồ sơ nhân sự của trường.">
            <input className="input" value={u.honorific ?? "Chưa có thông tin"} readOnly aria-readonly="true" aria-label="Danh xưng (chỉ đọc)" />
          </Field>
        </div>
        <div data-field="bio"><TextArea label="Giới thiệu ngắn" rows={3} maxChars={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} error={errors.bio} helper="Hiển thị với đồng nghiệp trong trường." /></div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" disabled={!dirty || save.pending} onClick={() => { setForm(initial); setErrors({}); }}>Hủy thay đổi</Button>
          <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={save.pending} disabled={!dirty}>Lưu hồ sơ</Button>
        </div>
      </form>
      <ConflictDialog error={save.error} onClose={save.reset} onReload={() => { save.reset(); onReload(); }}
        mine={<p className="text-sm">{form.fullName} · {form.workPhone}{form.bio ? ` · ${form.bio}` : ""}</p>} />
    </Card>
  );
}

function Memberships({ me }: { me: Me }) {
  return (
    <Card>
      <CardHeader title="Trường đang tham gia" icon={<Building2 className="size-5" />} subtitle={`${me.workspaces.length} trường`} />
      <div className="space-y-3 px-5 pb-5">
        {me.isPlatform && <Badge tone="info">Tài khoản vận hành nền tảng</Badge>}
        {me.workspaces.length === 0 && <p className="text-sm text-muted">Chưa là thành viên của trường nào.</p>}
        <ul className="space-y-3">
          {me.workspaces.map((w) => (
            <li key={w.membershipId} className="rounded-xl border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 font-semibold text-ink">{w.school.name}</p>
                <StatusBadge status={w.membershipStatus} map={membershipStatus} />
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{w.department}{w.roleNames.length ? ` · ${w.roleNames.join(", ")}` : ""} · Trường: {schoolStatus[w.school.status].label.toLowerCase()}</p>
              {w.duties.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{w.duties.map((d) => <li key={d}><Badge tone="info" dot={false}>{d}</Badge></li>)}</ul>}
            </li>
          ))}
        </ul>
        <Callout tone="neutral" icon={<Info />}>Phân công lớp/môn và vai trò do nhà trường quản lý. Bạn không tự thay đổi phân công của mình.</Callout>
      </div>
    </Card>
  );
}
