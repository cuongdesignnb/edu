"use client";
import { useMemo, useState } from "react";
import { School as SchoolIcon, UserCog, ClipboardCheck, PartyPopper, Save, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Link2, Copy } from "lucide-react";
import type { School } from "@/lib/model/types";
import { platformRepo } from "@/lib/repositories";
import { platformExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fold, fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Stepper } from "@/components/ui/progress";
import { TextField, SelectField, ErrorSummary } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { useToast } from "@/components/ui/toast";
import { Badge, DemoTag } from "@/components/ui/badge";

const STEPS = ["Thông tin trường", "Quản trị đầu tiên", "Kiểm tra", "Hoàn tất"];
const LEVELS: School["level"][] = ["THPT", "THCS", "Tiểu học"];
const EMPTY = { name: "", shortName: "", code: "", slug: "", level: "THPT" as School["level"], province: "", address: "", publicEmail: "", publicPhone: "", adminName: "", adminEmail: "" };
type Form = typeof EMPTY;
const LABELS: Record<string, string> = { name: "Tên trường", shortName: "Tên ngắn", code: "Mã trường", slug: "Đường dẫn công khai", province: "Tỉnh/thành", address: "Địa chỉ", publicEmail: "Email công khai", publicPhone: "Điện thoại công khai", adminName: "Họ tên quản trị", adminEmail: "Email quản trị" };
const STEP_OF: Record<string, number> = { name: 0, shortName: 0, code: 0, slug: 0, province: 0, address: 0, publicEmail: 0, publicPhone: 0, adminName: 1, adminEmail: 1 };
const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

function slugify(s: string) {
  return fold(s).replace(/^truong\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** PL03 — create school wizard. The school is always created as "Chờ kích hoạt"; never auto-activated. */
export function SchoolWizard() {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Awaited<ReturnType<typeof platformRepo.createSchool>> | null>(null);
  const provinces = useRepo(["platform-schools", "provinces"], (ctx) => platformRepo.listSchools(ctx, { pageSize: 1 }));
  const ident = useRepo(["school-identity", f.code, f.slug], (ctx) => platformExtraRepo.checkSchoolIdentity(ctx, f.code, f.slug), { enabled: !!(f.code || f.slug), staleTime: 0 });
  const dirty = !created && JSON.stringify(f) !== JSON.stringify(EMPTY);
  const create = useCommand((ctx, asDraft: boolean) => platformRepo.createSchool(ctx, { ...f, name: f.name.trim(), code: f.code.trim(), slug: f.slug.trim(), adminName: f.adminName.trim(), adminEmail: f.adminEmail.trim(), asDraft }), {
    success: (s) => `Đã tạo ${s.name} — trạng thái Chờ kích hoạt`,
    onError: (e) => {
      if (e.fieldErrors) { setErrors(e.fieldErrors); const first = Math.min(...Object.keys(e.fieldErrors).map((k) => STEP_OF[k] ?? 0)); setStep(first); }
    },
  });

  const set = (k: keyof Form, v: string) => {
    setF((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "name" && !slugTouched) next.slug = slugify(v);
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (f.name.trim().length < 5) e.name = "Tên trường tối thiểu 5 ký tự";
      if (!/^[A-Z0-9-]{3,16}$/.test(f.code)) e.code = "Mã gồm chữ in hoa, số, gạch nối (3–16 ký tự)";
      else if (ident.data?.codeTaken) e.code = "Mã trường đã tồn tại";
      if (!/^[a-z0-9-]{3,40}$/.test(f.slug)) e.slug = "Chỉ gồm chữ thường không dấu, số, gạch nối (3–40 ký tự)";
      else if (ident.data?.slugTaken) e.slug = "Đường dẫn đã được dùng";
      if (!f.province.trim()) e.province = "Chọn hoặc nhập tỉnh/thành";
      if (f.publicEmail && !isEmail(f.publicEmail)) e.publicEmail = "Email chưa hợp lệ";
    }
    if (s === 1) {
      if (f.adminEmail && !isEmail(f.adminEmail)) e.adminEmail = "Email quản trị chưa hợp lệ";
      if (f.adminEmail && f.adminName.trim().length < 3) e.adminName = "Họ tên tối thiểu 3 ký tự";
      if (!f.adminEmail && f.adminName) e.adminEmail = "Nhập email để tạo lời mời";
    }
    return e;
  };

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setStep((s) => Math.min(2, s + 1));
  };

  const save = async (asDraft: boolean) => {
    const e = { ...validateStep(0), ...validateStep(1) };
    if (!asDraft && !isEmail(f.adminEmail)) e.adminEmail = "Cần email quản trị đầu tiên để hoàn tất. Hoặc chọn “Lưu nháp”.";
    setErrors(e);
    if (Object.values(e).some(Boolean)) { setStep(Math.min(...Object.keys(e).filter((k) => e[k]).map((k) => STEP_OF[k] ?? 0))); return; }
    const s = await create.run(asDraft);
    if (s) { setCreated(s); setStep(3); }
  };

  const hasAdmin = isEmail(f.adminEmail) && f.adminName.trim().length >= 3;

  return (
    <div className="page">
      <PageHeader title="Tạo trường" subtitle="Mở không gian mới cho một trường. Trường mới luôn ở trạng thái “Chờ kích hoạt”." breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Danh sách trường", href: "/platform/schools" }, { label: "Tạo trường" }]}
        illustration="/assets/illustrations/school-header.png" quote={["Khởi tạo đúng", "vận hành bền vững"]} />
      <Card className="p-4 sm:p-5"><Stepper steps={STEPS} current={step} onStep={created ? undefined : setStep} /></Card>

      {step === 3 && created ? <Done school={created} invited={hasAdmin} onAnother={() => { setCreated(null); setF(EMPTY); setSlugTouched(false); setErrors({}); setStep(0); }} /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader title={STEPS[step]} icon={[<SchoolIcon key="0" className="size-5" />, <UserCog key="1" className="size-5" />, <ClipboardCheck key="2" className="size-5" />][step]} subtitle={`Bước ${step + 1}/4`} />
            <div className="space-y-4 px-5 pb-5">
              <ErrorSummary errors={errors} labels={LABELS} />
              {step === 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div data-field="name" className="md:col-span-2"><TextField label="Tên trường" required value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} placeholder="Ví dụ: Trường THCS Nguyễn Du" /></div>
                  <div data-field="shortName"><TextField label="Tên ngắn" value={f.shortName} onChange={(e) => set("shortName", e.target.value)} helper="Hiển thị ở sidebar, thông báo. Bỏ trống sẽ dùng tên đầy đủ." /></div>
                  <SelectField label="Cấp học" required value={f.level} onChange={(e) => set("level", e.target.value)} options={LEVELS.map((l) => ({ value: l, label: l }))} />
                  <div data-field="code"><TextField label="Mã trường" required value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} error={errors.code || (ident.data?.codeTaken ? "Mã trường đã tồn tại" : undefined)} helper="Chữ in hoa, số, gạch nối. Ví dụ THCS-ND" /></div>
                  <div data-field="slug"><TextField label="Đường dẫn công khai" required value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} error={errors.slug || (ident.data?.slugTaken ? "Đường dẫn đã được dùng" : undefined)} helper={f.slug ? `/schools/${f.slug}` : "Tự gợi ý từ tên trường"} /></div>
                  <div data-field="province"><TextField label="Tỉnh/thành" required list="province-list" value={f.province} onChange={(e) => set("province", e.target.value)} error={errors.province} /></div>
                  <datalist id="province-list">{(provinces.data?.provinces ?? []).map((p) => <option key={p} value={p} />)}</datalist>
                  <div data-field="address"><TextField label="Địa chỉ" value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
                  <div data-field="publicEmail"><TextField label="Email công khai" type="email" value={f.publicEmail} onChange={(e) => set("publicEmail", e.target.value)} error={errors.publicEmail} placeholder="lienhe@truong.edu.test" /></div>
                  <div data-field="publicPhone"><TextField label="Điện thoại công khai" value={f.publicPhone} onChange={(e) => set("publicPhone", e.target.value)} inputMode="tel" /></div>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  <Callout tone="info" icon={<UserCog />}>Người này nhận lời mời quản trị trường đầu tiên. Hệ thống gửi email chứa đường dẫn lời mời riêng. Có thể bỏ qua và mời sau — nhưng trường không kích hoạt được khi chưa có quản trị.</Callout>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div data-field="adminName"><TextField label="Họ tên quản trị" value={f.adminName} onChange={(e) => set("adminName", e.target.value)} error={errors.adminName} /></div>
                    <div data-field="adminEmail"><TextField label="Email công việc" type="email" value={f.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} error={errors.adminEmail} placeholder="quantri@truong.edu.test" /></div>
                  </div>
                  <p className="text-[13px] text-muted">Hạn lời mời: 14 ngày kể từ khi tạo. Có thể mời lại hoặc thu hồi trong mục Quản trị trường.</p>
                </div>
              )}
              {step === 2 && <Review f={f} hasAdmin={hasAdmin} />}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {step > 0 && <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(step - 1)} disabled={create.pending}>Quay lại</Button>}
                <span className="flex-1" />
                <Button variant="secondary" icon={<Save className="size-4" />} loading={create.pending} onClick={() => save(true)}>Lưu nháp</Button>
                {step < 2 ? <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={next}>Tiếp tục</Button>
                  : <Button variant="primary" icon={<CheckCircle2 className="size-4" />} loading={create.pending} onClick={() => save(false)}>Tạo trường và gửi lời mời</Button>}
              </div>
              {dirty && <p className="text-[12.5px] text-muted">Rời trang khi chưa lưu sẽ được hỏi lại. <button type="button" className="font-semibold text-primary-strong underline" onClick={() => { setF(EMPTY); setErrors({}); setStep(0); setSlugTouched(false); toast.push({ tone: "info", title: "Đã xóa nội dung đang nhập" }); }}>Hủy và xóa nội dung</button></p>}
            </div>
          </Card>
          <WizardAside />
        </div>
      )}
      <UnsavedGuard dirty={dirty} />
    </div>
  );
}

function UnsavedGuard({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return null;
}

function Review({ f, hasAdmin }: { f: Form; hasAdmin: boolean }) {
  const checks = useMemo(() => [
    { ok: true, label: "Thông tin trường đầy đủ các mục bắt buộc" },
    { ok: true, label: "Mã trường và đường dẫn chưa được dùng" },
    { ok: hasAdmin, label: hasAdmin ? "Có quản trị đầu tiên — sẽ tạo lời mời" : "Chưa có quản trị đầu tiên — chỉ lưu nháp được" },
    { ok: !!(f.publicEmail || f.publicPhone), label: f.publicEmail || f.publicPhone ? "Có liên hệ công khai" : "Chưa có liên hệ công khai (có thể bổ sung sau)" },
  ], [f, hasAdmin]);
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-line rounded-xl border border-line px-4">
        <InfoRow label="Tên trường">{f.name}{f.shortName && <span className="text-muted"> ({f.shortName})</span>}</InfoRow>
        <InfoRow label="Cấp học · Tỉnh/thành">{f.level} · {f.province}</InfoRow>
        <InfoRow label="Mã · Đường dẫn">{f.code} · /schools/{f.slug}</InfoRow>
        <InfoRow label="Địa chỉ">{f.address || "—"}</InfoRow>
        <InfoRow label="Liên hệ công khai">{[f.publicEmail, f.publicPhone].filter(Boolean).join(" · ") || "—"}</InfoRow>
        <InfoRow label="Quản trị đầu tiên">{hasAdmin ? `${f.adminName} — ${f.adminEmail}` : "Chưa có"}</InfoRow>
        <InfoRow label="Trạng thái sau khi tạo"><Badge tone="neutral">Chờ kích hoạt</Badge></InfoRow>
      </dl>
      <ul className="space-y-2">
        {checks.map((c) => <li key={c.label} className={`flex items-center gap-2 text-sm ${c.ok ? "text-success-text" : "text-warning-text"}`}>{c.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}{c.label}</li>)}
      </ul>
      <Callout tone="neutral">Trường không được tự kích hoạt. Kích hoạt trong hồ sơ trường sau khi quản trị đầu tiên chấp nhận lời mời.</Callout>
    </div>
  );
}

function WizardAside() {
  return (
    <aside className="space-y-4">
      <Card className="p-5">
        <p className="text-[15px] font-bold text-ink">Quy trình khởi tạo</p>
        <ol className="mt-3 space-y-2.5 text-[13.5px] text-body">
          <li>1. Tạo hồ sơ vận hành của trường (không có dữ liệu học sinh).</li>
          <li>2. Mời quản trị đầu tiên; người đó chấp nhận qua đường dẫn.</li>
          <li>3. Nền tảng kích hoạt trường khi đã có quản trị.</li>
          <li>4. Nhà trường tự tạo năm học, lớp, mời giáo viên.</li>
        </ol>
      </Card>
      <Callout tone="info">Không có gói cước hay thanh toán. Trạng thái trường chỉ phản ánh vận hành.</Callout>
    </aside>
  );
}

function Done({ school, invited, onAnother }: { school: Awaited<ReturnType<typeof platformRepo.createSchool>>; invited: boolean; onAnother: () => void }) {
  const d = useRepo(["platform-school", school.id], (ctx) => platformRepo.school(ctx, school.id));
  const toast = useToast();
  const inv = d.data?.invitations?.find((i) => i.status === "pending");
  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start gap-4">
        <span className="icon-tile tone-green !size-14" aria-hidden><PartyPopper className="size-7" /></span>
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="text-[20px] font-bold text-ink">Đã tạo {school.name}</h2>
          <p className="mt-1 text-[14px] text-body">Trạng thái: <Badge tone="neutral">Chờ kích hoạt</Badge>. Trường chưa hoạt động cho đến khi nền tảng kích hoạt.</p>
        </div>
      </div>
      {invited ? (
        <div className="mt-5 rounded-xl border border-line bg-[#f7fbff] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 className="size-4 text-primary" aria-hidden />Lời mời quản trị đầu tiên</p>
          <p className="mt-1 text-[13.5px] text-body">{inv?`${inv.fullName} — ${inv.email} · hạn ${fmtDateTime(inv.expiresAt)}`:"Lời mời đã được tạo cùng hồ sơ trường. Đang tải thông tin lời mời."}</p>
          <p className="mt-2 text-sm text-muted">Đường dẫn riêng được gửi qua email. Không sao chép lại mã bí mật từ danh sách lời mời.</p>
        </div>
      ) : (
        <Callout className="mt-5" tone="warning" icon={<AlertTriangle />}>Đã lưu nháp, chưa có quản trị đầu tiên. Hãy mời quản trị trước khi kích hoạt.</Callout>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={`/platform/schools/${school.id}`} variant="primary">Mở hồ sơ trường</ButtonLink>
        <ButtonLink href={`/platform/schools/${school.id}/admins`}>Quản trị trường</ButtonLink>
        <Button variant="ghost" onClick={onAnother}>Tạo trường khác</Button>
      </div>
    </Card>
  );
}
