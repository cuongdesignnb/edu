"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, Trash2, Copy, CheckCircle2, Info } from "lucide-react";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button, IconButton, ButtonLink } from "@/components/ui/button";
import { Checkbox, DateField, ErrorSummary, TextField } from "@/components/ui/form";
import { Stepper } from "@/components/ui/progress";
import { DeniedState, QueryState } from "@/components/ui/states";
import { useUnsavedChanges } from "@/components/ui/guards";
import { addDays, weekdayOf } from "@/lib/calendar";
import { fmtDate } from "@/lib/formatters";
import { FormError, useFormErrors } from "./common";

interface TermDraft { name: string; startDate?: string; endDate?: string; openingDate?: string }
interface HolidayDraft { name: string; startDate?: string; endDate?: string }

const STEPS = ["Năm học", "Học kỳ", "Tuần & ngày nghỉ", "Kiểm tra"];
const shiftYear = (d: string, n = 1) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;

function weekCount(t: TermDraft) {
  if (!t.startDate || !t.endDate || t.startDate > t.endDate) return 0;
  let monday = addDays(t.startDate, (8 - weekdayOf(t.startDate)) % 7);
  let n = 0;
  while (monday <= t.endDate) { n++; monday = addDays(monday, 7); }
  return n;
}

/** SC04 — new academic year wizard: year → terms → weeks/holidays → review. Never moves students (that is SC07). */
export function YearWizard({onCreated,onDirtyChange,onCancel,embedded=false}:{onCreated?:(year:{id:string;label:string})=>void|Promise<void>;embedded?:boolean;onDirtyChange?:(dirty:boolean)=>void;onCancel?:()=>void}={}) {
  const { school, can } = useSchool();
  const years = useRepo(["school-years", school.id], (c) => schoolRepo.years(c, school.id));
  if (!can("year.manage")) return <div className="page"><div className="card"><DeniedState message="Chỉ người có quyền quản lý năm học mới tạo được năm học." /></div></div>;
  return <QueryState query={years} skeleton="form">{(rows) => <WizardBody rows={rows} onCreated={onCreated} embedded={embedded} onDirtyChange={onDirtyChange} onCancel={onCancel} />}</QueryState>;
}

function WizardBody({ rows,onCreated,embedded,onDirtyChange,onCancel }: { rows: Awaited<ReturnType<typeof schoolRepo.years>>;onCreated?:(year:{id:string;label:string})=>void|Promise<void>;embedded:boolean;onDirtyChange?:(dirty:boolean)=>void;onCancel?:()=>void }) {
  const { school, setYearId, can } = useSchool();
  const ctx = useCtx();
  const router = useRouter();
  const [latest] = useState(rows[0]);
  const detail = useRepo(["school-year-detail", school.id, latest?.id], (c) => schoolRepo.yearDetail(c, school.id, latest!.id), { enabled: !!latest });
  const [initial] = useState(() => {
    const start = latest ? addDays(latest.endDate, 1) : `${ctx.today.slice(0, 4)}-08-01`;
    const label = `${start.slice(0, 4)}–${Number(start.slice(0, 4)) + 1}`;
    const terms: TermDraft[] = latest?.terms.length
      ? [...latest.terms].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((t) => ({ name: t.name, startDate: shiftYear(t.startDate), endDate: shiftYear(t.endDate), openingDate: t.openingDate ? shiftYear(t.openingDate) : undefined }))
      : [{ name: "Học kỳ 1" }, { name: "Học kỳ 2" }];
    return { label, startDate: start as string | undefined, endDate: addDays(shiftYear(start), -1) as string | undefined, terms, holidays: [] as HolidayDraft[], copyRules: can("rules.manage") && !!latest };
  });
  const [v, setV] = useState(initial);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<{ id: string; label: string } | null>(null);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = !done && JSON.stringify(v) !== JSON.stringify(initial);
  useUnsavedChanges(dirty&&!embedded);
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(() => { if (!done) setV(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmd = useCommand((c, input: Parameters<typeof schoolRepo.createYear>[2]) => schoolRepo.createYear(c, school.id, input), {
    success: "Đã tạo năm học (Nháp)",
    onError: (e) => { onError(e); const keys = Object.keys(e.fieldErrors ?? {}); if (keys.some((k) => ["label", "startDate", "endDate"].includes(k))) setStep(0); else if (keys.some((k) => k.startsWith("terms"))) setStep(1); },
  });

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!/^\d{4}–\d{4}$/.test(v.label)) e.label = "Định dạng năm học: 2027–2028";
      if (!v.startDate) e.startDate = "Chọn ngày bắt đầu";
      if (!v.endDate) e.endDate = "Chọn ngày kết thúc";
      if (v.startDate && v.endDate && v.startDate >= v.endDate) e.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
      if (v.startDate && v.endDate && rows.some((y) => y.startDate <= v.endDate! && y.endDate >= v.startDate!)) e.startDate = "Trùng khoảng thời gian với năm học đã có";
    }
    if (s === 1) {
      if (!v.terms.length) e.terms = "Cần ít nhất một học kỳ";
      const sorted = v.terms.map((t, i) => ({ ...t, i })).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
      sorted.forEach((t, k) => {
        if (t.name.trim().length < 2) e[`terms.${t.i}`] = `Học kỳ ${t.i + 1}: nhập tên`;
        else if (!t.startDate || !t.endDate) e[`terms.${t.i}`] = `${t.name}: chọn đủ ngày`;
        else if (t.startDate >= t.endDate) e[`terms.${t.i}`] = `${t.name}: ngày kết thúc phải sau ngày bắt đầu`;
        else if (t.startDate < v.startDate! || t.endDate > v.endDate!) e[`terms.${t.i}`] = `${t.name} nằm ngoài năm học`;
        else if (k > 0 && sorted[k - 1].endDate && t.startDate <= sorted[k - 1].endDate!) e[`terms.${t.i}`] = `${t.name} chồng lên ${sorted[k - 1].name}`;
      });
    }
    if (s === 2) {
      v.holidays.forEach((h, i) => {
        if (!h.name.trim() || !h.startDate || !h.endDate) e[`holidays.${i}`] = `Ngày nghỉ ${i + 1}: nhập tên và ngày`;
        else if (h.startDate > h.endDate) e[`holidays.${i}`] = `${h.name}: ngày kết thúc phải sau ngày bắt đầu`;
        else if (h.startDate < v.startDate! || h.endDate > v.endDate!) e[`holidays.${i}`] = `${h.name}: nằm ngoài năm học`;
      });
    }
    setErrors(e);
    return !Object.keys(e).length;
  };
  const next = () => { if (validate(step)) setStep((s) => Math.min(s + 1, 3)); };
  const submit = async () => {
    for (const s of [0, 1, 2]) if (!validate(s)) { setStep(s); return; }
    const r = await cmd.run({ label: v.label, startDate: v.startDate!, endDate: v.endDate!, terms: v.terms.map((t) => ({ name: t.name.trim(), startDate: t.startDate!, endDate: t.endDate!, openingDate: t.openingDate })), holidays: v.holidays.map((h) => ({ name: h.name.trim(), startDate: h.startDate!, endDate: h.endDate! })), copyRules: v.copyRules });
    if (r) { const created={id:r.id,label:v.label};setDone(created);await onCreated?.(created); }
  };
  const setTerm = (i: number, patch: Partial<TermDraft>) => { setV((s) => ({ ...s, terms: s.terms.map((t, k) => k === i ? { ...t, ...patch } : t) })); clear(`terms.${i}`); };
  const setHol = (i: number, patch: Partial<HolidayDraft>) => { setV((s) => ({ ...s, holidays: s.holidays.map((t, k) => k === i ? { ...t, ...patch } : t) })); clear(`holidays.${i}`); };
  const b = `/school/${school.id}`;

  if (done) return (
    <div className="page">
      <PageHeader title="Tạo năm học" breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học", href: `${b}/academic-years` }, { label: "Tạo năm học" }]} />
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <span className="icon-tile tone-green" aria-hidden><CheckCircle2 className="size-7" /></span>
          <div className="min-w-0 space-y-2">
            <p className="text-[18px] font-bold text-ink">Đã tạo năm học {done.label} ở trạng thái Nháp</p>
            <p className="text-sm text-body">Học kỳ, tuần và ngày nghỉ đã được lưu. Học sinh chưa được chuyển — hãy tạo lớp cho năm mới rồi dùng “Kết thúc năm & chuẩn bị năm mới” ở năm hiện tại để xếp lớp.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <ButtonLink href={`${b}/academic-years/${done.id}`} variant="primary">Mở năm học mới</ButtonLink>
              <Button onClick={() => { setYearId(done.id); router.push(`${b}/classes?new=1&year=${done.id}`); }}>Tạo lớp cho năm mới</Button>
              <ButtonLink href={`${b}/academic-years`}>Về danh sách năm học</ButtonLink>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Tạo năm học" subtitle="Khai báo năm học mới theo từng bước. Năm học cũ không bị thay đổi."
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học", href: `${b}/academic-years` }, { label: "Tạo năm học" }]} />
      <Card className="px-5 py-4"><Stepper steps={STEPS} current={step} onStep={(i) => setStep(i)} /></Card>
      <Card>
        <CardHeader title={STEPS[step]} subtitle={["Tên và khoảng thời gian của năm học.", "Các học kỳ nằm trong năm học, không chồng nhau.", "Tuần học được tạo tự động từ thứ Hai; thêm ngày nghỉ nếu cần.", "Kiểm tra trước khi tạo. Năm mới ở trạng thái Nháp."][step]} />
        <div className="space-y-4 px-5 pb-5">
          <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={{ label: "Năm học", startDate: "Ngày bắt đầu", endDate: "Ngày kết thúc", terms: "Học kỳ" }} />
          <FormError message={errors._form} />
          {step === 0 && (
            <div className="grid max-w-3xl gap-4 md:grid-cols-3">
              <div data-field="label"><TextField label="Năm học" required value={v.label} onChange={(e) => { setV((s) => ({ ...s, label: e.target.value.replace(/\s*-\s*/, "–") })); clear("label"); }} error={errors.label} helper="Dạng 2027–2028" /></div>
              <div data-field="startDate"><DateField label="Ngày bắt đầu" required value={v.startDate} onChange={(d) => { setV((s) => ({ ...s, startDate: d })); clear("startDate"); }} error={errors.startDate} /></div>
              <div data-field="endDate"><DateField label="Ngày kết thúc" required value={v.endDate} min={v.startDate} onChange={(d) => { setV((s) => ({ ...s, endDate: d })); clear("endDate"); }} error={errors.endDate} /></div>
              {latest && <p className="text-[13px] text-muted md:col-span-3">Năm học gần nhất: {latest.label} ({fmtDate(latest.startDate)} – {fmtDate(latest.endDate)}). Gợi ý mốc đã được điền sẵn, có thể sửa.</p>}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              {v.terms.map((t, i) => (
                <div key={i} data-field={`terms.${i}`} className="rounded-xl border border-line p-4">
                  <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_1fr_1fr_auto] md:items-start">
                    <TextField label="Tên học kỳ" required value={t.name} onChange={(e) => setTerm(i, { name: e.target.value })} />
                    <DateField label="Bắt đầu" required value={t.startDate} min={v.startDate} max={v.endDate} onChange={(d) => setTerm(i, { startDate: d })} />
                    <DateField label="Kết thúc" required value={t.endDate} min={t.startDate ?? v.startDate} max={v.endDate} onChange={(d) => setTerm(i, { endDate: d })} />
                    <DateField label="Khai giảng" value={t.openingDate} min={v.startDate} max={v.endDate} onChange={(d) => setTerm(i, { openingDate: d })} helper="Tùy chọn" />
                    <IconButton label={`Xóa ${t.name || "học kỳ"}`} icon={<Trash2 className="size-4" />} className="md:mt-7" disabled={v.terms.length <= 1} onClick={() => setV((s) => ({ ...s, terms: s.terms.filter((_, k) => k !== i) }))} />
                  </div>
                  {errors[`terms.${i}`] && <p className="error-text mt-2">{errors[`terms.${i}`]}</p>}
                </div>
              ))}
              <Button icon={<Plus className="size-4" />} onClick={() => setV((s) => ({ ...s, terms: [...s.terms, { name: `Học kỳ ${s.terms.length + 1}` }] }))}>Thêm học kỳ</Button>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[14px] font-semibold text-ink">Tuần học dự kiến</p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {v.terms.map((t, i) => <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-ink">{t.name}</span><span className="text-body">{weekCount(t)} tuần · {fmtDate(t.startDate)} – {fmtDate(t.endDate)}</span></li>)}
                  <li className="flex items-center justify-between bg-[#f7fbff] px-4 py-2.5 text-sm font-semibold"><span>Tổng</span><span>{v.terms.reduce((n, t) => n + weekCount(t), 0)} tuần</span></li>
                </ul>
                <p className="mt-2 text-[12.5px] text-muted">Mỗi tuần bắt đầu thứ Hai; hạn chốt mặc định là thứ Hai tuần kế tiếp (chỉnh được ở màn hình Học kỳ, tuần & ngày nghỉ).</p>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">Ngày nghỉ</p>
                  {detail.data && detail.data.holidays.length > 0 && <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => setV((s) => ({ ...s, holidays: detail.data!.holidays.map((h) => ({ name: h.name, startDate: shiftYear(h.startDate), endDate: shiftYear(h.endDate) })) }))}>Sao chép từ năm {latest?.label} (dời 1 năm)</Button>}
                </div>
                <div className="space-y-2">
                  {v.holidays.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-muted">Chưa có ngày nghỉ. Có thể thêm sau.</p>}
                  {v.holidays.map((h, i) => (
                    <div key={i} data-field={`holidays.${i}`} className="rounded-xl border border-line p-3">
                      <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-start">
                        <TextField label="Tên" value={h.name} onChange={(e) => setHol(i, { name: e.target.value })} />
                        <DateField label="Từ" value={h.startDate} min={v.startDate} max={v.endDate} onChange={(d) => setHol(i, { startDate: d })} helper=" " />
                        <DateField label="Đến" value={h.endDate} min={h.startDate ?? v.startDate} max={v.endDate} onChange={(d) => setHol(i, { endDate: d })} helper=" " />
                        <IconButton label={`Xóa ${h.name || "ngày nghỉ"}`} icon={<Trash2 className="size-4" />} className="sm:mt-7" onClick={() => setV((s) => ({ ...s, holidays: s.holidays.filter((_, k) => k !== i) }))} />
                      </div>
                      {errors[`holidays.${i}`] && <p className="error-text mt-1">{errors[`holidays.${i}`]}</p>}
                    </div>
                  ))}
                  <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setV((s) => ({ ...s, holidays: [...s.holidays, { name: "" }] }))}>Thêm ngày nghỉ</Button>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <dl className="rounded-xl border border-line p-4">
                <InfoRow label="Năm học">{v.label}</InfoRow>
                <InfoRow label="Thời gian">{fmtDate(v.startDate)} – {fmtDate(v.endDate)}</InfoRow>
                {v.terms.map((t, i) => <InfoRow key={i} label={t.name}>{fmtDate(t.startDate)} – {fmtDate(t.endDate)} · {weekCount(t)} tuần</InfoRow>)}
                <InfoRow label="Ngày nghỉ">{v.holidays.length ? v.holidays.map((h) => h.name).join(", ") : "Chưa có"}</InfoRow>
                <InfoRow label="Trạng thái sau khi tạo">Nháp</InfoRow>
              </dl>
              <div className="space-y-3">
                <Checkbox label="Sao chép nội quy thi đua đang áp dụng thành bản nháp cho năm mới" description="Bản sao ở trạng thái Nháp, cần ban hành lại. Nội quy năm hiện tại không đổi." checked={v.copyRules} disabled={!can("rules.manage") || !latest} onChange={(c) => setV((s) => ({ ...s, copyRules: c }))} />
                <Callout tone="warning" icon={<Info />} title="Không tự chuyển học sinh">Tạo năm học không di chuyển học sinh, lớp hay phân công. Xếp lớp năm mới làm ở “Kết thúc năm & chuẩn bị năm mới”, có xem trước từng nhóm.</Callout>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            {embedded?<Button variant="ghost" onClick={onCancel}>Hủy</Button>:<ButtonLink href={`${b}/academic-years`} variant="ghost">Hủy</ButtonLink>}
            <div className="flex gap-2">
              {step > 0 && <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)} disabled={cmd.pending}>Quay lại</Button>}
              {step < 3 ? <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={next}>Tiếp tục</Button> : <Button variant="primary" loading={cmd.pending} onClick={submit}>Tạo năm học</Button>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
