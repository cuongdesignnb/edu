"use client";
import { useCallback, useMemo, useState } from "react";
import { Settings2, Link2, Contact, FileText, Save, Lock, Scale, Globe } from "lucide-react";
import type { SchoolSettings } from "@/lib/model/types";
import { schoolRepo, type RepoError } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { ErrorSummary, NumberField, TextField, Toggle } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";

type Data = Awaited<ReturnType<typeof schoolRepo.settings>>;
type Form = Omit<SchoolSettings, "schoolId" | "language" | "timezone" | "linkDefaultDays"> & { linkDefaultDays?: number };

/** SC41 — display & sharing settings with version-conflict handling. Values are suggestions, not legal conclusions. */
export function SettingsForm({ schoolId, data, schoolName }: { schoolId: string; data: Data; schoolName: string }) {
  const s = data.settings;
  const init = useMemo<Form>(() => ({ linkDefaultDays: s.linkDefaultDays, reportHeader: s.reportHeader, shareTeacherPhone: s.shareTeacherPhone, shareTeacherEmail: s.shareTeacherEmail, contactHours: s.contactHours, version: s.version }), [s]);
  const [f, setF] = useState<Form>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ro = !data.canEdit;
  const dirty = !ro && JSON.stringify(f) !== JSON.stringify(init);
  const check = () => {
    const e: Record<string, string> = {};
    if (f.linkDefaultDays === undefined || f.linkDefaultDays < 7 || f.linkDefaultDays > 366) e.linkDefaultDays = "Từ 7 đến 366 ngày";
    if (!f.reportHeader.trim()) e.reportHeader = "Nhập tiêu đề đầu báo cáo";
    if (f.contactHours.trim().length > 120) e.contactHours = "Tối đa 120 ký tự";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const save = useCommand((ctx) => schoolRepo.saveSettings(ctx, schoolId, { ...f, linkDefaultDays: f.linkDefaultDays ?? 0, reportHeader: f.reportHeader.trim(), contactHours: f.contactHours.trim() }), {
    success: "Đã lưu cài đặt hiển thị và chia sẻ", onError: (e: RepoError) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? {}); },
  });
  const run = useCallback(async () => (check() ? !!(await save.run()) : false), [save, f]); // eslint-disable-line react-hooks/exhaustive-deps
  useUnsavedChanges(dirty, run);
  return (
    <div className="space-y-5">
      <Callout tone="warning" icon={<Scale />} title="Thông số là đề xuất, không kết luận tuân thủ pháp luật">Các mặc định dưới đây là gợi ý vận hành cho bản demo. Nhà trường tự đối chiếu quy định hiện hành về dữ liệu cá nhân trước khi dùng thật.</Callout>
      {ro && <Callout tone="neutral" icon={<Lock />}>Bạn chỉ có quyền xem cài đặt này.</Callout>}
      <ErrorSummary errors={errors} labels={{ linkDefaultDays: "Hạn link mặc định", reportHeader: "Tiêu đề báo cáo", contactHours: "Giờ liên hệ" }} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Link tra cứu phụ huynh" icon={<Link2 className="size-5" />} />
          <div className="space-y-3 px-5 pb-5" data-field="linkDefaultDays">
            {ro ? <dl><InfoRow label="Hạn mặc định">{s.linkDefaultDays} ngày</InfoRow></dl>
              : <NumberField label="Hạn mặc định của link mới (ngày)" required value={f.linkDefaultDays} min={1} max={999} allowNegative={false} onChange={(v) => setF({ ...f, linkDefaultDays: v })} error={errors.linkDefaultDays} helper="Từ 7 đến 366 ngày. Link đã cấp giữ hạn cũ." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Thông tin giáo viên hiển thị cho phụ huynh" icon={<Contact className="size-5" />} />
          <div className="space-y-4 px-5 pb-5">
            <Toggle label="Hiển thị số điện thoại giáo viên" description="Số được che một phần trong trang tra cứu" checked={f.shareTeacherPhone} onChange={(v) => setF({ ...f, shareTeacherPhone: v })} disabled={ro} />
            <Toggle label="Hiển thị email công việc của giáo viên" checked={f.shareTeacherEmail} onChange={(v) => setF({ ...f, shareTeacherEmail: v })} disabled={ro} />
            <div data-field="contactHours"><TextField label="Giờ liên hệ" value={f.contactHours} disabled={ro} onChange={(e) => setF({ ...f, contactHours: e.target.value })} error={errors.contactHours} placeholder="Ví dụ: 07:00–17:00, Thứ Hai đến Thứ Sáu" /></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Mẫu báo cáo" icon={<FileText className="size-5" />} />
          <div className="space-y-3 px-5 pb-5" data-field="reportHeader">
            <TextField label="Tiêu đề đầu báo cáo / bản in" required value={f.reportHeader} disabled={ro} onChange={(e) => setF({ ...f, reportHeader: e.target.value })} error={errors.reportHeader} />
            <div className="rounded-xl border border-dashed border-line-strong bg-[#f9fbfe] p-4 text-center">
              <p className="text-[12px] uppercase tracking-wide text-muted">Xem trước đầu trang in</p>
              <p className="mt-1 font-bold text-ink">{f.reportHeader || "—"}</p>
              <p className="text-[12.5px] text-muted">{schoolName}</p>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Ngôn ngữ và múi giờ" icon={<Globe className="size-5" />} />
          <dl className="px-5 pb-5">
            <InfoRow label="Ngôn ngữ">Tiếng Việt</InfoRow>
            <InfoRow label="Múi giờ">Asia/Ho_Chi_Minh (UTC+7)</InfoRow>
            <InfoRow label="Định dạng ngày">dd/MM/yyyy</InfoRow>
          </dl>
          <p className="-mt-4 px-5 pb-5 text-[12.5px] text-muted">Cố định trong bản demo.</p>
        </Card>
      </div>
      {!ro && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-[13px] text-warning-text">Có thay đổi chưa lưu</span>}
          <Button variant="ghost" disabled={!dirty || save.pending} onClick={() => { setF(init); setErrors({}); }}>Hủy thay đổi</Button>
          <Button variant="primary" icon={<Save className="size-4" />} disabled={!dirty} loading={save.pending} onClick={() => run()}>Lưu cài đặt</Button>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-muted"><Settings2 className="size-3.5" aria-hidden />Phiên bản cấu hình {s.version}. Nếu người khác lưu trước, bạn sẽ được hỏi trước khi ghi đè.</p>
      <ConflictDialog error={save.error} onClose={save.reset} onReload={() => window.location.reload()}
        mine={<ul className="text-[13px]"><li>Hạn link: {f.linkDefaultDays ?? "—"} ngày</li><li>Tiêu đề: {f.reportHeader}</li><li>Giờ liên hệ: {f.contactHours}</li></ul>} />
    </div>
  );
}
