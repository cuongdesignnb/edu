"use client";
import { createContext, useContext, useMemo, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {visibleTabScroll} from './tab-scroll';
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard, Users, UsersRound, CalendarCheck, Trophy, CalendarDays, BarChart3, Phone, Mail, GraduationCap, CircleHelp, ArrowRight,
  Archive, Megaphone as Speaker, ClipboardList,
} from "lucide-react";
import type { ActionKey } from "@/lib/model/types";
import { classroomRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate } from "@/lib/formatters";
import { SchoolShell, TeacherShell, ScopedClassShell, RequireStaffSession } from "@/components/layout/shells";
import { Breadcrumbs } from "@/components/layout/page";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Callout, IconTile } from "@/components/ui/card";
import { ErrorState, PageSkeleton } from "@/components/ui/states";
import { useLeaveGuard } from "@/components/ui/guards";
import {TourProvider,useTour} from '@/components/onboarding/provider';
import type {TourKey} from '@/components/onboarding/registry';
import { visibleSections, activeLocation, type SectionKey } from "./sections";

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

/* ------------------------------ Section navigation ------------------------------ */
const SECTION_ICONS: Record<SectionKey, ReactNode> = {
  overview: <LayoutDashboard />, students: <Users />, attendance: <CalendarCheck />, schedule: <CalendarDays />, activities: <Trophy />, parents: <UsersRound />,
};

/**
 * C007 — six teacher-facing sections (always fully visible: one row on desktop, a 3-column grid
 * on phones) plus the sub-items of the active section. Built from the server tab list only.
 */
export function ClassSectionNav() {
  const { header, base, can } = useClassroom();
  const pathname = usePathname();
  const rel = pathname.slice(base.length) || "";
  const sections = useMemo(() => visibleSections(header.tabs, base, can), [header.tabs, base, can]);
  const { section: active, item: activeItem } = activeLocation(sections, rel);
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    const tab = current ? { left: current.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft, width: current.offsetWidth } : null;
    el.scrollTo({ left: visibleTabScroll(el.scrollLeft, el.clientWidth, el.scrollWidth, tab), behavior: "auto" });
  }, [pathname]);
  const sub = active && active.items.length > 1 ? active : null;
  return (
    <div className="no-print flex flex-col gap-3">
      <nav data-tour="class-sections" className="card p-1.5" aria-label={`Mục của lớp ${header.class.name}`}>
        <ul className="grid grid-cols-3 gap-1 sm:[grid-template-columns:repeat(var(--sections),minmax(0,1fr))] desk:flex" style={{ "--sections": sections.length } as CSSProperties}>
          {sections.map((s) => (
            <li key={s.key} className="desk:flex-auto">
              <Link href={s.href} scroll={false} className="class-section-tab"
                aria-current={active?.key === s.key ? (s.items.length > 1 ? "true" : "page") : undefined}>
                <span aria-hidden className="[&>svg]:size-5">{SECTION_ICONS[s.key]}</span>{s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {sub && (
        <nav aria-label={`Trong mục ${sub.label}`}>
          <div ref={row} className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            {sub.items.map((it) => (
              <Link key={it.path} href={it.href} scroll={false} className="class-subtab" aria-current={activeItem?.path === it.path ? "page" : undefined}>{it.label}</Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

/* ------------------------------ Header ------------------------------ */
const CLASS_STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  active: { label: "Đang hoạt động", tone: "success" }, draft: { label: "Lớp nháp", tone: "warning" }, archived: { label: "Đã lưu trữ", tone: "neutral" },
};

/** Teachers with several current classes switch directly; the target always opens on its overview. */
function ClassSwitcher() {
  const { header: h, schoolId, classId } = useClassroom();
  const router = useRouter();
  const guard = useLeaveGuard();
  const classes = useRepo(["teacher-classes", schoolId], (c) => classroomRepo.teacherClasses(c, schoolId), { enabled: h.workspaceKind === "TEACHER" });
  const list = classes.data ?? [];
  if (h.workspaceKind !== "TEACHER" || list.length < 2 || !list.some((c) => c.id === classId)) return null;
  const homeroom = list.filter((c) => c.duties.some((d) => d.kind === "homeroom"));
  const teaching = list.filter((c) => !homeroom.includes(c));
  const option = (c: (typeof list)[number]) => <option key={c.id} value={c.id}>{c.name} ({c.yearLabel})</option>;
  return (
    <label className="flex w-full flex-col gap-1 sm:w-auto">
      <span className="text-[13px] font-semibold text-body">Lớp đang mở</span>
      <select className="select !h-11 min-w-[200px] text-[15px] font-semibold" value={classId}
        onChange={(e) => { const next = list.find((c) => c.id === e.target.value); if (next) guard(() => router.push(`/classroom/${schoolId}/${next.yearId}/${next.id}`)); }}>
        {homeroom.length > 0 && teaching.length > 0 ? <>
          <optgroup label="Lớp chủ nhiệm">{homeroom.map(option)}</optgroup>
          <optgroup label="Lớp giảng dạy">{teaching.map(option)}</optgroup>
        </> : list.map(option)}
      </select>
    </label>
  );
}

function ClassBanner({ motto }: { motto?: string }) {
  return (
    <div className="no-print relative hidden h-[112px] w-[360px] flex-none overflow-hidden rounded-2xl border border-[#d9e9fb] bg-[linear-gradient(90deg,#eaf4ff,#f4f9ff)] min-[1360px]:block">
      <img src="/assets/illustrations/class-banner.png" alt="" className="absolute inset-y-0 left-0 h-full w-auto [mask-image:linear-gradient(to_right,black_78%,transparent)]" />
      <p className="absolute inset-y-0 right-3 flex w-[118px] items-center text-right text-[14px] font-semibold italic leading-snug text-primary-strong">
        <span className="line-clamp-4">{motto?.trim() || "Đoàn kết tạo nên những điều tốt đẹp"}</span>
      </p>
    </div>
  );
}

/**
 * C051 — class context header (every class page): identity, status, year/school, homeroom,
 * class switcher and section navigation. With `title`, the page title becomes the h1 and the
 * class identity stays visible above it.
 */
export function ClassHeader({ title, subtitle, actions, crumbs }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  const { header: h, base, schoolId } = useClassroom();
  const tour=useTour();
  const classTour:TourKey=h.workspaceKind==='TEACHER'?(h.myDuties.some(d=>/chủ nhiệm/i.test(d))?'class-homeroom':'class-subject'):'class-staff';
  const breadcrumb = [
    { label: h.school.shortName, href: h.workspaceKind === 'SCHOOL' ? `/school/${schoolId}` : h.workspaceKind === 'TEACHER' ? `/teacher/${schoolId}` : '/choose-school' },
    ...(h.workspaceKind === 'CLASS' ? [] : [{ label: h.workspaceKind === 'SCHOOL' ? "Danh sách lớp" : "Lớp học của tôi", href: h.workspaceKind === 'SCHOOL' ? `/school/${schoolId}/classes` : `/teacher/${schoolId}/classes` }]),
    { label: `Lớp ${h.class.name}`, href: base },
    ...(crumbs ?? []),
  ];
  const status = CLASS_STATUS[h.class.status] ?? CLASS_STATUS.active;
  const ClassName = title ? "p" : "h1";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div data-tour="class-context" className="flex min-w-0 flex-[1_1_340px] items-start gap-4">
          <IconTile tone="blue" className="mt-6 max-sm:hidden"><GraduationCap className="size-7" /></IconTile>
          <div className="min-w-0">
            <Breadcrumbs items={breadcrumb} className="mb-1.5 max-sm:hidden" />
            <div className="flex flex-wrap items-center gap-2.5">
              <ClassName className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-ink sm:text-[30px]">Lớp {h.class.name}</ClassName>
              <Badge tone={status.tone}>{status.label}</Badge>
              {h.myDuties.slice(0, 2).map((d) => <Badge key={d} tone="info" dot={false}>{d}</Badge>)}
              {h.myDuties.length > 2 && <Badge tone="info" dot={false} title={h.myDuties.slice(2).join(", ")}>+{h.myDuties.length - 2} môn</Badge>}
              {h.viaSchoolRole && <Badge tone="purple" dot={false}>Xem theo quyền nhà trường</Badge>}
            </div>
            <p className="mt-1 text-[14px] text-body">Năm học {h.year.label}<span className="px-2 text-faint" aria-hidden>|</span>{h.school.name}<span className="px-2 text-faint" aria-hidden>|</span>{h.grade}</p>
            <p className="text-[13.5px] text-muted max-sm:hidden">Giáo viên chủ nhiệm: <span className="font-semibold text-ink">{h.homeroom?.name ?? "Chưa phân công"}</span></p>
          </div>
        </div>
        <div className={clsx("flex w-full flex-wrap items-end gap-2 sm:w-auto sm:flex-col sm:items-stretch", title && "max-sm:hidden")}>
          <ClassSwitcher />
          {tour&&<button data-tour="class-tour" type="button" className="btn btn-ghost btn-sm justify-start text-primary-strong" disabled={tour.active} onClick={()=>tour.start(classTour)}><CircleHelp className="size-4" aria-hidden />Hướng dẫn lớp này</button>}
        </div>
        <ClassBanner motto={h.class.motto} />
      </div>
      <ClassSectionNav />
      {(title || actions) && (
        <div className="flex flex-wrap items-end gap-3">
          {title && (
            <div className="min-w-0 flex-[1_1_320px]">
              <h1 className="text-[21px] font-extrabold leading-tight text-ink sm:text-[24px]">{title}</h1>
              {subtitle && <p className="mt-1 text-[14px] text-body">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Summary ------------------------------ */
const WEEK_STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "purple" | "success" }> = {
  open: { label: "Đang ghi nhận", tone: "neutral" }, in_review: { label: "Đang rà soát", tone: "warning" }, locked: { label: "Đã chốt", tone: "purple" }, published: { label: "Đã công bố", tone: "success" },
};
/** Class key figures (formerly the R06 header cards) — read from the header receipt, no extra request. */
export function ClassStats() {
  const { header: h, can, readOnly, base } = useClassroom();
  const statusMap = h.summary.weekStatus ? WEEK_STATUS[h.summary.weekStatus] ?? PUBLICATION_STATUS[h.summary.weekStatus] : null;
  const tile = "flex min-w-0 flex-col gap-1 rounded-2xl border p-4";
  return (
    <section className="card @container" aria-labelledby="class-stats-title">
      <div className="card-header">
        <h2 className="card-title" id="class-stats-title"><BarChart3 className="size-5" />Thống kê lớp {h.class.name}</h2>
        {h.tabs.some((t) => t.key === "reports") && <Link href={`${base}/reports`} className="card-link">Xem báo cáo<ArrowRight className="size-3.5" aria-hidden /></Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 @md:grid-cols-3">
        <div className={clsx(tile, "border-[#d6e8ff] bg-pastel-blue")}>
          <Users className="size-6 text-primary" aria-hidden />
          <p className="text-[13px] text-body">Sĩ số</p>
          <p className="text-[26px] font-extrabold leading-none text-ink">{h.size ?? '—'}</p>
          <p className="text-[12px] text-muted">{h.size === null ? 'Không có quyền xem' : h.male === null || h.female === null ? 'Không có quyền xem giới tính' : `${h.male} nam · ${h.female} nữ${h.size > h.male + h.female ? ` · ${h.size - h.male - h.female} chưa có dữ liệu` : ''}`}</p>
        </div>
        <div className={clsx(tile, "border-[#f5dcae] bg-pastel-amber")}>
          <ClipboardList className="size-6 text-warning" aria-hidden />
          <p className="text-[13px] text-body">Chờ rà soát</p>
          <p className="text-[26px] font-extrabold leading-none text-ink">{h.summary.pending ?? '—'}</p>
          <p className="text-[12px] text-muted">{h.summary.pending === null ? 'Không có quyền xem ghi nhận' : 'ghi nhận thi đua'}</p>
        </div>
        <div data-tour={!readOnly&&(can('conduct.lock')||can('conduct.publish'))?'class-publication':undefined} className={clsx(tile, "col-span-2 border-[#e6dcff] bg-pastel-purple @md:col-span-1")}>
          {h.readOnly ? <Archive className="size-6 text-purple" aria-hidden /> : <Speaker className="size-6 text-purple" aria-hidden />}
          {h.readOnly ? (
            <>
              <p className="text-[13px] text-body">Năm học {h.year.label}</p>
              <p><Badge tone="neutral">Đã lưu trữ</Badge></p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-body">Thi đua tuần {h.summary.weekIndex ?? "—"}</p>
              <p><Badge tone={statusMap?.tone ?? 'neutral'} className="max-w-full !whitespace-normal">{statusMap?.label ?? 'Chưa có kỳ hoặc không có quyền xem'}</Badge></p>
            </>
          )}
          <p className="text-[12px] text-muted">Công bố gần nhất: {h.summary.lastPublishedAt ? fmtDate(h.summary.lastPublishedAt) : "—"}</p>
        </div>
      </div>
    </section>
  );
}

/** Homeroom teacher contact, shown on the class overview (work contact only when the school allows it). */
export function HomeroomCard() {
  const { header: h } = useClassroom();
  return (
    <section className="card card-pad" aria-labelledby="class-homeroom-title">
      <h2 id="class-homeroom-title" className="text-[16px] font-bold text-ink">Giáo viên chủ nhiệm</h2>
      <div className="mt-3 flex items-center gap-3">
        {h.homeroom ? <Avatar name={h.homeroom.name} tone={h.homeroom.tone} size={52} /> : <IconTile tone="neutral" size="sm"><Users className="size-5" /></IconTile>}
        <p className="min-w-0 truncate text-[15px] font-bold text-ink">{h.homeroom?.name ?? "Chưa phân công"}</p>
      </div>
      {(h.homeroom?.phone || h.homeroom?.email) && (
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-body">
          {h.homeroom?.phone && <li className="flex items-center gap-2"><Phone className="size-4 flex-none text-muted" aria-hidden /><a href={`tel:${h.homeroom.phone}`} className="hover:underline">{h.homeroom.phone}</a></li>}
          {h.homeroom?.email && <li className="flex min-w-0 items-center gap-2"><Mail className="size-4 flex-none text-muted" aria-hidden /><a href={`mailto:${h.homeroom.email}`} className="truncate hover:underline">{h.homeroom.email}</a></li>}
        </ul>
      )}
    </section>
  );
}
