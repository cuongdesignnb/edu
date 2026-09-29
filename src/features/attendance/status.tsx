"use client";
import { clsx } from "clsx";
import { Check, Circle } from "lucide-react";
import type { AttendanceStatus } from "@/lib/model/types";
import { attendanceStatus } from "@/lib/formatters";

export const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "excused", "unexcused", "unmarked"];

/** Colour per status — always paired with text and an icon (never colour alone). */
export const STATUS_STYLE: Record<AttendanceStatus, { on: string; chip: string; dot: string; abbr: string }> = {
  present: { on: "border-[#9fdcc3] bg-success-bg text-success-text", chip: "bg-success-bg text-success-text", dot: "bg-success", abbr: "C" },
  late: { on: "border-[#f5d9a6] bg-warning-bg text-warning-text", chip: "bg-warning-bg text-warning-text", dot: "bg-warning", abbr: "M" },
  excused: { on: "border-[#b9d7fb] bg-primary-light text-primary-strong", chip: "bg-primary-light text-primary-strong", dot: "bg-primary", abbr: "P" },
  unexcused: { on: "border-[#f6c9cb] bg-danger-bg text-danger-text", chip: "bg-danger-bg text-danger-text", dot: "bg-danger", abbr: "K" },
  unmarked: { on: "border-line-strong bg-neutral-bg text-neutral-text", chip: "bg-neutral-bg text-neutral-text", dot: "bg-faint", abbr: "–" },
};

/**
 * C058 — five mutually exclusive status buttons (radiogroup). "Chưa điểm danh" is a real state,
 * never counted as present. `large` = touch-friendly version for C059 mobile cards.
 */
export function StatusButtons({ value, onChange, disabled, name, large }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void; disabled?: boolean; name: string; large?: boolean }) {
  return (
    <div role="radiogroup" aria-label={`Trạng thái điểm danh của ${name}`} className={clsx(large ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-1 xl:flex-nowrap")}>
      {STATUS_ORDER.map((s) => {
        const on = value === s;
        return (
          <button key={s} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={() => onChange(s)}
            onKeyDown={(e) => {
              const i = STATUS_ORDER.indexOf(value);
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const n = (i + step + STATUS_ORDER.length) % STATUS_ORDER.length;
              onChange(STATUS_ORDER[n]);
              (e.currentTarget.parentElement?.querySelectorAll("button")[n] as HTMLButtonElement | undefined)?.focus();
            }}
            tabIndex={on ? 0 : -1}
            className={clsx("inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              large ? "min-h-12 justify-center px-2 text-[13.5px]" : "min-h-8 whitespace-nowrap px-1.5 text-[12px]",
              large && s === "unmarked" && "col-span-2",
              on ? STATUS_STYLE[s].on : "border-line bg-white text-body hover:bg-[#f5f9ff]")}>
            {on ? <Check className="size-3.5 flex-none" aria-hidden /> : <Circle className="size-3.5 flex-none text-faint" aria-hidden />}
            {attendanceStatus[s].label}
          </button>
        );
      })}
    </div>
  );
}

/** Legend with abbreviation + label (used by the weekly matrix). */
export function StatusLegend({ extra }: { extra?: { abbr: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-body" aria-label="Chú giải">
      {STATUS_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5"><span className={clsx("inline-flex size-6 items-center justify-center rounded-md text-[12px] font-bold", STATUS_STYLE[s].chip)}>{STATUS_STYLE[s].abbr}</span>{attendanceStatus[s].label}</li>
      ))}
      {extra?.map((x) => <li key={x.abbr} className="flex items-center gap-1.5"><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#f1f4f8] px-1 text-[11px] font-bold text-muted">{x.abbr}</span>{x.label}</li>)}
    </ul>
  );
}
