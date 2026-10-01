"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, Palette, Globe, Phone, Mail, MapPin, Eye, ImageIcon, Lock } from "lucide-react";
import type { School } from "@/lib/model/types";
import { schoolRepo, type RepoError } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DemoTag } from "@/components/ui/badge";
import { SchoolMark } from "@/components/ui/avatar";
import { ErrorSummary, TextArea, TextField } from "@/components/ui/form";
import { FileDropzone } from "@/components/ui/file";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";
import { FormError, useFormErrors } from "./common";

type Form = Pick<School, "shortName" | "motto" | "publicIntro" | "publicPhone" | "publicEmail" | "address" | "website" | "accentColor">;
const LABELS: Record<string, string> = { shortName: "Tên viết tắt", motto: "Khẩu hiệu", publicIntro: "Giới thiệu", publicPhone: "Điện thoại", publicEmail: "Email liên hệ", address: "Địa chỉ", website: "Website", accentColor: "Màu nhấn" };
const PRESETS = ["#0a72e6", "#087cfa", "#0e9f6e", "#7c5ce0", "#e5484d", "#f59e0b", "#0891b2", "#be185d"];

/** SC02 — school identity: public info, accent color with live preview, logo check (local preview only). Plain text only — no HTML/JS. */
export function ProfileScreen() {
  const { school } = useSchool();
  const q = useRepo(["school-profile", school.id], (c) => schoolRepo.profile(c, school.id));
  if (q.data && (!q.error || q.error.code === "READ_ERROR")) return <ProfileForm s={q.data.school} canEdit={q.data.canEdit} readError={q.error?.message} onReload={async () => { const r = await q.refetch(); return r.error ? undefined : r.data?.school; }} />;
  return <QueryState query={q} skeleton="form">{() => null}</QueryState>;
}

type NativeSchool = Awaited<ReturnType<typeof schoolRepo.profile>>["school"];
function ProfileForm({ s: latest, canEdit, onReload, readError }: { readError?: string; s: NativeSchool; canEdit: boolean; onReload: () => Promise<NativeSchool | undefined> }) {
  const [s, setReviewed] = useState(latest);
  const init = useMemo<Form>(() => ({ shortName: s.shortName, motto: s.motto, publicIntro: s.publicIntro, publicPhone: s.publicPhone, publicEmail: s.publicEmail, address: s.address, website: s.website ?? "", accentColor: s.accentColor }), [s]);
  const [v, setV] = useState<Form>(init);
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  const cmd = useCommand((c, patch: Form & { version: number }) => schoolRepo.saveProfile(c, s.id, patch), { success: "Đã lưu thông tin trường", onError: (e) => { if (e.code === "CONFLICT") setConflict(e); onError(e); } });
  const save = async () => {
    const e: Record<string, string> = {};
    if (v.shortName.trim().length < 2) e.shortName = "Nhập tên viết tắt";
    if (v.publicEmail && !/^\S+@\S+\.\S+$/.test(v.publicEmail)) e.publicEmail = "Email liên hệ chưa hợp lệ";
    if (!/^#[0-9a-fA-F]{6}$/.test(v.accentColor)) e.accentColor = "Màu nhấn dạng #RRGGBB";
    if (/[<>]/.test(v.publicIntro + v.motto + v.shortName + v.address)) e.publicIntro = "Không chèn mã HTML/JS — chỉ nhập văn bản thường";
    if (v.publicIntro.length > 600) e.publicIntro = "Tối đa 600 ký tự";
    if (v.website && !/^https?:\/\/[^\s<>]+$/.test(v.website)) e.website = "Website bắt đầu bằng http:// hoặc https://";
    if (Object.keys(e).length) { setErrors(e); return false; }
    const r = await cmd.run({ ...v, website: v.website || undefined, version: s.version });
    if (r) { setReviewed(r); setV({ shortName: r.shortName, motto: r.motto, publicIntro: r.publicIntro, publicPhone: r.publicPhone, publicEmail: r.publicEmail, address: r.address, website: r.website ?? "", accentColor: r.accentColor }); }
    return !!r;
  };
  useUnsavedChanges(dirty, save);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.url); }, [logo]);
  const set = <K extends keyof Form>(k: K, val: Form[K]) => { setV((x) => ({ ...x, [k]: val })); clear(k); };
  const ro = !canEdit;
  return (
    <div className="page">
      <PageHeader title="Thông tin và nhận diện trường" subtitle="Thông tin công khai hiển thị trên trang trường, cổng phụ huynh và bản in"
        breadcrumbs={[{ label: "Nhà trường", href: `/school/${s.id}` }, { label: "Thông tin trường" }]}
        actions={canEdit ? <><Button variant="ghost" disabled={!dirty || cmd.pending} onClick={() => { setV(init); setErrors({}); }}>Hủy thay đổi</Button><Button variant="primary" loading={cmd.pending} disabled={!dirty} onClick={save}>Lưu thông tin</Button></> : undefined} />
      {readError && <FormError message={readError} />}
      {ro && <Callout tone="neutral" icon={<Lock />}>Bạn chỉ có quyền xem. Sửa thông tin trường cần quyền “Sửa thông tin và nhận diện trường”.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Thông tin định danh" icon={<Building2 className="size-5 text-primary" />} subtitle="Do nền tảng quản lý — liên hệ hỗ trợ nếu cần đổi" />
            <dl className="px-5 pb-4"><InfoRow label="Tên trường">{s.name}</InfoRow><InfoRow label="Mã trường">{s.code}</InfoRow><InfoRow label="Đường dẫn trang trường">/schools/{s.slug}</InfoRow><InfoRow label="Cấp học · Tỉnh/thành">{s.level ?? "Chưa khai báo cấp học"} · {s.province}</InfoRow></dl>
          </Card>
          <Card>
            <CardHeader title="Thông tin công khai" icon={<Globe className="size-5 text-primary" />} />
            <form className="space-y-4 px-5 pb-5" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
              <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={LABELS} />
              <FormError message={errors._form} />
              <div className="grid gap-4 md:grid-cols-2">
                <div data-field="shortName"><TextField label="Tên viết tắt" required disabled={ro} value={v.shortName} onChange={(e) => set("shortName", e.target.value)} error={errors.shortName} /></div>
                <div data-field="motto"><TextField label="Khẩu hiệu" disabled={ro} value={v.motto} onChange={(e) => set("motto", e.target.value)} error={errors.motto} maxLength={80} /></div>
              </div>
              <div data-field="publicIntro"><TextArea label="Giới thiệu ngắn" disabled={ro} rows={4} maxChars={600} value={v.publicIntro} onChange={(e) => set("publicIntro", e.target.value)} error={errors.publicIntro} helper="Văn bản thường, không nhận HTML hoặc mã script." /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div data-field="publicPhone"><TextField label="Điện thoại công khai" disabled={ro} icon={<Phone className="size-4" />} value={v.publicPhone} onChange={(e) => set("publicPhone", e.target.value)} /></div>
                <div data-field="publicEmail"><TextField label="Email liên hệ" disabled={ro} type="email" icon={<Mail className="size-4" />} value={v.publicEmail} onChange={(e) => set("publicEmail", e.target.value)} error={errors.publicEmail} /></div>
                <div data-field="address"><TextField label="Địa chỉ" disabled={ro} icon={<MapPin className="size-4" />} value={v.address} onChange={(e) => set("address", e.target.value)} /></div>
                <div data-field="website"><TextField label="Website" disabled={ro} placeholder="https://" value={v.website ?? ""} onChange={(e) => set("website", e.target.value)} error={errors.website} /></div>
              </div>
              <button type="submit" hidden aria-hidden tabIndex={-1} />
            </form>
          </Card>
          <Card>
            <CardHeader title="Màu nhấn và logo" icon={<Palette className="size-5 text-primary" />} />
            <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
              <div data-field="accentColor" className="field">
                <span className="label">Màu nhấn</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" aria-label="Chọn màu nhấn" disabled={ro} value={/^#[0-9a-fA-F]{6}$/.test(v.accentColor) ? v.accentColor : "#0a72e6"} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line disabled:cursor-not-allowed" />
                  <input className="input !w-[120px] font-mono" aria-label="Mã màu" disabled={ro} value={v.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Màu gợi ý">
                  {PRESETS.map((c) => <button key={c} type="button" disabled={ro} onClick={() => set("accentColor", c)} className="size-7 rounded-full border-2 border-white ring-1 ring-line disabled:cursor-not-allowed" style={{ background: c }} aria-label={`Dùng màu ${c}`} aria-pressed={v.accentColor.toLowerCase() === c} />)}
                </div>
                {errors.accentColor && <p className="error-text">{errors.accentColor}</p>}
              </div>
              <div>
                <p className="label mb-1.5 flex items-center gap-2">Logo <DemoTag>Xem trước cục bộ</DemoTag></p>
                <FileDropzone accept={["image/png", "image/jpeg", "image/webp"]} maxBytes={1024 * 1024} disabled={ro} label="Chọn ảnh logo (PNG, JPG, WEBP)" hint="Tối đa 1 MB. Không nhận SVG (có thể chứa mã)."
                  onFiles={([f]) => { if (logo) URL.revokeObjectURL(logo.url); setLogo({ url: URL.createObjectURL(f), name: f.name }); }} />
                <p className="mt-1.5 text-[12px] text-muted">{logo ? `Đang xem trước “${logo.name}”. ` : ""}Ảnh đang chọn chỉ dùng để xem trước. Hồ sơ hiện dùng ký hiệu chữ theo màu nhấn.</p>
              </div>
            </div>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="xl:sticky xl:top-4">
            <CardHeader title="Bản xem trước" icon={<Eye className="size-5 text-primary" />} subtitle="Cách trang trường và cổng phụ huynh hiển thị" />
            <div className="px-5 pb-5">
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="h-2" style={{ background: v.accentColor }} aria-hidden />
                <div className="flex items-center gap-3 p-4">
                  {logo ? <img src={logo.url} alt={`Logo ${s.name} (xem trước)`} className="size-12 rounded-xl object-contain" /> : <SchoolMark name={s.name} color={/^#[0-9a-fA-F]{6}$/.test(v.accentColor) ? v.accentColor : "#0a72e6"} size={48} />}
                  <div className="min-w-0"><p className="truncate text-[16px] font-bold text-ink">{s.name}</p><p className="text-[12.5px] text-muted">{v.shortName} · {s.province}</p></div>
                </div>
                <div className="space-y-3 border-t border-line bg-[#fafcff] p-4">
                  {v.motto && <p className="quote !text-[17px]">“{v.motto}”</p>}
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-body">{v.publicIntro || "Chưa có giới thiệu."}</p>
                  <ul className="space-y-1 text-[13px] text-body">
                    {v.address && <li className="flex gap-2"><MapPin className="mt-0.5 size-3.5 flex-none text-muted" aria-hidden />{v.address}</li>}
                    {v.publicPhone && <li className="flex gap-2"><Phone className="mt-0.5 size-3.5 flex-none text-muted" aria-hidden />{v.publicPhone}</li>}
                    {v.publicEmail && <li className="flex gap-2"><Mail className="mt-0.5 size-3.5 flex-none text-muted" aria-hidden />{v.publicEmail}</li>}
                    {v.website && <li className="flex gap-2"><Globe className="mt-0.5 size-3.5 flex-none text-muted" aria-hidden />{v.website}</li>}
                  </ul>
                  <span className="inline-flex rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: v.accentColor }}>Xem thông báo</span>
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><ImageIcon className="size-3.5" aria-hidden />Nội dung hiển thị dạng văn bản thường, không thực thi mã.</p>
            </div>
          </Card>
        </div>
      </div>
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={async () => { const refreshed = await onReload(); if (refreshed) { setReviewed(refreshed); setV({ shortName: refreshed.shortName, motto: refreshed.motto, publicIntro: refreshed.publicIntro, publicPhone: refreshed.publicPhone, publicEmail: refreshed.publicEmail, address: refreshed.address, website: refreshed.website ?? "", accentColor: refreshed.accentColor }); setErrors({}); setConflict(null); } }} mine={<span>{v.shortName} · {v.motto}</span>} />
    </div>
  );
}
