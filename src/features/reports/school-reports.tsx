"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Trophy, Sparkles, LayoutList, Link2, ArrowRight, Download, Filter, Info, BookX } from "lucide-react";
import { reportsRepo } from "@/lib/repositories";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { mondayOf } from "@/lib/calendar";
import { fmtDate, matches } from "@/lib/formatters";
import { Card, CardHeader, Callout, IconTile, type PastelTone } from "@/components/ui/card";
import { ButtonLink, Button } from "@/components/ui/button";
import { DateField, InlineSelect, SelectField } from "@/components/ui/form";
import { EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { ReportViewer } from "./viewer";

const META: Record<string, { icon: React.ReactNode; tone: PastelTone; group: string; filters: string }> = {
  attendance: { icon: <CalendarCheck className="size-6" />, tone: "green", group: "attendance", filters: "Khoảng ngày · khối" },
  conduct: { icon: <Trophy className="size-6" />, tone: "amber", group: "conduct", filters: "Tuần · khối" },
  activities: { icon: <Sparkles className="size-6" />, tone: "purple", group: "activities", filters: "Khối" },
  "class-progress": { icon: <LayoutList className="size-6" />, tone: "blue", group: "operations", filters: "Theo ngày hiện tại" },
  links: { icon: <Link2 className="size-6" />, tone: "pink", group: "operations", filters: "Khối" },
};
const GROUPS = [{ value: "attendance", label: "Chuyên cần" }, { value: "conduct", label: "Thi đua" }, { value: "activities", label: "Hoạt động" }, { value: "operations", label: "Vận hành lớp và link tra cứu" }];

/** SC37 — report center: cards from SCHOOL_REPORTS; filter by keyword and data group. No academic-results report. */
export function ReportCatalog({ schoolId }: { schoolId: string }) {
  const q = useRepo(["school-report-catalog", schoolId], (c) => reportsRepo.schoolCatalog(c, schoolId));
  const [kw, setKw] = useState("");
  const [group, setGroup] = useState("");
  return (
    <QueryState query={q} skeleton="cards">
      {(d) => {
        const items = d.reports.filter((r) => matches(kw, r.title, r.description) && (!group || META[r.type]?.group === group));
        return (
          <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-2 p-4">
              <Filter className="size-4 text-primary" aria-hidden />
              <input className="input min-w-[200px] flex-[2_1_240px]" type="search" placeholder="Tìm báo cáo…" aria-label="Tìm báo cáo" value={kw} onChange={(e) => setKw(e.target.value)} />
              <InlineSelect className="flex-[1_1_200px]" label="Loại dữ liệu" allLabel="Mọi loại dữ liệu" value={group} onChange={setGroup} options={GROUPS} />
              {d.canExport && <ButtonLink href={`/school/${schoolId}/exports`} icon={<Download className="size-4" />} className="!flex-none">Các bản xuất</ButtonLink>}
            </Card>
            {items.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((r) => {
                  const m = META[r.type];
                  return (
                    <Link key={r.type} href={`/school/${schoolId}/reports/${r.type}`} className="card group flex flex-col gap-3 p-5 transition-colors hover:border-[#9cc7f5]">
                      <div className="flex items-start gap-3">
                        <IconTile tone={m?.tone ?? "blue"}>{m?.icon}</IconTile>
                        <div className="min-w-0"><p className="text-[16px] font-bold text-ink">{r.title}</p><p className="mt-0.5 text-[13px] leading-snug text-body">{r.description}</p></div>
                      </div>
                      <p className="text-[12.5px] text-muted">Bộ lọc: {m?.filters}</p>
                      <span className="card-link mt-auto">Mở báo cáo<ArrowRight className="size-3.5" aria-hidden /></span>
                    </Link>
                  );
                })}
              </div>
            ) : <Card><EmptyState compact title="Không có báo cáo khớp bộ lọc" action={<Button size="sm" onClick={() => { setKw(""); setGroup(""); }}>Xóa bộ lọc</Button>} /></Card>}
            <div className="grid gap-4 lg:grid-cols-2">
              <Callout tone="info" icon={<Info />} title="Số liệu có mẫu số và thời điểm">Mỗi báo cáo ghi rõ phạm vi, kỳ, mẫu số và thời điểm tạo. “Chưa điểm danh” không được tính là có mặt; thi đua chỉ tính bản đã chốt.</Callout>
              <Callout tone="neutral" icon={<BookX />} title="Không có báo cáo học lực">Module kết quả học tập đang tắt theo phạm vi sản phẩm, nên không có báo cáo điểm môn/học lực.</Callout>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

/** SC38 — one school report with scoped filters → ReportViewer; exports are recorded for SC39. */
export function SchoolReportView({ schoolId, type, today, initial = {} }: { schoolId: string; type: string; today: string; initial?: Record<string, string | undefined> }) {
  const cat = useRepo(["school-report-catalog", schoolId], (c) => reportsRepo.schoolCatalog(c, schoolId));
  const ctx = useCtx();
  const [range, setRange] = useState<"week" | "custom">(initial.from ? "custom" : "week");
  const [weekId, setWeekId] = useState(initial.weekId ?? "");
  const [from, setFrom] = useState(initial.from ?? mondayOf(today));
  const [to, setTo] = useState(initial.to ?? today);
  const [gradeId, setGradeId] = useState(initial.gradeId ?? "");
  const weeks = useMemo(() => cat.data?.weeks ?? [], [cat.data?.weeks]);
  const effWeek = weekId || (type === "conduct" ? weeks[1]?.id ?? weeks[0]?.id : weeks[0]?.id) || "";
  const params = useMemo(() => {
    const p: Record<string, string | undefined> = { yearId: cat.data?.yearId ?? undefined, gradeId: gradeId || undefined };
    if (type === "conduct") p.weekId = effWeek || undefined;
    if (type === "attendance") {
      const w = weeks.find((x) => x.id === effWeek);
      if (range === "week" && w) { p.from = w.startDate; p.to = w.endDate < today ? w.endDate : today; } else { p.from = from; p.to = to; }
    }
    return p;
  }, [type, gradeId, effWeek, range, from, to, weeks, today, cat.data?.yearId]);
  const q = useRepo(["school-report", schoolId, type, params], (c) => reportsRepo.school(c, schoolId, type, params), { enabled: !!cat.data });
  const grades = cat.data?.grades ?? [];
  useEffect(() => {
    if (!cat.data || cat.isFetching || cat.error) return;
    if (weekId && !cat.data.weeks.some(w => w.id === weekId)) setWeekId("");
    if (gradeId && !cat.data.grades.some(g => g.id === gradeId)) setGradeId("");
  }, [cat.data, cat.isFetching, cat.error, weekId, gradeId]);
  const gradeName = grades.find((g) => g.id === gradeId)?.name;
  const fileBase = q.data ? `${q.data.title} ${q.data.periodLabel}${gradeName ? ` ${gradeName}` : ""}` : type;
  if (cat.error) return <div className="card"><ErrorState error={cat.error} onRetry={() => cat.refetch()} /></div>;
  if (!cat.data) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-5">
      <Card className="no-print">
        <CardHeader title="Bộ lọc" icon={<Filter className="size-5" />} subtitle="Chỉ dữ liệu của trường trong năm học hiện tại, theo quyền của bạn." />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          {type === "attendance" && (
            <SelectField label="Kỳ báo cáo" value={range} onChange={(e) => setRange(e.target.value as "week" | "custom")} options={[{ value: "week", label: "Theo tuần" }, { value: "custom", label: "Khoảng ngày" }]} />
          )}
          {(type === "conduct" || (type === "attendance" && range === "week")) && (
            <SelectField label="Tuần" value={effWeek} onChange={(e) => setWeekId(e.target.value)} options={weeks.map((w) => ({ value: w.id, label: `Tuần ${w.index} (${fmtDate(w.startDate)} – ${fmtDate(w.endDate)})` }))} />
          )}
          {type === "attendance" && range === "custom" && <>
            <DateField label="Từ ngày" value={from} max={today} onChange={(v) => v && setFrom(v)} />
            <DateField label="Đến ngày" value={to} min={from} max={today} onChange={(v) => v && setTo(v)} helper={`Tối đa đến hôm nay ${fmtDate(today)}`} />
          </>}
          {type !== "class-progress" && (
            <SelectField label="Khối" value={gradeId} onChange={(e) => setGradeId(e.target.value)} placeholder="Tất cả khối" options={grades.map((g) => ({ value: g.id, label: g.name }))} />
          )}
          {type === "class-progress" && <p className="self-end text-sm text-muted">Báo cáo theo ngày hiện tại ({fmtDate(today)}); gồm cả lớp nháp.</p>}
        </div>
      </Card>
      {q.isLoading || cat.isLoading ? <div className="space-y-3"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[14px]" />)}</div><Skeleton className="h-72 rounded-[14px]" /></div>
        : q.error ? <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
        : q.data && <ReportViewer data={q.data} fileBase={fileBase} canExport={!!cat.data?.canExport} onExport={(format) => reportsRepo.exportReport(ctx, schoolId, q.data!, format)} />}
    </div>
  );
}
