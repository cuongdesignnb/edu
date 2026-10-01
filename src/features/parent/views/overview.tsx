"use client";
import Link from "next/link";
import { clsx } from "clsx";
import { Lock, Users, GraduationCap, School, Phone, Mail, Clock3, Award, CheckCircle2, MinusCircle, Megaphone, CalendarDays, AlertTriangle, ChevronRight, Quote } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { useParent } from "@/features/parent/shell";
import { Card, CardHeader, CardLink } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DonutProgress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { NavIcon } from "@/components/layout/icons";
import { fmtDate, fmtDateLong, fmtDateTime, fmtPercent, fmtPoints, submissionStatus } from "@/lib/formatters";
import { PState, usePRead, useHref, GRADE_TONE } from "./common";

type Overview = Awaited<ReturnType<typeof parentRepo.overview>>;

const TINT = {
  blue: "bg-gradient-to-r from-[#eaf3ff] to-white",
  green: "bg-gradient-to-r from-[#e6f7f0] to-white",
  amber: "bg-gradient-to-r from-[#fff3dc] to-white",
  purple: "bg-gradient-to-r from-[#f1ecff] to-white",
  pink: "bg-gradient-to-r from-[#fdecec] to-white",
} as const;

function TintHeader({ tone, icon, title, href, linkLabel = "Xem chi tiết" }: { tone: keyof typeof TINT; icon: React.ReactNode; title: string; href?: string; linkLabel?: string }) {
  return <CardHeader className={clsx("rounded-t-[14px] border-b border-line !py-3", TINT[tone])} icon={icon} title={title} action={href && <CardLink href={href}>{linkLabel}</CardLink>} />;
}

/** PA02 — Thông tin của con (R10). */
export function ParentOverviewView() {
  const p = useParent();
  const ctx = p.context;
  const q = usePRead(["overview"], (k, s) => parentRepo.overview(k, s));
  const has = (m: string) => p.modules.includes(m as never);
  const href = useHref();
  const top = ["teachers", "attendance", "conduct"].filter(has).length;

  const notice = (
    <div className="flex items-start gap-3 rounded-2xl border border-[#cfe3fb] bg-[#eef6ff] px-4 py-3">
      <span className="icon-tile icon-tile-sm tone-blue !rounded-full"><Lock className="size-5" aria-hidden /></span>
      <div className="min-w-0 text-[13px]">
        <p className="font-semibold text-primary-strong">Trang thông tin chỉ xem, không yêu cầu đăng ký / đăng nhập</p>
        <p className="text-muted">Mọi thông tin được cung cấp qua liên kết riêng từ nhà trường.</p>
      </div>
    </div>
  );

  return (
    <div className="@container flex min-w-0 flex-col gap-4 lg:gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 className="page-title">Thông tin của con</h1>
          <p className="page-subtitle mt-1">Cập nhật tình hình học tập, rèn luyện và hoạt động tại trường</p>
        </div>
        <div className="hidden flex-[0_1_500px] md:block">{notice}</div>
      </div>

      {/* Student card */}
      <Card className="card-pad">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
          <div className="flex items-start gap-4 sm:contents">
            <Avatar name={ctx.student.fullName} tone={ctx.student.avatarTone} square size={72} className="sm:!size-[150px] sm:!text-[46px] !rounded-2xl" />
            <div className="min-w-0 flex-1 sm:hidden">
              <p className="text-[19px] font-bold text-ink">{ctx.student.fullName}</p>
              <p className="text-[13px] text-muted">Lớp {ctx.className}</p>
              <PublishState at={ctx.lastPublishedAt??undefined} compact />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="hidden flex-wrap items-start gap-4 sm:flex">
              <div className="min-w-0 flex-1">
                <p className="text-[26px] font-bold leading-tight text-ink">{ctx.student.fullName}</p>
                <p className="mt-1 text-[15px] text-body">Lớp {ctx.className}<span className="mx-3 text-line-strong" aria-hidden>|</span>{ctx.school.name}</p>
                {ctx.school.motto && <p className="quote mt-2 !text-[15px]"><Quote className="mr-1 inline size-4 -translate-y-0.5 rotate-180 opacity-50" aria-hidden />{ctx.school.motto}</p>}
              </div>
              <PublishState at={ctx.lastPublishedAt??undefined} />
            </div>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <Tile icon={<Users className="size-6" />} label="Học sinh" value={`Lớp ${ctx.className}`} className="hidden sm:flex" />
              <Tile icon={<GraduationCap className="size-6" />} label="Năm học" value={ctx.yearLabel} />
              <Tile icon={<School className="size-6" />} label="Trường" value={ctx.school.shortName??ctx.school.name} />
            </dl>
          </div>
        </div>
      </Card>

      <div className="md:hidden">{notice}</div>

      <PState query={q}>
        {(d) => (
          <>
            <div className={clsx("grid grid-cols-1 gap-4", top >= 2 && "@2xl:grid-cols-2", top === 3 && "@5xl:grid-cols-3")}>
              {has("teachers") && <TeacherCard d={d} href={href("teachers")} />}
              {has("attendance") && <AttendanceCard d={d} href={href("attendance")} />}
              {has("conduct") && <ConductCard d={d} href={href("conduct")} detailHref={(id) => href(`conduct/${id}`)} wide={top === 3} />}
            </div>
            <div className={clsx("grid grid-cols-1 gap-4", has("timetable") && has("announcements") && "@4xl:grid-cols-[1.12fr_1fr]")}>
              {has("timetable") && <TodayCard d={d} href={href("timetable")} />}
              {has("announcements") && <AnnouncementsCard d={d} href={href("announcements")} itemHref={(id) => href(`announcements/${id}`)} />}
            </div>
            {(has("duties") || has("activities")) && (
              <div className={clsx("grid grid-cols-1 gap-4", has("duties") && has("activities") && "@2xl:grid-cols-2")}>
                {has("duties") && (
                  <Card>
                    <TintHeader tone="green" icon={<NavIcon name="broom" className="size-5" />} title="Trực nhật sắp tới của con" href={href("duties")} />
                    {d.duties.length ? (
                      <ul className="divide-y divide-line px-5 py-2">
                        {d.duties.map((x) => <li key={x.date + x.task} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="font-medium text-ink">{x.task}</span><span className="flex-none text-muted">{fmtDateLong(x.date)}</span></li>)}
                      </ul>
                    ) : <EmptyState compact title="Chưa có lịch trực nhật sắp tới" description="Lịch trực nhật của con sẽ hiện khi giáo viên công bố." />}
                  </Card>
                )}
                {has("activities") && (
                  <Card>
                    <TintHeader tone="purple" icon={<NavIcon name="users" className="size-5" />} title="Hoạt động của con" href={href("activities")} />
                    {d.activities.length ? (
                      <ul className="divide-y divide-line px-5 py-2">
                        {d.activities.slice(0, 3).map((a) => (
                          <li key={a.id}>
                            <Link href={href(`activities/${a.id}`)} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary-strong">
                              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{a.title}</span><span className="text-[12.5px] text-muted">Hạn {fmtDate(a.dueDate)}</span></span>
                              <Badge tone={submissionStatus[a.status as keyof typeof submissionStatus]?.tone ?? "neutral"}>{submissionStatus[a.status as keyof typeof submissionStatus]?.label ?? a.status}</Badge>
                              <ChevronRight className="size-4 flex-none text-faint" aria-hidden />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : <EmptyState compact title="Chưa có hoạt động được chia sẻ" />}
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </PState>
    </div>
  );
}

function PublishState({ at, compact }: { at?: string; compact?: boolean }) {
  return (
    <div className={clsx("flex-none", compact ? "mt-1.5 flex flex-wrap items-center gap-2" : "text-right")}>
      {at ? <Badge tone="success" icon={<CheckCircle2 className="size-4" aria-hidden />} className={compact ? undefined : "!px-3 !py-1.5 !text-[13.5px]"}>Đã công bố</Badge> : <Badge tone="neutral">Chưa công bố</Badge>}
      {!compact && <p className="mt-3 text-[12.5px] text-muted">Cập nhật gần nhất</p>}
      <p className={clsx("text-muted", compact ? "text-[12px]" : "text-[13px] font-medium text-body")}>{compact && "Cập nhật "}{at ? fmtDateTime(at) : "Chưa có dữ liệu công bố"}</p>
    </div>
  );
}

function Tile({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    // Only <dt>/<dd> may sit directly in a <dl> group, so the icon lives inside <dt> (absolutely placed).
    <div className={clsx("relative flex min-w-0 flex-col justify-center rounded-xl border border-line bg-[#f7fbff] py-2.5 pl-11 pr-3 sm:py-3 sm:pl-12 sm:pr-4", className)}>
      <dt className="text-[12px] text-muted"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary sm:left-4" aria-hidden>{icon}</span>{label}</dt>
      <dd className="min-w-0 text-[13.5px] font-bold leading-snug text-ink sm:truncate sm:text-[15px]">{value}</dd>
    </div>
  );
}

function TeacherCard({ d, href }: { d: Overview; href: string }) {
  const t = d.teacher;
  return (
    <Card>
      <TintHeader tone="blue" icon={<Users className="size-5" />} title="Thông tin giáo viên" href={href} />
      {t ? (
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            <Avatar name={t.name} tone={t.tone} square size={76} className="!rounded-xl" />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-ink">{t.name}</p>
              <p className="text-[13px] text-muted">{t.role}</p>
              {t.phone && <p className="mt-2 flex items-center gap-2 text-body"><Phone className="size-4 text-primary" aria-hidden /><a href={`tel:${t.phone.replace(/\s/g, "")}`} className="hover:underline">{t.phone}</a></p>}
              {t.email && <p className="mt-1 flex min-w-0 items-center gap-2 text-body"><Mail className="size-4 flex-none text-primary" aria-hidden /><a href={`mailto:${t.email}`} className="truncate hover:underline">{t.email}</a></p>}
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f3f8ff] px-3 py-2.5 text-[13px] text-body">
            <Clock3 className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
            <p>Thời gian liên hệ công việc: <span className="font-medium text-ink">{t.contactHours ?? "Theo lịch của nhà trường"}</span>{!t.phone && !t.email && <> · Nhà trường chưa chia sẻ số điện thoại/email giáo viên, vui lòng liên hệ văn phòng trường.</>}</p>
          </div>
        </div>
      ) : <EmptyState compact title="Chưa có thông tin giáo viên chủ nhiệm" />}
    </Card>
  );
}

function AttendanceCard({ d, href }: { d: Overview; href: string }) {
  const a = d.attendanceWeek;
  const rows = a ? [["Có mặt", a.present, "#0e9f6e"], ["Nghỉ có phép", a.excused, "#0a72e6"], ["Nghỉ không phép", a.unexcused, "#e5484d"], ["Đi muộn", a.late, "#f59e0b"]] as const : [];
  const attended = a ? a.present + a.late : 0;
  return (
    <Card>
      <TintHeader tone="green" icon={<NavIcon name="calendarCheck" className="size-5" />} title="Điểm danh tuần này" href={href} />
      {a && a.published > 0 ? (
        <div className="flex items-center gap-5 px-5 py-4">
          <DonutProgress value={attended} total={a.published} size={116} stroke={11} color="var(--color-success)" label={`Có mặt ${attended}/${a.published} buổi đã công bố`}>
            <span className="text-[24px] font-bold text-ink">{attended}/{a.published}</span><span className="text-[11.5px] text-muted">Buổi đã công bố</span>
          </DonutProgress>
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="text-muted">Tỷ lệ chuyên cần</p>
            <p className="text-[24px] font-bold text-ink">{fmtPercent(attended, a.published)}</p>
            <ul className="mt-2 space-y-1.5">
              {rows.map(([l, v, c]) => <li key={l} className="flex items-center gap-2"><span className="size-2.5 flex-none rounded-full" style={{ background: c }} aria-hidden /><span className="flex-1 text-body">{l}</span><span className="font-semibold tabular-nums text-ink">{v}</span></li>)}
            </ul>
          </div>
        </div>
      ) : (
        <EmptyState compact icon={<CalendarDays className="size-6" />} title="Chưa có dữ liệu công bố tuần này" description={<>Điểm danh chỉ hiển thị sau khi giáo viên công bố. Chưa công bố không có nghĩa là vắng hay có mặt. <Link href={href} className="font-semibold text-primary-strong hover:underline">Xem theo tháng</Link></>} />
      )}
    </Card>
  );
}

function ConductCard({ d, href, detailHref, wide }: { d: Overview; href: string; detailHref: (id: string) => string; wide?: boolean }) {
  const c = d.conduct;
  return (
    <Card className={wide ? "@2xl:col-span-2 @5xl:col-span-1" : undefined}>
      <TintHeader tone="amber" icon={<Award className="size-5 !text-warning" />} title="Thi đua đã công bố" href={href} />
      {c ? (
        <div className="px-5 py-4">
          <div className="flex items-center gap-4">
            <span className="flex size-[72px] flex-none flex-col items-center justify-center rounded-full bg-gradient-to-b from-[#ffd46b] to-[#f59e0b] text-white shadow-[0_4px_12px_rgb(245_158_11/0.35)]" aria-hidden>
              <span className="text-[24px] font-extrabold leading-none">{c.total}</span><span className="text-[10.5px] font-semibold">điểm</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted">Xếp loại thi đua</p>
              <p className="text-[22px] font-bold text-ink">{c.grade}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><Badge tone={GRADE_TONE(c.gradeTone)}>Tuần {c.weekIndex}</Badge>{c.adjusted && <Badge tone="purple">Đã điều chỉnh · bản {c.versionNo}</Badge>}</div>
            </div>
          </div>
          {c.items.length ? (
            <ul className="mt-3 divide-y divide-line text-[13px]">
              {c.items.slice(0, 4).map((i, idx) => (
                <li key={idx} className="flex items-center gap-2 py-1.5">
                  {i.points >= 0 ? <CheckCircle2 className="size-4 flex-none text-success" aria-hidden /> : <MinusCircle className="size-4 flex-none text-danger" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-body">{i.label}</span>
                  <span className={clsx("font-semibold tabular-nums", i.points >= 0 ? "text-success-text" : "text-danger-text")}>{fmtPoints(i.points)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-[13px] text-muted">Không có ghi nhận cộng/trừ được chia sẻ trong tuần này.</p>}
          <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-muted">
            <span>Công bố {fmtDateTime(c.publishedAt)}</span>
            <Link href={detailHref(c.periodId)} className="font-semibold text-primary-strong hover:underline">Chi tiết tuần {c.weekIndex}</Link>
          </div>
          {c.adjusted && <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-purple-text"><AlertTriangle className="mt-0.5 size-3.5 flex-none" aria-hidden />{c.adjustmentNote}</p>}
        </div>
      ) : <EmptyState compact icon={<Award className="size-6" />} title="Chưa có kết quả công bố" description="Kết quả thi đua chỉ hiện sau khi nhà trường công bố. Chưa công bố không phải là 0 điểm." />}
    </Card>
  );
}

function TodayCard({ d, href }: { d: Overview; href: string }) {
  return (
    <Card>
      <TintHeader tone="purple" icon={<NavIcon name="calendar" className="size-5 !text-purple" />} title="Lịch học hôm nay" href={href} />
      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <p className="text-sm font-bold text-ink">{fmtDateLong(d.today)}</p>
        {d.todayLessons.length > 0 && <Badge tone="info" dot={false}>{d.todayLessons.length} tiết học</Badge>}
      </div>
      {d.todayLessons.length ? (
        <div className="table-wrap px-3 pb-3 pt-2">
          <table className="table text-[13px]">
            <thead><tr><th className="center">Tiết</th><th>Thời gian</th><th>Môn học</th><th>Phòng</th><th>Giáo viên</th></tr></thead>
            <tbody>
              {d.todayLessons.map((l) => (
                <tr key={l.period} className={l.cancelled ? "opacity-70" : undefined}>
                  <td className="center">{l.period}</td>
                  <td className="whitespace-nowrap tabular-nums">{l.start} - {l.end}</td>
                  <td className="font-medium text-ink">{l.subject}{l.cancelled && <Badge tone="danger" className="ml-1.5">Nghỉ</Badge>}{!l.cancelled && l.changed && <Badge tone="warning" className="ml-1.5" title={l.changed}>Thay đổi</Badge>}</td>
                  <td>{l.room}</td>
                  <td className="whitespace-nowrap">{l.teacher}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState compact title="Hôm nay con không có tiết học" />}
    </Card>
  );
}

function AnnouncementsCard({ d, href, itemHref }: { d: Overview; href: string; itemHref: (id: string) => string }) {
  return (
    <Card>
      <TintHeader tone="pink" icon={<NavIcon name="bell" className="size-5 !text-danger" />} title="Thông báo mới" href={href} linkLabel="Xem tất cả" />
      {d.announcements.length ? (
        <ul className="divide-y divide-line px-5 py-1">
          {d.announcements.map((a, i) => (
            <li key={a.id}>
              <Link href={itemHref(a.id)} className="group flex items-start gap-3 py-3">
                <span className={clsx("icon-tile icon-tile-sm", ["tone-pink", "tone-blue", "tone-green"][i % 3])} aria-hidden><Megaphone className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3"><span className="font-semibold text-ink group-hover:text-primary-strong">{a.title}</span><span className="flex-none text-[12px] text-muted">{fmtDate(a.publishedAt)}</span></span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{a.summary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="Chưa có thông báo dành cho gia đình" />}
    </Card>
  );
}
