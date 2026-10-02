"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { Bell, ChevronDown, Menu, Search, User, ShieldCheck, School, BookOpenText, LogOut, GraduationCap, Users, Building2 } from "lucide-react";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { searchRepo, sessionRepo, type SearchHit } from "@/lib/repositories";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/dialog";
import { Brand } from "./brand";

/** C008 — scoped search dialog (Ctrl/⌘ + K). Parents have no system-wide search. */
export function GlobalSearch({ schoolId, placeholder }: { schoolId?: string; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const router = useRouter();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const res = useRepo(["search", schoolId, debounced], (ctx) => searchRepo.search(ctx, debounced, schoolId), { enabled: open && debounced.trim().length >= 2 });
  const icon = (k: SearchHit["kind"]) => k === "student" ? <GraduationCap className="size-4" /> : k === "teacher" ? <Users className="size-4" /> : k === "school" ? <Building2 className="size-4" /> : <School className="size-4" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-full max-w-[480px] items-center gap-3 rounded-xl border border-line bg-[#f7fbff] px-4 text-left text-sm text-muted hover:border-line-strong" aria-label="Mở tìm kiếm">
        <Search className="size-[18px] flex-none text-muted" aria-hidden />
        <span className="truncate">{placeholder}</span>
        <span className="kbd ml-auto hidden md:inline">Ctrl K</span>
      </button>
      <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }} title="Tìm kiếm" description="Chỉ tìm trong phạm vi bạn được phân công." size="md">
        <div className="input-icon">
          <Search className="size-4" aria-hidden />
          <input autoFocus className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Nội dung tìm kiếm" />
        </div>
        <div className="mt-3 min-h-[120px]" aria-live="polite">
          {q.trim().length < 2 && <p className="py-6 text-center text-sm text-muted">Nhập ít nhất 2 ký tự.</p>}
          {q.trim().length >= 2 && res.isLoading && <p className="py-6 text-center text-sm text-muted">Đang tìm…</p>}
          {q.trim().length >= 2 && debounced === q && res.error && <p role="alert" className="py-6 text-center text-sm text-danger-text">{res.error.message}</p>}
          {q.trim().length >= 2 && res.data && res.data.length === 0 && debounced === q && <p className="py-6 text-center text-sm text-muted">Không có kết quả trong phạm vi của bạn.</p>}
          <ul className="space-y-1">
            {(q.trim().length >= 2 && debounced === q ? res.data : undefined)?.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-primary-light" onClick={() => { setOpen(false); router.push(h.href); }}>
                  <span className="icon-tile icon-tile-sm tone-blue !size-8">{icon(h.kind)}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{h.title}</span><span className="block truncate text-[12px] text-muted">{h.sub}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}

/** C009 — user menu: profile / workspace / sign out of the DEMO. No fake role switcher. */
export function UserMenu({ roleLabel }: { roleLabel: string }) {
  const { signOut, actor } = useSession();
  const logout=useCommand(()=>signOut(),{changesAuthentication:true,onSuccess:()=>router.push("/login")});
  const router = useRouter();
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx), { enabled: actor.kind !== "anonymous" });
  const name = me.data?.user.fullName ?? "…";
  const display = me.data?.user.honorific ? `${me.data.user.honorific} ${name}` : name;
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>
        <button type="button" className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-[#f2f7fe]" aria-label={`Tài khoản: ${display}`}>
          <Avatar name={name} tone={me.data?.user.avatarTone} size={42} />
          <span className="hidden min-w-0 text-left md:block">
            <span className="block max-w-[190px] truncate text-[15px] font-bold text-ink">{display}</span>
            <span className="block max-w-[190px] truncate text-[12.5px] text-muted">{roleLabel}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted md:block" aria-hidden />
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={8} className="z-[70] w-64 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
          <div className="px-3 py-2"><p className="text-sm font-semibold text-ink">{display}</p><p className="truncate text-[12px] text-muted">{me.data?.user.email}</p></div>
          <M.Separator className="my-1 h-px bg-line" />
          {[
            { href: "/account/profile", label: "Hồ sơ cá nhân", icon: <User className="size-4" /> },
            { href: "/account/security", label: "Bảo mật và phiên", icon: <ShieldCheck className="size-4" /> },
            { href: "/choose-school", label: "Chọn không gian làm việc", icon: <School className="size-4" /> },
            { href: "/help", label: "Hướng dẫn sử dụng", icon: <BookOpenText className="size-4" /> },
          ].map((i) => (
            <M.Item key={i.href} asChild><Link href={i.href} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink outline-none data-[highlighted]:bg-primary-light"><span className="text-muted">{i.icon}</span>{i.label}</Link></M.Item>
          ))}
          <M.Separator className="my-1 h-px bg-line" />
          <M.Item onSelect={() => { void logout.run(); }} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger-text outline-none data-[highlighted]:bg-danger-bg"><LogOut className="size-4" />Thoát phiên</M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function NotificationBell({ schoolId }: { schoolId?: string }) {
  const { actor } = useSession();
  const q = useRepo(["notifications", "unread", schoolId], (ctx) => sessionRepo.notifications(ctx, { unreadOnly: true }), { enabled: actor.kind === "staff" });
  const n = q.data?.length ?? 0;
  return (
    <Link href="/notifications" className="relative rounded-xl p-2.5 text-[#46618a] hover:bg-[#f2f7fe]" aria-label={n ? `Thông báo, ${n} chưa đọc` : "Thông báo"}>
      <Bell className="size-[22px]" aria-hidden />
      {n > 0 && <span className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-[18px] text-white">{n}</span>}
    </Link>
  );
}

/** C003 — staff topbar. */
export function Topbar({ onMenu, search, right, homeHref }: { onMenu: () => void; search?: ReactNode; right?: ReactNode; homeHref: string }) {
  return (
    <header className="no-print sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-5">
      <button type="button" onClick={onMenu} className="rounded-lg p-2 text-ink hover:bg-neutral-bg lg:hidden" aria-label="Mở điều hướng"><Menu className="size-6" /></button>
      <div className="lg:hidden"><Brand href={homeHref} compact /></div>
      <div className="hidden min-w-0 flex-1 sm:block">{search}</div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">{right}</div>
    </header>
  );
}
