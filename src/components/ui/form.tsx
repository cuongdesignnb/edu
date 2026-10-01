"use client";
import { forwardRef, useContext, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import {serverToday} from "@/lib/api/session";
import {NativeSchoolScope} from "@/lib/query/native-school-scope";
import { clsx } from "clsx";
import * as Switch from "@radix-ui/react-switch";
import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { weekdayOf } from "@/lib/calendar";

/* ------------------------------ Field ------------------------------ */
export function Field({ label, htmlFor, required, helper, error, children, className, labelAction }: { label: ReactNode; htmlFor?: string; required?: boolean; helper?: ReactNode; error?: string; children: ReactNode; className?: string; labelAction?: ReactNode }) {
  return (
    <div className={clsx("field", className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="label" htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}{required && <span className="sr-only"> (bắt buộc)</span>}</label>
        {labelAction}
      </div>
      {children}
      {error ? <p className="error-text" id={htmlFor ? `${htmlFor}-error` : undefined}><AlertCircle className="size-3.5 flex-none" aria-hidden />{error}</p> : helper ? <p className="helper" id={htmlFor ? `${htmlFor}-help` : undefined}>{helper}</p> : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; helper?: ReactNode; icon?: ReactNode; labelAction?: ReactNode };

/** C013 — label always visible (placeholder never replaces the label). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, helper, icon, id, required, className, labelAction, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} required={required} helper={helper} error={error} className={className} labelAction={labelAction}>
      <div className={clsx(icon && "input-icon")}>
        {icon}
        <input ref={ref} id={fid} className="input" aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-error` : helper ? `${fid}-help` : undefined} required={required} {...rest} />
      </div>
    </Field>
  );
});

/** C014 — textarea with optional character counter. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; error?: string; helper?: ReactNode; maxChars?: number }>(function TextArea({ label, error, helper, id, required, className, maxChars, value, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const len = typeof value === "string" ? value.length : 0;
  return (
    <Field label={label} htmlFor={fid} required={required} error={error} className={className}
      helper={maxChars ? <span className="flex justify-between gap-2"><span>{helper}</span><span className={clsx(len > maxChars && "text-danger-text")}>{len}/{maxChars}</span></span> : helper}>
      <textarea ref={ref} id={fid} className="textarea" value={value} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-error` : `${fid}-help`} required={required} {...rest} />
    </Field>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; error?: string; helper?: ReactNode; options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; labelAction?: ReactNode }>(function SelectField({ label, error, helper, id, required, className, options, placeholder, labelAction, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} required={required} helper={helper} error={error} className={className} labelAction={labelAction}>
      <select ref={ref} id={fid} className="select" aria-invalid={!!error || undefined} required={required} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </Field>
  );
});

/** Compact select without a visible label (used inside filter bars — has aria-label). */
export function InlineSelect({ label, value, onChange, options, className, allLabel, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; allLabel?: string; disabled?: boolean }) {
  return (
    <select disabled={disabled} aria-label={label} className={clsx("select", className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ------------------------------ Checkbox / radio / switch ------------------------------ */
export function Checkbox({ label, checked, onChange, disabled, indeterminate, description, id, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; indeterminate?: boolean; description?: ReactNode; id?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const auto = useId();
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label htmlFor={id ?? auto} className={clsx("flex cursor-pointer items-start gap-2.5 text-sm", disabled && "cursor-not-allowed opacity-60", className)}>
      <input ref={ref} id={id ?? auto} type="checkbox" className="mt-0.5 size-[18px] flex-none cursor-pointer accent-[var(--color-primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0"><span className="font-medium text-ink">{label}</span>{description && <span className="block text-[12.5px] text-muted">{description}</span>}</span>
    </label>
  );
}

export function RadioGroup<T extends string>({ label, value, onChange, options, name, error, direction = "col", className }: { label: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }[]; name?: string; error?: string; direction?: "row" | "col"; className?: string }) {
  const auto = useId();
  return (
    <fieldset className={clsx("field", className)}>
      <legend className="label mb-1.5">{label}</legend>
      <div className={clsx("flex gap-2", direction === "col" ? "flex-col" : "flex-wrap")} role="radiogroup">
        {options.map((o) => (
          <label key={o.value} className={clsx("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors", value === o.value ? "border-[#9cc7f5] bg-primary-light" : "border-line bg-white hover:bg-[#f8fbff]", o.disabled && "cursor-not-allowed opacity-55")}>
            <input type="radio" name={name ?? auto} className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            <span><span className="font-medium text-ink">{o.label}</span>{o.description && <span className="block text-[12.5px] text-muted">{o.description}</span>}</span>
          </label>
        ))}
      </div>
      {error && <p className="error-text mt-1"><AlertCircle className="size-3.5" aria-hidden />{error}</p>}
    </fieldset>
  );
}

/** Switch is only for simple on/off preferences — never for approval actions. */
export function Toggle({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={fid} className={clsx("min-w-0 text-sm", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-[12.5px] text-muted">{description}</span>}
      </label>
      <Switch.Root id={fid} checked={checked} onCheckedChange={onChange} disabled={disabled}
        className="relative h-6 w-11 flex-none rounded-full bg-[#cfdcec] transition-colors data-[state=checked]:bg-primary disabled:opacity-50">
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}

/* ------------------------------ Number ------------------------------ */
/** C018 — empty means "no data" (undefined), never silently 0; NaN rejected. */
export function NumberField({ label, value, onChange, min, max, step = 1, error, helper, required, id, allowNegative = true }: { label: ReactNode; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; error?: string; helper?: ReactNode; required?: boolean; id?: string; allowNegative?: boolean }) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [local, setLocal] = useState<string | undefined>();
  useEffect(() => { setText(value === undefined ? "" : String(value)); }, [value]);
  return (
    <Field label={label} htmlFor={fid} required={required} helper={helper} error={error ?? local}>
      <input id={fid} className="input" inputMode="numeric" value={text} aria-invalid={!!(error ?? local) || undefined}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(e.target.value);
          if (t.trim() === "") { setLocal(undefined); onChange(undefined); return; }
          if (!(allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(t)) { setLocal("Chỉ nhập số"); return; }
          const n = Number(t);
          if (min !== undefined && n < min) { setLocal(`Tối thiểu ${min}`); return; }
          if (max !== undefined && n > max) { setLocal(`Tối đa ${max}`); return; }
          setLocal(undefined);
          onChange(Math.round(n / step) * step);
        }} />
    </Field>
  );
}

/* ------------------------------ Date (dd/MM/yyyy, Asia/Ho_Chi_Minh) ------------------------------ */
const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
function isoToVi(iso?: string) { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ""; }
function viToIso(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function MiniCalendar({ value, onSelect, min, max, marked }: { value?: string; onSelect: (iso: string) => void; min?: string; max?: string; marked?: Set<string> }) {
  const schoolId=useContext(NativeSchoolScope);
  const init = value ?? min ?? serverToday(schoolId);
  const [ym, setYm] = useState({ y: Number(init.slice(0, 4)), m: Number(init.slice(5, 7)) });
  const days = useMemo(() => {
    const first = `${ym.y}-${String(ym.m).padStart(2, "0")}-01`;
    const lead = weekdayOf(first) - 1;
    const count = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${ym.y}-${String(ym.m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  }, [ym]);
  const move = (d: number) => setYm((x) => { const m = x.m + d; return m < 1 ? { y: x.y - 1, m: 12 } : m > 12 ? { y: x.y + 1, m: 1 } : { y: x.y, m }; });
  return (
    <div className="w-[272px] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(-1)} aria-label="Tháng trước"><ChevronLeft className="size-4" /></button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{MONTHS[ym.m - 1]}, {ym.y}</p>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(1)} aria-label="Tháng sau"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[12px]">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <span key={d} className="py-1 font-semibold text-muted">{d}</span>)}
        {days.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <button key={d} type="button" disabled={(min && d < min) || (max && d > max) ? true : false} onClick={() => onSelect(d)}
            className={clsx("relative rounded-lg py-1.5 text-[13px] hover:bg-primary-light disabled:opacity-30", d === value && "bg-primary font-semibold text-white hover:bg-primary")} aria-pressed={d === value} aria-label={isoToVi(d)}>
            {Number(d.slice(8))}
            {marked?.has(d) && d !== value && <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** C017 — date as dd/MM/yyyy text + calendar popover; value is ISO yyyy-MM-dd. */
export function DateField({ label, value, onChange, min, max, error, helper, required, id, className }: { label: ReactNode; value?: string; onChange: (iso: string | undefined) => void; min?: string; max?: string; error?: string; helper?: ReactNode; required?: boolean; id?: string; className?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(isoToVi(value));
  const [local, setLocal] = useState<string>();
  const [open, setOpen] = useState(false);
  useEffect(() => setText(isoToVi(value)), [value]);
  const commit = (t: string) => {
    if (!t.trim()) { setLocal(undefined); onChange(undefined); return; }
    const iso = viToIso(t);
    if (!iso) { setLocal("Định dạng ngày dd/MM/yyyy"); return; }
    if (min && iso < min) { setLocal(`Không trước ${isoToVi(min)}`); return; }
    if (max && iso > max) { setLocal(`Không sau ${isoToVi(max)}`); return; }
    setLocal(undefined);
    onChange(iso);
  };
  return (
    <Field label={label} htmlFor={fid} required={required} error={error ?? local} helper={helper ?? "Định dạng dd/MM/yyyy"} className={className}>
      <div className="relative">
        <input id={fid} className="input pr-11" placeholder="dd/MM/yyyy" value={text} inputMode="numeric" aria-invalid={!!(error ?? local) || undefined}
          onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }} />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted hover:bg-neutral-bg" aria-label="Mở lịch chọn ngày"><CalendarDays className="size-4" /></button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={6} className="z-[70] rounded-xl border border-line bg-white p-3 shadow-[var(--shadow-pop)]">
              <MiniCalendar value={value} min={min} max={max} onSelect={(iso) => { onChange(iso); setLocal(undefined); setOpen(false); }} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </Field>
  );
}

/* ------------------------------ Error summary ------------------------------ */
/** C019 — on submit, focus moves here; each item jumps to its field. Form data is never cleared. */
export function ErrorSummary({ errors, labels, title = "Vui lòng kiểm tra lại các mục sau" }: { errors: Record<string, string | undefined>; labels?: Record<string, string>; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const list = Object.entries(errors).filter(([, v]) => !!v);
  const sig = list.map(([k, v]) => k + v).join("|");
  useEffect(() => { if (list.length) ref.current?.focus(); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-xl border border-[#f6c9cb] bg-danger-bg px-4 py-3 text-[13.5px] text-danger-text outline-none">
      <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" aria-hidden />{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">
        {list.map(([k, v]) => (
          <li key={k}><button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => { const el = document.querySelector<HTMLElement>(`[data-field="${k}"] input, [data-field="${k}"] select, [data-field="${k}"] textarea, [data-field="${k}"] button`); el?.focus(); }}>{labels?.[k] ? `${labels[k]}: ` : ""}{v}</button></li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Multi-select chips ------------------------------ */
export function ChipToggleGroup<T extends string>({ label, options, value, onChange, error }: { label: ReactNode; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; error?: string }) {
  return (
    <fieldset className="field">
      <legend className="label mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" className={clsx("chip", on && "chip-active")} aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
              {on && <Check className="size-3.5" aria-hidden />}{o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="error-text mt-1"><AlertCircle className="size-3.5" aria-hidden />{error}</p>}
    </fieldset>
  );
}

export { isoToVi, viToIso };
