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
import { fmtRelative } from "@/lib/formatters";
import { demoNowISO } from "@/lib/calendar";

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
  const q = useRepo(["notifications", "center"], (ctx) => sessionRepo.notifications(ctx), { enabled: actor.kind === "staff", schoolId });
  const rows = q.error ? [] : q.data ?? [];
  const n = rows.filter(row => !row.readAt).length;
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>
        <button type="button" className="relative rounded-xl p-2.5 text-[#46618a] hover:bg-[#f2f7fe]" aria-label={n ? `Thông báo, ${n} chưa đọc` : "Thông báo"}>
          <Bell className="size-[22px]" aria-hidden />
          {n > 0 && <span className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-[18px] text-white">{n > 99 ? "99+" : n}</span>}
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content aria-label="Thông báo gần đây" align="end" sideOffset={8} collisionPadding={12}
          className="z-[70] flex max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]">
          <M.Label className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px] font-bold text-ink">
            Thông báo <span className="text-xs font-medium text-muted">{n ? `${n} chưa đọc` : "Gần đây"}</span>
          </M.Label>
          <div className="min-h-0 overflow-y-auto p-1.5">
            {q.isLoading ? <p role="status" className="px-3 py-5 text-center text-sm text-muted">Đang tải thông báo…</p>
              : q.error ? <div className="px-3 py-4"><p role="alert" className="text-sm text-danger-text">Chưa tải được thông báo.</p><M.Item onSelect={event => { event.preventDefault(); void q.refetch(); }} className="mt-2 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-primary-strong outline-none data-[highlighted]:bg-primary-light">Thử lại</M.Item></div>
              : rows.length === 0 ? <p className="px-3 py-5 text-center text-sm text-muted">{actor.kind === "platform" ? "Thông báo của trường dành cho nhân sự nhà trường." : "Chưa có thông báo."}</p>
              : rows.slice(0, 6).map(row => (
                <M.Item key={row.id} asChild>
                  <Link href={`/notifications/${encodeURIComponent(row.id)}`} prefetch={false}
                    className="flex items-start gap-3 rounded-lg px-3 py-3 outline-none data-[highlighted]:bg-primary-light">
                    <span className="icon-tile icon-tile-sm !size-9 flex-none tone-blue" aria-hidden><Bell className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm text-ink ${row.readAt ? "font-medium" : "font-bold"}`}>{row.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-body">{row.body}</span>
                      <span className="mt-1 block text-[11px] text-muted">{row.schoolName} · {fmtRelative(row.createdAt, demoNowISO())}</span>
                    </span>
                    {!row.readAt && <span className="mt-1.5 size-2 flex-none rounded-full bg-primary" aria-label="Chưa đọc" />}
                  </Link>
                </M.Item>
              ))}
          </div>
          <M.Separator className="h-px flex-none bg-line" />
          <M.Item asChild><Link href="/notifications" className="flex flex-none items-center justify-center px-4 py-3 text-sm font-semibold text-primary-strong outline-none data-[highlighted]:bg-primary-light">Xem thêm</Link></M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
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
