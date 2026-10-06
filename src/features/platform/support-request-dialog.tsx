"use client";
import {PickerState} from "@/features/forms/picker-state";
import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import type { SupportScope } from "@/lib/model/types";
import { platformRepo, SUPPORT_SCOPE_LABEL } from "@/lib/repositories";
import { platformExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { Checkbox, ErrorSummary, NumberField, SelectField, TextArea } from "@/components/ui/form";
import { useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";

/**
 * O34 (platform side) — REQUEST a time-boxed support scope. The school approves or declines;
 * the platform can never grant itself access, and no scope covers student or family records.
 */
export function RequestSupportDialog({ open, onClose, schoolId, ticketId }: { open: boolean; onClose: () => void; schoolId?: string; ticketId?: string }) {
  const targets = useRepo(["support-targets"], (ctx) => platformExtraRepo.supportTargets(ctx), { enabled: open });
  const [f, setF] = useState({ schoolId: schoolId ?? "", ticketId: ticketId ?? "", scopes: [] as SupportScope[], reason: "", days: 7 as number | undefined });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setF({ schoolId: schoolId ?? "", ticketId: ticketId ?? "", scopes: [], reason: "", days: 7 }); setErrors({}); } }, [open, schoolId, ticketId]);
  const dirty = open && (f.scopes.length > 0 || !!f.reason);
  useUnsavedChanges(dirty);
  const leave = useLeaveGuard();
  const cmd = useCommand((ctx, v: { schoolId: string; ticketId?: string; scopes: SupportScope[]; reason: string; days: number }) => platformRepo.requestSupportGrant(ctx, v), {
    success: "Đã gửi đề nghị — chờ nhà trường cho phép", onSuccess: onClose, onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.schoolId) e.schoolId = "Chọn trường";
    if (!f.scopes.length) e.scopes = "Chọn ít nhất một phạm vi";
    if (f.reason.trim().length < 5) e.reason = "Nêu rõ lý do (tối thiểu 5 ký tự)";
    if (!f.days || f.days < 1 || f.days > 14) e.days = "Thời hạn từ 1 đến 14 ngày";
    setErrors(e);
    if (Object.keys(e).length) return;
    cmd.run({ schoolId: f.schoolId, ticketId: f.ticketId || undefined, scopes: f.scopes, reason: f.reason.trim(), days: f.days! });
  };
  const tickets = (targets.data?.tickets ?? []).filter((t) => t.schoolId === f.schoolId);
  const toggle = (s: SupportScope, on: boolean) => setF({ ...f, scopes: on ? [...f.scopes, s] : f.scopes.filter((x) => x !== s) });
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} busy={cmd.pending} size="md" title="Đề nghị quyền hỗ trợ tạm thời" description="Nhà trường là bên cho phép hoặc từ chối"
      beforeClose={() => { if (!dirty) return true; leave(onClose); return false; }}
      footer={<><Button variant="ghost" onClick={onClose} disabled={cmd.pending}>Hủy</Button><Button variant="primary" icon={<KeyRound className="size-4" />} loading={cmd.pending} onClick={submit}>Gửi đề nghị</Button></>}>
      <div className="space-y-4">
        <PickerState query={targets} empty={targets.data?.schools.length===0}/>
        <ErrorSummary errors={errors} labels={{ schoolId: "Trường", scopes: "Phạm vi", reason: "Lý do", days: "Thời hạn" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="schoolId"><SelectField label="Trường" required value={f.schoolId} placeholder="Chọn trường đang hoạt động" onChange={(e) => setF({ ...f, schoolId: e.target.value, ticketId: "" })} error={errors.schoolId} options={(targets.data?.schools ?? []).map((s) => ({ value: s.id, label: s.name }))} /></div>
          <SelectField label="Gắn với yêu cầu hỗ trợ" value={f.ticketId} placeholder="Không gắn" onChange={(e) => setF({ ...f, ticketId: e.target.value })} options={tickets.map((t) => ({ value: t.id, label: t.title }))} disabled={!f.schoolId} />
        </div>
        <fieldset className="field" data-field="scopes">
          <legend className="label mb-1.5">Phạm vi cần xem<span className="req" aria-hidden>*</span></legend>
          <div className="grid gap-2">
            {(Object.keys(SUPPORT_SCOPE_LABEL) as SupportScope[]).map((s) => <Checkbox key={s} label={SUPPORT_SCOPE_LABEL[s]} checked={f.scopes.includes(s)} onChange={(v) => toggle(s, v)} />)}
          </div>
          {errors.scopes && <p className="error-text mt-1">{errors.scopes}</p>}
        </fieldset>
        <div data-field="reason"><TextArea label="Lý do" required rows={3} maxChars={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={errors.reason} helper="Nhà trường sẽ thấy lý do này khi quyết định." /></div>
        <div data-field="days"><NumberField label="Thời hạn (ngày)" required min={1} max={14} value={f.days} onChange={(v) => setF({ ...f, days: v })} error={errors.days} helper="Tối đa 14 ngày; nhà trường có thể thu hồi sớm." allowNegative={false} /></div>
        <Callout tone="warning" icon={<ShieldAlert />}>Không có phạm vi nào gồm hồ sơ học sinh, điểm danh, thi đua hay thông tin gia đình. Mọi truy cập hỗ trợ được ghi nhật ký.</Callout>
      </div>
    </Modal>
  );
}
