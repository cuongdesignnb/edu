"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarRange, Lock, Clock3, FlaskConical, Presentation } from "lucide-react";
import type { AcademicYear, ActionKey, School } from "@/lib/model/types";
import { useRepo, useSession } from "@/lib/query/hooks";
import { schoolRepo, sessionRepo, classroomRepo, type RepoError } from "@/lib/repositories";
import { isExpired } from "@/lib/api/session";
import { StaffPrivateScope } from "@/lib/query/native-provider";
import { NativeSchoolScope } from "@/lib/query/native-school-scope";
import { demoNowISO } from "@/lib/calendar";
import { Sidebar } from "./sidebar";
import { Topbar, GlobalSearch, NotificationBell, UserMenu } from "./topbar";
import { AppFooter } from "./page";
import { Brand } from "./brand";
import { platformNav, schoolNav, teacherNav, accountNav } from "./nav";
import { DemoScenarioBanner, useLeaveGuard } from "@/components/ui/guards";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/states";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

const PROMO = { image: "/assets/illustrations/school-sidebar.png", title: "Cùng nhau kiến tạo nền giáo dục tốt đẹp hơn", text: "EduManage đồng hành cùng nhà trường trên hành trình xây dựng môi trường học tập hiện đại, hiệu quả và nhân văn." };

/* ------------------------------ Session gate (ST11) ------------------------------ */
export function RequireStaffSession({ children, kind = "staff" }: { children: ReactNode; kind?: "staff" | "platform" | "any" }) {
  const { session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <PageSkeleton />;
  if (!session || session.actor.kind === "anonymous") {
    return <CenterCard><EmptyState icon={<FlaskConical className="size-6" />} title="Vui lòng đăng nhập" description="Đăng nhập bằng tài khoản nhân sự được nhà trường mời." action={<ButtonLink href="/login" variant="primary">Đăng nhập</ButtonLink>} /></CenterCard>;
  }
  if (isExpired(session, demoNowISO())) {
    return <CenterCard><EmptyState icon={<Clock3 className="size-6" />} title="Phiên đã hết" description="Vì an toàn, hãy đăng nhập lại. Bản nháp đang soạn trong biểu mẫu (nếu có) đã được giữ trên trình duyệt ở mức cho phép." action={<ButtonLink href="/login" variant="primary">Đăng nhập lại</ButtonLink>} /></CenterCard>;
  }
  if (kind !== "any" && session.actor.kind !== kind) {
    return <CenterCard><EmptyState icon={<Lock className="size-6" />} title="Không gian này không dành cho vai trò hiện tại" description={kind === "platform" ? "Chỉ tài khoản vận hành nền tảng mở được khu vực này." : "Tài khoản vận hành nền tảng không mặc định mở không gian nhà trường hoặc hồ sơ học sinh."} action={<ButtonLink href="/choose-school">Chọn không gian</ButtonLink>} /></CenterCard>;
  }
  return <StaffPrivateScope>{children}</StaffPrivateScope>;
}

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <DemoScenarioBanner />
      <div className="flex flex-1 items-center justify-center p-4"><div className="card w-full max-w-xl"><div className="flex justify-center pt-6"><Brand /></div>{children}</div></div>
    </div>
  );
}

/* ------------------------------ Frame ------------------------------ */
function Frame({ nav, actions, homeHref, search, roleLabel, schoolId, children, promo = PROMO, sidebarFooter }: {
  nav: Parameters<typeof Sidebar>[0]["entries"]; actions?: Set<ActionKey>; homeHref: string; search: ReactNode; roleLabel: string; schoolId?: string; children: ReactNode; promo?: typeof PROMO | null; sidebarFooter?: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const close = useCallback(() => setMobile(false), []);
  return (
    <div className="flex min-h-dvh bg-app">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[90] rounded-lg bg-primary px-3 py-2 text-white">Bỏ qua điều hướng</a>
      <Sidebar entries={nav} actions={actions} promo={promo} homeHref={homeHref} mobileOpen={mobile} onMobileClose={close} footer={sidebarFooter} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoScenarioBanner />
        <Topbar onMenu={() => setMobile(true)} homeHref={homeHref} search={search} right={<><NotificationBell schoolId={schoolId} /><span className="mx-1 hidden h-8 w-px bg-line sm:block" aria-hidden /><UserMenu roleLabel={roleLabel} /></>} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}

/* ------------------------------ Platform ------------------------------ */
export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <RequireStaffSession kind="platform">
      <Frame nav={platformNav()} homeHref="/platform" roleLabel="Vận hành nền tảng" search={<GlobalSearch placeholder="Tìm trường học theo tên, mã, tỉnh/thành…" />}>{children}</Frame>
    </RequireStaffSession>
  );
}

/* ------------------------------ School ------------------------------ */
interface SchoolCtx { school: Awaited<ReturnType<typeof schoolRepo.context>>["school"]; years: AcademicYear[] | null; yearId: string; setYearId: (id: string) => void; actions: Set<ActionKey>; can: (a: ActionKey) => boolean; roleNames: string[]; currentYearId?: string; contextError?: RepoError; retryContext: () => void }
const SchoolContext = createContext<SchoolCtx | null>(null);
export function useSchool() {
  const v = useContext(SchoolContext);
  if (!v) throw new Error("useSchool outside SchoolShell");
  return v;
}
export function useOptionalSchool() {
  return useContext(SchoolContext);
}

/** C004 — school/year context. Changing year clears cached queries of the old context. */
function useYearState(schoolId: string, fallback?: string) {
  const [yearId, setYear] = useState<string | undefined>();
  useEffect(() => { try { setYear(localStorage.getItem(`edu-year:${schoolId}`) ?? undefined); } catch { /* ignore */ } }, [schoolId]);
  const set = (id: string) => { setYear(id); try { localStorage.setItem(`edu-year:${schoolId}`, id); } catch { /* ignore */ } };
  return [yearId ?? fallback, set] as const;
}

export function SchoolContextProvider({ schoolId, children, loading }: { schoolId: string; children: (ctx: SchoolCtx) => ReactNode; loading?: ReactNode }) {
  const ctxQ = useRepo(["school-context", schoolId], (c) => schoolRepo.context(c, schoolId));
  const actsQ = useRepo(["school-actions", schoolId], (c) => sessionRepo.schoolActions(c, schoolId));
  const fallbackYear = ctxQ.data?.currentYearId ?? ctxQ.data?.years?.find(y => y.status !== "archived")?.id ?? ctxQ.data?.years?.[0]?.id;
  const [yearId, setYearRaw] = useYearState(schoolId, fallbackYear);
  const qc = useQueryClient();
  const guard = useLeaveGuard();
  const setYearId = useCallback((id: string) => guard(() => { if (!id) return; setYearRaw(id); qc.removeQueries({ predicate: (q) => q.queryKey.includes(schoolId) && !q.queryKey.includes("school-context") }); }), [guard, qc, schoolId, setYearRaw]);
  const value: SchoolCtx | null = (() => {
    if (!ctxQ.data || !actsQ.data) return null;
    const set = new Set(actsQ.data as ActionKey[]);
    const valid = ctxQ.data.years?.some((y) => y.id === yearId) ? yearId! : fallbackYear ?? "";
    return { school: ctxQ.data.school, years: ctxQ.data.years, yearId: valid, setYearId, actions: set, can: (a) => set.has(a), roleNames: ctxQ.data.roleNames, currentYearId: ctxQ.data.currentYearId, contextError: ctxQ.error ?? actsQ.error ?? undefined, retryContext: () => { void ctxQ.refetch(); void actsQ.refetch(); } };
  })();
  if ((ctxQ.error || actsQ.error) && (!value || (ctxQ.error ?? actsQ.error)?.code !== "READ_ERROR")) return <ErrorPage error={ctxQ.error ?? actsQ.error} retry={() => { ctxQ.refetch(); actsQ.refetch(); }} />;
  if (!value) return <>{loading ?? <PageSkeleton />}</>;
  return <NativeSchoolScope.Provider value={schoolId}><SchoolContext.Provider key={schoolId} value={value}>{children(value)}</SchoolContext.Provider></NativeSchoolScope.Provider>;
}

function ErrorPage({ error, retry }: { error: Parameters<typeof ErrorState>[0]["error"]; retry: () => void }) {
  return <div className="page"><div className="card"><ErrorState error={error} onRetry={retry} /></div></div>;
}

function WorkspaceSwitch({ schoolId, target }: { schoolId: string; target: "teacher" | "school" }) {
  const me = useRepo(["me"], (c) => sessionRepo.me(c));
  const ws = me.data?.workspaces.find((w) => w.school.id === schoolId);
  if (!ws) return null;
  if (target === "teacher" && !ws.teacherWorkspace) return null;
  if (target === "school" && !ws.schoolWorkspace) return null;
  return (
    <Link href={target === "teacher" ? `/teacher/${schoolId}` : `/school/${schoolId}`} className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#d6e6fa] bg-white px-3.5 py-3 text-[13.5px] font-semibold text-primary-strong hover:bg-primary-light">
      <Presentation className="size-4" aria-hidden />{target === "teacher" ? "Chuyển sang: Lớp học của tôi" : "Chuyển sang: Quản lý nhà trường"}
    </Link>
  );
}

function PrivateYearScope({children}: {children: ReactNode}) { return children; }

export function SchoolShell({ schoolId, children }: { schoolId: string; children: ReactNode }) {
  const pathname = usePathname();
  const independent = /^\/(profile|settings|dictionaries|academic-years|teachers|roles|audit|support|students|guardians|parent-access)(\/|$)/.test(pathname.slice(`/school/${schoolId}`.length));
  return (
    <RequireStaffSession>
      <SchoolContextProvider schoolId={schoolId} loading={<Frame nav={[]} homeHref={`/school/${schoolId}`} roleLabel="" search={null} schoolId={schoolId}><PageSkeleton /></Frame>}>
        {(ctx) => (
          <Frame nav={schoolNav(schoolId)} actions={ctx.actions} homeHref={`/school/${schoolId}`} schoolId={schoolId}
            roleLabel={ctx.roleNames.join(", ") || "Nhân sự nhà trường"} search={<GlobalSearch schoolId={schoolId} placeholder="Tìm học sinh, giáo viên, lớp học…" />}
            sidebarFooter={<WorkspaceSwitch schoolId={schoolId} target="teacher" />}>
            {ctx.contextError && <div className="px-6 pt-4"><ErrorState error={ctx.contextError} onRetry={ctx.retryContext} compact /></div>}
            {ctx.yearId || independent ? <PrivateYearScope key={independent ? schoolId : `${schoolId}/${ctx.yearId}`}>{children}</PrivateYearScope> : <div className="page"><EmptyState title={ctx.years === null ? "Danh mục năm học không thuộc phạm vi của bạn" : "Chưa có năm học"} description={ctx.years === null ? "Mở chức năng thuộc quyền được cấp để xem dữ liệu phù hợp." : "Nhà trường cần tạo năm học trước khi tổ chức lớp và nhập dữ liệu học sinh."} action={ctx.can("year.manage") ? <ButtonLink href={`/school/${schoolId}/academic-years/new`} variant="primary">Tạo năm học</ButtonLink> : undefined} /></div>}
          </Frame>
        )}
      </SchoolContextProvider>
    </RequireStaffSession>
  );
}

/** School + year context bar (R02 style "Nhà trường 🔒 / Năm học ▾"). */
export function SchoolYearBar() {
  const { school, years, yearId, setYearId } = useSchool();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-medium text-body">Nhà trường</span>
        <span className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 text-[15px] font-semibold text-ink" title="Trường đang làm việc — đổi trường ở Chọn không gian">
          <Building2 className="size-[18px] text-primary" aria-hidden />{school.name}<Lock className="size-3.5 text-primary" aria-label="Cố định theo không gian đang mở" />
        </span>
      </div>
      <label className="flex items-center gap-2.5">
        <span className="text-sm font-medium text-body">Năm học</span>
        <span className="relative">
          <CalendarRange className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-primary" aria-hidden />
          <select className="select !h-11 !w-auto min-w-[180px] pl-10 text-[15px] font-semibold" value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Chọn năm học">
            {!years?.length && <option value="">{years === null ? "Danh mục năm học không thuộc phạm vi" : "Chưa có năm học"}</option>}
            {years?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.status === "archived" ? " (lưu trữ)" : y.status === "draft" ? " (nháp)" : ""}</option>)}
          </select>
        </span>
      </label>
    </div>
  );
}

/* ------------------------------ Teacher ------------------------------ */
export function TeacherShell({ schoolId, children }: { schoolId: string; children: ReactNode }) {
  return (
    <RequireStaffSession>
      <TeacherFrame schoolId={schoolId}>{children}</TeacherFrame>
    </RequireStaffSession>
  );
}

function TeacherFrame({ schoolId, children }: { schoolId: string; children: ReactNode }) {
  const classes = useRepo(["teacher-classes", schoolId], (c) => classroomRepo.teacherClasses(c, schoolId));
  const me = useRepo(["me"], (c) => sessionRepo.me(c));
  const ws = me.data?.workspaces.find((w) => w.school.id === schoolId);
  const nav = teacherNav(schoolId, (classes.data ?? []).map((c) => ({ id: c.id, yearId: c.yearId, name: c.name, role: c.duties.some((d) => d.kind === "homeroom") ? "Chủ nhiệm" : c.duties.map((d) => d.label).join(", ") })));
  const role = ws ? [ws.duties.slice(0, 2).join(" · ")].join("") || "Giáo viên" : "Giáo viên";
  const content = classes.error ? <div className="page"><Card className="card-pad"><ErrorState error={classes.error} onRetry={() => classes.refetch()} /></Card></div> : children;
  return (
    <Frame nav={nav} homeHref={`/teacher/${schoolId}`} schoolId={schoolId} roleLabel={role} promo={{ ...PROMO, text: "EduManage đồng hành cùng thầy cô trên hành trình truyền cảm hứng và phát triển thế hệ tương lai." }}
      search={<GlobalSearch schoolId={schoolId} placeholder="Tìm học sinh, lớp học của tôi…" />} sidebarFooter={<WorkspaceSwitch schoolId={schoolId} target="school" />}>
      {content}
    </Frame>
  );
}

/* ------------------------------ Account / personal ------------------------------ */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <RequireStaffSession kind="any">
      <Frame nav={accountNav()} homeHref="/choose-school" roleLabel="Tài khoản nhân sự" search={<GlobalSearch placeholder="Tìm trong phạm vi được phân công…" />} promo={null}>{children}</Frame>
    </RequireStaffSession>
  );
}

/* ------------------------------ Public / system ------------------------------ */
export function PublicShell({ children, schoolName }: { children: ReactNode; schoolName?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <DemoScenarioBanner compact />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-4">
          <Brand />
          {schoolName && <span className="hidden truncate text-sm font-semibold text-ink sm:block">· {schoolName}</span>}
          <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Liên kết">
            <Link href="/privacy" className="text-body hover:text-primary-strong">Quyền riêng tư</Link>
            <Link href="/terms" className="hidden text-body hover:text-primary-strong sm:inline">Điều kiện sử dụng</Link>
            <Link href="/login" className="btn btn-secondary btn-sm">Nhân sự đăng nhập</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 [&>.page]:!p-0">{children}</main>
      <footer className="border-t border-line bg-white/70 px-4 py-5 text-center text-[13px] text-muted">EduManage — Trang công khai không có công cụ tra cứu hồ sơ học sinh.</footer>
    </div>
  );
}

export function useRouterPush() {
  return useRouter().push;
}
