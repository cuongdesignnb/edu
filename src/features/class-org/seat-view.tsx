"use client";
import { clsx } from "clsx";
import type { ReactNode } from "react";

export function seatKey(r: number, c: number) { return `r${r}c${c}`; }

/** Short display name: last two words ("Nguyễn Minh Anh" → "Minh Anh"). */
export function shortName(full: string) {
  const p = full.trim().split(/\s+/);
  return p.slice(-2).join(" ");
}

/** Given name only for dense previews ("Nguyễn Minh Anh" → "Anh"); full name stays in aria-label/title. */
export function tinyName(full: string) {
  const p = full.trim().split(/\s+/);
  return p[p.length - 1] ?? full;
}

/** Classroom frame of R06: board at the top, teacher desk, warm floor. Children = seat grid. */
export function ClassroomFrame({ children, compact, className }: { children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={clsx("rounded-2xl border border-[#e3cfa9] bg-[#f3e6cf] p-3", className)}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 justify-center">
          <div className={clsx("w-[85%] rounded-md border-4 border-[#6b4a2b] bg-[#1f6b4a] text-center font-bold tracking-[0.3em] text-white shadow-inner", compact ? "py-1.5 text-[12px]" : "py-2.5 text-sm")} aria-label="Bảng lớp (phía trước)">BẢNG</div>
        </div>
        <div className={clsx("flex-none rounded-md bg-[#b88a5a] text-white shadow", compact ? "px-2 py-1 text-[10.5px]" : "px-3 py-1.5 text-[12px]")}>Bàn giáo viên</div>
      </div>
      {children}
    </div>
  );
}

/** Read-only seat map (CL02 preview / read-only CL14). */
export function SeatMapView({ rows, cols, seats, names, compact, maxRows }: { rows: number; cols: number; seats: { seat: string; studentId: string | null }[]; names: Map<string, string>; compact?: boolean; maxRows?: number }) {
  const bySeat = new Map(seats.map((s) => [s.seat, s.studentId]));
  const shown = Math.min(rows, maxRows ?? rows);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="list" aria-label={`Sơ đồ ${rows} hàng × ${cols} ghế`}>
      {Array.from({ length: shown }, (_, r) => Array.from({ length: cols }, (_, c) => {
        const sid = bySeat.get(seatKey(r + 1, c + 1));
        const name = sid ? names.get(sid) : undefined;
        return (
          <div key={`${r}-${c}`} role="listitem" aria-label={`Hàng ${r + 1}, ghế ${c + 1}: ${name ?? "trống"}`}
            className={clsx("flex min-w-0 items-center justify-center rounded-md border text-center shadow-sm", compact ? "h-7 px-0.5 text-[11px]" : "h-9 px-1.5 text-[12px]", name ? "border-[#e6dccb] bg-white text-ink" : "border-dashed border-[#d6c3a0] bg-transparent text-[#9b8566]")}>
            <span className="truncate" title={name}>{name ? (compact ? tinyName(name) : shortName(name)) : compact ? "–" : "Trống"}</span>
          </div>
        );
      }))}
    </div>
  );
}
