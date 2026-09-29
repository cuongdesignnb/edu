"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { BarChart3, Table2 } from "lucide-react";

export interface Series { label: string; value: number; color: string }

/**
 * C034 — charts with a table alternative and explicit denominator. Values come from
 * the report data; nothing is randomised per render.
 */
export function ChartCard({ title, series, kind = "bar", unit, denominatorLabel, className }: { title: string; series: Series[]; kind?: "bar" | "stack"; unit?: string; denominatorLabel: string; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  const total = series.reduce((a, s) => a + s.value, 0);
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <figure className={clsx("rounded-xl border border-line bg-white p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}{asTable ? "Xem biểu đồ" : "Xem dạng bảng"}
        </button>
      </div>
      {total === 0 && kind === "stack" ? <p className="py-6 text-center text-sm text-muted">Chưa có dữ liệu trong phạm vi đã chọn.</p> : asTable ? (
        <table className="table"><thead><tr><th>Nhóm</th><th className="num">Giá trị</th>{kind === "stack" && <th className="num">Tỷ lệ</th>}</tr></thead>
          <tbody>{series.map((s) => <tr key={s.label}><td>{s.label}</td><td className="num">{s.value}{unit ?? ""}</td>{kind === "stack" && <td className="num">{total ? Math.round((s.value / total) * 1000) / 10 : 0}%</td>}</tr>)}</tbody></table>
      ) : kind === "stack" ? (
        <div>
          <div className="flex h-5 w-full overflow-hidden rounded-full bg-[#eef3f9]" role="img" aria-label={`${title}: ${series.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
            {series.map((s) => s.value > 0 && <span key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3">
            {series.map((s) => <li key={s.label} className="flex items-center gap-2"><span className="size-2.5 flex-none rounded-full" style={{ background: s.color }} aria-hidden /><span className="text-body">{s.label}</span><span className="ml-auto font-semibold tabular-nums text-ink">{s.value}</span></li>)}
          </ul>
        </div>
      ) : (
        <ul className="space-y-2.5" role="img" aria-label={`${title}: ${series.map((s) => `${s.label} ${s.value}${unit ?? ""}`).join(", ")}`}>
          {series.map((s) => (
            <li key={s.label} className="grid grid-cols-[minmax(70px,120px)_1fr_48px] items-center gap-3 text-[13px]">
              <span className="truncate text-body">{s.label}</span>
              <span className="h-3 rounded-full bg-[#eef3f9]"><span className="block h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: s.color }} /></span>
              <span className="text-right font-semibold tabular-nums text-ink">{s.value}{unit ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-muted">Mẫu số: {denominatorLabel}</p>
    </figure>
  );
}
