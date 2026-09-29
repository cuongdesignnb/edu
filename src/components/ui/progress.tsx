import { clsx } from "clsx";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** Progress bar with explicit numerator/denominator label (never a bare percentage). */
export function ProgressBar({ value, total, color, label, className, showPercent = true, ariaLabel }: { value: number; total: number; color?: string; label?: ReactNode; className?: string; showPercent?: boolean; ariaLabel?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const name = ariaLabel ?? (typeof label === "string" ? label : `Tiến độ ${value}/${total}`);
  return (
    <div className={clsx("min-w-0", className)}>
      {label && <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]"><span className="font-medium text-ink">{label}</span>{showPercent && <span className="tabular-nums text-muted">{total ? `${pct}%` : "—"}</span>}</div>}
      <div className="progress" role="progressbar" aria-label={name} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${value}/${total}`}>
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Ring progress (R02 "75%", R10 "5/5"). Center text is provided by the caller. */
export function DonutProgress({ value, total, size = 112, stroke = 12, color = "var(--color-primary)", children, label }: { value: number; total: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7eef7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** C033 — wizard stepper; completed steps are clickable to go back without losing data. */
export function Stepper({ steps, current, onStep, className }: { steps: string[]; current: number; onStep?: (i: number) => void; className?: string }) {
  return (
    <ol className={clsx("flex items-center gap-2 overflow-x-auto pb-1", className)} aria-label="Các bước">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-fit flex-1 items-center gap-2">
            <button type="button" disabled={!done || !onStep} onClick={() => onStep?.(i)} aria-current={active ? "step" : undefined}
              className={clsx("flex items-center gap-2.5 rounded-lg px-1 py-1 text-left", done && onStep && "hover:bg-primary-light")}>
              <span className={clsx("flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold", active ? "bg-primary text-white" : done ? "bg-success-bg text-success-text" : "bg-[#eef3f9] text-muted")}>
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={clsx("whitespace-nowrap text-sm font-semibold", active ? "text-primary-strong" : done ? "text-ink" : "text-muted")}>{s}</span>
            </button>
            {i < steps.length - 1 && <span className="hidden h-px min-w-6 flex-1 bg-line-strong sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
