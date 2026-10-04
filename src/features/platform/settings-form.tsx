"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Settings, Save, Eye, Mail, Phone, Info, CalendarClock } from "lucide-react";
import type { PlatformSettings } from "@/lib/model/types";
import { platformRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextField, TextArea, ErrorSummary } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { LogoMark } from "@/components/layout/brand";
import { QueryState } from "@/components/ui/states";
import {PlatformMailSettingsCard} from './mail-settings-form';

/** PL11 — platform settings with live preview. No plans, billing or payment settings exist. */
export function PlatformSettingsPage() {
  const q = useRepo(["platform-settings"], (ctx) => platformRepo.settings(ctx));
  return <QueryState query={q} skeleton="form">{(s) => <Form s={s} reload={() => q.refetch()} />}</QueryState>;
}

function Form({ s, reload }: { s: PlatformSettings; reload: () => void }) {
  const init = { brandName: s.brandName, supportEmail: s.supportEmail, supportPhone: s.supportPhone, footerNote: s.footerNote };
  const [f, setF] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setF({ brandName: s.brandName, supportEmail: s.supportEmail, supportPhone: s.supportPhone, footerNote: s.footerNote }); setErrors({}); }, [s.version, s.brandName, s.supportEmail, s.supportPhone, s.footerNote]);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const cmd = useCommand((ctx, v: typeof f) => platformRepo.saveSettings(ctx, { ...v, version: s.version }), { success: "Đã lưu cấu hình nền tảng", onError: (e) => e.fieldErrors && setErrors(e.fieldErrors) });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const er: Record<string, string> = {};
    if (f.brandName.trim().length < 2) er.brandName = "Tên hiển thị tối thiểu 2 ký tự";
    if (!/^\S+@\S+\.\S+$/.test(f.supportEmail.trim())) er.supportEmail = "Email hỗ trợ chưa hợp lệ";
    if (!f.supportPhone.trim()) er.supportPhone = "Nhập số liên hệ hỗ trợ";
    if (f.footerNote.length > 160) er.footerNote = "Tối đa 160 ký tự";
    setErrors(er);
    if (Object.keys(er).length) return false;
    return !!(await cmd.run(f));
  };
  useUnsavedChanges(dirty, submit);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="page">
      <PageHeader title="Cấu hình nền tảng" subtitle="Thương hiệu, liên hệ hỗ trợ và gửi email tùy chọn" breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Cấu hình" }]} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Thương hiệu và hỗ trợ" icon={<Settings className="size-5" />} subtitle={`Phiên bản cấu hình: ${s.version}`} />
          <form className="space-y-4 px-5 pb-5" onSubmit={submit} noValidate>
            <ErrorSummary errors={errors} labels={{ brandName: "Tên hiển thị", supportEmail: "Email hỗ trợ", supportPhone: "Điện thoại hỗ trợ", footerNote: "Ghi chú chân trang" }} />
            <div data-field="brandName"><TextField label="Tên hiển thị" required value={f.brandName} onChange={set("brandName")} error={errors.brandName} /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div data-field="supportEmail"><TextField label="Email hỗ trợ" type="email" required value={f.supportEmail} onChange={set("supportEmail")} error={errors.supportEmail} icon={<Mail className="size-4" />} /></div>
              <div data-field="supportPhone"><TextField label="Điện thoại hỗ trợ" required value={f.supportPhone} onChange={set("supportPhone")} error={errors.supportPhone} icon={<Phone className="size-4" />} /></div>
            </div>
            <div data-field="footerNote"><TextArea label="Ghi chú chân trang" rows={2} maxChars={160} value={f.footerNote} onChange={set("footerNote")} error={errors.footerNote} /></div>
            <div className="rounded-xl border border-line bg-[#f7fbff] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><CalendarClock className="size-4 text-primary" aria-hidden />Quy ước hiển thị (cố định)</p>
              <dl className="mt-1"><InfoRow label="Định dạng ngày">{s.dateFormat}</InfoRow><InfoRow label="Múi giờ">{s.timezone} (+07)</InfoRow></dl>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" disabled={!dirty || cmd.pending} onClick={() => { setF(init); setErrors({}); }}>Hủy thay đổi</Button>
              <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={cmd.pending} disabled={!dirty}>Lưu cấu hình</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Xem trước" icon={<Eye className="size-5" />} subtitle={dirty ? "Đang hiển thị nội dung chưa lưu" : "Giống nội dung đang áp dụng"} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3"><LogoMark size={36} /><div><p className="text-[18px] font-bold text-primary-strong">{f.brandName || "—"}</p><p className="text-[12px] text-muted">Thanh tiêu đề</p></div></div>
              <div className="rounded-xl border border-line bg-white/80 p-3 text-[13px] text-muted">
                <p className="font-bold text-ink">{f.brandName || "—"}</p>
                <p>{f.footerNote || "—"}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-4">Hỗ trợ: <span>{f.supportEmail || "—"}</span><span>{f.supportPhone || "—"}</span></p>
                <p className="mt-1 text-[12px]">Chân trang, trang quyền riêng tư và hướng dẫn</p>
              </div>
            </div>
          </Card>
          <Callout tone="info" icon={<Info />}>Thông tin thương hiệu và liên hệ hỗ trợ được dùng chung trên giao diện EduManage.</Callout>
        </div>
      </div>
      <PlatformMailSettingsCard/>
      <ConflictDialog error={cmd.error} onClose={cmd.reset} onReload={() => { cmd.reset(); reload(); }} mine={<p className="text-sm">{f.brandName} · {f.supportEmail} · {f.supportPhone}</p>} />
    </div>
  );
}
