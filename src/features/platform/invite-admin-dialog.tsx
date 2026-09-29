"use client";
import { useEffect, useState } from "react";
import { MailPlus, Info } from "lucide-react";
import { platformRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { TextField, SelectField, ErrorSummary, RadioGroup } from "@/components/ui/form";
import { DemoTag } from "@/components/ui/badge";
import { useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";

export interface AdminOption { membershipId: string; name: string }

/**
 * O02 — invite or replace a school admin. Replacing never removes the current admin first:
 * the new person is invited, and the old role is revoked only once another admin is active.
 */
export function InviteAdminDialog({ open, onClose, schoolId, schoolName, admins, initialMode = "invite", onInvited }: {
  open: boolean; onClose: () => void; schoolId: string; schoolName: string; admins: AdminOption[]; initialMode?: "invite" | "replace"; onInvited?: (inviteId: string) => void;
}) {
  const [mode, setMode] = useState<"invite" | "replace">(initialMode);
  const [f, setF] = useState({ fullName: "", email: "", days: "14", replaces: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstAdmin = admins[0]?.membershipId ?? "";
  useEffect(() => { if (open) { setMode(initialMode); setF({ fullName: "", email: "", days: "14", replaces: firstAdmin }); setErrors({}); } }, [open, initialMode, firstAdmin]);
  const dirty = open && !!(f.fullName || f.email);
  useUnsavedChanges(dirty);
  const leave = useLeaveGuard();
  const cmd = useCommand((ctx, v: { fullName: string; email: string; days: number }) => platformRepo.inviteSchoolAdmin(ctx, schoolId, v), {
    success: (i) => `Đã tạo lời mời cho ${i.email} (mô phỏng, không gửi email)`,
    onSuccess: (i) => { onInvited?.(i.id); onClose(); },
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 3) e.fullName = "Họ tên tối thiểu 3 ký tự";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Email chưa hợp lệ";
    if (mode === "replace" && !f.replaces) e.replaces = "Chọn quản trị cần thay";
    setErrors(e);
    if (Object.keys(e).length) return;
    cmd.run({ fullName: f.fullName.trim(), email: f.email.trim(), days: Number(f.days) });
  };
  const replaced = admins.find((a) => a.membershipId === f.replaces);
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} busy={cmd.pending} size="md" title={mode === "replace" ? "Thay quản trị trường" : "Mời quản trị trường"} description={schoolName}
      beforeClose={() => { if (!dirty) return true; leave(onClose); return false; }}
      footer={<><Button variant="ghost" onClick={onClose} disabled={cmd.pending}>Hủy</Button><Button variant="primary" icon={<MailPlus className="size-4" />} loading={cmd.pending} onClick={submit}>Tạo lời mời</Button></>}>
      <div className="space-y-4">
        <ErrorSummary errors={errors} labels={{ fullName: "Họ tên", email: "Email", replaces: "Quản trị cần thay", days: "Thời hạn" }} />
        {admins.length > 0 && (
          <RadioGroup label="Loại thao tác" direction="row" value={mode} onChange={setMode} options={[{ value: "invite", label: "Thêm quản trị" }, { value: "replace", label: "Thay người phụ trách" }]} />
        )}
        {mode === "replace" && (
          <div data-field="replaces"><SelectField label="Quản trị cần thay" required value={f.replaces} onChange={(e) => setF({ ...f, replaces: e.target.value })} error={errors.replaces} options={admins.map((a) => ({ value: a.membershipId, label: a.name }))} /></div>
        )}
        <div data-field="fullName"><TextField label="Họ tên người được mời" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={errors.fullName} /></div>
        <div data-field="email"><TextField label="Email công việc" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} helper="Nếu email đã có danh tính EduManage, chấp nhận chỉ thêm thành viên ở trường này." /></div>
        <SelectField label="Thời hạn lời mời" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} options={[{ value: "7", label: "7 ngày" }, { value: "14", label: "14 ngày" }, { value: "30", label: "30 ngày" }]} />
        {mode === "replace" && replaced && (
          <Callout tone="warning" icon={<Info />}>{replaced.name} vẫn giữ quyền cho đến khi người mới chấp nhận lời mời. Sau đó thu hồi quyền của {replaced.name} trong danh sách quản trị — hệ thống không cho phép để trường mất người quản trị cuối.</Callout>
        )}
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><DemoTag>Không gửi email</DemoTag>Lời mời chỉ tạo đường dẫn demo để mở trong trình duyệt.</p>
      </div>
    </Modal>
  );
}
