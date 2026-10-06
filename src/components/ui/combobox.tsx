"use client";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { clsx } from "clsx";
import { Check, ChevronDown, Search, X, AlertCircle } from "lucide-react";
import { fold } from "@/lib/formatters";

export interface ComboOption { value: string; label: string; hint?: string; disabled?: boolean; group?: string }

/**
 * C015 — searchable select (single or multi) with keyboard support.
 * Options must already be restricted to the actor's school/class scope by the caller.
 */
export function Combobox({ label, options, value, onChange, multiple, placeholder = "Chọn…", error, required, helper, emptyText = "Không có lựa chọn phù hợp", id, disabled, onSearchChange, selectedLabel,labelAction }: {
  label: ReactNode; options: ComboOption[]; value: string | string[]; onChange: (v: string | string[]) => void; multiple?: boolean; placeholder?: string;
  error?: string; required?: boolean; helper?: ReactNode; emptyText?: string; id?: string; disabled?: boolean;onSearchChange?:(query:string)=>void;selectedLabel?:string;labelAction?:ReactNode;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : value ? [value] : []), [value]);
  const filtered = useMemo(() => onSearchChange?options:options.filter((o) => !q || fold(`${o.label} ${o.hint ?? ""}`).includes(fold(q))), [options, q,onSearchChange]);
  const summary = multiple
    ? selected.size ? `${selected.size} đã chọn` : placeholder
    : options.find((o) => o.value === value)?.label ?? selectedLabel ?? placeholder;

  const choose = (o: ComboOption) => {
    if (o.disabled) return;
    if (multiple) {
      const next = new Set(selected);
      if (next.has(o.value)) next.delete(o.value); else next.add(o.value);
      onChange([...next]);
    } else {
      onChange(o.value);
      setOpen(false);
    }
  };

  return (
    <div className="field">
      <div className="flex items-center justify-between gap-2"><label className="label" htmlFor={fid}>{label}{required && <span className="req" aria-hidden>*</span>}</label>{labelAction}</div>
      <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) {setQ("");onSearchChange?.("");} }}>
        <Popover.Trigger asChild disabled={disabled}>
          <button id={fid} type="button" role="combobox" aria-expanded={open} aria-invalid={!!error || undefined} aria-controls={`${fid}-list`}
            className={clsx("select flex items-center text-left", !selected.size && "text-faint")}>
            <span className="min-w-0 flex-1 truncate">{summary}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={4} className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-xl border border-line bg-white p-2 shadow-[var(--shadow-pop)]"
            onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector("input")?.focus(); }}>
            <div className="input-icon mb-2">
              <Search className="size-4" aria-hidden />
              <input className="input" placeholder="Tìm…" value={q} aria-label="Tìm trong danh sách" aria-controls={`${fid}-list`}
                onChange={(e) => { setQ(e.target.value); setActive(0);onSearchChange?.(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); const o = filtered[active]; if (o) choose(o); }
                }} />
            </div>
            <ul id={`${fid}-list`} ref={listRef} role="listbox" aria-multiselectable={multiple || undefined} className="max-h-64 overflow-y-auto">
              {filtered.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">{emptyText}</li>}
              {filtered.map((o, i) => (
                <li key={o.value} role="option" aria-selected={selected.has(o.value)} aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
                  className={clsx("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm", i === active && "bg-primary-light", o.disabled && "cursor-not-allowed opacity-50")}>
                  {multiple
                    ? <span className={clsx("flex size-4 flex-none items-center justify-center rounded border", selected.has(o.value) ? "border-primary bg-primary text-white" : "border-line-strong")} aria-hidden>{selected.has(o.value) && <Check className="size-3" />}</span>
                    : <span className="flex size-4 flex-none items-center justify-center text-primary" aria-hidden>{selected.has(o.value) && <Check className="size-4" />}</span>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-ink">{o.label}</span>{o.hint && <span className="block truncate text-[12px] text-muted">{o.hint}</span>}</span>
                </li>
              ))}
            </ul>
            {multiple && (
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Bỏ chọn</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Xong</button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {multiple && selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.filter((o) => selected.has(o.value)).slice(0, 12).map((o) => (
            <span key={o.value} className="chip chip-active !py-0.5 text-[12.5px]">{o.label}
              <button type="button" aria-label={`Bỏ ${o.label}`} onClick={() => choose(o)} className="rounded-full p-0.5 hover:bg-white/60"><X className="size-3" /></button>
            </span>
          ))}
          {selected.size > 12 && <span className="text-[12.5px] text-muted">+{selected.size - 12}</span>}
        </div>
      )}
      {error ? <p className="error-text"><AlertCircle className="size-3.5" aria-hidden />{error}</p> : helper ? <p className="helper">{helper}</p> : null}
      <ChevronDown className="hidden" aria-hidden />
    </div>
  );
}
