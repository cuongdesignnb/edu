"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, CalendarClock, Umbrella, ListOrdered, ArrowLeft } from "lucide-react";
import type { Term } from "@/lib/model/types";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { DateField, InlineSelect, TextField } from "@/components/ui/form";
import { Pagination } from "@/components/data/table";
import { EmptyState, QueryState } from "@/components/ui/states";
import { weekdayOf } from "@/lib/demo/clock";
import { fmtDate } from "@/lib/formatters";
import { TermDialog } from "./term-dialog";
import { FormError, useFormErrors } from "./common";

type Detail = Awaited<ReturnType<typeof schoolRepo.yearDetail>>;
type WeekRow = Detail["weeks"][number];

/** SC06 — terms, weeks (with close deadlines) and holidays of one year. Locked data is never re-dated. */
export function YearCalendar({ yearId }: { yearId: string }) {
  const { school } = useSchool();
  const q = useRepo(["school-year-detail", school.id, yearId], (c) => schoolRepo.yearDetail(c, school.id, yearId));
  const b = `/school/${school.id}`;
  return (
    <QueryState query={q} skeleton="table">
      {(d) => {
        const editable = d.canManage && d.year.status !== "archived";
        return (
          <div className="page">
            <PageHeader title="Học kỳ, tuần và ngày nghỉ" subtitle={`Năm học ${d.year.label}: ${fmtDate(d.year.startDate)} – ${fmtDate(d.year.endDate)}`}
              breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học", href: `${b}/academic-years` }, { label: d.year.label, href: `${b}/academic-years/${d.year.id}` }, { label: "Học kỳ, tuần & ngày nghỉ" }]}
              actions={<ButtonLink href={`${b}/academic-years/${d.year.id}`} icon={<ArrowLeft className="size-4" />}>Về năm học</ButtonLink>} />
            {!editable && <Callout tone="neutral">{d.year.status === "archived" ? "Năm học đã lưu trữ — chỉ xem." : "Bạn chỉ có quyền xem lịch năm học. Chỉnh mốc cần quyền quản lý năm học."}</Callout>}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <TermsList d={d} editable={editable} />
                <MonthView d={d} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <WeeksTable d={d} editable={editable} />
                <Holidays d={d} editable={editable} />
              </div>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function TermsList({ d, editable }: { d: Detail; editable: boolean }) {
  const [term, setTerm] = useState<Term | null>(null);
  return (
    <Card>
      <CardHeader title="Học kỳ" icon={<CalendarDays className="size-5 text-primary" />} subtitle="Học kỳ không chồng thời gian và nằm trong năm học" />
      {d.terms.length === 0 ? <EmptyState compact title="Chưa có học kỳ" /> : (
        <ul className="space-y-2 px-5 pb-5">
          {d.terms.map((t) => {
            const weeks = d.weeks.filter((w) => w.termId === t.id);
            const locked = weeks.filter((w) => w.locked).length;
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{t.name}</p>
                  <p className="text-[13px] text-body">{fmtDate(t.startDate)} – {fmtDate(t.endDate)} · {weeks.length} tuần{t.openingDate ? ` · khai giảng ${fmtDate(t.openingDate)}` : ""}</p>
                  {locked > 0 && <p className="text-[12.5px] text-purple">{locked} tuần đã có lớp chốt</p>}
                </div>
                {editable && <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setTerm(t)}>Sửa mốc</Button>}
              </li>
            );
          })}
        </ul>
      )}
      <TermDialog term={term} year={d.year} lockedWeeks={term ? d.weeks.filter((w) => w.termId === term.id && w.locked).length : 0} onClose={() => setTerm(null)} />
    </Card>
  );
}

function MonthView({ d }: { d: Detail }) {
  const ctx = useCtx();
  const months = useMemo(() => {
    const out: string[] = [];
    let m = d.year.startDate.slice(0, 7);
    while (m <= d.year.endDate.slice(0, 7)) { out.push(m); const [y, mm] = m.split("-").map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; }
    return out;
  }, [d.year]);
  const initial = months.includes(ctx.today.slice(0, 7)) ? ctx.today.slice(0, 7) : months[0];
  const [month, setMonth] = useState(initial);
  const idx = months.indexOf(month);
  const [y, mm] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const lead = weekdayOf(`${month}-01`) - 1;
  const days = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const holidayOf = (day: string) => d.holidays.find((h) => h.startDate <= day && h.endDate >= day);
  const termOf = (day: string) => d.terms.find((t) => t.startDate <= day && t.endDate >= day);
  const weekOf = (day: string) => d.weeks.find((w) => w.startDate <= day && w.endDate >= day);
  return (
    <Card>
      <CardHeader title="Lịch tháng" icon={<CalendarClock className="size-5 text-primary" />} action={
        <div className="flex items-center gap-1">
          <IconButton label="Tháng trước" icon={<ChevronLeft className="size-4" />} size="sm" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])} />
          <InlineSelect label="Chọn tháng" className="!h-9 !min-h-9 !w-auto !py-0 text-[13px]" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}` }))} />
          <IconButton label="Tháng sau" icon={<ChevronRight className="size-4" />} size="sm" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])} />
        </div>
      } />
      <div className="px-5 pb-5">
        <div className="grid grid-cols-7 gap-1 text-center text-[12.5px]">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => <span key={w} className="py-1 font-semibold text-muted">{w}</span>)}
          {days.map((day, i) => {
            if (!day) return <span key={`e${i}`} />;
            const hol = holidayOf(day);
            const term = termOf(day);
            const week = weekOf(day);
            const today = day === ctx.today;
            return (
              <div key={day} title={[hol?.name, term?.name, week ? `Tuần ${week.index}${week.locked ? " (đã chốt)" : ""}` : undefined].filter(Boolean).join(" · ")}
                className={clsx("flex min-h-[46px] flex-col items-center justify-center rounded-lg border text-[13px]",
                  hol ? "border-[#f6c9cb] bg-danger-bg text-danger-text" : term ? "border-[#d6e6fa] bg-[#f3f8ff] text-ink" : "border-transparent text-muted",
                  week?.isCurrent && "ring-2 ring-success", today && "font-extrabold")}>
                <span>{Number(day.slice(8))}</span>
                {weekdayOf(day) === 1 && week && <span className={clsx("text-[10.5px]", week.locked ? "text-purple" : "text-primary-strong")}>T{week.index}</span>}
              </div>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-body">
          <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-[#d6e6fa] bg-[#f3f8ff]" aria-hidden />Ngày trong học kỳ</li>
          <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-[#f6c9cb] bg-danger-bg" aria-hidden />Ngày nghỉ</li>
          <li className="flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-success" aria-hidden />Tuần hiện tại</li>
          <li className="flex items-center gap-1.5"><span className="font-semibold text-primary-strong">T5</span>Số tuần (tím = đã chốt)</li>
        </ul>
      </div>
    </Card>
  );
}

function WeeksTable({ d, editable }: { d: Detail; editable: boolean }) {
  const { school } = useSchool();
  const sp = useSearchParams();
  const [term, setTerm] = useState(sp.get("term") ?? "");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<WeekRow | null>(null);
  const rows = d.weeks.filter((w) => !term || w.termId === term);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount);
  const shown = rows.slice((cur - 1) * pageSize, cur * pageSize);
  return (
    <Card>
      <CardHeader title="Mốc tuần và hạn chốt" icon={<ListOrdered className="size-5 text-primary" />} action={
        <InlineSelect label="Lọc học kỳ" className="!w-auto min-w-[150px]" allLabel="Tất cả học kỳ" value={term} onChange={(v) => { setTerm(v); setPage(1); }} options={d.terms.map((t) => ({ value: t.id, label: t.name }))} />
      } />
      {rows.length === 0 ? <EmptyState compact title="Chưa có tuần học" /> : (
        <>
          <div className="px-4">
            <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Danh sách tuần" tabIndex={0}>
              <table className="table" style={{ minWidth: 540 }}>
                <thead><tr><th>Tuần</th><th>Thời gian</th><th>Học kỳ</th><th>Hạn chốt</th><th>Trạng thái</th>{editable && <th className="center">Thao tác</th>}</tr></thead>
                <tbody>
                  {shown.map((w) => (
                    <tr key={w.id}>
                      <td className="whitespace-nowrap font-semibold text-ink">Tuần {w.index}</td>
                      <td className="whitespace-nowrap">{w.startDate.slice(8, 10)}/{w.startDate.slice(5, 7)} – {fmtDate(w.endDate)}</td>
                      <td className="whitespace-nowrap">{d.terms.find((t) => t.id === w.termId)?.name}</td>
                      <td className="whitespace-nowrap">{fmtDate(w.closeDeadline)}</td>
                      <td>{w.isCurrent ? <Badge tone="success" className="whitespace-nowrap">Hiện tại</Badge> : w.locked ? <Badge tone="purple" className="whitespace-nowrap" title="Có lớp đã chốt thi đua tuần này">Đã chốt</Badge> : <Badge tone="neutral" className="whitespace-nowrap">Đang mở</Badge>}</td>
                      {editable && <td className="center"><Button size="sm" variant="ghost" disabled={w.locked} title={w.locked ? "Tuần đã có lớp chốt — không đổi hạn áp ngược" : undefined} onClick={() => setEdit(w)}>Đổi hạn</Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={cur} pageCount={pageCount} total={rows.length} pageSize={pageSize} onPage={setPage} what="tuần" />
        </>
      )}
      <DeadlineDialog week={edit} schoolId={school.id} onClose={() => setEdit(null)} />
    </Card>
  );
}

function DeadlineDialog({ week, schoolId, onClose }: { week: WeekRow | null; schoolId: string; onClose: () => void }) {
  const [value, setValue] = useState<string | undefined>();
  const { errors, setErrors, onError } = useFormErrors();
  const cmd = useCommand((c, id: string, date: string) => schoolRepo.updateWeekDeadline(c, schoolId, id, date), { success: (w) => `Đã đổi hạn chốt tuần ${w.index}`, onError });
  const v = value ?? week?.closeDeadline;
  const close = () => { setValue(undefined); setErrors({}); onClose(); };
  return (
    <Modal open={!!week} onOpenChange={(o) => { if (!o) close(); }} busy={cmd.pending} size="sm" title={`Hạn chốt tuần ${week?.index ?? ""}`} description={week ? `${fmtDate(week.startDate)} – ${fmtDate(week.endDate)}` : undefined}
      footer={<><Button variant="ghost" onClick={close} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} disabled={!v || v === week?.closeDeadline} onClick={async () => { if (!week || !v) return; const r = await cmd.run(week.id, v); if (r) close(); }}>Lưu hạn chốt</Button></>}>
      <div className="space-y-3">
        <FormError message={errors._form} />
        <DateField label="Hạn chốt" required value={v} min={week?.endDate} onChange={setValue} error={errors.closeDeadline} helper="Không sớm hơn ngày cuối tuần. Chỉ áp dụng khi chưa có lớp chốt tuần này." />
      </div>
    </Modal>
  );
}

function Holidays({ d, editable }: { d: Detail; editable: boolean }) {
  const { school } = useSchool();
  const [form, setForm] = useState<{ name: string; startDate?: string; endDate?: string }>({ name: "" });
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const { errors, setErrors, onError, clear } = useFormErrors();
  const add = useCommand((c, h: { name: string; startDate: string; endDate: string }) => schoolRepo.addHoliday(c, school.id, d.year.id, h), { success: (h) => `Đã thêm ${h.name}`, onError });
  const del = useCommand((c, id: string) => schoolRepo.removeHoliday(c, school.id, id), { success: "Đã xóa ngày nghỉ khỏi lịch" });
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Nhập tên ngày nghỉ";
    if (!form.startDate) e.startDate = "Chọn ngày bắt đầu";
    if (!form.endDate) e.endDate = "Chọn ngày kết thúc";
    if (Object.keys(e).length) { setErrors(e); return; }
    const r = await add.run({ name: form.name.trim(), startDate: form.startDate!, endDate: form.endDate! });
    if (r) setForm({ name: "" });
  };
  return (
    <Card>
      <CardHeader title="Ngày nghỉ" icon={<Umbrella className="size-5 text-primary" />} subtitle={`${d.holidays.length} kỳ nghỉ trong năm học`} />
      <div className="px-5 pb-5">
        {d.holidays.length === 0 ? <p className="text-[13px] text-muted">Chưa khai báo ngày nghỉ.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {d.holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1"><p className="font-medium text-ink">{h.name}</p><p className="text-[12.5px] text-muted">{fmtDate(h.startDate)}{h.endDate !== h.startDate ? ` – ${fmtDate(h.endDate)}` : ""}</p></div>
                {editable && <IconButton label={`Xóa ${h.name}`} icon={<Trash2 className="size-4" />} size="sm" onClick={() => setRemove({ id: h.id, name: h.name })} />}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <form className="mt-4 rounded-xl border border-dashed border-line-strong p-3" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <p className="mb-2 text-[13.5px] font-semibold text-ink">Thêm ngày nghỉ</p>
            <FormError message={errors._form} />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Tên" required value={form.name} onChange={(e) => { setForm((s) => ({ ...s, name: e.target.value })); clear("name"); }} error={errors.name} placeholder="Ví dụ: Nghỉ giữa kỳ" />
              <DateField label="Từ ngày" required value={form.startDate} min={d.year.startDate} max={d.year.endDate} onChange={(v) => { setForm((s) => ({ ...s, startDate: v })); clear("startDate"); }} error={errors.startDate} />
              <DateField label="Đến ngày" required value={form.endDate} min={form.startDate ?? d.year.startDate} max={d.year.endDate} onChange={(v) => { setForm((s) => ({ ...s, endDate: v })); clear("endDate"); }} error={errors.endDate} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {(form.name || form.startDate || form.endDate) && <Button variant="ghost" size="sm" onClick={() => { setForm({ name: "" }); setErrors({}); }}>Hủy</Button>}
              <Button type="submit" size="sm" variant="primary" icon={<Plus className="size-4" />} loading={add.pending}>Thêm vào lịch</Button>
            </div>
          </form>
        )}
      </div>
      <ConfirmDialog open={!!remove} onOpenChange={(o) => { if (!o) setRemove(null); }} busy={del.pending} title="Xóa ngày nghỉ khỏi lịch" object={remove?.name} variant="danger" confirmLabel="Xóa ngày nghỉ"
        consequence="Ngày này trở lại là ngày học bình thường trên lịch. Dữ liệu điểm danh, thi đua đã ghi không thay đổi."
        onConfirm={async () => { if (!remove) return; const r = await del.run(remove.id); if (r) setRemove(null); }} />
    </Card>
  );
}
