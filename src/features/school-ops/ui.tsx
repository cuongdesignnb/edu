"use client";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/** Segmented filter tabs (status filters). Real buttons with tab semantics, counts from the repository. */
export function SegmentTabs<T extends string>({ items, value, onChange, label, className }: { items: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div className={clsx("tabbar", className)} role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={value === it.value} className="tab whitespace-nowrap" onClick={() => onChange(it.value)}>
          {it.label}
          {it.count !== undefined && <span className="rounded-full bg-white/80 px-1.5 text-[11px] font-bold tabular-nums">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Small stat tile used in page summary rows (value always from the repository). */
export function StatTile({ label, value, hint, tone = "blue", icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "blue" | "green" | "amber" | "pink" | "purple" | "neutral"; icon: ReactNode }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 px-4 py-3">
      <span className={clsx("icon-tile icon-tile-sm", `tone-${tone}`)} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-body">{label}</p>
        <p className="text-[22px] font-extrabold leading-tight text-ink tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11.5px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}
