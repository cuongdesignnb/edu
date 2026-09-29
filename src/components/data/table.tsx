"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X, SlidersHorizontal } from "lucide-react";
import type { ListQuery } from "@/lib/repositories";
import { Button } from "@/components/ui/button";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** hide below md; the row still stays readable via the first columns */
  hideBelow?: "sm" | "md" | "lg";
}

/** List state for server-like paging: filter/search changes always reset to page 1 (C023). */
export function useListQuery(initial: Partial<ListQuery> = {}) {
  const [state, setState] = useState<ListQuery>({ q: "", page: 1, pageSize: 10, filters: {}, ...initial });
  const setQ = useCallback((q: string) => setState((s) => ({ ...s, q, page: 1 })), []);
  const setFilter = useCallback((k: string, v: string | undefined) => setState((s) => ({ ...s, page: 1, filters: { ...s.filters, [k]: v || undefined } })), []);
  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page })), []);
  const setPageSize = useCallback((pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })), []);
  const setSort = useCallback((sort: string) => setState((s) => ({ ...s, sort, dir: s.sort === sort && s.dir === "asc" ? "desc" : "asc", page: 1 })), []);
  const reset = useCallback(() => setState((s) => ({ ...s, q: "", page: 1, filters: {} })), []);
  const active = !!state.q || Object.values(state.filters ?? {}).some(Boolean);
  return { query: state, setQ, setFilter, setPage, setPageSize, setSort, reset, active };
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

/** C025 — real sort/filter/paging from the repository; sticky header; selectable rows; row actions. */
export function DataTable<T>({ rows, columns, rowKey, sort, dir, onSort, selectable, selected, onSelectedChange, caption, onRowClick, rowSelectedKey, empty, dense, minWidth = 720 }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; sort?: string; dir?: "asc" | "desc"; onSort?: (key: string) => void;
  selectable?: boolean; selected?: Set<string>; onSelectedChange?: (s: Set<string>) => void; caption?: string; onRowClick?: (r: T) => void; rowSelectedKey?: string; empty?: ReactNode; dense?: boolean; minWidth?: number;
}) {
  const pageIds = rows.map(rowKey);
  const allOnPage = selectable && pageIds.length > 0 && pageIds.every((id) => selected?.has(id));
  const someOnPage = selectable && pageIds.some((id) => selected?.has(id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPage) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id));
    onSelectedChange?.(next);
  };
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption ?? "Bảng dữ liệu"}>
      <table className={clsx("table", dense && "[&_td]:py-2")} style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {selectable && (
              <th className="w-10">
                <input type="checkbox" aria-label="Chọn tất cả dòng trên trang này" className="size-4 accent-[var(--color-primary)]" checked={!!allOnPage}
                  ref={(el) => { if (el) el.indeterminate = !allOnPage && !!someOnPage; }} onChange={toggleAll} />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={clsx(c.align === "right" && "num", c.align === "center" && "center", c.hideBelow && HIDE[c.hideBelow], c.headerClassName)}
                aria-sort={sort === c.key ? (dir === "desc" ? "descending" : "ascending") : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" className="sort-btn" onClick={() => onSort(c.key)}>
                    {c.header}
                    {sort === c.key ? dir === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 text-faint" aria-hidden />}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="!p-0">{empty}</td></tr>}
          {rows.map((r) => {
            const id = rowKey(r);
            return (
              <tr key={id} aria-selected={selected?.has(id) || rowSelectedKey === id || undefined} className={clsx(onRowClick && "cursor-pointer")} onClick={onRowClick ? (e) => { if ((e.target as HTMLElement).closest("button,a,input,select,label")) return; onRowClick(r); } : undefined}>
                {selectable && (
                  <td><input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label="Chọn dòng" checked={!!selected?.has(id)} onChange={() => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onSelectedChange?.(n); }} /></td>
                )}
                {columns.map((c) => <td key={c.key} className={clsx(c.align === "right" && "num", c.align === "center" && "center", c.hideBelow && HIDE[c.hideBelow], c.className)}>{c.cell(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** C026 — pagination from the filtered total. */
export function Pagination({ page, pageCount, total, pageSize, onPage, onPageSize, what = "mục" }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; what?: string }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) out.push(p);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [page, pageCount]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <p className="text-muted" aria-live="polite">Hiển thị {from}–{to} của {total} {what}</p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select aria-label="Số dòng mỗi trang" className="select !min-h-8 !w-auto !py-0 text-[13px]" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / trang</option>)}
          </select>
        )}
        <nav className="flex items-center gap-1" aria-label="Phân trang">
          <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước"><ChevronLeft className="size-4" /></button>
          {pages.map((p, i) => p === "…" ? <span key={`d${i}`} className="px-1 text-muted">…</span> : (
            <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined}
              className={clsx("btn btn-sm min-w-8 !px-2", p === page ? "btn-primary" : "btn-secondary")}>{p}</button>
          ))}
          <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Trang sau"><ChevronRight className="size-4" /></button>
        </nav>
      </div>
    </div>
  );
}

/** C027 — explicit "selected on this page" vs "all N filtered results". */
export function BulkSelectionBar({ selected, pageIds, allIds, onChange, children, what = "mục" }: { selected: Set<string>; pageIds: string[]; allIds: string[]; onChange: (s: Set<string>) => void; children?: ReactNode; what?: string }) {
  if (!selected.size) return null;
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const pageAll = pageIds.every((id) => selected.has(id));
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-primary-light px-4 py-2.5 text-sm" role="status">
      <span className="font-semibold text-primary-strong">Đã chọn {selected.size} {what}{allSelected ? " (tất cả kết quả lọc)" : ""}</span>
      {pageAll && !allSelected && allIds.length > pageIds.length && (
        <button type="button" className="font-semibold text-primary-strong underline" onClick={() => onChange(new Set(allIds))}>Chọn tất cả {allIds.length} kết quả lọc</button>
      )}
      <button type="button" className="text-muted hover:text-ink" onClick={() => onChange(new Set())}>Bỏ chọn</button>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** C023 — search + filters + reset; mobile collapses advanced filters. */
export function FilterBar({ q, onQ, placeholder = "Tìm kiếm…", children, onReset, active, advanced }: { q: string; onQ: (v: string) => void; placeholder?: string; children?: ReactNode; onReset?: () => void; active?: boolean; advanced?: ReactNode }) {
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="input-icon min-w-[200px] flex-[2_1_240px]">
          <Search className="size-4" aria-hidden />
          <input className="input" type="search" placeholder={placeholder} aria-label={placeholder} value={q} onChange={(e) => onQ(e.target.value)} />
        </div>
        <div className="contents [&>*]:min-w-[176px] [&>*]:flex-[1_1_176px]">{children}</div>
        {advanced && <Button variant="secondary" size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setMore((m) => !m)} aria-expanded={more}>Lọc nâng cao</Button>}
        {onReset && active && <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={onReset}>Xóa lọc</Button>}
      </div>
      {advanced && more && <div className="flex flex-wrap gap-2 [&>*]:min-w-[160px] [&>*]:flex-[1_1_180px]">{advanced}</div>}
    </div>
  );
}

/** Client-side list helper for small, already-scoped arrays (roster, etc.). */
export function useClientList<T>(rows: T[], opts: { search: (r: T) => string; pageSize?: number }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = opts.pageSize ?? 10;
  const { search } = opts;
  const filtered = useMemo(() => {
    const f = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
    return q ? rows.filter((r) => f(search(r)).includes(f(q))) : rows;
  }, [rows, q, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  return { q, setQ: (v: string) => { setQ(v); setPage(1); }, page: cur, setPage, pageCount, total: filtered.length, pageSize, items: filtered.slice((cur - 1) * pageSize, cur * pageSize), filtered };
}
