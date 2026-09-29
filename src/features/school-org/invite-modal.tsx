"use client";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { staffRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, ErrorSummary, NumberField, TextField } from "@/components/ui/form";
import { Callout } from "@/components/ui/card";
import { DemoTag } from "@/components/ui/badge";
import { fmtDate } from "@/lib/formatters";
import { addDays } from "@/lib/demo/clock";
import { useCtx } from "@/lib/query/hooks";
import { FormError, useDirtyClose, useFormErrors } from "./common";

const EMPTY = { fullName: "", email: "", proposedDuty: "", roleTemplateIds: [] as string[], days: 7 as number | undefined };
const LABELS = { fullName: "Họ và tên", email: "Email công việc", proposedDuty: "Nhiệm vụ dự kiến", roleTemplateIds: "Mẫu quyền nhà trường", days: "Hạn lời mời" };

/**
 * O05 — invite a teacher/staff. Simulated: no email is sent. An existing identity only
 * receives a new membership at this school; nothing else about it changes. Roles the
 * inviter does not fully hold are disabled (no escalation).
 */
export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { school, actions } = useSchool();
  const ctx = useCtx();
  const roles = useRepo(["school-roles", school.id], (c) => staffRepo.roles(c, school.id), { enabled: open });
  const [v, setV] = useState(EMPTY);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = open && JSON.stringify(v) !== JSON.stringify(EMPTY);
  const close = () => { setV(EMPTY); setErrors({}); onClose(); };
  const { beforeClose, confirmNode } = useDirtyClose(dirty, close);
  const cmd = useCommand((c, input: Parameters<typeof staffRepo.invite>[2]) => staffRepo.invite(c, school.id, input), {
    success: (r) => `Đã tạo lời mời cho ${r.fullName} (mô phỏng, không gửi email)`, onError,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); clear(k as string); };

  const submit = async () => {
    const local: Record<string, string> = {};
    if (v.fullName.trim().length < 3) local.fullName = "Họ tên tối thiểu 3 ký tự";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) local.email = "Email chưa hợp lệ";
    if (v.days === undefined) local.days = "Nhập số ngày (1–30)";
    if (Object.keys(local).length) { setErrors(local); return; }
    const r = await cmd.run({ fullName: v.fullName, email: v.email, proposedDuty: v.proposedDuty, roleTemplateIds: v.roleTemplateIds, days: v.days! });
    if (r) close();
  };

  const schoolRoles = (roles.data ?? []).filter((r) => r.level === "school");
  return (
    <>
      <Modal open={open} onOpenChange={(o) => { if (!o) close(); }} beforeClose={beforeClose} busy={cmd.pending} size="md"
        title="Mời giáo viên" description="Nhân sự không tự đăng ký; nhà trường mời và phân công sau khi họ nhận lời mời."
        footer={<><Button variant="ghost" onClick={() => { if (beforeClose()) close(); }} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} icon={<MailCheck className="size-4" />} onClick={submit}>Tạo lời mời</Button></>}>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={LABELS} />
          <FormError message={errors._form} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="fullName"><TextField label="Họ và tên" required value={v.fullName} onChange={(e) => set("fullName", e.target.value)} error={errors.fullName} autoComplete="off" /></div>
            <div data-field="email"><TextField label="Email công việc" required type="email" placeholder="ten@truong.edu.test" value={v.email} onChange={(e) => set("email", e.target.value)} error={errors.email} autoComplete="off" /></div>
          </div>
          <div data-field="proposedDuty"><TextField label="Nhiệm vụ dự kiến" placeholder="Ví dụ: Giáo viên Toán — dự kiến 10A3" value={v.proposedDuty} onChange={(e) => set("proposedDuty", e.target.value)} helper="Chỉ để thông tin. Quyền theo lớp/môn được cấp bằng Phân công sau khi nhận lời mời." /></div>
          <fieldset className="field" data-field="roleTemplateIds">
            <legend className="label mb-1.5">Mẫu quyền nhà trường (tùy chọn)</legend>
            <div className="space-y-2 rounded-xl border border-line p-3">
              {roles.isLoading && <p className="text-sm text-muted">Đang tải mẫu quyền…</p>}
              {schoolRoles.map((r) => {
                const exceeds = r.actions.some((a) => !actions.has(a));
                return <Checkbox key={r.id} label={r.name} disabled={exceeds} checked={v.roleTemplateIds.includes(r.id)}
                  description={exceeds ? "Vượt quá quyền của bạn — không thể cấp." : r.description}
                  onChange={(on) => set("roleTemplateIds", on ? [...v.roleTemplateIds, r.id] : v.roleTemplateIds.filter((x) => x !== r.id))} />;
              })}
              <p className="text-[12.5px] text-muted">Giáo viên thông thường không cần mẫu quyền nhà trường.</p>
            </div>
            {errors.roleTemplateIds && <p className="error-text mt-1">{errors.roleTemplateIds}</p>}
          </fieldset>
          <div data-field="days" className="max-w-[240px]"><NumberField label="Hạn lời mời (ngày)" required min={1} max={30} allowNegative={false} value={v.days} onChange={(n) => set("days", n)} error={errors.days}
            helper={v.days ? `Hết hạn ${fmtDate(addDays(ctx.today, v.days))}` : "1–30 ngày"} /></div>
          <Callout tone="info" title={<span className="flex items-center gap-2">Gửi lời mời <DemoTag /></span>}>
            Bản demo không gửi email thật. Lời mời xuất hiện ở mục “Lời mời chờ xác nhận”. Nếu email đã có danh tính trong hệ thống, người đó chỉ được thêm thành viên trường này — mật khẩu và dữ liệu ở trường khác không thay đổi.
          </Callout>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      {confirmNode}
    </>
  );
}
