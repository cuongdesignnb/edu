"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3, Bell, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileCheck2, FileText, Heart, History, Megaphone, Plus, Upload, UsersRound, AlarmClock,
  CalendarClock, Edit3, Eye, Lock, PlayCircle, Send,
} from "lucide-react";
import { clsx } from "clsx";
import { activitiesRepo } from "@/lib/repositories";
import { activitiesExtraRepo } from "@/lib/repositories/activities-extra";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtPercent, fmtRelative } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, CardLink } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered, EmptyState, QueryState, Skeleton, ErrorState } from "@/components/ui/states";
import { FileThumb } from "@/components/ui/file";
import { Avatar } from "@/components/ui/avatar";
import { Pagination, useClientList } from "@/components/data/table";
import { ActivityArt, ActivitySectionTabs, activityState, scopeLabel } from "./shared";
import { ActivityStatusConfirm, type StatusIntent } from "./activity-actions";
import { FileViewerDialog, RecordEvidenceDialog, ReviewEvidenceDialog, type ReviewDecision } from "./evidence-dialogs";

type ListData = Awaited<ReturnType<typeof activitiesRepo.list>>;
type Item = ListData["items"][number];
type EvidenceData = Awaited<ReturnType<typeof activitiesRepo.evidence>>;

const STATUS_FILTERS = [
  { value: "active", label: "Đang diễn ra" },
  { value: "due", label: "Đã đến hạn, chưa kết thúc" },
  { value: "draft", label: "Nháp" },
  { value: "closed", label: "Đã kết thúc" },
];

/** CL17 — Hoạt động lớp (R09): activity cards, overview KPIs, recent activity, pending evidence, upcoming announcements. */
export function ActivitiesDashboard() {
  const { schoolId, yearId, classId, base, header, readOnly } = useClassroom();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const list = useRepo(["activities", classId, status, q], (ctx) => activitiesRepo.list(ctx, schoolId, yearId, classId, { status: status || undefined, q }));
  return (
    <div className="page">
      <ClassHeader variant="compact" title="Hoạt động lớp" subtitle={<>Quản lý hoạt động, minh chứng và thông báo của lớp {header.class.name}</>} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ActivitySectionTabs />
        <div className="no-print hidden items-center gap-3 xl:flex" aria-hidden>
          <p className="quote max-w-[340px] text-right !text-[15px] !leading-snug">“Mỗi hoạt động nhỏ là một bước tiến lớn<br />trong hành trình trưởng thành”</p>
          <img src="/assets/illustrations/students-duo.png" alt="" className="h-[84px] w-auto [mask-image:linear-gradient(to_right,transparent,black_18%)]" />
        </div>
      </div>
      <QueryState query={list} skeleton="cards">
        {(d) => <Body d={d} status={status} setStatus={setStatus} q={q} setQ={setQ} base={base} classSize={header.size} readOnly={readOnly} />}
      </QueryState>
    </div>
  );
}

function Body({ d, status, setStatus, q, setQ, base, classSize, readOnly }: { d: ListData; status: string; setStatus: (v: string) => void; q: string; setQ: (v: string) => void; base: string; classSize: number; readOnly: boolean }) {
  const [intent, setIntent] = useState<StatusIntent | null>(null);
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const page = useClientList(d.items, { search: (a) => a.title, pageSize: 3 });
  const canManage = d.canManage && !readOnly;
  const canEvidence = d.canEvidence && !readOnly;
  const menu = (a: Item): MenuItem[] => [
    { label: "Mở chi tiết", icon: <Eye />, href: `${base}/activities/${a.id}` },
    ...(canManage && a.status !== "closed" ? [{ label: "Sửa hoạt động", icon: <Edit3 />, href: `${base}/activities/${a.id}/edit` }] : []),
    ...(canEvidence && a.status === "active" ? [{ label: "Ghi nhận minh chứng", icon: <Upload />, onSelect: () => setRecordFor(a.id) }] : []),
    ...(canManage && a.status === "draft" ? [{ label: "Giao hoạt động", icon: <Send />, onSelect: () => setIntent({ id: a.id, title: a.title, to: "active", fromDraft: true, dueDate: a.dueDate, assigned: a.progress.total }) }] : []),
    ...(canManage && a.status === "active" ? [{ label: "Kết thúc hoạt động", icon: <Lock />, danger: true, separatorBefore: true, onSelect: () => setIntent({ id: a.id, title: a.title, to: "closed", dueDate: a.dueDate }) }] : []),
    ...(canManage && a.status === "closed" ? [{ label: "Mở lại hoạt động", icon: <PlayCircle />, onSelect: () => setIntent({ id: a.id, title: a.title, to: "active", dueDate: a.dueDate }) }] : []),
  ];
  const activeItems = d.items.filter((a) => a.status !== "draft");
  const done = d.totals.approved;
  const total = d.totals.total;
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Danh sách hoạt động" icon={<CalendarDays className="size-5 text-primary" />}
              action={canManage ? <ButtonLink href={`${base}/activities/new`} variant="primary" size="sm" icon={<Plus className="size-4" />}>Tạo hoạt động</ButtonLink> : undefined} />
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              <input className="input min-w-[180px] flex-[2_1_220px]" type="search" placeholder="Tìm theo tên hoặc mô tả hoạt động" aria-label="Tìm hoạt động" value={q} onChange={(e) => setQ(e.target.value)} />
              <InlineSelect label="Lọc trạng thái" className="flex-[1_1_180px]" value={status} onChange={setStatus} options={STATUS_FILTERS} allLabel="Tất cả trạng thái" />
            </div>
            {d.items.length === 0 ? (
              status || q ? <EmptyFiltered what="hoạt động" onReset={() => { setStatus(""); setQ(""); }} /> : (
                <EmptyState compact icon={<ClipboardList className="size-6" />} title="Lớp chưa có hoạt động" description="Tạo hoạt động để giao cho cả lớp, một tổ hoặc một số học sinh."
                  action={canManage ? <ButtonLink href={`${base}/activities/new`} variant="primary" size="sm" icon={<Plus className="size-4" />}>Tạo hoạt động</ButtonLink> : undefined} />
              )
            ) : (
              <ul className="space-y-3 px-5 pb-2">
                {page.items.map((a) => {
                  const st = activityState(a);
                  const p = a.progress;
                  return (
                    <li key={a.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-3 transition-shadow hover:shadow-[var(--shadow-card)] md:flex-row md:items-center">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <ActivityArt kind={a.illustration} className="h-[86px] w-[104px] flex-none sm:h-[96px] sm:w-[118px]" />
                        <div className="min-w-0 flex-1">
                          <Link href={`${base}/activities/${a.id}`} className="line-clamp-2 text-[16px] font-bold text-ink hover:text-primary-strong">{a.title}</Link>
                          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{a.description}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-body">
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-muted" aria-hidden />Hạn: <span className={clsx("font-semibold", a.dueSoon || a.overdue ? "text-danger-text" : "text-ink")}>{fmtDate(a.dueDate)}</span></span>
                            <span className="inline-flex items-center gap-1.5"><UsersRound className="size-4 text-muted" aria-hidden />Giao: <span className="font-semibold text-ink">{scopeLabel(a, classSize)}</span></span>
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-start gap-3 md:w-[270px] md:flex-none">
                        <div className="min-w-0 flex-1">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {a.status === "draft" ? (
                            <p className="mt-2 text-[13px] text-muted">Chưa giao — {p.total} học sinh dự kiến</p>
                          ) : (
                            <>
                              <p className="mt-2 text-[13px] text-ink"><span className="font-semibold">{p.approved}/{p.total}</span> học sinh được giao đã duyệt</p>
                              <div className="mt-1 flex items-center gap-2">
                                <ProgressBar value={p.approved} total={p.total} className="flex-1" color={st.tone === "warning" ? "var(--color-success)" : undefined} showPercent={false} />
                                <span className="w-10 text-right text-[12.5px] tabular-nums text-muted">{fmtPercent(p.approved, p.total)}</span>
                              </div>
                              {(p.pending > 0 || p.supplement > 0) && <p className="mt-1 text-[12px] text-muted">{p.pending} chờ duyệt · {p.supplement} cần bổ sung</p>}
                            </>
                          )}
                        </div>
                        <ActionMenu items={menu(a)} label={`Thao tác cho ${a.title}`} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {page.total > page.pageSize && <Pagination page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} onPage={page.setPage} what="hoạt động" />}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Tổng quan hoạt động lớp" icon={<BarChart3 className="size-5 text-primary" />} subtitle={`${activeItems.length} hoạt động đã giao · mẫu số là số lượt học sinh được giao`} />
            <div className="grid grid-cols-2 gap-3 px-5 pb-5">
              <Kpi icon={<CheckCircle2 className="size-6" />} tone="green" label="Đã hoàn thành" value={<>{done}/{total}</>} hint={fmtPercent(done, total)} />
              <Kpi icon={<AlarmClock className="size-6" />} tone="pink" label="Chưa nộp" value={d.totals.notReceived} hint={<span className="text-danger-text">{fmtPercent(d.totals.notReceived, total)}</span>} />
              <Link href={`${base}/evidence?status=pending`} className="col-span-2"><Kpi icon={<FileCheck2 className="size-6" />} tone="amber" label="Minh chứng chờ duyệt" value={d.pendingEvidence} hint="Mở danh sách minh chứng" /></Link>
              <AnnouncementKpi />
            </div>
          </Card>
          <Card>
            <CardHeader title="Hoạt động gần đây" icon={<Clock3 className="size-5 text-primary" />} action={<CardLink href={`${base}/evidence`}>Xem minh chứng</CardLink>} />
            <RecentList base={base} />
          </Card>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PendingEvidence base={base} canEvidence={canEvidence} />
        <UpcomingAnnouncements base={base} />
      </div>
      <ActivityStatusConfirm intent={intent} onClose={() => setIntent(null)} />
      {recordFor && <RecordForActivity activityId={recordFor} onClose={() => setRecordFor(null)} />}
    </>
  );
}

function Kpi({ icon, tone, label, value, hint }: { icon: ReactNode; tone: "green" | "pink" | "amber" | "blue"; label: string; value: ReactNode; hint?: ReactNode }) {
  const TONE = { green: "bg-success-bg text-success-text", pink: "bg-danger-bg text-danger-text", amber: "bg-warning-bg text-warning-text", blue: "bg-primary-light text-primary" };
  return (
    <div className="flex h-full items-start gap-2.5 rounded-2xl border border-line bg-white p-3">
      <span className={clsx("flex size-9 flex-none items-center justify-center rounded-full [&>svg]:size-5", TONE[tone])} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-body">{label}</p>
        <p className="text-[22px] font-extrabold leading-tight text-ink tabular-nums">{value}</p>
        {hint && <p className="text-[12px] leading-snug text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function AnnouncementKpi() {
  const { schoolId, yearId, classId, base } = useClassroom();
  const q = useRepo(["class-ann-panel", classId], (ctx) => activitiesExtraRepo.announcementsPanel(ctx, schoolId, yearId, classId));
  if (!q.data) return null;
  const diff = q.data.thisWeek - q.data.lastWeek;
  return (
    <Link href={`${base}/announcements`} className="col-span-2">
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-white p-3">
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden><Bell className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-body">Thông báo lớp tuần này</p>
          <p className="text-[22px] font-extrabold leading-tight text-ink tabular-nums">{q.data.thisWeek}</p>
        </div>
        <p className={clsx("text-[12px] font-semibold", diff >= 0 ? "text-success-text" : "text-danger-text")}>{diff >= 0 ? "+" : "−"}{Math.abs(diff)} so với tuần trước</p>
      </div>
    </Link>
  );
}

const RECENT_ICON: Record<string, { icon: ReactNode; cls: string }> = {
  approved: { icon: <CheckCircle2 className="size-4" />, cls: "bg-success-bg text-success-text" },
  evidence: { icon: <Upload className="size-4" />, cls: "bg-[#e7f7ef] text-success-text" },
  supplement: { icon: <FileText className="size-4" />, cls: "bg-danger-bg text-danger-text" },
  activity: { icon: <Plus className="size-4" />, cls: "bg-primary-light text-primary" },
};

function RecentList({ base }: { base: string }) {
  const { schoolId, yearId, classId } = useClassroom();
  const ctx = useCtx();
  const q = useRepo(["activity-recent", classId], (c) => activitiesExtraRepo.recentFeed(c, schoolId, yearId, classId, 5));
  if (q.isLoading) return <div className="px-5 pb-5"><Skeleton className="h-40" /></div>;
  if (q.error) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data ?? [];
  if (!items.length) return <EmptyState compact icon={<History className="size-6" />} title="Chưa có hoạt động gần đây" description="Việc giao hoạt động, ghi nhận và duyệt minh chứng sẽ hiện ở đây." />;
  return (
    <ul className="space-y-3.5 px-5 pb-5">
      {items.map((x) => {
        const ic = RECENT_ICON[x.kind];
        return (
          <li key={x.id} className="flex gap-3">
            <span className={clsx("flex size-8 flex-none items-center justify-center rounded-full", ic.cls)} aria-hidden>{ic.icon}</span>
            <div className="min-w-0 text-[13px]">
              <Link href={`${base}/${x.href}`} className="text-ink hover:underline"><span className="font-semibold">{x.actor}</span> — {x.text}</Link>
              <p className="truncate text-body">{x.detail}</p>
              <p className="text-[12px] text-muted" title={fmtDateTime(x.at)}>{fmtRelative(x.at, ctx.now)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PendingEvidence({ base, canEvidence }: { base: string; canEvidence: boolean }) {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["evidence", classId, "pending", "", ""], (ctx) => activitiesRepo.evidence(ctx, schoolId, yearId, classId, { status: "pending" }));
  const [review, setReview] = useState<{ ids: string[]; decision: ReviewDecision; subject: string } | null>(null);
  const [view, setView] = useState<EvidenceData["items"][number] | null>(null);
  return (
    <Card className="min-w-0">
      <CardHeader title="Minh chứng chờ duyệt" icon={<FileCheck2 className="size-5 text-primary" />} action={<CardLink href={`${base}/evidence?status=pending`} />} />
      {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32" /></div> : q.error ? <ErrorState compact error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? (
        <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không có minh chứng chờ duyệt" description="Minh chứng giáo viên ghi nhận sẽ chờ duyệt tại đây." />
      ) : (
        <div className="table-wrap px-3 pb-3">
          <table className="table" style={{ minWidth: 480 }}>
            <thead><tr><th>Học sinh</th><th>Hoạt động</th><th>Minh chứng</th><th>Ghi nhận</th>{canEvidence && <th className="center">Thao tác</th>}</tr></thead>
            <tbody>
              {q.data.items.slice(0, 4).map((e) => (
                <tr key={e.id}>
                  <td><div className="flex items-center gap-2"><Avatar name={e.studentName} size={30} /><span className="text-[13px] font-semibold text-ink">{e.studentName}</span></div></td>
                  <td className="max-w-[120px] text-[12.5px]">{e.activityTitle}</td>
                  <td><button type="button" className="block w-[64px] rounded-lg focus-visible:outline-2" onClick={() => setView(e)} aria-label={`Xem minh chứng của ${e.studentName}`}><FileThumb file={e.file} /></button></td>
                  <td className="text-[12.5px] tabular-nums">{fmtDate(e.uploadedAt)}<br /><span className="text-muted">{e.uploadedByName}</span></td>
                  {canEvidence && (
                    <td className="center">
                      <div className="flex flex-col gap-1.5">
                        <Button size="sm" variant="primary" onClick={() => setReview({ ids: [e.id], decision: "approved", subject: `${e.studentName} — ${e.activityTitle}` })}>Duyệt</Button>
                        <Button size="sm" variant="secondary" onClick={() => setReview({ ids: [e.id], decision: "supplement", subject: `${e.studentName} — ${e.activityTitle}` })}>Yêu cầu bổ sung</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.items.length > 4 && <p className="px-2 pt-2 text-[12.5px] text-muted">Còn {q.data.items.length - 4} minh chứng chờ duyệt khác.</p>}
        </div>
      )}
      <ReviewEvidenceDialog open={!!review} onOpenChange={(o) => { if (!o) setReview(null); }} evidenceIds={review?.ids ?? []} decision={review?.decision ?? "approved"} subject={review?.subject ?? ""} />
      <FileViewerDialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }} file={view?.file}
        meta={view ? [{ label: "Học sinh", value: view.studentName }, { label: "Hoạt động", value: view.activityTitle }, { label: "Giáo viên ghi nhận", value: view.uploadedByName }] : undefined} />
    </Card>
  );
}

function UpcomingAnnouncements({ base }: { base: string }) {
  const { schoolId, yearId, classId, can } = useClassroom();
  const q = useRepo(["class-ann-panel", classId], (ctx) => activitiesExtraRepo.announcementsPanel(ctx, schoolId, yearId, classId));
  if (!can("announcement.class")) return null;
  return (
    <Card className="min-w-0">
      <CardHeader title="Thông báo sắp công bố" icon={<Megaphone className="size-5 text-primary" />} action={<CardLink href={`${base}/announcements`} />} />
      {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32" /></div> : q.error ? <ErrorState compact error={q.error} onRetry={() => q.refetch()} /> : !q.data?.upcoming.length ? (
        <EmptyState compact icon={<Megaphone className="size-6" />} title="Không có thông báo nháp hoặc đã đặt lịch" action={<ButtonLink href={`${base}/announcements/new`} size="sm" variant="primary" icon={<Plus className="size-4" />}>Soạn thông báo</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line px-5 pb-3">
          {q.data.upcoming.slice(0, 4).map((a, i) => {
            const st = PUBLICATION_STATUS[a.status];
            const tones = ["bg-[#fff1e6] text-[#e07a1f]", "bg-primary-light text-primary", "bg-[#fdeef1] text-[#d6405c]"];
            const Icon = [Megaphone, FileText, Heart][i % 3];
            return (
              <li key={a.id} className="flex gap-3 py-3">
                <span className={clsx("flex size-11 flex-none items-center justify-center rounded-xl", tones[i % 3])} aria-hidden><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`${base}/announcements/${a.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-primary-strong">{a.title}</Link>
                  <p className="line-clamp-1 text-[12.5px] text-muted">{a.summary}</p>
                  <p className="text-[12.5px] text-body">Đối tượng: {a.scopeLabel} · {a.audienceLabel}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted"><CalendarClock className="size-3.5" aria-hidden />{a.status === "scheduled" && a.scheduledAt ? `Công bố ${fmtDateTime(a.scheduledAt)}` : `Cập nhật ${fmtDateTime(a.updatedAt)}`}</p>
                </div>
                <Badge tone={st.tone} className="self-start">{a.status === "draft" ? "Nháp — chờ công bố" : st.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecordForActivity({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["evidence", classId, "", "", ""], (ctx) => activitiesRepo.evidence(ctx, schoolId, yearId, classId, {}));
  if (!q.data) return null;
  return <RecordEvidenceDialog open onOpenChange={(o) => { if (!o) onClose(); }} activities={q.data.activities} students={q.data.students} activityId={activityId} />;
}
