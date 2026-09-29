"use client";
import { useCallback, useMemo, useState } from "react";
import { Workflow, Save, Eye, Info, ShieldCheck, Lock } from "lucide-react";
import type { ParentModule, PublicationPolicy } from "@/lib/model/types";
import { conductRepo, type RepoError } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { parentModuleLabel } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { ChipToggleGroup, RadioGroup, Toggle } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { Stepper } from "@/components/ui/progress";

type Data = Awaited<ReturnType<typeof conductRepo.policy>>;
type Form = Omit<PublicationPolicy, "schoolId">;
const WHO = { homeroom: "Giáo viên chủ nhiệm", school_leader: "Ban giám hiệu / quản trị trường" } as const;

/** SC31 — lock/publish workflow policy. Saving affects future periods only; never republishes old data. */
export function PolicyForm({ schoolId, data }: { schoolId: string; data: Data }) {
  const p = data.policy;
  const init = useMemo<Form>(() => ({ lockBy: p.lockBy, publishBy: p.publishBy, requireLeaderApproval: p.requireLeaderApproval, weekCloseDay: p.weekCloseDay, defaultParentModules: [...p.defaultParentModules], attendanceAutoPublish: p.attendanceAutoPublish, version: p.version }), [p]);
  const [f, setF] = useState<Form>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const ro = !data.canEdit;
  const dirty = !ro && JSON.stringify(f) !== JSON.stringify(init);
  const save = useCommand((ctx) => conductRepo.savePolicy(ctx, schoolId, f), {
    success: "Đã lưu quy trình chốt và công bố", onSuccess: () => setConfirm(false),
    onError: (e: RepoError) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? {}); setConfirm(false); },
  });
  useUnsavedChanges(dirty, useCallback(async () => !!(await save.run()), [save]));
  const changes = [
    f.lockBy !== init.lockBy && `Người chốt: ${WHO[f.lockBy]}`,
    f.publishBy !== init.publishBy && `Người công bố: ${WHO[f.publishBy]}`,
    f.requireLeaderApproval !== init.requireLeaderApproval && (f.requireLeaderApproval ? "Bật duyệt của ban giám hiệu trước khi công bố" : "Tắt bước duyệt của ban giám hiệu"),
    f.weekCloseDay !== init.weekCloseDay && `Hạn chốt tuần: ${f.weekCloseDay === "sunday" ? "Chủ nhật" : "Thứ Hai tuần sau"}`,
    JSON.stringify(f.defaultParentModules) !== JSON.stringify(init.defaultParentModules) && `Mục phụ huynh mặc định: ${f.defaultParentModules.map((m) => parentModuleLabel[m]).join(", ")}`,
    f.attendanceAutoPublish !== init.attendanceAutoPublish && (f.attendanceAutoPublish ? "Tự công bố chuyên cần khi lưu" : "Chuyên cần cần công bố thủ công"),
  ].filter(Boolean) as string[];
  const steps = ["Ghi nhận", "Rà soát", f.requireLeaderApproval ? "BGH duyệt" : null, `Chốt (${f.lockBy === "homeroom" ? "GVCN" : "BGH"})`, `Công bố (${f.publishBy === "homeroom" ? "GVCN" : "BGH"})`].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      {ro && <Callout tone="neutral" icon={<Lock />} title="Chỉ xem">Bạn không có quyền cấu hình quy trình chốt và công bố. Liên hệ quản trị trường nếu cần thay đổi.</Callout>}
      <Card className="p-5">
        <p className="mb-3 text-sm font-semibold text-ink">Luồng thi đua mỗi tuần theo cấu hình</p>
        <Stepper steps={steps} current={steps.length} />
        <p className="mt-3 text-[13px] text-muted">“Đã lưu”, “Đã chốt” và “Đã công bố” là ba trạng thái khác nhau. Phụ huynh chỉ thấy dữ liệu sau bước công bố.</p>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Quyền chốt và công bố" icon={<Workflow className="size-5" />} />
          <fieldset disabled={ro} className="space-y-4 px-5 pb-5">
            <RadioGroup label="Ai được chốt thi đua tuần" value={f.lockBy} onChange={(v) => setF({ ...f, lockBy: v })} options={[{ value: "homeroom", label: WHO.homeroom, description: "Chủ nhiệm chốt lớp mình sau khi rà soát" }, { value: "school_leader", label: WHO.school_leader, description: "Chỉ ban giám hiệu/quản trị chốt" }]} />
            <RadioGroup label="Ai được công bố cho phụ huynh" value={f.publishBy} onChange={(v) => setF({ ...f, publishBy: v })} options={[{ value: "homeroom", label: WHO.homeroom }, { value: "school_leader", label: WHO.school_leader }]} />
            <Toggle label="Cần ban giám hiệu duyệt trước khi công bố" description="Bảng đã chốt chờ duyệt, phụ huynh chưa thấy cho tới khi công bố" checked={f.requireLeaderApproval} onChange={(v) => setF({ ...f, requireLeaderApproval: v })} disabled={ro} />
            <RadioGroup direction="row" label="Hạn chốt tuần" value={f.weekCloseDay} onChange={(v) => setF({ ...f, weekCloseDay: v })} options={[{ value: "sunday", label: "Chủ nhật cùng tuần" }, { value: "monday", label: "Thứ Hai tuần sau" }]} />
          </fieldset>
        </Card>
        <Card>
          <CardHeader title="Phụ huynh được xem" icon={<Eye className="size-5" />} subtitle="Áp dụng mặc định cho link tra cứu cấp mới; link đã cấp giữ phạm vi riêng." />
          <fieldset disabled={ro} className="space-y-4 px-5 pb-5" data-field="defaultParentModules">
            <ChipToggleGroup label="Mục mặc định trong link tra cứu" options={(Object.keys(parentModuleLabel) as ParentModule[]).map((m) => ({ value: m, label: parentModuleLabel[m] }))} value={f.defaultParentModules}
              onChange={(v) => { setF({ ...f, defaultParentModules: v }); setErrors({}); }} error={errors.defaultParentModules} />
            <Toggle label="Tự công bố chuyên cần khi lưu điểm danh" description="Tắt: giáo viên lưu rồi bấm công bố riêng. Không áp dụng cho buổi đã lưu trước đây." checked={f.attendanceAutoPublish} onChange={(v) => setF({ ...f, attendanceAutoPublish: v })} disabled={ro} />
          </fieldset>
        </Card>
      </div>
      <Callout tone="info" icon={<Info />} title="Tác động khi lưu">Thay đổi chỉ áp dụng cho các tuần/buổi xử lý sau khi lưu. Dữ liệu đã chốt hoặc đã công bố giữ nguyên; hệ thống không tự công bố lại dữ liệu cũ và không rút lại bản đã công bố.</Callout>
      {!ro && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-[13px] text-warning-text">Có {changes.length} thay đổi chưa lưu</span>}
          <Button variant="ghost" disabled={!dirty || save.pending} onClick={() => { setF(init); setErrors({}); }}>Hủy thay đổi</Button>
          <Button variant="primary" icon={<Save className="size-4" />} disabled={!dirty} loading={save.pending} onClick={() => setConfirm(true)}>Lưu quy trình</Button>
        </div>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Lưu quy trình chốt và công bố" confirmLabel="Lưu" busy={save.pending}
        object={<ul className="list-disc space-y-0.5 pl-5 text-[13px] font-medium">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
        consequence={<div className="space-y-1"><p>Áp dụng từ lần chốt/công bố tiếp theo.</p><p className="flex gap-1.5"><ShieldCheck className="mt-0.5 size-4 flex-none text-success" aria-hidden />Không công bố lại dữ liệu cũ; bảng đã chốt và đã công bố giữ nguyên phiên bản.</p></div>}
        onConfirm={async () => { await save.run(); }} />
      <ConflictDialog error={save.error} onClose={save.reset} onReload={() => window.location.reload()} />
    </div>
  );
}
