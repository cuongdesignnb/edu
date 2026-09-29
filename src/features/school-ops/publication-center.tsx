"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Lock, CircleDot, AlertTriangle, Clock, CalendarCheck, Megaphone, FileDiff, Info } from "lucide-react";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { InlineSelect } from "@/components/ui/form";
import { EmptyState, QueryState } from "@/components/ui/states";
import { StatTile, SegmentTabs } from "./ui";

type Data = Awaited<ReturnType<typeof conductRepo.publicationCenter>>;
type Row = Data["rows"][number];

/** SC36 — oversight across classes: status per class, blocking issues, adjustments, pending announcements. No bulk lock/publish. */
export function PublicationCenter({ schoolId }: { schoolId: string }) {
  const [weekId, setWeekId] = useState<string>();
  const [filter, setFilter] = useState<"" | "open" | "locked" | "published" | "issues">("");
  const q = useRepo(["publication-center", schoolId, weekId ?? ""], (c) => conductRepo.publicationCenter(c, schoolId, weekId));
  return (
    <QueryState query={q} skeleton="table">
      {(d) => {
        const count = (s: string) => d.rows.filter((r) => r.status === s).length;
        const issues = d.rows.filter((r) => r.blocking.length || r.overdue).length;
        const rows = d.rows.filter((r) => !filter || (filter === "issues" ? r.blocking.length > 0 || r.overdue : r.status === filter));
        const reviewHref = (r: Row) => `/classroom/${schoolId}/${r.yearId}/${r.classId}/conduct/review?week=${d.week.id}`;
        return (
          <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <CalendarCheck className="size-5 text-primary" aria-hidden />
              <InlineSelect className="!w-auto min-w-[260px]" label="Chọn tuần" value={d.week.id} onChange={setWeekId}
                options={d.weeks.map((w) => ({ value: w.id, label: `Tuần ${w.index} (${fmtDate(w.startDate)} – ${fmtDate(w.endDate)})` }))} />
              <p className="text-[13px] text-muted">Hạn chốt tuần {d.week.index}: {fmtDate(d.week.closeDeadline)}</p>
            </Card>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile label="Đang mở" value={count("open")} hint={`/${d.rows.length} lớp`} icon={<CircleDot className="size-5" />} tone="neutral" />
              <StatTile label="Đã chốt, chưa công bố" value={count("locked")} icon={<Lock className="size-5" />} tone="purple" />
              <StatTile label="Đã công bố" value={count("published")} icon={<CheckCircle2 className="size-5" />} tone="green" />
              <StatTile label="Có vướng mắc / quá hạn" value={issues} icon={<AlertTriangle className="size-5" />} tone="amber" />
            </div>
            <Callout tone="info" icon={<Info />}>Trang này để theo dõi. Việc rà soát, chốt và công bố thực hiện trong từng lớp sau khi kiểm tra — không có thao tác chốt hay công bố hàng loạt.</Callout>
            <Card>
              <CardHeader title={`Tình trạng các lớp — tuần ${d.week.index}`} icon={<CalendarCheck className="size-5" />} />
              <div className="px-4 pb-3">
                <SegmentTabs label="Lọc trạng thái lớp" value={filter} onChange={setFilter} items={[
                  { value: "", label: "Tất cả", count: d.rows.length }, { value: "open", label: "Đang mở", count: count("open") }, { value: "locked", label: "Đã chốt", count: count("locked") },
                  { value: "published", label: "Đã công bố", count: count("published") }, { value: "issues", label: "Có vướng mắc", count: issues },
                ]} />
              </div>
              {rows.length ? (
                <div className="table-wrap px-4 pb-4" tabIndex={0} role="region" aria-label="Tình trạng công bố các lớp">
                  <table className="table" style={{ minWidth: 900 }}>
                    <thead><tr><th>Lớp</th><th>Thi đua</th><th className="num">Chờ rà soát</th><th>Vướng mắc</th><th>Chuyên cần (buổi sáng)</th><th className="num">Điều chỉnh chờ</th><th><span className="sr-only">Mở</span></th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.classId}>
                          <td><p className="font-semibold text-ink">{r.className}</p><p className="text-[12px] text-muted">{r.homeroom}</p></td>
                          <td><div className="flex flex-wrap gap-1"><StatusBadge status={r.status} map={PUBLICATION_STATUS} />{r.overdue && <Badge tone="danger">Quá hạn chốt</Badge>}</div>
                            {r.snapshotVersion && <p className="mt-0.5 text-[12px] text-muted">Bản v{r.snapshotVersion}{r.publishedAt ? ` · công bố ${fmtDateTime(r.publishedAt)}` : ""}</p>}</td>
                          <td className="num tabular-nums">{r.pending}</td>
                          <td className="max-w-[260px] text-[12.5px]">{r.blocking.length || r.warnings.length ? <ul className="space-y-0.5">{r.blocking.map((b) => <li key={b} className="text-danger-text">{b}</li>)}{r.warnings.map((w) => <li key={w} className="text-warning-text">{w}</li>)}</ul> : <span className="text-muted">Không có</span>}</td>
                          <td className="text-[13px]"><p>Đã lưu {r.attendanceSaved} buổi</p><p className="text-muted">Đã công bố {r.attendancePublished}/{r.attendanceSaved}</p></td>
                          <td className="num tabular-nums">{r.adjustments}</td>
                          <td><Link href={reviewHref(r)} className="card-link whitespace-nowrap">Mở rà soát lớp<ArrowRight className="size-3.5" aria-hidden /></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState compact title="Không có lớp khớp bộ lọc" />}
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader title="Điều chỉnh sau chốt" icon={<FileDiff className="size-5" />} subtitle="Chờ duyệt hoặc đã duyệt chưa công bố" />
                {d.adjustments.length ? <ul className="divide-y divide-line px-5 pb-3">{d.adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[200px] flex-1"><p className="text-sm font-semibold text-ink">{a.studentName} · lớp {a.className}</p><p className="text-[12.5px] text-muted">Tổng {a.beforeTotal} → {a.afterTotal} · {a.reason} · {a.requestedByName}</p></div>
                    <StatusBadge status={a.status} map={PUBLICATION_STATUS} />
                    <Link href={`/classroom/${schoolId}/${a.yearId}/${a.classId}/conduct/adjustments`} className="card-link">Xem<ArrowRight className="size-3.5" aria-hidden /></Link>
                  </li>
                ))}</ul> : <EmptyState compact title="Không có điều chỉnh đang chờ" />}
              </Card>
              <Card>
                <CardHeader title="Thông báo chờ công bố" icon={<Megaphone className="size-5" />} subtitle="Bản nháp và thông báo đã đặt lịch (mô phỏng)" />
                {d.announcements.length ? <ul className="divide-y divide-line px-5 pb-3">{d.announcements.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[200px] flex-1"><p className="text-sm font-semibold text-ink">{a.title}</p><p className="text-[12.5px] text-muted">{a.origin === "school" ? "Nhà trường" : `Lớp ${a.className}`}{a.scheduledAt ? ` · hẹn ${fmtDateTime(a.scheduledAt)}` : ""}</p></div>
                    <StatusBadge status={a.status} map={PUBLICATION_STATUS} />
                    <Link href={`/school/${schoolId}/announcements/${a.id}`} className="card-link">Mở<ArrowRight className="size-3.5" aria-hidden /></Link>
                  </li>
                ))}</ul> : <EmptyState compact title="Không có thông báo chờ công bố" />}
              </Card>
            </div>
            <p className="flex items-center gap-1.5 text-[12px] text-muted"><Clock className="size-3.5" aria-hidden />Số liệu đọc tại thời điểm mở trang theo đồng hồ demo.</p>
          </div>
        );
      }}
    </QueryState>
  );
}
