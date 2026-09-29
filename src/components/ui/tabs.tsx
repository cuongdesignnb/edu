"use client";
import * as T from "@radix-ui/react-tabs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/** In-page tabs synced with ?tab= (deep-linkable). */
export function Tabs({ tabs, value, onChange, children, param = "tab", className, variant = "pill" }: { tabs: { value: string; label: ReactNode; icon?: ReactNode; count?: number }[]; value?: string; onChange?: (v: string) => void; children: ReactNode; param?: string; className?: string; variant?: "pill" | "underline" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = value ?? sp.get(param) ?? tabs[0]?.value;
  const set = (v: string) => {
    if (onChange) onChange(v);
    else {
      const next = new URLSearchParams(sp.toString());
      next.set(param, v);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  };
  return (
    <T.Root value={current} onValueChange={set} className={className}>
      <T.List className={clsx("tabbar", variant === "underline" && "border-b border-line")} aria-label="Các mục">
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value} className={clsx("tab", variant === "underline" && "tab-underline")}>
            {t.icon && <span className="[&>svg]:size-[18px]" aria-hidden>{t.icon}</span>}
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-bold">{t.count}</span>}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}

export const TabPanel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <T.Content value={value} className={clsx("mt-4 outline-none", className)}>{children}</T.Content>
);

/** C007 — route-based section tabs (real links, active from pathname). */
export function LinkTabs({ items, className, exactFirst = true }: { items: { href: string; label: ReactNode; icon?: ReactNode }[]; className?: string; exactFirst?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={clsx("tabbar", className)} aria-label="Điều hướng mục">
      {items.map((it, i) => {
        const active = i === 0 && exactFirst ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link key={it.href} href={it.href} className="tab" aria-current={active ? "page" : undefined}>
            {it.icon && <span className="[&>svg]:size-[18px]" aria-hidden>{it.icon}</span>}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
