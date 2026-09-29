"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { clsx } from "clsx";

export type ToastTone = "success" | "error" | "warning" | "info";
export interface ToastItem { id: number; tone: ToastTone; title: string; detail?: string; action?: { label: string; onClick: () => void } }

const Ctx = createContext<{ push: (t: Omit<ToastItem, "id">) => void }>({ push: () => undefined });

const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const TONE = {
  success: "border-[#bfe8d6] bg-white [&_.ic]:text-success",
  error: "border-[#f6c9cb] bg-white [&_.ic]:text-danger",
  warning: "border-[#f5d9a6] bg-white [&_.ic]:text-warning",
  info: "border-[#cfe3fb] bg-white [&_.ic]:text-primary",
};

/** C041 — toasts only after a successful (mock) transaction; errors never show as success. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    window.setTimeout(() => dismiss(id), t.tone === "error" ? 9000 : 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-3 bottom-3 z-[80] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px]">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={clsx("pointer-events-auto flex w-full gap-3 rounded-xl border p-3.5 shadow-[var(--shadow-pop)] animate-[var(--animate-pop-in)]", TONE[t.tone])}>
              <Icon className="ic mt-0.5 size-5 flex-none" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-[13px] text-body">{t.detail}</p>}
                {t.action && <button type="button" className="mt-2 text-[13px] font-semibold text-primary-strong hover:underline" onClick={t.action.onClick}>{t.action.label}</button>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="flex-none rounded-md p-1 text-muted hover:bg-neutral-bg" aria-label="Đóng thông báo"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
