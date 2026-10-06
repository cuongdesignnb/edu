"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3, BookX, CalendarCheck, Filter, Info, ListChecks, Trophy, UserRound } from "lucide-react";
import { reportsRepo } from "@/lib/repositories";
import { activitiesExtraRepo } from "@/lib/repositories";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf } from "@/lib/calendar";
import { fmtDate } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import {PublicPortalSettings} from "./public-portal-settings";
import { ReportViewer } from "@/features/reports/viewer";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { DateField, SelectField } from "@/components/ui/form";
import { DeniedState, EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";

const ICONS: Record<string, ReactNode> = { attendance: <CalendarCheck className="size-6" />, conduct: <Trophy className="size-6" />, activities: <ListChecks className="size-6" />, student: <UserRound className="size-6" /> };
const TONES: Record<string, string> = { attendance: "tone-green", conduct: "tone-amber", activities: "tone-purple", student: "tone-blue" };

/** CL25 — class report catalog (subject teachers see fewer reports, decided by the repository). */
export function ClassReportsPage() {
  const { schoolId, yearId, classId, base, header, can } = useClassroom();
  const allowed = can("report.class");
  const q = useRepo(["class-report-catalog", schoolId, yearId, classId], (ctx) => activitiesExtraRepo.classReportCatalog(ctx, schoolId, yearId, classId), { enabled: allowed });
  return (
    <div className="page">
      <ClassHeader variant="compact" title="Báo cáo lớp" subtitle={<>Báo cáo chuyên cần, thi đua, hoạt động của lớp {header.class.name}</>} />
      <PublicPortalSettings/>
      {!allowed ? <div className="card"><DeniedState /></div> : (
        <QueryState query={q} skeleton="cards">
          {(d) => (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-4 sm:grid-cols-2">
                {d.reports.map((r) => (
                  <Link key={r.type} href={`${base}/reports/${r.type}`} className="card card-pad group flex gap-4 transition-shadow hover:shadow-[var(--shadow-pop)]">
                    <span className={`icon-tile ${TONES[r.type]}`} aria-hidden>{ICONS[r.type]}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-ink group-hover:text-primary-strong">{r.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{r.description}</p>
                      <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-strong">Mở báo cáo <ArrowRight className="size-3.5" aria-hidden /></p>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="space-y-3">
                <Card className="p-5">
                  <p className="text-[13.5px] text-body">Vai trò của bạn với lớp</p>
                  <p className="mt-1 text-lg font-bold text-ink">{d.role}</p>
                  <p className="mt-2 text-[13px] text-muted">{d.canExport ? "Được xuất CSV/XLSX; mỗi lần xuất được ghi nhật ký." : "Chỉ xem và in; không có quyền xuất tệp báo cáo lớp."}</p>
                  {d.hiddenCount > 0 && <p className="mt-2 text-[13px] text-muted">Giáo viên bộ môn chỉ xem báo cáo chuyên cần và hoạt động ({d.hiddenCount} báo cáo khác dành cho giáo viên chủ nhiệm).</p>}
                </Card>
                <Callout tone="info" icon={<Info />} title="Số liệu có mẫu số và thời điểm">“Chưa điểm danh” không tính là có mặt; thi đua chỉ dùng bản đã chốt/công bố; tiến độ hoạt động tính trên học sinh được giao.</Callout>
                <Callout tone="neutral" icon={<BookX />} title="Không có bảng điểm học tập">Module kết quả học tập đang tắt nên không có báo cáo điểm môn.</Callout>
              </div>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}

/** CL26 — class report detail: params → reportsRepo.classReport → ReportViewer; export recorded when allowed. */
export function ClassReportDetailPage({ reportType }: { reportType: string }) {
  const { schoolId, yearId, classId, base, can } = useClassroom();
  const sp = useSearchParams();
  const allowed = can("report.class");
  const cat = useRepo(["class-report-catalog", schoolId, yearId, classId], (ctx) => activitiesExtraRepo.classReportCatalog(ctx, schoolId, yearId, classId), { enabled: allowed });
  const meta = cat.data?.reports.find((r) => r.type === reportType);
  return (
    <div className="page">
      <ClassHeader variant="compact" title={meta?.title ?? "Báo cáo lớp"} subtitle={meta?.description} crumbs={[{ label: "Báo cáo", href: `${base}/reports` }, { label: meta?.title ?? "Chi tiết" }]} />
      {!allowed ? <div className="card"><DeniedState /></div> : cat.isLoading ? <Skeleton className="h-72 rounded-[14px]" /> : cat.error ? <div className="card"><ErrorState error={cat.error} onRetry={() => cat.refetch()} /></div> : !meta ? (
        <div className="card"><EmptyState icon={<BarChart3 className="size-6" />} title="Báo cáo không có trong phạm vi của bạn" description="Loại báo cáo không tồn tại hoặc chỉ dành cho giáo viên chủ nhiệm/nhà trường." /></div>
      ) : <ReportBody type={reportType} cat={cat.data!} initialStudent={sp.get("studentId") ?? ""} />}
    </div>
  );
}

type Catalog = Awaited<ReturnType<typeof activitiesExtraRepo.classReportCatalog>>;

function ReportBody({ type, cat, initialStudent }: { type: string; cat: Catalog; initialStudent: string }) {
  const { schoolId, yearId, classId, header } = useClassroom();
  const ctx = useCtx();
  const today = cat.today;
  const [weekId, setWeekId] = useState(cat.weeks.find((w) => w.endDate < today)?.id ?? cat.weeks[0]?.id ?? "");
  const [from, setFrom] = useState(mondayOf(today));
  const [to, setTo] = useState(today);
  const [studentId, setStudentId] = useState(initialStudent);
  const params = useMemo(() => {
    const p: Record<string, string | undefined> = {};
    if (type === "conduct") p.weekId = weekId || undefined;
    if ((type === "attendance" || type === "parent-conduct")) { p.from = from; p.to = to; }
    if (type === "student" || type === "parent-conduct") p.studentId = studentId || undefined;
    return p;
  }, [type, weekId, from, to, studentId]);
  const ready = type !== "student" || !!studentId;
  const q = useRepo(["class-report", schoolId, yearId, classId, type, params], (ctx) => reportsRepo.classReport(ctx, schoolId, yearId, classId, type, params), { enabled: ready });
  const fileBase = q.data ? `${header.class.name} ${q.data.title} ${q.data.periodLabel}` : type;
  return (
    <div className="space-y-5">
      <Card className="no-print">
        <CardHeader title="Tham số" icon={<Filter className="size-5" />} subtitle={`Chỉ dữ liệu lớp ${header.class.name}.`} action={!cat.canExport ? <Badge tone="neutral" dot={false}>Chỉ xem và in</Badge> : undefined} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {type === "conduct" && <SelectField label="Tuần" value={weekId} onChange={(e) => setWeekId(e.target.value)} options={cat.weeks.map((w) => ({ value: w.id, label: `Tuần ${w.index} (${fmtDate(w.startDate)} – ${fmtDate(w.endDate)})` }))} />}
          {(type === "attendance" || type === "parent-conduct") && <>
            <DateField label="Từ ngày" value={from} max={today} onChange={(v) => v && setFrom(v)} />
            <DateField label="Đến ngày" value={to} min={from} max={today} onChange={(v) => v && setTo(v)} helper={`Tối đa đến ${fmtDate(today)}`} />
            <SelectField label="Chọn nhanh" value="" placeholder="Khoảng thời gian…" onChange={(e) => { const v = e.target.value; if(v==="month"){const first=today.slice(0,7)+"-01",last=addDays(first,-1);setFrom(last.slice(0,7)+"-01");setTo(last);} if (v === "week") { setFrom(mondayOf(today)); setTo(today); } if (v === "last") { const m = addDays(mondayOf(today), -7); setFrom(m); setTo(addDays(m, 6)); } if (v === "30") { setFrom(addDays(today, -29)); setTo(today); } }}
              options={[{value:"month",label:"Tháng trước"},{ value: "week", label: "Tuần này" }, { value: "last", label: "Tuần trước" }, { value: "30", label: "30 ngày gần nhất" }]} />
          </>}
          {(type === "student" || type === "parent-conduct") && <Combobox label="Học sinh (để trống để xuất cả lớp)" required={type==="student"} value={studentId} onChange={(v) => setStudentId(String(v))} options={cat.students.map((s) => ({ value: s.id, label: s.fullName, hint: s.code }))} placeholder="Tìm học sinh của lớp…" />}
          {type === "activities" && <p className="self-end text-sm text-muted">Tình trạng đến ngày {fmtDate(today)}; ô trống là học sinh không được giao.</p>}
        </div>
      </Card>
      {!ready ? <div className="card"><EmptyState compact icon={<UserRound className="size-6" />} title="Chọn học sinh để tạo báo cáo cá nhân" /></div>
        : q.isLoading ? <div className="space-y-3"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[14px]" />)}</div><Skeleton className="h-72 rounded-[14px]" /></div>
        : q.error ? <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
        : q.data && <ReportViewer data={q.data} fileBase={fileBase} canExport={cat.canExport} onExport={(format) => reportsRepo.exportReport(ctx, schoolId, q.data!, format)} />}
    </div>
  );
}
