"use client";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * C024 — sticky action bar for dirty forms, bulk selection or lock/publish steps.
 * Leaves room for the mobile keyboard / bottom bars (safe-area) and never covers content:
 * pair it with a bottom spacer (the bar reserves its own height via `sticky`).
 */
export function StickyActionBar({ children, status, className, tone = "default" }: { children: ReactNode; status?: ReactNode; className?: string; tone?: "default" | "warning" }) {
  return (
    <div role="region" aria-label="Thanh thao tác" className={clsx(
      "no-print sticky bottom-0 z-30 -mx-[var(--page-pad)] mt-2 flex flex-wrap items-center gap-3 border-t px-[var(--page-pad)] py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur",
      tone === "warning" ? "border-[#f5d9a6] bg-warning-bg/95" : "border-line bg-white/95", className)}>
      {status && <div className="min-w-0 flex-1 text-[13.5px] text-body" aria-live="polite">{status}</div>}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
