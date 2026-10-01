"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin, CalendarDays } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useRepo, useCtx } from "@/lib/query/hooks";
import { addDays, mondayOf, weekdayOf } from "@/lib/calendar";
import { PERIODS } from "@/lib/domain/timetable";
import { fmtDate, fmtDayMonth, weekdayLabel } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState } from "@/components/ui/states";

type Sched = Awaited<ReturnType<typeof classroomRepo.teacherSchedule>>;
type Lesson = Sched["days"][number]["lessons"][number];

/** TE03 — my teaching schedule; each lesson links to the right class/period attendance. */
export function TeacherSchedule({ schoolId }: { schoolId: string }) {
  const ctx = useCtx();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const weekParam = sp.get("week");
  const monday = mondayOf(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : ctx.today);
  const setWeek = (m: string) => router.replace(`${pathname}?week=${m}`, { scroll: false });
  const q = useRepo(["teacher-schedule", schoolId, monday], (c) => classroomRepo.teacherSchedule(c, schoolId, monday));
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day && day >= monday && day <= addDays(monday, 5) ? day : (ctx.today >= monday && ctx.today <= addDays(monday, 5) ? ctx.today : monday);

  const attendHref = (l: Lesson, date: string) => `/classroom/${schoolId}/${l.yearId}/${l.classId}/attendance?date=${date}&slot=period-${l.period}`;
  const canOpenAttend = (l: Lesson, date: string) => l.canAttend && !l.cancelled && date <= ctx.today;

  const LessonCell = ({ l, date }: { l: Lesson; date: string }) => (
    <div className={clsx("rounded-lg border px-2.5 py-2 text-[12.5px]", l.cancelled ? "border-dashed border-line-strong bg-neutral-bg" : "border-[#cfe3fb] bg-[#f3f8ff]")}>
      <p className={clsx("font-semibold text-ink", l.cancelled && "line-through")}>{l.subject} · {l.className}</p>
      <p className="flex items-center gap-1 text-muted"><MapPin className="size-3" aria-hidden />{l.room}</p>
      {l.changed && <Badge tone={l.cancelled ? "neutral" : "warning"} className="mt-1" title={l.changed.reason}>{l.cancelled ? "Nghỉ" : "Thay đổi"}: {l.changed.reason}</Badge>}
      {canOpenAttend(l, date) && <Link href={attendHref(l, date)} className="mt-1 inline-flex items-center gap-1 font-semibold text-primary-strong hover:underline"><CalendarCheck className="size-3.5" aria-hidden />Điểm danh tiết</Link>}
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Lịch dạy của tôi" subtitle="Lịch theo tuần của các lớp và môn bạn được phân công" breadcrumbs={[{ label: "Việc hôm nay", href: `/teacher/${schoolId}` }, { label: "Lịch dạy" }]}
        actions={<div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(monday, -7))}>Tuần trước</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeek(mondayOf(ctx.today))} disabled={monday === mondayOf(ctx.today)}>Tuần này</Button>
          <Button variant="secondary" size="sm" iconRight={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(monday, 7))}>Tuần sau</Button>
        </div>} />
      <QueryState query={q} skeleton="table">
        {(d) => {
          const total = d.days.reduce((a, x) => a + x.lessons.length, 0);
          return (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                <CalendarDays className="size-5 text-primary" aria-hidden />
                <h2 className="text-[16px] font-bold text-ink">Tuần {fmtDate(monday)} – {fmtDate(addDays(monday, 5))}</h2>
                <span className="text-[13px] text-muted">{total} tiết</span>
              </div>
              {total === 0 && d.days.every((x) => !x.holiday) ? <EmptyState compact title="Không có tiết dạy trong tuần này" /> : (
                <>
                  {/* desktop week grid */}
                  <div className="hidden p-4 lg:block">
                    <div className="table-wrap">
                      <table className="table" style={{ minWidth: 900 }}>
                        <caption className="sr-only">Lịch dạy tuần {fmtDate(monday)}</caption>
                        <thead><tr><th className="w-[92px]">Tiết</th>{d.days.map((x) => <th key={x.date} className={clsx(x.date === ctx.today && "!text-primary-strong")}>{weekdayLabel(weekdayOf(x.date))}<span className="block text-[12px] font-normal text-muted">{fmtDayMonth(x.date)}{x.date === ctx.today ? " · Hôm nay" : ""}</span></th>)}</tr></thead>
                        <tbody>
                          {PERIODS.map((p) => (
                            <tr key={p.period} className={p.period === 6 ? "border-t-4 border-[#eef4fb]" : undefined}>
                              <td className="align-top"><b className="text-ink">Tiết {p.period}</b><span className="block text-[12px] text-muted">{p.start} – {p.end}</span></td>
                              {d.days.map((x) => {
                                if (x.holiday) return p.period === 1 ? <td key={x.date} rowSpan={PERIODS.length} className="bg-neutral-bg text-center align-middle text-[13px] font-semibold text-neutral-text">Nghỉ: {x.holiday}</td> : null;
                                const l = x.lessons.find((y) => y.period === p.period);
                                return <td key={x.date} className={clsx("align-top", x.date === ctx.today && "bg-[#f8fbff]")}>{l ? <LessonCell l={l} date={x.date} /> : null}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* mobile day list */}
                  <div className="p-4 lg:hidden">
                    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Chọn ngày">
                      {d.days.map((x) => (
                        <button key={x.date} type="button" role="tab" aria-selected={x.date === activeDay} onClick={() => setDay(x.date)}
                          className={clsx("flex min-w-[52px] flex-col items-center rounded-xl border px-2 py-1.5 text-[12px]", x.date === activeDay ? "border-primary bg-primary text-white" : "border-line bg-white text-body")}>
                          <span className="font-bold">{weekdayLabel(weekdayOf(x.date), true)}</span><span>{fmtDayMonth(x.date)}</span>
                        </button>
                      ))}
                    </div>
                    <DayList day={d.days.find((x) => x.date === activeDay)!} render={(l, date) => <LessonCell l={l} date={date} />} />
                  </div>
                </>
              )}
              <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">“Điểm danh tiết” chỉ hiện với tiết bạn được phân công điểm danh (chủ nhiệm hoặc đúng môn dạy) và ngày không ở tương lai.</p>
            </Card>
          );
        }}
      </QueryState>
    </div>
  );
}

function DayList({ day, render }: { day: Sched["days"][number]; render: (l: Lesson, date: string) => React.ReactNode }) {
  const lessons = useMemo(() => [...day.lessons].sort((a, b) => a.period - b.period), [day]);
  if (day.holiday) return <p className="rounded-xl bg-neutral-bg p-4 text-sm font-semibold text-neutral-text">Nghỉ: {day.holiday}</p>;
  if (!lessons.length) return <p className="rounded-xl bg-[#f7fbff] p-4 text-sm text-muted">Không có tiết dạy trong ngày.</p>;
  return (
    <ul className="space-y-2">
      {lessons.map((l) => (
        <li key={l.id} className="flex gap-3">
          <div className="w-[64px] flex-none pt-1 text-[12px]"><b className="block text-ink">Tiết {l.period}</b><span className="text-muted">{l.start}</span></div>
          <div className="min-w-0 flex-1">{render(l, day.date)}</div>
        </li>
      ))}
    </ul>
  );
}
