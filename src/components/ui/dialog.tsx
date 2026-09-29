"use client";
import * as D from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { X, AlertTriangle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";
import { TextArea } from "./form";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** When busy, Escape/outside click are blocked so an in-flight save is not abandoned. */
  busy?: boolean;
  /** Called instead of closing when there are unsaved changes (returns true to allow close). */
  beforeClose?: () => boolean;
}

function guard(props: BaseProps) {
  return (o: boolean) => {
    if (!o && props.busy) return;
    if (!o && props.beforeClose && !props.beforeClose()) return;
    props.onOpenChange(o);
  };
}

/** C037 — modal with focus trap; Escape closes unless busy; focus returns to the opener. */
export function Modal(props: BaseProps & { size?: "sm" | "md" | "lg" | "xl" }) {
  const { open, title, description, children, footer, size = "md" } = props;
  return (
    <D.Root open={open} onOpenChange={guard(props)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-[#0b1b3a]/40 animate-[var(--animate-fade-in)]" />
        <D.Content className={clsx("fixed inset-x-3 top-1/2 z-[61] mx-auto flex max-h-[calc(100dvh-24px)] -translate-y-1/2 flex-col rounded-2xl border border-line bg-white shadow-[var(--shadow-pop)] animate-[var(--animate-pop-in)] focus:outline-none",
          size === "sm" && "max-w-[440px]", size === "md" && "max-w-[560px]", size === "lg" && "max-w-[760px]", size === "xl" && "max-w-[1040px]")}
          aria-describedby={description ? undefined : undefined}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-lg font-bold text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-[13.5px] text-muted">{description}</D.Description> : <D.Description className="sr-only">Hộp thoại</D.Description>}
            </div>
            <D.Close asChild><button type="button" className="rounded-lg p-1.5 text-muted hover:bg-neutral-bg disabled:opacity-40" aria-label="Đóng" disabled={props.busy}><X className="size-5" /></button></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** C038 — side drawer; becomes full-screen on phones. */
export function Drawer(props: BaseProps & { width?: number; side?: "right" | "bottom" }) {
  const { open, title, description, children, footer, width = 440, side = "right" } = props;
  return (
    <D.Root open={open} onOpenChange={guard(props)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-[#0b1b3a]/30 animate-[var(--animate-fade-in)]" />
        <D.Content style={{ ["--dw" as string]: `${width}px` }}
          className={clsx("fixed z-[61] flex flex-col bg-white shadow-[var(--shadow-pop)] focus:outline-none",
            side === "right" ? "inset-0 sm:inset-y-3 sm:left-auto sm:right-3 sm:w-[min(var(--dw),calc(100vw-24px))] sm:rounded-2xl sm:border sm:border-line animate-[var(--animate-slide-in)]"
              : "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-line animate-[var(--animate-pop-in)]")}>
          {side === "bottom" && <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line-strong" aria-hidden />}
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-lg font-bold text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-[13.5px] text-muted">{description}</D.Description> : <D.Description className="sr-only">Bảng chi tiết</D.Description>}
            </div>
            <D.Close asChild><button type="button" className="rounded-lg p-1.5 text-muted hover:bg-neutral-bg disabled:opacity-40" aria-label="Đóng" disabled={props.busy}><X className="size-5" /></button></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** C039 — bottom sheet for phones (status pickers, filters, class menu). */
export function BottomSheet(props: BaseProps) {
  return <Drawer {...props} side="bottom" />;
}

/**
 * C040 / ST27 — confirmation naming the exact object and consequence. Optional
 * mandatory reason. Cancel never changes data. onConfirm may reject → stays open.
 */
export function ConfirmDialog({ open, onOpenChange, title, object, consequence, confirmLabel, variant = "primary", reasonLabel, reasonRequired, onConfirm, busy, children, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; object?: ReactNode; consequence: ReactNode; confirmLabel: string; variant?: ButtonVariant;
  reasonLabel?: string; reasonRequired?: boolean; onConfirm: (reason: string) => void | Promise<unknown>; busy?: boolean; children?: ReactNode; error?: string;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const tooShort = reasonRequired && reason.trim().length < 3;
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) { setReason(""); setTouched(false); } onOpenChange(o); }} title={title} size="sm" busy={busy}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Hủy</Button>
        <Button variant={variant} loading={busy} onClick={async () => { setTouched(true); if (tooShort) return; await onConfirm(reason.trim()); }}>{confirmLabel}</Button>
      </>}>
      <div className="space-y-3 text-sm">
        {object && <div className="rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 font-semibold text-ink">{object}</div>}
        <div className="flex gap-2.5 text-body"><AlertTriangle className={clsx("mt-0.5 size-4 flex-none", variant === "danger" ? "text-danger" : "text-warning")} aria-hidden /><div>{consequence}</div></div>
        {children}
        {reasonLabel && <TextArea label={reasonLabel} required={reasonRequired} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} error={touched && tooShort ? "Vui lòng ghi lý do (tối thiểu 3 ký tự)" : undefined} />}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
