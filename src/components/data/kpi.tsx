import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { IconTile, type PastelTone } from "@/components/ui/card";

/**
 * C028 — KPI from fixture data. A delta is only shown when a comparison base exists
 * (e.g. previous school year); "—" is shown instead of a fake zero when there is no data.
 */
export function KpiCard({ label, value, icon, tone = "blue", hint, delta, deltaLabel, className, children }: {
  label: ReactNode; value: ReactNode; icon: ReactNode; tone?: PastelTone; hint?: ReactNode; delta?: number | null; deltaLabel?: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={clsx("card card-pad flex min-w-0 items-center gap-4", className)}>
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug text-body">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[28px] font-extrabold leading-tight tracking-tight text-ink tabular-nums">{value ?? "—"}</span>
          {delta !== undefined && delta !== null && (
            <span className={clsx("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold", delta >= 0 ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text")}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {delta >= 0 ? "+" : "−"}{Math.abs(delta)}
            </span>
          )}
        </div>
        {(hint || deltaLabel) && <p className="mt-0.5 text-[12px] leading-snug text-muted">{deltaLabel ?? hint}</p>}
        {children}
      </div>
    </div>
  );
}
