"use client";
import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import {useQueryClient} from "@tanstack/react-query";
import {QuickCreate} from "@/features/forms/quick-create";
import { schoolRepo } from "@/lib/repositories";
type ClassRow = Awaited<ReturnType<typeof schoolRepo.classes>>["items"][number];
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ErrorSummary, NumberField, SelectField, TextField } from "@/components/ui/form";
import { Callout } from "@/components/ui/card";
import { Skeleton, ErrorState } from "@/components/ui/states";
import { ConflictDialog } from "@/components/ui/guards";
import { FormError, useDirtyClose, useFormErrors } from "./common";

export interface ClassDrawerTarget { mode: "create"; yearId?: string; gradeId?: string }
export type ClassEditTarget = { mode: "edit"; row: Pick<ClassRow, "id" | "yearId" | "gradeId" | "name" | "capacity" | "roomCode" | "homeroomName" | "version"> & { roomId?: string } };

const LABELS: Record<string, string> = { yearId: "Năm học", gradeId: "Khối", name: "Tên lớp", capacity: "Sức chứa tối đa", homeroomMembershipId: "Giáo viên chủ nhiệm", roomId: "Phòng học" };

/**
 * O03 — create / edit class. Homeroom is optional: without one the class stays "Nháp"
 * (the repository enforces it). Year is fixed to non-archived years.
 */
export function ClassDrawer({ target, onClose, onSaved }: { target: ClassDrawerTarget | ClassEditTarget | null; onClose: () => void; onSaved?: (row: Awaited<ReturnType<typeof schoolRepo.saveClass>>) => void|Promise<void> }) {
  const { school, yearId: ctxYear } = useSchool();
  const qc = useQueryClient();
  const open = !!target;
  const opts = useRepo(["school-form-options", school.id], (c) => schoolRepo.formOptions(c, school.id), { enabled: open });
  const edit = target?.mode === "edit" ? target.row : null;
  const initial = useMemo(() => ({
    yearId: edit?.yearId ?? (target?.mode === "create" ? target.yearId : undefined) ?? ctxYear,
    gradeId: edit?.gradeId ?? (target?.mode === "create" ? target.gradeId : undefined) ?? "",
    name: edit?.name ?? "",
    capacity: edit?.capacity ?? 40 as number | undefined,
    roomId: edit?.roomId ?? "",
    homeroom: "",
  }), [target, ctxYear]); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = open && JSON.stringify(v) !== JSON.stringify(initial);
  const close = () => { setErrors({}); onClose(); };
  const { beforeClose, confirmNode } = useDirtyClose(dirty, close);
  const [conflict, setConflict] = useState<null | import("@/lib/repositories").RepoError>(null);

  const cmd = useCommand((ctx, input: Parameters<typeof schoolRepo.saveClass>[2]) => schoolRepo.saveClass(ctx, school.id, input), {
    success: (r) => edit ? `Đã cập nhật lớp ${r.name}` : r.status === "draft" && !r.homeroomAssigned ? `Đã tạo lớp ${r.name} (Nháp — chưa có GVCN)` : `Đã tạo lớp ${r.name}`,
    onError: (e) => { if (e.code === "CONFLICT") setConflict(e); onError(e); },
  });

  const grades = opts.data?.grades ?? [];
  const grade = grades.find((g) => g.id === v.gradeId);
  const submit = async () => {
    const local: Record<string, string> = {};
    if (!v.yearId) local.yearId = "Chọn năm học";
    if (!v.gradeId) local.gradeId = "Chọn khối";
    if (!v.name.trim()) local.name = "Nhập tên lớp, ví dụ 10A1";
    else if (grade?.level != null && !v.name.trim().toUpperCase().startsWith(String(grade.level))) local.name = `Tên lớp phải bắt đầu bằng ${grade.level}`;
    if (v.capacity === undefined) local.capacity = "Nhập sức chứa";
    if (Object.keys(local).length) { setErrors(local); return false; }
    const r = await cmd.run({ id: edit?.id, yearId: v.yearId, gradeId: v.gradeId, name: v.name, capacity: v.capacity!, roomId: v.roomId || undefined, homeroomMembershipId: v.homeroom || undefined, version: edit?.version });
    if (r) { await onSaved?.(r); close(); return true; }
    return false;
  };

  const teacherOptions = (opts.data?.teachers ?? []).map((t) => ({ value: t.membershipId, label: t.name, hint: t.department }));
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); clear(k === "homeroom" ? "homeroomMembershipId" : (k as string)); };

  const chooseCreated = async (field:"yearId"|"gradeId"|"roomId",id:string) => {
    const fresh=await opts.refetch();if(fresh.error)throw fresh.error;
    const choices=field==="yearId"?fresh.data?.years.filter(y=>y.status!=="archived"):field==="gradeId"?fresh.data?.grades:fresh.data?.rooms;
    if(!choices?.some(row=>row.id===id))throw new Error("Đã tạo dữ liệu nhưng chưa thuộc lựa chọn hợp lệ của biểu mẫu. Hãy tải lại lựa chọn.");
    set(field,id);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => { if (!o) close(); }} beforeClose={beforeClose} busy={cmd.pending} width={420}
        title={edit ? `Sửa lớp ${edit.name}` : "Tạo lớp mới"} description={edit ? "Thay đổi được ghi nhật ký. Đổi GVCN dùng Bàn giao chủ nhiệm." : "Lớp mới ở trạng thái Nháp cho đến khi có GVCN và được kích hoạt."}
        footer={<><Button onClick={() => { if (beforeClose()) close(); }} disabled={cmd.pending} className="min-w-[110px]">Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit} className="min-w-[110px]">{edit ? "Lưu thay đổi" : "Tạo lớp"}</Button></>}>
        {opts.error ? <ErrorState error={opts.error} onRetry={() => opts.refetch()} compact /> : opts.isLoading || !opts.data ? <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div> : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={LABELS} />
            <FormError message={errors._form} />
            <div data-field="yearId"><SelectField label="Năm học" labelAction={!edit&&<QuickCreate kind="year" schoolId={school.id} onCreated={r=>chooseCreated("yearId",r.id)}/>} value={v.yearId} disabled={!!edit} onChange={(e) => set("yearId", e.target.value)} error={errors.yearId}
              options={opts.data.years.filter(y => y.status !== "archived" || y.id === edit?.yearId).map((y) => ({ value: y.id, label: `${y.label}${y.status === "draft" ? " (nháp)" : ""}` }))} /></div>
            <div data-field="gradeId"><SelectField label="Khối" labelAction={<QuickCreate kind="grade" schoolId={school.id} onCreated={r=>chooseCreated("gradeId",r.id)}/>} required placeholder="Chọn khối lớp" value={v.gradeId} onChange={(e) => set("gradeId", e.target.value)} error={errors.gradeId}
              options={grades.map((g) => ({ value: g.id, label: g.name }))} /></div>
            <div data-field="name"><TextField label="Tên lớp" required placeholder={grade ? `Ví dụ: ${grade.level}A1` : "Ví dụ: 10A1"} value={v.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoComplete="off" helper="Duy nhất trong năm học; tự viết hoa khi lưu." /></div>
            <div data-field="capacity"><NumberField label="Sức chứa tối đa" required value={v.capacity} min={10} max={60} allowNegative={false} onChange={(n) => set("capacity", n)} error={errors.capacity} helper="Số lượng học sinh tối đa của lớp (10–60)." /></div>
            <div data-field="roomId"><SelectField label="Phòng học" labelAction={<QuickCreate kind="room" schoolId={school.id} onCreated={r=>chooseCreated("roomId",r.id)}/>} placeholder="Chưa gán phòng" value={v.roomId} onChange={(e) => set("roomId", e.target.value)} options={opts.data.rooms.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))} /></div>
            {edit ? (
              <Callout tone="neutral" icon={<Info />} title={`Giáo viên chủ nhiệm: ${edit.homeroomName ?? "chưa có"}`}>
                {edit.homeroomName ? "Đổi người chủ nhiệm qua Bàn giao chủ nhiệm để giữ lịch sử và ngày hiệu lực." : "Chọn giáo viên dưới đây để phân công chủ nhiệm từ hôm nay."}
              </Callout>
            ) : null}
            {opts.data.canAssign && (!edit || !edit.homeroomName) && (
              <div data-field="homeroomMembershipId">
                <Combobox label="Giáo viên chủ nhiệm (tùy chọn)" labelAction={<QuickCreate kind="teacher" schoolId={school.id} onCreated={async r=>{const result=await opts.refetch();if(result.error)throw result.error;if(result.data?.teachers?.some(t=>t.membershipId===r.id))set("homeroom",r.id);else throw new Error("Giáo viên mới chưa đủ điều kiện phân công chủ nhiệm.");}}/>} placeholder="Chọn giáo viên" options={teacherOptions} value={v.homeroom} onChange={(x) => set("homeroom", x as string)} error={errors.homeroomMembershipId}
                  helper={v.homeroom ? "GVCN nhận quyền chủ nhiệm lớp này từ hôm nay." : "Chưa chọn GVCN — lớp giữ trạng thái Nháp, chưa kích hoạt được."} emptyText="Không tìm thấy giáo viên đang hoạt động" />
                {v.homeroom && <button type="button" className="mt-1 text-[13px] font-semibold text-primary-strong hover:underline" onClick={() => set("homeroom", "")}>Bỏ chọn giáo viên</button>}
              </div>
            )}
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        )}
      </Drawer>
      {confirmNode}
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={async () => { try { await qc.refetchQueries({type: "active", predicate: query => query.queryKey.includes(school.id) && ["school-classes", "school-overview", "school-year-detail"].some(key => query.queryKey.includes(key))}, {throwOnError: true}); setConflict(null); close(); } catch { setErrors({_form: "Không tải được bản mới nhất. Nội dung đang sửa được giữ lại."}); } }} mine={<span>{v.name} · {v.capacity} chỗ</span>} />
    </>
  );
}
