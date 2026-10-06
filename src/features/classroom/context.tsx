"use client";
import { createContext, useContext, useMemo, useLayoutEffect, useRef, type ReactNode } from "react";
import {visibleTabScroll} from './tab-scroll';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import * as M from "@radix-ui/react-dropdown-menu";
import {
  LayoutDashboard, Users, CalendarCheck, Trophy, CalendarDays, LayoutGrid, Star, Megaphone, FolderOpen, BarChart3, MoreHorizontal, Phone, Mail,
  Archive, Link2, Megaphone as Speaker, ClipboardList,
} from "lucide-react";
import type { ActionKey } from "@/lib/model/types";
import { classroomRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtPercent } from "@/lib/formatters";
import { SchoolShell, TeacherShell, ScopedClassShell, RequireStaffSession } from "@/components/layout/shells";
import { Breadcrumbs } from "@/components/layout/page";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Callout, IconTile } from "@/components/ui/card";
import { ErrorState, PageSkeleton } from "@/components/ui/states";
import { ProgressBar } from "@/components/ui/progress";
import {TourProvider,useTour} from '@/components/onboarding/provider';
import type {TourKey} from '@/components/onboarding/registry';

type Header = Awaited<ReturnType<typeof classroomRepo.header>>;
export interface ClassroomCtx { schoolId: string; yearId: string; classId: string; base: string; header: Header; can: (a: ActionKey) => boolean; readOnly: boolean }
const Ctx = createContext<ClassroomCtx | null>(null);

export function useClassroom() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClassroom outside ClassroomLayout");
  return v;
}

function ClassroomInner({ schoolId, yearId, classId, children }: { schoolId: string; yearId: string; classId: string; children: ReactNode }) {
  const header = useRepo(["class-header", schoolId, yearId, classId], (c) => classroomRepo.header(c, schoolId, yearId, classId));
  const value = useMemo<ClassroomCtx | null>(() => {
    if (!header.data) return null;
    const set = new Set(header.data.actions as ActionKey[]);
    return { schoolId, yearId, classId, base: `/classroom/${schoolId}/${yearId}/${classId}`, header: header.data, can: (a) => set.has(a), readOnly: header.data.readOnly };
  }, [header.data, schoolId, yearId, classId]);
  if (header.isLoading) return <PageSkeleton />;
  if (!value || header.error && header.error.code !== 'READ_ERROR' && header.error.code !== 'NETWORK') return <div className="page"><div className="card"><ErrorState error={header.error} onRetry={() => header.refetch()} /></div></div>;
  const content = (
    <Ctx.Provider value={value}>
      {header.error && <div className="px-[var(--page-pad)] pt-4"><ErrorState compact error={header.error} onRetry={() => header.refetch()} /></div>}
      {value.readOnly && <div className="px-[var(--page-pad)] pt-4"><Callout tone="neutral" icon={<Archive />} title="Năm học đã lưu trữ — chỉ xem">Dữ liệu năm cũ được giữ nguyên để tra cứu; các thao tác ghi đã tắt (ST24).</Callout></div>}
      {children}
    </Ctx.Provider>
  );
  const shell=value.header.workspaceKind==='TEACHER'?<TeacherShell schoolId={schoolId} classWorkspace>{content}</TeacherShell>:value.header.workspaceKind==='SCHOOL'?<SchoolShell schoolId={schoolId} classWorkspace>{content}</SchoolShell>:<ScopedClassShell schoolId={schoolId} base={value.base} className={value.header.class.name}>{content}</ScopedClassShell>;
  return <TourProvider tourKey={value.header.workspaceKind==='TEACHER'?(value.header.myDuties.some(d=>/chủ nhiệm/i.test(d))?'class-homeroom':'class-subject'):'class-staff'} schoolId={schoolId} contextKey={`${schoolId}/${yearId}/${classId}`} enabled={!value.readOnly&&!header.error}>{shell}</TourProvider>;
}

/**
 * The same ClassWorkspace is used by teachers and school staff: the shell follows the
 * actor's real relation to this class (assignment → TeacherShell; school role → SchoolShell).
 */
export function ClassroomLayout({ schoolId, yearId, classId, children }: { schoolId: string; yearId: string; classId: string; children: ReactNode }) {
  return <RequireStaffSession><ClassroomInner schoolId={schoolId} yearId={yearId} classId={classId}>{children}</ClassroomInner></RequireStaffSession>;
}

/* ------------------------------ Tabs ------------------------------ */
const TAB_ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard />, students: <Users />, attendance: <CalendarCheck />, conduct: <Trophy />, timetable: <CalendarDays />,
  groups: <LayoutGrid />, activities: <Star />, announcements: <Megaphone />, files: <FolderOpen />, reports: <BarChart3 />,
  notebook:<ClipboardList/>,periodic:<Trophy/>,duties:<ClipboardList/>,seating:<LayoutGrid/>,'public-portal':<Link2/>,'notebook-settings':<LayoutGrid/>,
};
const MATCH: Record<string, string[]> = {
  groups: ["/groups"], conduct: ["/conduct", "/publications", "/adjustments", "/rules"], activities: ["/activities", "/evidence"], attendance: ["/attendance"],
};

/** C007 — class section nav: full row on desktop, 4 items + "Thêm" menu on small screens. */
export function ClassTabs() {
  const { header, base, schoolId, yearId, classId } = useClassroom();
  const row=useRef<HTMLDivElement>(null);
  const storageKey=`class-tabs:${schoolId}:${yearId}:${classId}`;
  const saveScroll=()=>{if(row.current)try{sessionStorage.setItem(storageKey,String(row.current.scrollLeft));}catch{/* Storage may be unavailable. */}};
  const pathname = usePathname();
  const rel = pathname.slice(base.length) || "";
  const isActive = (key: string, path: string) => (key === "overview" ? rel === "" : (MATCH[key] ?? [path]).some((p) => rel === p || rel.startsWith(`${p}/`)));
  const tabs = header.tabs;
  const primary = tabs.slice(0, 4);
  const rest = tabs.slice(4);
  useLayoutEffect(()=>{
    const el=row.current;if(!el)return;
    const restore=()=>{
      if(!el.clientWidth)return;
      let left=el.scrollLeft;try{const stored=sessionStorage.getItem(storageKey);if(stored!==null&&Number.isFinite(Number(stored)))left=Number(stored);}catch{/* Use the current layout. */}
      const active=el.querySelector<HTMLElement>('[aria-current="page"]');
      // Rectangle differences also work when the row is not the offsetParent.
      const tab=active?{left:active.getBoundingClientRect().left-el.getBoundingClientRect().left+el.scrollLeft,width:active.offsetWidth}:null;
      el.scrollTo({left:visibleTabScroll(left,el.clientWidth,el.scrollWidth,tab),behavior:'auto'});
    };
    restore();const observer=new ResizeObserver(restore);observer.observe(el);
    return()=>{observer.disconnect();};
  },[pathname,storageKey,tabs]);
  const item = (t: (typeof tabs)[number], extra?: string) => (
    <Link data-tour={`class-${t.key}`} key={t.key} href={`${base}${t.path}`} scroll={false} onClick={saveScroll} className={clsx("tab flex-none whitespace-nowrap !gap-2 [&_svg]:size-[18px]", extra)} aria-current={isActive(t.key, t.path) ? "page" : undefined}>
      <span aria-hidden>{TAB_ICONS[t.key]}</span>{t.label}
    </Link>
  );
  return (
    <nav className="card no-print flex items-center gap-1 p-1.5" aria-label={`Mục của lớp ${header.class.name}`}>
      <div ref={row} data-class-tabs="desktop" onScroll={saveScroll} className="hidden min-w-0 flex-1 gap-1 overflow-x-auto lg:flex">{tabs.map((t) => item(t))}</div>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto lg:hidden">{primary.map((t) => item(t, "!px-3"))}</div>
      {rest.length > 0 && (
        <M.Root modal={false}>
          <M.Trigger asChild>
            <button data-tour="class-more" type="button" aria-current={rest.some(t=>isActive(t.key,t.path))?'page':undefined} className={clsx("tab !px-3 lg:hidden", rest.some((t) => isActive(t.key, t.path)) && "bg-primary-light text-primary-strong")}><MoreHorizontal className="size-[18px]" aria-hidden />Thêm</button>
          </M.Trigger>
          <M.Portal>
            <M.Content align="end" sideOffset={6} className="z-[70] min-w-[220px] rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
              {rest.map((t) => (
                <M.Item key={t.key} asChild>
                  <Link href={`${base}${t.path}`} scroll={false} onClick={saveScroll} aria-current={isActive(t.key,t.path)?'page':undefined} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-ink outline-none data-[highlighted]:bg-primary-light [&_svg]:size-4 [&_svg]:text-muted">{TAB_ICONS[t.key]}{t.label}</Link>
                </M.Item>
              ))}
            </M.Content>
          </M.Portal>
        </M.Root>
      )}
    </nav>
  );
}

/* ------------------------------ Header ------------------------------ */
/**
 * C051 — class context header. "full" reproduces the R06 top area (title, 4 summary cards);
 * "compact" keeps school / year / class always visible on inner pages.
 */
export function ClassHeader({ variant = "compact", title, subtitle, actions, crumbs }: { variant?: "full" | "compact"; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  const { header: h, base, schoolId,can,readOnly } = useClassroom();
  const tour=useTour();
  const classTour:TourKey=h.workspaceKind==='TEACHER'?(h.myDuties.some(d=>/chủ nhiệm/i.test(d))?'class-homeroom':'class-subject'):'class-staff';
  const breadcrumb = [
    { label: h.school.shortName, href: h.workspaceKind === 'SCHOOL' ? `/school/${schoolId}` : h.workspaceKind === 'TEACHER' ? `/teacher/${schoolId}` : '/choose-school' },
    ...(h.workspaceKind === 'CLASS' ? [] : [{ label: h.workspaceKind === 'SCHOOL' ? "Danh sách lớp" : "Lớp học của tôi", href: h.workspaceKind === 'SCHOOL' ? `/school/${schoolId}/classes` : `/teacher/${schoolId}/classes` }]),
    { label: `Lớp ${h.class.name}`, href: base },
    ...(crumbs ?? []),
  ];
  const statusMap = h.summary.weekStatus ? PUBLICATION_STATUS[h.summary.weekStatus] : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div data-tour="class-context" className="min-w-0 flex-[1_1_320px]">
          <Breadcrumbs items={breadcrumb} className="mb-1.5" />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{title ?? `Lớp ${h.class.name}`}</h1>
            {!title && <Badge tone="success">{h.grade}</Badge>}
            {h.myDuties.map((d) => <Badge key={d} tone="info" dot={false}>{d}</Badge>)}
            {h.viaSchoolRole && <Badge tone="purple" dot={false}>Xem theo quyền nhà trường</Badge>}
          </div>
          <p className="page-subtitle mt-1">{subtitle ?? <>Lớp {h.class.name} · Năm học {h.year.label} · {h.school.name}</>}</p>
        </div>
        {variant === "full" && (
          <div className="no-print hidden flex-none items-center gap-3 xl:flex" aria-hidden>
            <p className="quote max-w-[300px] text-right">“Mỗi học sinh là một tiềm năng<br />Mỗi lớp học là một hành trình tươi sáng”</p>
            <img src="/assets/illustrations/school-header.png" alt="" className="h-[88px] w-auto [mask-image:linear-gradient(to_right,transparent,black_18%)]" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{tour&&<button data-tour="class-tour" type="button" className="btn btn-secondary btn-sm" disabled={tour.active} onClick={()=>tour.start(classTour)}>Hướng dẫn lớp này</button>}{actions}</div>
      </div>
      {variant === "full" && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 max-sm:[&_.icon-tile]:hidden max-sm:[&_.card-pad]:!p-3.5">
          <div className="card card-pad col-span-2 flex items-center gap-3.5 sm:col-span-1">
            {h.homeroom ? <Avatar name={h.homeroom.name} tone={h.homeroom.tone} size={56} square /> : <IconTile tone="neutral"><Users className="size-6" /></IconTile>}
            <div className="min-w-0 text-[13px]">
              <p className="text-body">Giáo viên chủ nhiệm</p>
              <p className="truncate text-[15px] font-bold text-ink">{h.homeroom?.name ?? "Chưa phân công"}</p>
              {h.homeroom?.phone && <p className="hidden items-center gap-1.5 text-muted sm:flex"><Phone className="size-3.5" aria-hidden />{h.homeroom.phone}</p>}
              {h.homeroom?.email && <p className="hidden items-center gap-1.5 truncate text-muted sm:flex"><Mail className="size-3.5 flex-none" aria-hidden />{h.homeroom.email}</p>}
            </div>
          </div>
          <div className="card card-pad flex items-center gap-4">
            <IconTile tone="blue"><Users className="size-7" /></IconTile>
            <div><p className="text-[13.5px] text-body">Sĩ số lớp</p><p className="text-[22px] font-extrabold leading-tight sm:text-[28px] text-ink">{h.size ?? '—'}</p><p className="text-[12px] text-muted">{h.size === null ? 'Không có quyền xem' : h.male === null || h.female === null ? 'Không có quyền xem giới tính' : `${h.male} nam · ${h.female} nữ${h.size > h.male + h.female ? ` · ${h.size - h.male - h.female} chưa có dữ liệu` : ''}`}</p></div>
          </div>
          {h.summary.links ? (
            <div className="card card-pad flex items-center gap-4">
              <IconTile tone="green"><Link2 className="size-7" /></IconTile>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-body">Học sinh có link tra cứu</p>
                <p className="text-[22px] font-extrabold leading-tight sm:text-[28px] text-ink">{h.summary.links.studentsWithLink}{h.size !== null && <span className="text-lg text-muted"> / {h.size}</span>}</p>
                {h.size !== null && <ProgressBar value={h.summary.links.studentsWithLink} total={h.size} ariaLabel="Tỉ lệ học sinh có link tra cứu" color="var(--color-success)" />}
                <p className="mt-1 text-[12px] text-muted">{h.summary.links.opened} em có link đã được mở{h.size !== null && ` (${fmtPercent(h.summary.links.opened, h.size)})`}</p>
              </div>
            </div>
          ) : (
            <div className="card card-pad flex items-center gap-4">
              <IconTile tone="amber"><ClipboardList className="size-7" /></IconTile>
              <div><p className="text-[13.5px] text-body">Ghi nhận chờ rà soát</p><p className="text-[22px] font-extrabold leading-tight sm:text-[28px] text-ink">{h.summary.pending ?? '—'}</p><p className="text-[12px] text-muted">{h.summary.pending === null ? 'Không có quyền xem' : 'Trong phạm vi được cấp'}</p></div>
            </div>
          )}
          <div data-tour={!readOnly&&(can('conduct.lock')||can('conduct.publish'))?'class-publication':undefined} className="card card-pad col-span-2 flex items-center gap-4 sm:col-span-1">
            <IconTile tone="pink">{h.readOnly ? <Archive className="size-7" /> : <Speaker className="size-7" />}</IconTile>
            {h.readOnly ? (
              <div className="min-w-0">
                <p className="text-[13.5px] text-body">Năm học {h.year.label}</p>
                <p className="mt-1"><Badge tone="neutral">Đã lưu trữ</Badge></p>
                <p className="mt-1.5 text-[12px] text-muted">Công bố gần nhất: {h.summary.lastPublishedAt ? fmtDate(h.summary.lastPublishedAt) : "—"}</p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-[13.5px] text-body">Thi đua tuần {h.summary.weekIndex ?? "—"}</p>
                <p className="mt-1"><Badge tone={statusMap?.tone ?? 'neutral'} className="max-w-full !whitespace-normal">{h.summary.weekStatus === 'locked' ? 'Đã chốt' : statusMap?.label ?? 'Chưa có kỳ hoặc không có quyền xem'}</Badge></p>
                <p className="mt-1.5 text-[12px] text-muted">Công bố gần nhất: {h.summary.lastPublishedAt ? fmtDate(h.summary.lastPublishedAt) : "—"}</p>
              </div>
            )}
          </div>
        </div>
      )}
      <ClassTabs />
    </div>
  );
}
