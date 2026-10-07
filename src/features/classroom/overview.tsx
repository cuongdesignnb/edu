"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import {
  Archive, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, ClipboardCheck, FileBarChart, FileImage, LayoutGrid, Link2,
  Megaphone, MessageCircle, QrCode, Scale, Star, Sun, Trophy, Users, UserCheck,
} from "lucide-react";
import { announcementsRepo, classroomRepo } from "@/lib/repositories";
import { CLASS_OVERVIEW_TASKS } from "@/lib/repositories/connected/classroom-overview";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateLong, fmtPercent } from "@/lib/formatters";
import { useNotebookTasks } from "@/features/notebook/quick-status";
import { useClassroom, ClassHeader, ClassStats, HomeroomCard } from "./context";
import { Card, CardHeader, CardLink, IconTile, type PastelTone } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DonutProgress, ProgressBar } from "@/components/ui/progress";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

type Overview = Awaited<ReturnType<typeof classroomRepo.overview>>;
type TaskKind = keyof typeof CLASS_OVERVIEW_TASKS;

const HISTORY_LINKS = { reports: "Báo cáo lớp", "attendance/weekly": "Điểm danh theo tuần", conduct: "Điểm nề nếp các tuần", timetable: "Thời khóa biểu", groups: "Tổ & chức vụ", activities: "Hoạt động lớp" };
const restricted = <p className="px-5 pb-5 text-sm text-muted">Không có quyền xem phần này.</p>;

/** One verb per task so the teacher knows exactly what the button does. */
const TASK_UI: Record<TaskKind, { verb: string; icon: ReactNode; tone: PastelTone }> = {
  attendance: { verb: "Điểm danh", icon: <CalendarCheck className="size-5" />, tone: "pink" },
  "attendance-finish": { verb: "Hoàn tất", icon: <CalendarCheck className="size-5" />, tone: "amber" },
  "attendance-publish": { verb: "Công bố", icon: <Megaphone className="size-5" />, tone: "amber" },
  "lesson-attendance": { verb: "Điểm danh", icon: <CalendarDays className="size-5" />, tone: "blue" },
  "conduct-review": { verb: "Rà soát", icon: <ClipboardCheck className="size-5" />, tone: "amber" },
  "conduct-lock": { verb: "Chốt tuần", icon: <Star className="size-5" />, tone: "pink" },
  evidence: { verb: "Duyệt", icon: <FileImage className="size-5" />, tone: "blue" },
  adjustment: { verb: "Duyệt", icon: <Scale className="size-5" />, tone: "amber" },
  "adjustment-publish": { verb: "Công bố", icon: <Megaphone className="size-5" />, tone: "amber" },
  groups: { verb: "Xếp tổ", icon: <LayoutGrid className="size-5" />, tone: "neutral" },
};
const STATUS_TONE = { danger: "danger", warning: "warning", info: "info", neutral: "neutral" } as const;

/** CL01 — class overview: what to do today first, then today's schedule, shortcuts and key figures. */
export function ClassOverview() {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["class-overview", schoolId, yearId, classId], (ctx) => classroomRepo.overview(ctx, schoolId, yearId, classId), { schoolId });
  const d = q.error ? undefined : q.data;
  return (
    <div className="page">
      <ClassHeader />
      <div className="grid gap-5 lg:grid-cols-2 desk:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {q.isLoading ? <Card className="card-pad space-y-3" aria-busy="true"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-16" /><Skeleton className="h-16" /></Card>
            : q.error ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
            : d && (d.isCurrent ? <TodayTasks d={d} /> : <HistoryCard d={d} />)}
          <QuickActions />
          <ClassStats />
        </div>
        <div className="min-w-0 space-y-5">
          {d?.isCurrent && <TodayLessons d={d} />}
          {d?.isCurrent && <MorningAttendance d={d} />}
          {d && <Activities d={d} />}
        </div>
        <div className="grid min-w-0 content-start gap-5 lg:col-span-2 lg:grid-cols-2 desk:col-span-1 desk:grid-cols-1">
          <HomeroomCard />
          <ParentLinks />
          {d && <Groups d={d} />}
          <RecentAnnouncements />
        </div>
      </div>
    </div>
  );
}

function TodayTasks({ d }: { d: Overview }) {
  const { base } = useClassroom();
  const extra = useNotebookTasks();
  const count = (d.tasks?.length ?? 0) + extra.length;
  return (
    <Card data-testid="class-overview-tasks" data-tour="class-tasks">
      <CardHeader title="Việc cần làm hôm nay" icon={<Sun className="size-6 !text-warning" />} subtitle={fmtDateLong(d.today)}
        action={count > 0 ? <Badge tone="warning">{count} việc</Badge> : undefined} />
      {d.tasks === null ? restricted : count === 0 ? (
        <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không có việc chờ xử lý trong phạm vi được cấp" description="Các nguồn có quyền xử lý sẽ hiện ở đây khi phát sinh công việc." />
      ) : (
        <ul className="space-y-2.5 px-5 pb-5">
          {d.tasks.map((t) => {
            const meta = CLASS_OVERVIEW_TASKS[t.kind], ui = TASK_UI[t.kind];
            return <TaskRow key={t.kind} icon={ui.icon} tone={ui.tone} title={meta.label} detail={`${t.count} ${meta.unit}`} status={<Badge tone={STATUS_TONE[meta.tone]}>{meta.status}</Badge>} href={`${base}${meta.path}`} verb={ui.verb} />;
          })}
          {extra.map((t) => <TaskRow key={t.kind} icon={t.kind === "officers" ? <UserCheck className="size-5" /> : <Trophy className="size-5" />} tone={t.kind === "officers" ? "purple" : "green"} title={t.label} detail={t.detail} href={`${base}${t.path}`} verb={t.verb} />)}
        </ul>
      )}
    </Card>
  );
}

function TaskRow({ icon, tone, title, detail, status, href, verb }: { icon: ReactNode; tone: PastelTone; title: string; detail: string; status?: ReactNode; href: string; verb: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#fbfdff] p-3">
      <IconTile tone={tone} size="sm">{icon}</IconTile>
      <div className="min-w-0 flex-[1_1_180px]">
        <p className="font-semibold leading-snug text-ink">{title}</p>
        <p className="text-[13px] text-muted">{detail}</p>
        {status && <p className="mt-1">{status}</p>}
      </div>
      <ButtonLink href={href} size="sm" variant="secondary" className="max-sm:w-full" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>{verb}</ButtonLink>
    </li>
  );
}

function HistoryCard({ d }: { d: Overview }) {
  const { base } = useClassroom();
  return (
    <Card>
      <CardHeader title={d.readOnly ? "Năm học hoặc lớp đã lưu trữ" : "Không trong thời gian học hiện tại"} icon={<Archive className="size-5" />} subtitle="Không hiển thị việc cần làm, lịch học hay điểm danh của ngày hiện tại cho phạm vi này." />
      <div className="flex flex-wrap gap-2 px-5 pb-5">{d.navigation.map((path) => <ButtonLink key={path} href={`${base}/${path}`} size="sm" variant="secondary">{HISTORY_LINKS[path]}</ButtonLink>)}</div>
    </Card>
  );
}

/** Shortcuts to the most frequent daily jobs; each appears only when the class grants it. */
function QuickActions() {
  const { header: h, base, can, readOnly } = useClassroom();
  const tab = (k: string) => h.tabs.some((t) => t.key === k);
  const all: { show: boolean; write?: boolean; label: string; href: string; icon: ReactNode; tone: PastelTone }[] = [
    { show: tab("attendance") && can("attendance.record"), write: true, label: "Điểm danh", href: "/attendance", icon: <CalendarCheck />, tone: "green" },
    { show: tab("conduct") && can("conduct.record"), write: true, label: "Ghi rèn luyện", href: "/conduct", icon: <Star />, tone: "blue" },
    { show: tab("announcements") && can("announcement.class"), write: true, label: "Soạn thông báo", href: "/announcements/new", icon: <Megaphone />, tone: "pink" },
    { show: tab("activities") && can("activity.manage"), write: true, label: "Tạo hoạt động", href: "/activities/new", icon: <Trophy />, tone: "amber" },
    { show: tab("students"), label: "Danh sách học sinh", href: "/students", icon: <Users />, tone: "purple" },
    { show: tab("timetable"), label: "Thời khóa biểu", href: "/timetable", icon: <CalendarDays />, tone: "blue" },
    { show: tab("reports"), label: "Xuất báo cáo", href: "/reports", icon: <FileBarChart />, tone: "blue" },
    { show: tab("public-portal"), label: "Mã QR phụ huynh", href: "/public-portal", icon: <QrCode />, tone: "green" },
    { show: tab("reports") && can("guardian.view"), label: "Tin nhắn Zalo", href: "/reports/zalo", icon: <MessageCircle />, tone: "blue" },
  ];
  const items = all.filter((a) => a.show && !(readOnly && a.write)).slice(0, 6);
  if (!items.length) return null;
  return (
    <Card className="@container" data-tour="class-quick">
      <CardHeader title="Thao tác nhanh" />
      <ul className="grid grid-cols-2 gap-3 px-5 pb-5 @sm:grid-cols-3">
        {items.map((a) => (
          <li key={a.href}>
            <Link href={`${base}${a.href}`} className={clsx("flex h-full min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-transparent px-2 py-3 text-center text-[13.5px] font-semibold text-ink transition-colors hover:border-[#b9d6f7] focus-visible:border-primary", `tone-${a.tone}`)}>
              <span aria-hidden className="[&>svg]:size-6">{a.icon}</span>
              <span className="leading-tight text-ink">{a.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TodayLessons({ d }: { d: Overview }) {
  const { base } = useClassroom();
  return (
    <Card data-testid="class-overview-lessons">
      <CardHeader title="Lịch học hôm nay" icon={<CalendarDays className="size-5" />} action={d.navigation.includes("timetable") ? <CardLink href={`${base}/timetable`}>Xem thời khóa biểu</CardLink> : undefined} />
      {d.lessons === null ? restricted : d.lessons.length === 0 ? <EmptyState compact title="Không có tiết học đã công bố trong phạm vi được cấp hôm nay" /> : (
        <ol className="px-5 pb-5">
          {d.lessons.map((l, i) => {
            const cancelled = l.status === "CANCELLED";
            return (
              <li key={l.id} className="relative grid grid-cols-[18px_108px_minmax(0,1fr)] gap-x-2 pb-4 last:pb-0">
                {i < d.lessons!.length - 1 && <span className="absolute bottom-0 left-[5px] top-3 w-0.5 bg-[#d6e8ff]" aria-hidden />}
                <span className={clsx("relative mt-1.5 size-3 rounded-full ring-4 ring-white", cancelled ? "bg-faint" : "bg-primary")} aria-hidden />
                <span className={clsx("whitespace-nowrap pt-0.5 text-[13px] font-semibold tabular-nums", cancelled ? "text-muted line-through" : "text-ink")}>{l.startsAtLocal} – {l.endsAtLocal}</span>
                <div className="min-w-0">
                  <p className={clsx("font-semibold text-ink", cancelled && "line-through decoration-faint")}>
                    {l.subjectName}
                    {cancelled ? <Badge tone="neutral" className="ml-2 align-middle">Đã hủy</Badge> : l.changeReason ? <Badge tone="warning" className="ml-2 align-middle">Thay đổi</Badge> : null}
                  </p>
                  <p className="text-[12.5px] text-muted"><span>{l.periodNumber ? `Tiết ${l.periodNumber}` : "Chưa ghi số tiết"}</span> · <span>{l.roomName ?? "Chưa ghi phòng"}</span> · <span>{l.teacherName ?? "Chưa có tên công tác"}</span></p>
                  {l.changeReason && <p className="mt-0.5 text-xs text-warning-text">{l.changeReason}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function MorningAttendance({ d }: { d: Overview }) {
  const { base } = useClassroom();
  const a = d.attendance, c = a?.counts;
  const label = a?.session?.status === "PUBLISHED" ? "Đã công bố" : a?.session?.status === "LOCKED" ? "Đã chốt" : a?.session ? "Đang ghi nhận" : a?.calendarState === "HOLIDAY" ? "Ngày nghỉ theo lịch trường" : "Chưa tạo buổi điểm danh";
  return (
    <Card data-testid="class-overview-attendance">
      <CardHeader title="Điểm danh buổi sáng" icon={<CalendarCheck className="size-5" />} action={d.canRecordMorning ? <CardLink href={`${base}/attendance`}>Mở điểm danh</CardLink> : undefined} />
      {a === null ? restricted : c === null || c === undefined ? (
        <div className="px-5 pb-5"><Badge tone="neutral">{label}</Badge><p className="mt-2 text-sm text-muted">Chưa có buổi điểm danh sáng cho ngày nghỉ này.</p></div>
      ) : (
        <div className="flex flex-wrap items-center gap-5 px-5 pb-5">
          <DonutProgress value={c.present + c.late} total={c.total} label={`Hiện diện ${c.present + c.late}/${c.total}`} color="var(--color-success)">
            <span className="text-2xl font-extrabold text-ink">{c.present + c.late}/{c.total}</span><span className="text-[11px] text-muted">hiện diện</span>
          </DonutProgress>
          <ul className="min-w-[170px] flex-1 space-y-1.5 text-[13.5px]">
            {([["Có mặt đúng giờ", c.present, "bg-success"], ["Đi muộn", c.late, "bg-warning"], ["Nghỉ có phép", c.excused, "bg-primary"], ["Nghỉ không phép", c.unexcused, "bg-danger"], ["Chưa điểm danh", c.unmarked, "bg-faint"]] as const).map(([text, value, color]) => (
              <li key={text} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${color}`} aria-hidden /><span className="text-body">{text}</span><span className="ml-auto font-semibold tabular-nums text-ink">{value}</span></li>
            ))}
            <li className="pt-1"><Badge tone={a.session?.status === "PUBLISHED" ? "success" : "neutral"} className="!whitespace-normal">{label}</Badge>{a.calendarState === "HOLIDAY" && a.session && <p className="mt-2 text-xs text-muted">Ngày đã được đánh dấu nghỉ; hiển thị buổi đã tồn tại.</p>}</li>
          </ul>
        </div>
      )}
    </Card>
  );
}

function Activities({ d }: { d: Overview }) {
  const { base } = useClassroom();
  return (
    <Card data-testid="class-overview-activities">
      <CardHeader title={d.isCurrent ? "Hoạt động đang diễn ra" : "Hoạt động trong năm học"} icon={<Trophy className="size-5" />} action={d.navigation.includes("activities") ? <CardLink href={`${base}/activities`} /> : undefined} />
      {d.activities === null ? restricted : (
        <ul className="space-y-4 px-5 pb-5">
          {d.activities.items.length === 0 && <li className="text-sm text-muted">Chưa có hoạt động đang giao trong phạm vi được cấp.</li>}
          {d.activities.items.map((activity) => (
            <li key={activity.id}>
              <Link href={`${base}/activities/${activity.id}`} className="group block rounded-xl border border-line p-3 hover:border-[#b9d6f7]">
                <ProgressBar value={activity.done} total={activity.total} ariaLabel={`Tiến độ ${activity.title}`} label={<span className="font-semibold text-ink group-hover:underline">{activity.title}</span>} color="var(--color-purple)" />
                <p className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[12px] text-muted"><span>{activity.done}/{activity.total} học sinh được giao đã duyệt</span><span>Hạn {fmtDate(activity.dueDate)}</span></p>
              </Link>
            </li>
          ))}
          {d.activities.hasMore && <li className="text-sm text-muted">Hiển thị {d.activities.items.length}/{d.activities.total} hoạt động. <Link className="card-link" href={`${base}/activities`}>Xem tất cả</Link></li>}
        </ul>
      )}
      {d.navigation.includes("reports") && <div className="px-5 pb-4"><Link href={`${base}/reports`} className="card-link">Báo cáo lớp <ArrowRight className="size-3.5" /></Link></div>}
    </Card>
  );
}

function Groups({ d }: { d: Overview }) {
  const { base } = useClassroom();
  return (
    <Card data-testid="class-overview-groups">
      <CardHeader title="Tổ của lớp" icon={<LayoutGrid className="size-5" />} action={d.navigation.includes("groups") ? <CardLink href={`${base}/groups`}>Tổ & chức vụ</CardLink> : undefined} />
      {d.groups === null ? restricted : (
        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          {d.groups.items.map((g) => <div key={g.id} className="rounded-xl border border-line bg-[#f7fbff] p-3"><p className="font-bold text-primary-strong">{g.name}</p><p className="text-[13px] text-muted">{g.size} học sinh</p></div>)}
          {d.groups.items.length === 0 && <p className="col-span-2 text-sm text-muted">Chưa tạo tổ cho lớp.</p>}
          {d.groups.noGroup > 0 && <p className="col-span-2 text-[13px] text-warning-text">{d.groups.noGroup} học sinh chưa phân tổ</p>}
        </div>
      )}
    </Card>
  );
}

/** Lookup-link coverage (from the header summary) with the two places a teacher acts on it. */
function ParentLinks() {
  const { header: h, base } = useClassroom();
  const links = h.summary.links;
  if (!links) return null;
  const tab = (k: string) => h.tabs.some((t) => t.key === k);
  return (
    <section className="card card-pad" aria-labelledby="class-links-title">
      <h2 id="class-links-title" className="flex items-center gap-2 text-[16px] font-bold text-ink"><Link2 className="size-5 text-primary" aria-hidden />Liên kết phụ huynh</h2>
      <div className="mt-3 flex items-center gap-3">
        <IconTile tone="green" size="sm"><Users className="size-5" /></IconTile>
        <div>
          <p className="text-[24px] font-extrabold leading-none text-ink">{links.studentsWithLink}{h.size !== null && <span className="text-base font-semibold text-muted"> / {h.size}</span>}</p>
          <p className="text-[13px] text-muted">Học sinh có link tra cứu</p>
        </div>
      </div>
      {h.size !== null && <ProgressBar className="mt-3" value={links.studentsWithLink} total={h.size} ariaLabel="Tỉ lệ học sinh có link tra cứu" color="var(--color-success)" />}
      <p className="mt-2 text-[12.5px] text-muted">{links.opened} em có link đã được mở{h.size !== null && ` (${fmtPercent(links.opened, h.size)})`}</p>
      {(tab("public-portal") || tab("students")) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tab("public-portal") && <ButtonLink href={`${base}/public-portal`} size="sm" variant="secondary" icon={<QrCode className="size-4" aria-hidden />}>Cổng lớp & mã QR</ButtonLink>}
          {tab("students") && <ButtonLink href={`${base}/students`} size="sm" variant="ghost">Cấp link theo học sinh</ButtonLink>}
        </div>
      )}
    </section>
  );
}

const ANN_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  draft: { label: "Nháp", tone: "neutral" }, scheduled: { label: "Đã đặt lịch", tone: "info" }, published: { label: "Đã công bố", tone: "success" }, withdrawn: { label: "Đã thu hồi", tone: "danger" },
};

/** Latest class + school notices; shares the cache of the Thông báo page. */
function RecentAnnouncements() {
  const { header: h, schoolId, yearId, classId, base, readOnly } = useClassroom();
  const allowed = h.nativeActions.includes("announcement.read") && h.tabs.some((t) => t.key === "announcements");
  const q = useRepo(["class-announcements", schoolId, yearId, classId], (ctx) => announcementsRepo.classList(ctx, schoolId, yearId, classId), { enabled: allowed });
  if (!allowed) return null;
  const when = (a: { publishedAt?: string; scheduledAt?: string; updatedAt: string }) => a.publishedAt ?? a.scheduledAt ?? a.updatedAt;
  const items = q.data ? [...q.data.own.map((a) => ({ a, school: false })), ...q.data.fromSchool.map((a) => ({ a, school: true }))].sort((x, y) => when(y.a).localeCompare(when(x.a))).slice(0, 4) : [];
  return (
    <Card>
      <CardHeader title="Thông báo gần đây" icon={<Megaphone className="size-5" />} action={<CardLink href={`${base}/announcements`} />} />
      {q.isLoading ? <div className="space-y-2 px-5 pb-5" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        : q.error ? <div className="px-5 pb-5"><ErrorState compact error={q.error} onRetry={() => q.refetch()} /></div>
        : items.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa có thông báo nào cho lớp.</p>
        : (
          <ul className="divide-y divide-line px-5 pb-3">
            {items.map(({ a, school }) => (
              <li key={a.id} className="py-2.5">
                <Link href={`${base}/announcements/${a.id}`} className="font-semibold text-ink hover:text-primary-strong hover:underline">{a.title}</Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span>{fmtDate(when(a))}</span>
                  {school ? <Badge tone="purple" dot={false}>Từ nhà trường</Badge> : <Badge tone={ANN_STATUS[a.status]?.tone ?? "neutral"}>{ANN_STATUS[a.status]?.label ?? a.status}</Badge>}
                </p>
              </li>
            ))}
          </ul>
        )}
      {!readOnly && q.data?.canCompose && <div className="px-5 pb-5"><ButtonLink href={`${base}/announcements/new`} size="sm" variant="primary" icon={<Megaphone className="size-4" aria-hidden />}>Soạn thông báo</ButtonLink></div>}
    </Card>
  );
}

