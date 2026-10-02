"use client";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import * as D from "@radix-ui/react-dialog";
import { Lock, ShieldCheck, Heart, Leaf, MoreHorizontal, X, Eye } from "lucide-react";
import type { ParentModule } from "@/lib/model/types";
import { parentRepo, isRepoError, type ParentKey, type RepoError } from "@/lib/repositories";
import { useQuery } from "@tanstack/react-query";
import { readParentView,readParentFault,parentSessionRevision,onParentSessionChanged } from "@/lib/api/parent-session";
import { PARENT_NAV } from "@/components/layout/nav";
import { NavIcon } from "@/components/layout/icons";
import { Brand } from "@/components/layout/brand";
import { DemoScenarioBanner } from "@/components/ui/guards";
import { DeniedState, EmptyState, ErrorState, PageSkeleton } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import {TourProvider,TourHelp} from '@/components/onboarding/provider';

interface ParentCtx { key: ParentKey; slug: string; base: string; modules: ParentModule[]; preview: boolean; context: Awaited<ReturnType<typeof parentRepo.context>> }
const Ctx = createContext<ParentCtx | null>(null);

export function useParent() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useParent outside ParentShell");
  return v;
}

/** Map a repository error to the unavailable-page reason (never exposes data). */
export function unavailableReason(e: RepoError | null | undefined): string | null {
  if (!e || !isRepoError(e)) return null;
  if (e.details?.problemCode === "PARENT_CONTEXT_CHANGED") return "changed";
  if (e.details?.problemCode === "PARENT_ACCESS_INVALID") return "invalid";
  if (e.code === "REVOKED") return "revoked";
  if (e.code === "EXPIRED") return "expired";
  if (e.code === "SUSPENDED") return "suspended";
  if (e.code === "NOT_FOUND" && e.message === "invalid") return "invalid";
  return null;
}

/**
 * Parent read hook: re-validates the link on every read; a revoked/expired link redirects
 * to the unavailable page (ST22). Module not granted → FORBIDDEN handled by the page.
 */
export function useParentRead<T>(key: readonly unknown[], fn: (k: ParentKey, slug: string) => Promise<T>) {
  const p = useParent();
  const router = useRouter();
  const previewId='preview' in p.key?p.key.preview.accessId:null;
  const q = useQuery<T, RepoError>({ queryKey: ["parent", parentSessionRevision(), previewId, p.slug, ...key], queryFn: () => fn(p.key, p.slug), retry: false, staleTime: 0,refetchOnWindowFocus:true,refetchInterval:30_000 });
  const reason = !p.preview?readParentFault(p.slug)??unavailableReason(q.error):unavailableReason(q.error);
  useEffect(() => { if (reason && !p.preview) router.replace(`/p/${p.slug}/access-unavailable?reason=${reason}`); }, [reason, p.preview, p.slug, router]);
  return q;
}

const MOBILE_PRIMARY = ["overview", "timetable", "attendance"];

export function ParentShell({ slug, children, preview }: { slug: string; children: ReactNode; preview?: { key: ParentKey; base: string } }) {
  const [tourNavigation,setTourNavigation]=useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const revision=useSyncExternalStore(onParentSessionChanged,parentSessionRevision,()=>-1);
  const viewId=revision===-1?null:readParentView(slug);
  const key = useMemo<ParentKey | null>(() => preview?preview.key:viewId?{viewId}:null, [preview, viewId]);
  const previewId=key&&'preview' in key?key.preview.accessId:null;
  const ctxQ = useQuery({ queryKey: ["parent", revision, previewId, slug, "context",viewId], queryFn: () => parentRepo.context(key!, slug), enabled: !!key, retry: false,staleTime:0,refetchOnWindowFocus:true,refetchInterval:30_000 });
  const reason = !preview?readParentFault(slug)??unavailableReason(ctxQ.error as RepoError | null):unavailableReason(ctxQ.error as RepoError | null);
  useEffect(() => { if (reason && !preview) router.replace(`/p/${slug}/access-unavailable?reason=${reason}`); }, [reason, preview, slug, router]);
  const base = preview?.base ?? `/p/${slug}`;
  const value = useMemo<ParentCtx | null>(() => (key && ctxQ.data ? { key, slug, base, modules: ctxQ.data.modules, preview: !!preview, context: ctxQ.data } : null), [key, ctxQ.data, slug, base, preview]);

  if (revision === -1 && !preview) return <PageSkeleton variant="parent" />;
  if(reason&&!preview)return <PageSkeleton variant="parent" />;
  if (!key) return <NoLink slug={slug} />;
  if (ctxQ.isLoading || (reason && !preview)) return <PageSkeleton variant="parent" />;
  if ((ctxQ.error as RepoError | null)?.code === "FORBIDDEN") return <div className="p-6"><DeniedState message="Bạn không có quyền xem trước link tra cứu này." /></div>;
  if(ctxQ.error)return <div className="p-6"><ErrorState error={ctxQ.error as RepoError} onRetry={()=>ctxQ.refetch()} /></div>;
  if (!value) return <div className="p-6"><EmptyState title="Không mở được thông tin" description="Đường dẫn không còn hiệu lực hoặc không đúng trường." /></div>;

  const nav = PARENT_NAV.filter((n) => n.href==='overview'?value.context.overviewAllowed:!n.module || value.modules.includes(n.module));
  const home=nav[0]?.href??'overview';
  const active = (href: string) => (href === "overview" ? pathname === `${base}/overview` || pathname === base : pathname.startsWith(`${base}/${href}`));
  const content=(
    <Ctx.Provider value={value}>
      <div className={clsx("flex flex-col bg-app", preview ? "min-h-[600px]" : "min-h-dvh")}>
        {!preview && <DemoScenarioBanner compact />}
        <header data-tour="parent-context" className="no-print relative overflow-hidden border-b border-line bg-gradient-to-r from-white via-[#f5f9ff] to-[#eaf3ff]">
          <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-4 px-4 lg:h-[88px]">
            <Brand href={`${base}/${home}`} />
            {!preview&&<TourHelp className="ml-auto"/>}
            <div className="ml-4 hidden items-center gap-3 md:flex">
              <span className="icon-tile icon-tile-sm tone-blue !rounded-full"><Lock className="size-5" /></span>
              <div><p className="text-[16px] font-bold text-ink">Cổng thông tin dành cho phụ huynh</p><p className="text-[12.5px] text-muted">Thông tin đã được nhà trường công bố, chỉ xem</p></div>
            </div>
            <img src="/assets/illustrations/family-header.png" alt="" aria-hidden className="pointer-events-none absolute bottom-0 right-4 hidden h-[86px] w-auto [mask-image:linear-gradient(to_right,transparent,black_20%)] lg:block" />
          </div>
        </header>
        {preview && <div className="flex items-center gap-2 bg-purple-bg px-4 py-2 text-[13px] font-semibold text-purple-text"><Eye className="size-4" aria-hidden />Xem trước nội bộ — đúng phần phụ huynh sẽ thấy qua link này. Không cấp thêm quyền nào.</div>}
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-5 px-3 py-4 sm:px-4 lg:py-6">
          <aside className="no-print hidden w-[210px] flex-none lg:block" aria-label="Mục thông tin của con">
            <nav className="card sticky top-4 p-2">
              <ul className="space-y-1">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link data-tour={`parent-${n.href}`} href={`${base}/${n.href}`} aria-current={active(n.href) ? "page" : undefined}
                      className={clsx("flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium", active(n.href) ? "bg-[#dcebff] font-semibold text-primary-strong" : "text-body hover:bg-[#f2f7fe]")}>
                      <NavIcon name={n.icon} className={clsx("size-[20px]", active(n.href) ? "text-primary" : "text-[#46618a]")} />{n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#d6e6fa] bg-gradient-to-b from-[#eaf3ff] to-white">
              <img src="/assets/illustrations/family-sidebar.png" alt="" className="h-[150px] w-full object-cover object-top" />
              <p className="px-4 pb-4 text-[16px] font-bold leading-snug text-ink">Con phát triển là niềm hạnh phúc của gia đình <Heart className="inline size-4 fill-danger text-danger" aria-hidden /></p>
            </div>
          </aside>
          <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
        <footer className="no-print hidden border-t border-line bg-white/70 lg:block">
          <div className="mx-auto grid max-w-[1400px] grid-cols-3 gap-6 px-6 py-5 text-[13px]">
            {[[<ShieldCheck key="a" className="size-6" />, "An toàn · Chỉ xem", "Không tài khoản, không đăng nhập. Link riêng do nhà trường cấp."], [<Heart key="b" className="size-6" />, "Kết nối yêu thương", "Xem tình hình học tập, rèn luyện đã được công bố của con."], [<Leaf key="c" className="size-6" />, "Đồng hành cùng con", [value.context.school.publicPhone,value.context.school.publicEmail].filter(Boolean).join(' · ')||'Vui lòng liên hệ trực tiếp giáo viên chủ nhiệm.']].map(([ic, t, d]) => (
              <div key={t as string} className="flex items-start gap-3"><span className="icon-tile icon-tile-sm tone-blue !rounded-full">{ic}</span><div><p className="font-bold text-ink">{t}</p><p className="text-muted">{d}</p></div></div>
            ))}
          </div>
        </footer>
        <ParentBottomBar nav={nav} base={base} active={active} tourNavigation={tourNavigation}/>
      </div>
    </Ctx.Provider>
  );
  return preview?content:<TourProvider tourKey="parent-overview" contextKey={`${slug}/${viewId}/${revision}`} parent prepareNavigation={()=>{if(window.innerWidth<1024)setTourNavigation(true);}} restoreNavigation={()=>setTourNavigation(false)}>{content}</TourProvider>;
}

/** Mobile: Tổng quan / Lịch / Chuyên cần / Thêm — never 8 buttons in one bar. */
function ParentBottomBar({ nav, base, active,tourNavigation=false }: { nav: typeof PARENT_NAV; base: string; active: (h: string) => boolean;tourNavigation?:boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(()=>{setOpen(tourNavigation);},[tourNavigation]);
  const primary = nav.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const rest = nav.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Điều hướng nhanh">
        {primary.map((n) => (
          <Link data-tour={`parent-${n.href}`} key={n.href} href={`${base}/${n.href}`} aria-current={active(n.href) ? "page" : undefined} className={clsx("flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-medium", active(n.href) ? "text-primary-strong" : "text-muted")}>
            <NavIcon name={n.icon} className="size-[22px]" />{n.href === "overview" ? "Tổng quan" : n.label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} className={clsx("flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-medium", rest.some((n) => active(n.href)) ? "text-primary-strong" : "text-muted")}>
          <MoreHorizontal className="size-[22px]" aria-hidden />Thêm
        </button>
      </nav>
      <D.Root modal={!tourNavigation} open={open} onOpenChange={o=>{if(!tourNavigation)setOpen(o);}}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-[#0b1b3a]/30 lg:hidden" />
          <D.Content className={clsx("fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] lg:hidden",tourNavigation&&"!bottom-[60px]")} aria-describedby={undefined}>
            <div className="mb-3 flex items-center justify-between"><D.Title className="text-base font-bold text-ink">Mục khác</D.Title><D.Close className="rounded-lg p-2 text-muted" aria-label="Đóng"><X className="size-5" /></D.Close></div>
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((n) => (
                <li key={n.href}><Link data-tour={`parent-${n.href}`} href={`${base}/${n.href}`} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line px-3 text-[15px] font-medium text-ink"><NavIcon name={n.icon} className="size-5 text-primary" />{n.label}</Link></li>
              ))}
            </ul>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}

function NoLink({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app p-4">
      <div className="card w-full max-w-lg">
        <div className="flex justify-center pt-6"><Brand /></div>
        <EmptyState icon={<Lock className="size-6" />} title="Cần đường dẫn riêng do nhà trường cấp" description="Trang thông tin của con chỉ mở được qua link/QR riêng mà giáo viên gửi cho gia đình. Không có đăng ký hay đăng nhập cho phụ huynh."
          action={<ButtonLink href={`/schools/${slug}`}>Xem trang công khai của trường</ButtonLink>} />
      </div>
    </div>
  );
}
