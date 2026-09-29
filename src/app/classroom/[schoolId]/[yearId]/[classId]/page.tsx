"use client";
import Link from "next/link";
import { Archive, CalendarCheck, CalendarDays, ClipboardCheck, LayoutGrid, Star, ArrowRight, CheckCircle2 } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDateLong, fmtDate } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, CardLink } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DonutProgress, ProgressBar } from "@/components/ui/progress";
import { EmptyState, QueryState } from "@/components/ui/states";

const TONE_CLS: Record<string, string> = { danger: "bg-danger-bg text-danger-text", warning: "bg-warning-bg text-warning-text", info: "bg-primary-light text-primary-strong", neutral: "bg-neutral-bg text-neutral-text" };

/** CL01 — class overview (derived from R05/R06): tasks, attendance today, timetable, groups, activities. */
export default function ClassOverview() {
  const { schoolId, yearId, classId, base, can, readOnly } = useClassroom();
  const q = useRepo(["class-overview", classId], (ctx) => classroomRepo.overview(ctx, schoolId, yearId, classId));
  return (
    <div className="page">
      <ClassHeader variant="full" />
      <QueryState query={q} skeleton="none">
        {(d) => {
          const c = d.counts;
          const st = PUBLICATION_STATUS[d.sessionStatus === "none" ? "none" : d.sessionStatus];
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                {readOnly ? (
                  <Card>
                    <CardHeader title="Năm học đã kết thúc" icon={<Archive className="size-5" />} subtitle="Không còn việc cần làm, lịch học hay điểm danh trong ngày cho năm lưu trữ." />
                    <div className="flex flex-wrap gap-2 px-5 pb-5">
                      <ButtonLink href={`${base}/reports`} size="sm" variant="secondary">Báo cáo lớp</ButtonLink>
                      <ButtonLink href={`${base}/attendance/weekly`} size="sm" variant="secondary">Điểm danh theo tuần</ButtonLink>
                      <ButtonLink href={`${base}/conduct`} size="sm" variant="secondary">Điểm nề nếp các tuần</ButtonLink>
                      <ButtonLink href={`${base}/timetable`} size="sm" variant="secondary">Thời khóa biểu</ButtonLink>
                    </div>
                  </Card>
                ) : (<>
                <Card>
                  <CardHeader title="Việc cần làm của lớp" icon={<ClipboardCheck className="size-5" />} subtitle={fmtDateLong(d.date)} />
                  {d.tasks.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không còn việc tồn đọng" description="Các việc mới (điểm danh, ghi nhận chờ rà soát, minh chứng) sẽ hiện ở đây." /> : (
                    <ul className="divide-y divide-line px-5 pb-3">
                      {d.tasks.map((t) => (
                        <li key={t.key} className="flex flex-wrap items-center gap-3 py-3">
                          <div className="min-w-0 flex-[1_1_220px]"><p className="font-semibold text-ink">{t.label}</p><p className="truncate text-[13px] text-muted">{t.detail}</p></div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE_CLS[t.tone]}`}>{t.status}</span>
                          <ButtonLink href={t.href} size="sm" variant="secondary">Mở</ButtonLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Lịch học hôm nay" icon={<CalendarDays className="size-5" />} action={<CardLink href={`${base}/timetable`}>Xem thời khóa biểu</CardLink>} />
                  {d.today.length === 0 ? <EmptyState compact title="Không có tiết học hôm nay" /> : (
                    <div className="table-wrap px-5 pb-4">
                      <table className="table" style={{ minWidth: 520 }}>
                        <thead><tr><th>Tiết</th><th>Thời gian</th><th>Môn học</th><th>Giáo viên</th><th>Phòng</th></tr></thead>
                        <tbody>{d.today.map((l) => (
                          <tr key={l.period}><td>{l.period}</td><td className="tabular-nums">{l.start} – {l.end}</td><td className="font-semibold text-ink">{l.subject}{l.changed && <Badge tone="warning" className="ml-2">Thay đổi</Badge>}</td><td>{l.teacher}</td><td>{l.room}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </Card>
                </>)}
              </div>
              <div className="space-y-5">
                {!readOnly && (
                <Card>
                  <CardHeader title="Điểm danh buổi sáng" icon={<CalendarCheck className="size-5" />} action={can("attendance.record") ? <CardLink href={`${base}/attendance`}>Mở điểm danh</CardLink> : undefined} />
                  <div className="flex flex-wrap items-center gap-5 px-5 pb-5">
                    <DonutProgress value={c.presentAll} total={c.total} label={`Hiện diện ${c.presentAll}/${c.total}`} color="var(--color-success)">
                      <span className="text-2xl font-extrabold text-ink">{c.presentAll}/{c.total}</span><span className="text-[11px] text-muted">hiện diện</span>
                    </DonutProgress>
                    <ul className="min-w-[180px] flex-1 space-y-1.5 text-[13.5px]">
                      {[["Có mặt đúng giờ", c.present, "bg-success"], ["Đi muộn", c.late, "bg-warning"], ["Nghỉ có phép", c.excused, "bg-primary"], ["Nghỉ không phép", c.unexcused, "bg-danger"], ["Chưa điểm danh", c.unmarked, "bg-faint"]].map(([l, v, col]) => (
                        <li key={l as string} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${col}`} aria-hidden /><span className="text-body">{l}</span><span className="ml-auto font-semibold tabular-nums text-ink">{v}</span></li>
                      ))}
                      <li className="pt-1"><Badge tone={st.tone}>{d.sessionStatus === "none" ? "Chưa điểm danh hôm nay" : st.label}</Badge></li>
                    </ul>
                  </div>
                </Card>
                )}
                <Card>
                  <CardHeader title="Tổ và sơ đồ" icon={<LayoutGrid className="size-5" />} action={can("groups.manage") || can("student.profile.view") ? <CardLink href={`${base}/groups`}>Xem tổ & chức vụ</CardLink> : undefined} />
                  <div className="grid grid-cols-2 gap-3 px-5 pb-5">
                    {d.groups.map((g) => <div key={g.id} className="rounded-xl border border-line bg-[#f7fbff] p-3"><p className="font-bold text-primary-strong">{g.name}</p><p className="text-[13px] text-muted">{g.size} học sinh</p></div>)}
                    {d.noGroup > 0 && <p className="col-span-2 text-[13px] text-warning-text">{d.noGroup} học sinh chưa phân tổ</p>}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Hoạt động đang diễn ra" icon={<Star className="size-5" />} action={<CardLink href={`${base}/activities`} />} />
                  <ul className="space-y-4 px-5 pb-5">
                    {d.activities.length === 0 && <li className="text-sm text-muted">Chưa có hoạt động đang giao.</li>}
                    {d.activities.map((a) => (
                      <li key={a.id}>
                        <Link href={`${base}/activities/${a.id}`} className="group block">
                          <ProgressBar value={a.done} total={a.total} ariaLabel={`Tiến độ ${a.title}`} label={<span className="group-hover:underline">{a.title}</span>} color="var(--color-purple)" />
                          <p className="mt-1 flex items-center justify-between text-[12px] text-muted"><span>{a.done}/{a.total} học sinh được giao đã duyệt</span><span>Hạn {fmtDate(a.dueDate)}</span></p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="px-5 pb-4"><Link href={`${base}/reports`} className="card-link">Báo cáo lớp <ArrowRight className="size-3.5" /></Link></div>
                </Card>
              </div>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
