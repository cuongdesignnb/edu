"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import * as D from "@radix-ui/react-dialog";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, BookOpenText, X } from "lucide-react";
import type { ActionKey } from "@/lib/model/types";
import { isGroup, type NavEntry, type NavLink } from "./nav";
import { NavIcon } from "./icons";
import { Brand } from "./brand";

function visible(link: NavLink, actions?: Set<ActionKey>) {
  return !link.need || !actions || link.need.some((a) => actions.has(a));
}

/** Filter entries by permission (a group disappears if none of its children remain). */
export function filterNav(entries: NavEntry[], actions?: Set<ActionKey>): NavEntry[] {
  return entries.flatMap((e): NavEntry[] => {
    if (!isGroup(e)) return visible(e, actions) ? [e] : [];
    const children = e.children.filter((c) => visible(c, actions));
    return children.length ? [{ ...e, children,tour:e.tour==='school-publication'&&!children.some(c=>c.need?.includes('publication.oversee'))?undefined:e.tour }] : [];
  });
}

function activeHref(entries: NavEntry[], pathname: string) {
  const links = entries.flatMap((e) => (isGroup(e) ? [...e.children, ...(e.href ? [{ href: e.href, exact: true } as NavLink] : [])] : [e]));
  const match = links.filter((l) => (l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  return match?.href;
}

function NavList({ entries, collapsed, onNavigate }: { entries: NavEntry[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeHref(entries, pathname);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groupActive = (e: NavEntry) => isGroup(e) && e.children.some((c) => c.href === active);
  return (
    <ul className="space-y-1">
      {entries.map((e) => {
        if (!isGroup(e)) {
          const on = e.href === active;
          return (
            <li key={e.href}>
              <Link data-tour={e.tour} href={e.href} onClick={onNavigate} aria-current={on ? "page" : undefined} title={collapsed ? e.label : undefined}
                className={clsx("flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors", on ? "bg-[#dcebff] font-semibold text-primary-strong" : "text-body hover:bg-white/70", collapsed && "justify-center px-0")}>
                <NavIcon name={e.icon} className={clsx("size-[20px] flex-none", on ? "text-primary" : "text-[#46618a]")} />
                {!collapsed && <span className="truncate">{e.label}</span>}
                {!collapsed && e.badge ? <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{e.badge}</span> : null}
              </Link>
            </li>
          );
        }
        const isOpen = open[e.label] ?? groupActive(e);
        if (collapsed) {
          const first = e.href ?? e.children[0]?.href;
          const on = groupActive(e);
          return (
            <li key={e.label}>
              <Link data-tour={e.tour} href={first} title={e.label} onClick={onNavigate} className={clsx("flex min-h-11 items-center justify-center rounded-xl", on ? "bg-[#dcebff] text-primary" : "text-[#46618a] hover:bg-white/70")}>
                <NavIcon name={e.icon} className="size-[20px]" /><span className="sr-only">{e.label}</span>
              </Link>
            </li>
          );
        }
        return (
          <li key={e.label}>
            <button data-tour={e.tour} type="button" onClick={() => setOpen((o) => ({ ...o, [e.label]: !isOpen }))} aria-expanded={isOpen}
              className={clsx("flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-medium transition-colors hover:bg-white/70", groupActive(e) ? "text-primary-strong" : "text-body")}>
              <NavIcon name={e.icon} className={clsx("size-[20px] flex-none", groupActive(e) ? "text-primary" : "text-[#46618a]")} />
              <span className="flex-1 truncate">{e.label}</span>
              <ChevronDown className={clsx("size-4 flex-none transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <ul className="ml-[26px] mt-1 space-y-0.5 border-l border-[#cfe0f5] pl-3">
                {e.children.map((c) => {
                  const on = c.href === active;
                  return (
                    <li key={c.href}>
                      <Link href={c.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                        className={clsx("flex min-h-9 items-center rounded-lg px-3 text-[14px]", on ? "bg-[#dcebff] font-semibold text-primary-strong" : "text-body hover:bg-white/70")}>
                        <span className="truncate">{c.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface SidebarProps {
  entries: NavEntry[];
  actions?: Set<ActionKey>;
  promo?: { image: string; title: string; text: string; href?: string } | null;
  footer?: ReactNode;
  mobileOpen: boolean;
  onMobileClose: () => void;
  homeHref: string;
  tourNavigation?:boolean;
}

/** C002 — expanded / collapsed (76px, remembered) / mobile drawer. Only in-scope menu items. */
export function Sidebar({ entries, actions, promo, footer, mobileOpen, onMobileClose, homeHref,tourNavigation=false }: SidebarProps) {
  const list = useMemo(() => filterNav(entries, actions), [entries, actions]);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("edu-sidebar-collapsed") === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("edu-sidebar-collapsed", c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  const pathname = usePathname();
  useEffect(() => { onMobileClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const promoCard = promo && (
    <div className="mt-6 overflow-hidden rounded-2xl border border-[#d6e6fa] bg-gradient-to-b from-[#e3f0ff] to-white">
      <img src={promo.image} alt="" className="h-[108px] w-full object-cover object-top [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" />
      <div className="px-4 pb-4">
        <p className="text-[17px] font-bold leading-snug text-ink">{promo.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-body">{promo.text}</p>
        <Link href={promo.href ?? "/help"} className="btn btn-primary mt-3 w-full"><BookOpenText className="size-4" aria-hidden />Xem hướng dẫn</Link>
      </div>
    </div>
  );

  return (
    <>
      <aside className={clsx("no-print sticky top-0 hidden h-dvh flex-none flex-col border-r border-[#e1edfb] bg-sidebar lg:flex", collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]")} aria-label="Điều hướng chính">
        <div className={clsx("flex h-[var(--topbar-h)] flex-none items-center border-b border-[#e1edfb]", collapsed ? "justify-center px-2" : "px-5")}>
          <Brand href={homeHref} compact={collapsed} />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavList entries={list} collapsed={collapsed} />
          {!collapsed && promoCard}
          {!collapsed && footer}
        </nav>
        <button type="button" onClick={toggle} className="flex h-11 flex-none items-center justify-center gap-2 border-t border-[#e1edfb] text-[13px] text-muted hover:bg-white/60" aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Thu gọn</>}
        </button>
      </aside>
      <D.Root modal={!tourNavigation} open={mobileOpen} onOpenChange={(o) => { if (!o&&!tourNavigation) onMobileClose(); }}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[55] bg-[#0b1b3a]/40 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-[56] flex w-[min(88vw,320px)] flex-col bg-sidebar shadow-[var(--shadow-pop)] animate-[var(--animate-fade-in)] lg:hidden" aria-describedby={undefined}>
            <div className="flex h-[var(--topbar-h)] items-center justify-between border-b border-[#e1edfb] px-4">
              <D.Title className="sr-only">Điều hướng</D.Title>
              <Brand href={homeHref} />
              <D.Close asChild><button type="button" className="rounded-lg p-2 text-muted hover:bg-white" aria-label="Đóng điều hướng"><X className="size-5" /></button></D.Close>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng chính">
              <NavList entries={list} collapsed={false} onNavigate={onMobileClose} />
              {footer}
            </nav>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
