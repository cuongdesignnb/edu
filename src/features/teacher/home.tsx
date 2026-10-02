"use client";
import { useState } from "react";
import Link from "next/link";
import { Users, UserX, Trophy, Bell, ClipboardCheck, CheckCircle2, BookOpen, MapPin, CalendarDays, Clock, Megaphone, CalendarCheck, ChevronRight, ArrowRight } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { teacherExtraRepo } from "@/lib/repositories";
import { errorMessage } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { demoNowISO, mondayOf } from "@/lib/calendar";
import { fmtDate, fmtDateLong, fmtRelative, fmtPercent } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, CardLink, IconTile } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { EmptyState, QueryState, Skeleton } from "@/components/ui/states";
import { MiniCalendar } from "@/components/ui/form";
import { ClassHeroCard, TaskIcon, TASK_TONE, feedIcon, taskActionLabel } from "./shared";

/** TE01 — teacher "today" workspace (R05). All numbers come from classroomRepo.teacherHome. */
export function TeacherHome({ schoolId }: { schoolId: string }) {
  const q = useRepo(["teacher-home", schoolId], (ctx) => classroomRepo.teacherHome(ctx, schoolId));
  const acts = useRepo(["teacher-class-actions", schoolId], (ctx) => teacherExtraRepo.myClassActions(ctx, schoolId));
  return (
    <QueryState query={q}>
      {(d) => {
        const hr = d.homeroom;
        const att = hr?.attendance;
        const attStatus = d.kpi.attendanceStatus;
        const statusNote = attStatus === "none" ? "Chưa điểm danh" : PUBLICATION_STATUS[attStatus ?? "none"]?.label;
        const can = (cid: string, a: string) => !!acts.data?.[cid]?.includes(a);
        const base = (c: { id: string; yearId: string }) => `/classroom/${schoolId}/${c.yearId}/${c.id}`;
        return (
          <div className="page">
            <PageHeader title="Lớp học của tôi" subtitle="Không chỉ giảng dạy, mà còn đồng hành cùng học sinh trưởng thành"
              quote={["Mỗi học trò là một câu chuyện đẹp", "mà thầy cô có cơ hội viết cùng"]} illustration="/assets/illustrations/teacher-board.png" />

            {d.classes.length === 0 ? (
              <Card><EmptyState title="Bạn chưa được phân công lớp nào đang hiệu lực" description="Khi nhà trường phân công chủ nhiệm hoặc bộ môn, lớp sẽ hiện ở đây. Bạn không thể tự thêm lớp." action={<ButtonLink href={`/teacher/${schoolId}/classes`} size="sm">Xem phân công đã kết thúc</ButtonLink>} /></Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {d.classes.map((c) => (
                  <ClassHeroCard key={c.id} href={base(c)} name={c.name} homeroom={c.isHomeroom} size={c.size} motto={c.motto}
                    roles={[...(c.isHomeroom ? ["Chủ nhiệm"] : []), ...c.subjects.filter((s) => !c.isHomeroom)]} />
                ))}
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="card card-pad flex min-w-0 items-center gap-4">
                    <IconTile tone="blue"><Users className="size-7" /></IconTile>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-body">Học sinh hôm nay</p>
                      {att ? (
                        <>
                          <p className="text-[28px] font-extrabold leading-tight text-ink tabular-nums">{att.presentAll}<span className="text-lg text-muted">/{att.total}</span></p>
                          <p className="text-[12px] text-muted">hiện diện lớp {hr?.name} ({fmtPercent(att.presentAll, att.total)})</p>
                          <p className={attStatus === "none" ? "text-[12px] font-semibold text-danger-text" : "text-[12px] font-semibold text-primary-strong"}>{statusNote}</p>
                        </>
                      ) : <p className="mt-1 text-sm text-muted">{hr ? "Chưa có dữ liệu chuyên cần trong phạm vi được xem" : "Không có lớp chủ nhiệm"}</p>}
                    </div>
                  </div>
                  <div className="card card-pad flex min-w-0 items-center gap-4">
                    <IconTile tone="pink"><UserX className="size-7" /></IconTile>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-body">Vắng mặt</p>
                      <p className="text-[28px] font-extrabold leading-tight text-ink tabular-nums">{att ? d.kpi.absentToday : "—"}</p>
                      {att && <><p className="text-[12px] text-muted">{att.excused} có phép · {att.unexcused} không phép</p>
                      <p className="text-[12px] text-muted">{att.late} đi muộn (có mặt){att.unmarked ? ` · ${att.unmarked} chưa điểm danh` : ""}</p></>}
                    </div>
                  </div>
                  <div className="card card-pad flex min-w-0 items-center gap-4">
                    <IconTile tone="amber"><Trophy className="size-7" /></IconTile>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-body">Ghi nhận thi đua chờ rà soát</p>
                      <p className="text-[28px] font-extrabold leading-tight text-ink tabular-nums">{d.kpi.pendingConduct ?? "—"}</p>
                      <p className="text-[12px] text-muted">Lớp bạn được giao rà soát</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <Card>
                    <CardHeader title="Việc cần làm hôm nay" icon={<ClipboardCheck className="size-5 text-primary" />} action={<CardLink href={`/teacher/${schoolId}/tasks`} />} />
                    {d.tasks.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không còn việc cần làm" description="Việc điểm danh, rà soát và minh chứng mới sẽ hiện ở đây." /> : (
                      <ul className="divide-y divide-line px-5 pb-2">
                        {d.tasks.slice(0, 4).map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                            <TaskIcon kind={t.kind} />
                            <div className="min-w-0 flex-[1_1_200px]"><p className="font-semibold text-ink">{t.title}</p><p className="truncate text-[13px] text-muted">{t.detail}</p></div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TASK_TONE[t.tone]}`}>{t.status}</span>
                            <ButtonLink href={t.href} size="sm" variant="secondary" className="min-w-[104px] justify-center">{taskActionLabel(t)}</ButtonLink>
                          </li>
                        ))}
                      </ul>
                    )}
                    {d.tasks.length > 4 && <p className="px-5 pb-4 text-[13px] text-muted">Còn {d.tasks.length - 4} việc khác trong “Việc cần xử lý”.</p>}
                  </Card>
                  <Link href="/notifications" className="card flex h-fit items-center gap-4 bg-gradient-to-br from-[#fdedf0] to-white p-5 hover:border-[#f3b4c0]">
                    <IconTile tone="pink"><Bell className="size-7" /></IconTile>
                    <span className="min-w-0"><span className="block text-[13.5px] font-medium text-body">Thông báo chưa đọc</span><span className="block text-[28px] font-extrabold leading-tight text-ink">{d.kpi.unread}</span><span className="block text-[12px] text-muted">Tại trường này</span></span>
                  </Link>
                </div>

                <Card>
                  <CardHeader title="Lớp phụ trách" icon={<Users className="size-5 text-primary" />} action={<CardLink href={`/teacher/${schoolId}/classes`}>Quản lý lớp</CardLink>} />
                  <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
                    {d.classes.map((c) => {
                      const periodSlot = !c.isHomeroom && c.nextLesson ? `?date=${d.today}&slot=lesson-${c.nextLesson.id}` : "";
                      const showAttend = can(c.id, "attendance.record") && (c.isHomeroom || !!c.nextLesson?.canAttend);
                      return (
                        <div key={c.id} className="rounded-2xl border border-line bg-white p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-12 flex-none items-end justify-center overflow-hidden rounded-xl bg-[#eaf3ff]" aria-hidden><img src="/assets/illustrations/students-duo.png" alt="" className="h-[90%] w-auto" /></span>
                            <p className="text-[22px] font-extrabold text-ink">{c.name}</p>
                            <Badge tone="info" dot={false}>{c.isHomeroom ? "Chủ nhiệm" : c.subjects.join(", ")}</Badge>
                            <Link href={base(c)} className="ml-auto rounded-full p-1.5 text-muted hover:bg-primary-light hover:text-primary" aria-label={`Mở lớp ${c.name}`}><ChevronRight className="size-5" /></Link>
                          </div>
                          <dl className="mt-3 space-y-1.5 text-[13.5px]">
                            <div className="flex gap-2"><dt className="flex w-[132px] flex-none items-center gap-2 text-muted"><Users className="size-4" aria-hidden />Sĩ số</dt><dd className="font-semibold text-ink">{c.size === null ? "Chưa có quyền xem" : `${c.size} học sinh`}</dd></div>
                            <div className="flex gap-2"><dt className="flex w-[132px] flex-none items-center gap-2 text-muted"><BookOpen className="size-4" aria-hidden />Tiết học tiếp theo</dt><dd className="font-semibold text-ink">{c.nextLesson ? `${c.nextLesson.subject}${c.nextLesson.period === null ? "" : ` – Tiết ${c.nextLesson.period}`} (${c.nextLesson.start} – ${c.nextLesson.end})` : "Không có tiết của bạn hôm nay"}</dd></div>
                            <div className="flex gap-2"><dt className="flex w-[132px] flex-none items-center gap-2 text-muted"><MapPin className="size-4" aria-hidden />Phòng học</dt><dd className="font-semibold text-ink">{c.nextLesson?.room ?? c.room ?? "Chưa có phòng"}</dd></div>
                          </dl>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {can(c.id, "roster.view") && <ButtonLink href={`${base(c)}/students`} size="sm" variant="primary" icon={<Users className="size-4" />}>Xem danh sách</ButtonLink>}
                            {showAttend && <ButtonLink href={`${base(c)}/attendance${periodSlot}`} size="sm" icon={<CalendarCheck className="size-4" />}>Điểm danh</ButtonLink>}
                            {can(c.id, "announcement.class") && <ButtonLink href={`${base(c)}/announcements`} size="sm" icon={<Megaphone className="size-4" />}>Thông báo lớp</ButtonLink>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              <div className="min-w-0 space-y-5">
                <Card>
                  <CardHeader title="Hoạt động gần đây" icon={<Clock className="size-5 text-primary" />} />
                  {d.feed.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa có hoạt động.</p> : (
                    <ul className="space-y-3.5 px-5 pb-5">
                      {d.feed.map((e) => {
                        const ic = feedIcon(e.action);
                        return (
                          <li key={e.id} className="flex gap-3">
                            <span className={`icon-tile icon-tile-sm !size-9 flex-none !rounded-full ${ic.tone}`} aria-hidden>{ic.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-medium leading-snug text-ink">{e.action}</p>
                              <p className="truncate text-[12px] text-muted">{e.entityLabel}</p>
                            </div>
                            <p className="flex-none text-right text-[12px] text-muted">{fmtRelative(e.at, demoNowISO())}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
                <MyCalendar schoolId={schoolId} today={d.today} />
              </div>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function MyCalendar({ schoolId, today }: { schoolId: string; today: string }) {
  const [day, setDay] = useState(today);
  const monday = mondayOf(day);
  const q = useRepo(["teacher-schedule", schoolId, monday], (ctx) => classroomRepo.teacherSchedule(ctx, schoolId, monday));
  const lessons = q.data?.days.find((x) => x.date === day);
  const marked = new Set(q.data?.days.filter((x) => x.lessons.length).map((x) => x.date));
  return (
    <Card>
      <CardHeader title="Lịch của tôi" icon={<CalendarDays className="size-5 text-primary" />} action={<CardLink href={`/teacher/${schoolId}/schedule?week=${monday}`}>Xem lịch dạy</CardLink>} />
      <div className="flex justify-center px-4"><MiniCalendar value={day} onSelect={setDay} marked={marked} /></div>
      <div className="m-4 rounded-xl bg-[#f3f8ff] p-3">
        <p className="mb-2 flex items-center justify-between text-[13.5px] font-semibold text-primary-strong">{day === today ? "Hôm nay – " : ""}{fmtDateLong(day)}</p>
        {q.isLoading ? <Skeleton className="h-16" /> : q.isError ? <p role="alert" className="text-[13px] text-danger-text">{errorMessage(q.error)}</p> : !lessons || lessons.lessons.length === 0 ? (
          <p className="text-[13px] text-muted">{lessons?.holiday ? `Nghỉ: ${lessons.holiday}` : "Không có tiết dạy trong ngày."}</p>
        ) : (
          <ul className="space-y-1.5">
            {lessons.lessons.map((l) => (
              <li key={l.id} className="flex items-center gap-2 border-l-2 border-primary pl-2 text-[13px]">
                <span className="tabular-nums text-body">{l.start} – {l.end}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.subject} – {l.className}{l.cancelled ? " (nghỉ)" : ""}</span>
                <span className="flex flex-none items-center gap-1 text-muted"><MapPin className="size-3.5" aria-hidden />{l.room ?? "Chưa có phòng"}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/teacher/${schoolId}/schedule?week=${monday}`} className="card-link mt-2">Lịch tuần {fmtDate(monday)} <ArrowRight className="size-3.5" aria-hidden /></Link>
      </div>
    </Card>
  );
}
