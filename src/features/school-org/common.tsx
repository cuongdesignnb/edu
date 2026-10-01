"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { RepoError } from "@/lib/repositories";
import type { AcademicYear, AssignmentStatus } from "@/lib/model/types";
import { fmtDate, type StatusLabel } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/components/ui/guards";
import { QueryState, ErrorState } from "@/components/ui/states";

/** Keep the reviewed draft through a transport read failure; authorization errors still unmount it. */
export function SchoolSourceState<T>({ query, children }: { query: {data?:T;isLoading:boolean;error:RepoError|null;refetch:()=>unknown}; children:(data:T)=>ReactNode }) {
  const retained = query.error?.code === 'READ_ERROR' && query.data !== undefined;
  return <>{retained && <div className="page"><CalloutRead error={query.error!} retry={query.refetch} /></div>}<QueryState query={retained ? {...query,error:null} : query} skeleton="detail">{children}</QueryState></>;
}
function CalloutRead({error,retry}:{error:RepoError;retry:()=>unknown}) { return <div className="card"><ErrorState error={error} onRetry={() => retry()} compact /></div>; }

export const yearStatus: Record<AcademicYear["status"], StatusLabel> = {
  draft: { label: "Nháp", tone: "neutral" },
  active: { label: "Đang hoạt động", tone: "success" },
  archived: { label: "Lưu trữ — chỉ xem", tone: "neutral" },
};

export const assignmentStatusLabel = (a: { status: AssignmentStatus; validFrom: string; validTo?: string | null; live?: boolean }, today: string): StatusLabel => {
  if (a.status === "revoked") return { label: "Đã thu hồi", tone: "danger" };
  if (a.status === "ended" || (a.validTo && a.validTo < today)) return { label: "Đã kết thúc", tone: "neutral" };
  if (a.validFrom > today) return { label: "Chưa bắt đầu", tone: "info" };
  if (a.live === false) return { label: "Tạm dừng (thành viên bị khóa)", tone: "warning" };
  return { label: "Đang hiệu lực", tone: "success" };
};

export function fmtRange(from?: string | null, to?: string | null) {
  return `${fmtDate(from)} – ${to ? fmtDate(to) : "không thời hạn"}`;
}

/** Map a repository error into field errors (VALIDATION) or a form-level message. */
export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onError = useCallback((e: RepoError) => {
    if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { _form: e.message });
    else if (e.code === "LOCKED" || e.code === "FORBIDDEN") setErrors({ _form: e.message });
  }, []);
  const clear = useCallback((k?: string) => setErrors((s) => { if (!k) return {}; const n = { ...s }; delete n[k]; return n; }), []);
  return { errors, setErrors, onError, clear };
}

/**
 * Dirty-aware close for drawers/modals: registers the unsaved-changes guard and,
 * when the user closes with changes, asks before discarding (never window.confirm).
 */
export function useDirtyClose(dirty: boolean, close: () => void, save?: () => Promise<boolean>) {
  useUnsavedChanges(dirty, save);
  const [asking, setAsking] = useState(false);
  const beforeClose = useCallback(() => { if (!dirty) return true; setAsking(true); return false; }, [dirty]);
  const node = (
    <ConfirmDialog open={asking} onOpenChange={setAsking} title="Bỏ thay đổi chưa lưu?" variant="danger-soft" confirmLabel="Bỏ thay đổi"
      consequence="Nội dung bạn vừa nhập trong biểu mẫu sẽ không được lưu. Dữ liệu hiện có không thay đổi."
      onConfirm={() => { setAsking(false); close(); }} />
  );
  return { beforeClose, confirmNode: node, requestClose: () => { if (beforeClose()) close(); } };
}

/** Desktop breakpoint detector (xl = 1280px) for panel ↔ drawer switching. */
export function useIsWide(query = "(min-width: 1280px)") {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[#f6c9cb] bg-danger-bg px-4 py-2.5 text-[13.5px] text-danger-text">{message}</p>;
}

export function SectionTitle({ children, className, action }: { children: ReactNode; className?: string; action?: ReactNode }) {
  return <div className={clsx("flex items-center justify-between gap-2", className)}><h3 className="text-[15px] font-bold text-ink">{children}</h3>{action}</div>;
}

/** Numbered step bar reflecting REAL completeness (not wizard position). */
export function CompletenessSteps({ steps }: { steps: { label: string; done: boolean | null; detail?: string; href?: string }[] }) {
  const current = steps.findIndex((s) => s.done === false);
  return (
    <ol className="relative flex w-full max-w-full items-stretch gap-2 overflow-x-auto pb-1" aria-label="Tiến độ thiết lập năm học">
      {steps.map((s, i) => {
        const active = i === current;
        const inner = (
          <span className="flex items-center gap-2.5">
            <span className={clsx("flex size-10 flex-none items-center justify-center rounded-full text-[15px] font-bold", s.done ? "bg-success-bg text-success-text" : active ? "bg-primary text-white" : "bg-[#eef3f9] text-muted")}>
              {s.done ? <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M5 12l5 5 9-10" /></svg> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={clsx("block whitespace-nowrap text-[15px] font-semibold", active ? "text-primary-strong" : s.done ? "text-ink" : "text-muted")}>{s.label}</span>
              {s.detail && <span className="block whitespace-nowrap text-[12px] text-muted">{s.detail}</span>}
            </span>
          </span>
        );
        return (
          <li key={s.label} className="flex min-w-fit flex-1 items-center gap-3" aria-current={active ? "step" : undefined}>
            {s.href ? <Link href={s.href} className="rounded-lg px-1 py-1 hover:bg-primary-light">{inner}</Link> : <span className="px-1 py-1">{inner}</span>}
            {i < steps.length - 1 && <span className="hidden h-px min-w-6 flex-1 bg-line-strong md:block" aria-hidden />}
            <span className="sr-only">{s.done === null ? "Không có quyền xem tình trạng" : s.done ? "Đã hoàn thành" : "Chưa hoàn thành"}</span>
          </li>
        );
      })}
    </ol>
  );
}
