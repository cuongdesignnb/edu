"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  separatorBefore?: boolean;
}

/** C012 — row / page action menu. Escape closes; destructive items should open a ConfirmDialog. */
export function ActionMenu({ items, label = "Thao tác", trigger, align = "end" }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: "start" | "end" }) {
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>
        {trigger ?? <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={label}><MoreHorizontal className="size-4" /></button>}
      </M.Trigger>
      <M.Portal>
        <M.Content align={align} sideOffset={6} className="z-[70] min-w-[220px] rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)] animate-[var(--animate-pop-in)]">
          {visible.map((it, i) => (
            <div key={`${it.label}-${i}`}>
              {it.separatorBefore && <M.Separator className="my-1 h-px bg-line" />}
              {it.href && !it.disabled ? (
                <M.Item asChild>
                  <Link href={it.href} className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-primary-light", it.danger ? "text-danger-text" : "text-ink")}>
                    {it.icon && <span className="[&>svg]:size-4 text-muted" aria-hidden>{it.icon}</span>}{it.label}
                  </Link>
                </M.Item>
              ) : (
                <M.Item disabled={it.disabled} onSelect={() => it.onSelect?.()}
                  className={clsx("flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-primary-light", it.danger ? "text-danger-text" : "text-ink")}>
                  {it.icon && <span className={clsx("mt-0.5 [&>svg]:size-4", it.danger ? "text-danger-text" : "text-muted")} aria-hidden>{it.icon}</span>}
                  <span><span className="block">{it.label}</span>{it.hint && <span className="block text-[12px] text-muted">{it.hint}</span>}</span>
                </M.Item>
              )}
            </div>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
