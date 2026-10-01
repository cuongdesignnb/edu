"use client";
import { useEffect, useMemo, useState } from "react";
type Term = Awaited<ReturnType<typeof schoolRepo.yearDetail>>["terms"][number];
import { schoolRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField, ErrorSummary, TextField } from "@/components/ui/form";
import { Callout } from "@/components/ui/card";
import { fmtDate } from "@/lib/formatters";
import { FormError, useDirtyClose, useFormErrors } from "./common";

/**
 * O04 — edit a term's dates. The repository refuses overlaps with other terms, dates
 * outside the year, and moving a term so that locked (chốt) weeks fall outside it.
 */
export function TermDialog({ term, year, lockedWeeks, onClose }: { term: Term | null; year: { startDate: string; endDate: string; label: string }; lockedWeeks: number; onClose: () => void }) {
  const { school } = useSchool();
  const initial = useMemo(() => ({ name: term?.name ?? "", startDate: term?.startDate as string | undefined, endDate: term?.endDate as string | undefined, openingDate: term?.openingDate }), [term]);
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = !!term && JSON.stringify(v) !== JSON.stringify(initial);
  const close = () => { setErrors({}); onClose(); };
  const { beforeClose, confirmNode } = useDirtyClose(dirty, close);
  const cmd = useCommand((c, patch: Pick<Term, "name" | "startDate" | "endDate" | "openingDate">) => schoolRepo.updateTerm(c, school.id, term!.id, {...patch, version: term!.version}), { success: (t) => `Đã cập nhật mốc ${t.name}`, onError });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); clear(k as string); clear("_form"); };
  const submit = async () => {
    const local: Record<string, string> = {};
    if (v.name.trim().length < 2) local.name = "Nhập tên học kỳ";
    if (!v.startDate) local.startDate = "Chọn ngày bắt đầu";
    if (!v.endDate) local.endDate = "Chọn ngày kết thúc";
    if (v.startDate && v.endDate && v.startDate >= v.endDate) local.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
    if (Object.keys(local).length) { setErrors(local); return; }
    const r = await cmd.run({ name: v.name.trim(), startDate: v.startDate!, endDate: v.endDate!, openingDate: v.openingDate });
    if (r) close();
  };
  return (
    <>
      <Modal open={!!term} onOpenChange={(o) => { if (!o) close(); }} beforeClose={beforeClose} busy={cmd.pending} size="md" title={`Sửa mốc ${term?.name ?? "học kỳ"}`}
        description={`Năm học ${year.label}: ${fmtDate(year.startDate)} – ${fmtDate(year.endDate)}`}
        footer={<><Button variant="ghost" onClick={() => { if (beforeClose()) close(); }} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Lưu mốc học kỳ</Button></>}>
        <div className="space-y-4">
          <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={{ name: "Tên", startDate: "Ngày bắt đầu", endDate: "Ngày kết thúc" }} />
          <FormError message={errors._form} />
          <div data-field="name"><TextField label="Tên học kỳ" required value={v.name} onChange={(e) => set("name", e.target.value)} error={errors.name} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="startDate"><DateField label="Ngày bắt đầu" required value={v.startDate} min={year.startDate} max={year.endDate} onChange={(d) => set("startDate", d)} error={errors.startDate} /></div>
            <div data-field="endDate"><DateField label="Ngày kết thúc" required value={v.endDate} min={v.startDate ?? year.startDate} max={year.endDate} onChange={(d) => set("endDate", d)} error={errors.endDate} /></div>
          </div>
          <DateField label="Ngày khai giảng (tùy chọn)" value={v.openingDate} min={year.startDate} max={year.endDate} onChange={(d) => set("openingDate", d)} />
          {lockedWeeks > 0 && <Callout tone="warning" title={`${lockedWeeks} tuần của học kỳ đã có lớp chốt dữ liệu`}>Mốc mới phải vẫn bao gồm các tuần đã chốt. Dữ liệu đã chốt/công bố không bị áp ngược.</Callout>}
          <Callout tone="neutral">Không được chồng thời gian với học kỳ khác. Danh sách tuần hiện có giữ nguyên; kiểm tra lại hạn chốt tuần sau khi đổi mốc.</Callout>
        </div>
      </Modal>
      {confirmNode}
    </>
  );
}
