"use client";
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Presentation, Users, GraduationCap, Link2, Zap, Plus, UserPlus, FileSpreadsheet, Megaphone, AlertCircle, ClipboardList, CalendarCheck,
  CheckCircle2, Circle, ArrowRight, Eye, Pencil, UserCog, Power, List, Bell, FileText, Users2,
} from "lucide-react";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool, SchoolYearBar } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, CardLink } from "@/components/ui/card";
import { Badge, StatusBadge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { DonutProgress } from "@/components/ui/progress";
import { EmptyState, QueryState } from "@/components/ui/states";
import { classStatus, fmtDateLong, fmtNumber, fmtRelative } from "@/lib/formatters";
import { ClassDrawer, type ClassDrawerTarget, type ClassEditTarget } from "./class-drawer";
import { InviteModal } from "./invite-modal";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";

type Overview = Awaited<ReturnType<typeof schoolRepo.overview>>;
type NeedRow = Overview["classesNeedingAction"][number];

/** SC01 — school overview (R02). Every number is derived from the repository for the selected year. */
export function SchoolOverview() {
  const { school, yearId, can } = useSchool();
  const q = useRepo(["school-overview", school.id, yearId], (c) => schoolRepo.overview(c, school.id, yearId));
  const [classTarget, setClassTarget] = useState<ClassDrawerTarget | ClassEditTarget | null>(null);
  const [invite, setInvite] = useState(false);
  const [assign, setAssign] = useState<AssignPrefill | null>(null);

  return (
    <div className="page">
      <PageHeader title="Quản lý nhà trường" subtitle={`Tổng quan hoạt động của ${school.name}`} quote={["Mỗi học sinh là một", "hành trình đáng trân trọng"]} illustration="/assets/illustrations/school-header.png">
        <SchoolYearBar />
      </PageHeader>
      <QueryState query={q}>
        {(d) => (
          <>
            <Kpis d={d} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <QuickActions onCreateClass={() => setClassTarget({ mode: "create", yearId: d.year.status === "archived" ? undefined : d.year.id })} onInvite={() => setInvite(true)} archived={d.year.status === "archived"} />
                <ClassesNeedingAction rows={d.classesNeedingAction} yearId={d.year.id} onEdit={(r) => setClassTarget({ mode: "edit", row: r })} onAssign={(classId) => setAssign({ kind: "homeroom", classId, yearId: d.year.id })} canEdit={can("class.manage") && d.year.status !== "archived"} canAssign={can("assignment.manage")} />
                <RecentAnnouncements items={d.announcements} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <SetupProgress d={d} />
                <TodayItems items={d.todayItems} />
                <MottoBanner />
              </div>
            </div>
          </>
        )}
      </QueryState>
      <ClassDrawer target={classTarget} onClose={() => setClassTarget(null)} />
      <InviteModal open={invite} onClose={() => setInvite(false)} />
      <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
    </div>
  );
}

function Kpis({ d }: { d: Overview }) {
  const k = d.kpi;
  const prev = d.prevYear;
  const vsPrev = prev ? `so với năm học ${prev.label}` : undefined;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Lớp đang hoạt động" value={fmtNumber(k.activeClasses)} icon={<Presentation className="size-7" />} tone="blue"
        delta={prev && k.prevClasses !== undefined ? k.activeClasses - k.prevClasses : null} deltaLabel={prev ? `${vsPrev}${k.draftClasses ? ` · ${k.draftClasses} lớp nháp` : ""}` : undefined} hint={k.draftClasses ? `${k.draftClasses} lớp đang nháp` : "Không có lớp nháp"} />
      <KpiCard label="Giáo viên, nhân sự" value={fmtNumber(k.staffActive)} icon={<Users className="size-7" />} tone="green" hint="Thành viên đang hoạt động của trường" />
      <KpiCard label="Học sinh" value={fmtNumber(k.students)} icon={<GraduationCap className="size-7" />} tone="amber"
        delta={prev && k.prevStudents !== undefined ? k.students - k.prevStudents : null} deltaLabel={vsPrev} hint="Đang theo học các lớp đã kích hoạt" />
      <KpiCard label="Link tra cứu hiệu lực" value={fmtNumber(k.linksActive)} icon={<Link2 className="size-7" />} tone="pink" hint={`${fmtNumber(k.linksOpened)} link đã được mở · năm học này`} />
    </div>
  );
}

function QuickActions({ onCreateClass, onInvite, archived }: { onCreateClass: () => void; onInvite: () => void; archived: boolean }) {
  const { school, can } = useSchool();
  const b = `/school/${school.id}`;
  const cards = [
    can("class.manage") && !archived && { key: "class", title: "Tạo lớp học", text: "Khởi tạo lớp mới trong năm học", tone: "bg-[#e8f3ff] hover:border-[#9cc7f5]", icon: <span className="flex size-12 items-center justify-center rounded-full bg-primary text-white"><Plus className="size-7" /></span>, onClick: onCreateClass },
    can("staff.invite") && { key: "invite", title: "Mời giáo viên", text: "Gửi lời mời tham gia nhà trường", tone: "bg-[#e6f7ef] hover:border-[#9edcc0]", icon: <UserPlus className="size-11 text-success" />, onClick: onInvite },
    can("import.run") && { key: "import", title: "Nhập danh sách học sinh", text: "Nhập từ tệp Excel/CSV hoặc thêm thủ công", tone: "bg-[#fff4e0] hover:border-[#f5d9a6]", icon: <FileSpreadsheet className="size-11 text-warning" />, href: `${b}/imports/new` },
    can("announcement.school") && { key: "ann", title: "Công bố thông báo", text: "Gửi thông báo đến giáo viên và gia đình", tone: "bg-[#fdecef] hover:border-[#f6c9cb]", icon: <Megaphone className="size-11 text-danger" />, href: `${b}/announcements/new` },
  ].filter(Boolean) as { key: string; title: string; text: string; tone: string; icon: React.ReactNode; onClick?: () => void; href?: string }[];
  if (!cards.length) return null;
  return (
    <Card>
      <CardHeader title="Thao tác nhanh" icon={<Zap className="size-6 fill-primary text-primary" />} />
      <div className={clsx("grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2", cards.length >= 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : "")}>
        {cards.map((c) => {
          const inner = (
            <>
              <span className="flex h-14 items-center justify-center" aria-hidden>{c.icon}</span>
              <span className="mt-2 block text-[15px] font-bold leading-snug text-ink">{c.title}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-muted">{c.text}</span>
            </>
          );
          const cls = clsx("flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-transparent px-3 py-4 text-center transition-colors", c.tone);
          return c.href ? <Link key={c.key} href={c.href} className={cls}>{inner}</Link> : <button key={c.key} type="button" onClick={c.onClick} className={cls}>{inner}</button>;
        })}
      </div>
    </Card>
  );
}

function ClassesNeedingAction({ rows, yearId, onEdit, onAssign, canEdit, canAssign }: { rows: NeedRow[]; yearId: string; onEdit: (r: NeedRow) => void; onAssign: (classId: string) => void; canEdit: boolean; canAssign: boolean }) {
  const { school } = useSchool();
  const activate = useCommand((c, id: string) => schoolRepo.setClassStatus(c, school.id, id, "active"), { success: "Đã kích hoạt lớp" });
  const top = rows.slice(0, 6);
  return (
    <Card>
      <CardHeader title="Lớp cần xử lý" icon={<AlertCircle className="size-6 fill-danger text-white" />} subtitle={rows.length ? `${rows.length} lớp có việc chưa hoàn tất` : undefined} action={<CardLink href={`/school/${school.id}/classes`} />} />
      {rows.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không có lớp cần xử lý" description="Các lớp đều đã có GVCN, học sinh, lịch và điểm danh hôm nay." /> : (
        <div className="px-4 pb-4">
          <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Lớp cần xử lý" tabIndex={0}>
            <table className="table" style={{ minWidth: 600 }}>
              <thead><tr><th className="w-8">#</th><th>Tên lớp</th><th>Khối</th><th>GVCN</th><th>Việc cần xử lý</th><th>Tình trạng</th><th className="center">Thao tác</th></tr></thead>
              <tbody>
                {top.map((r, i) => {
                  const items: MenuItem[] = [
                    { label: "Mở không gian lớp", icon: <Eye />, href: `/classroom/${school.id}/${yearId}/${r.id}` },
                    ...(canEdit ? [{ label: "Sửa thông tin lớp", icon: <Pencil />, onSelect: () => onEdit(r) }] : []),
                    ...(canAssign && !r.homeroomName ? [{ label: "Phân công GVCN", icon: <UserCog />, onSelect: () => onAssign(r.id) }] : []),
                    ...(canEdit && r.status === "draft" ? [{ label: "Kích hoạt lớp", icon: <Power />, disabled: !r.homeroomName, hint: r.homeroomName ? undefined : "Cần phân công GVCN trước", onSelect: () => activate.run(r.id) }] : []),
                    { label: "Xem trong danh sách lớp", icon: <List />, href: `/school/${school.id}/classes?q=${encodeURIComponent(r.name)}`, separatorBefore: true },
                  ];
                  return (
                    <tr key={r.id}>
                      <td className="text-muted">{i + 1}</td>
                      <td><Link href={`/classroom/${school.id}/${yearId}/${r.id}`} className="font-bold text-primary-strong hover:underline">{r.name}</Link></td>
                      <td>{r.gradeName.replace("Khối ", "")}</td>
                      <td>{r.homeroomName ?? <span className="font-medium text-danger-text">Chưa có</span>}</td>
                      <td title={r.tasks.join("\n")}>
                        <span className="flex items-center gap-2"><span className={clsx("size-2 flex-none rounded-full", r.severity === "blocked" ? "bg-danger" : "bg-warning")} aria-hidden /><span className="font-medium text-ink">{r.tasks.length} việc</span></span>
                        <span className="block max-w-[150px] truncate text-[12px] text-muted">{r.tasks[0]}</span>
                      </td>
                      <td>{r.status === "draft" ? <StatusBadge status="draft" map={classStatus} /> : r.severity === "blocked" ? <Badge tone="danger">Cần xử lý</Badge> : <Badge tone="warning">Cần theo dõi</Badge>}</td>
                      <td className="center"><ActionMenu label={`Thao tác với lớp ${r.name}`} items={items} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > top.length && <p className="mt-2 text-[12.5px] text-muted">Còn {rows.length - top.length} lớp khác — xem trong danh sách lớp.</p>}
        </div>
      )}
    </Card>
  );
}

function RecentAnnouncements({ items }: { items: Overview["announcements"] }) {
  const { school } = useSchool();
  const ctx = useCtx();
  const icons = [<Bell key="b" className="size-4" />, <Users2 key="u" className="size-4" />, <FileText key="f" className="size-4" />];
  const tones = ["tone-blue", "tone-amber", "tone-blue"];
  return (
    <Card>
      <CardHeader title="Thông báo gần đây" icon={<Megaphone className="size-6 text-primary" />} action={<CardLink href={`/school/${school.id}/announcements`} />} />
      {items.length === 0 ? <EmptyState compact title="Chưa có thông báo nhà trường" description="Thông báo đã công bố hoặc đặt lịch sẽ hiển thị ở đây." /> : (
        <ul className="divide-y divide-line px-5 pb-3">
          {items.map((a, i) => (
            <li key={a.id} className="flex gap-3 py-2.5">
              <span className={`icon-tile icon-tile-sm !size-9 !rounded-full ${tones[i % 3]}`} aria-hidden>{icons[i % 3]}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/school/${school.id}/announcements/${a.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-primary-strong">{a.title}</Link>
                <p className="truncate text-[12.5px] text-muted">{a.summary}</p>
              </div>
              <div className="flex flex-none flex-col items-end gap-1 text-right">
                <span className="text-[12px] text-muted">{fmtRelative(a.publishedAt ?? a.scheduledAt ?? a.createdAt, ctx.now)}</span>
                {a.status !== "published" && <StatusBadge status={a.status} map={PUBLICATION_STATUS} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SetupProgress({ d }: { d: Overview }) {
  const done = d.setup.filter((s) => s.done).length;
  const total = d.setup.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const firstOpen = d.setup.findIndex((s) => !s.done);
  const { school } = useSchool();
  return (
    <Card>
      <CardHeader title="Tiến độ khởi tạo năm học" icon={<ClipboardList className="size-6 text-primary" />} action={<CardLink href={`/school/${school.id}/academic-years/${d.year.id}`}>Xem chi tiết</CardLink>} />
      <div className="px-5 pb-5">
        <div className="flex items-center gap-5">
          <DonutProgress value={done} total={total} size={112} stroke={13} label={`Đã hoàn thành ${done}/${total} hạng mục, ${pct}%`}>
            <span className="text-[26px] font-extrabold text-ink">{pct}%</span>
          </DonutProgress>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">Đã hoàn thành {done}/{total} <span className="font-medium text-primary-strong">hạng mục</span></p>
            <p className="text-[13px] text-muted">Năm học {d.year.label}</p>
            {firstOpen >= 0 && <p className="mt-1 text-[12.5px] text-body">Tiếp theo: <Link href={d.setup[firstOpen].href} className="font-semibold text-primary-strong hover:underline">{d.setup[firstOpen].label}</Link></p>}
          </div>
        </div>
        <ul className="mt-4 space-y-1.5">
          {d.setup.map((s, i) => (
            <li key={s.key}>
              <Link href={s.href} className="group flex items-start gap-2.5 rounded-md py-0.5 text-[13px]">
                {s.done ? <CheckCircle2 className="mt-0.5 size-[18px] flex-none fill-success text-white" aria-hidden /> : i === firstOpen ? <span className="mt-0.5 flex size-[18px] flex-none items-center justify-center rounded-full border-2 border-primary" aria-hidden><span className="size-2 rounded-full bg-primary" /></span> : <Circle className="mt-0.5 size-[18px] flex-none text-line-strong" aria-hidden />}
                <span className="min-w-0 flex-1 text-ink group-hover:text-primary-strong group-hover:underline">{s.label}<span className="sr-only"> — {s.done ? "đã hoàn thành" : "chưa hoàn thành"}</span></span>
                <span className={clsx("max-w-[45%] flex-none truncate text-right text-[12px]", s.done ? "text-muted" : i === firstOpen ? "font-medium text-primary-strong" : "text-muted")} title={s.detail}>{s.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TodayItems({ items }: { items: Overview["todayItems"] }) {
  const ctx = useCtx();
  const dot = { danger: "bg-danger", warning: "bg-warning", info: "bg-primary" } as const;
  return (
    <Card>
      <CardHeader title="Việc cần xử lý hôm nay" icon={<CalendarCheck className="size-6 text-primary" />} subtitle={fmtDateLong(ctx.today)} />
      {items.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không có việc chờ xử lý" description="Yêu cầu chuyển lớp, lời mời, điều chỉnh sau chốt và lớp thiếu GVCN sẽ hiện ở đây." /> : (
        <ul className="space-y-1 px-5 pb-4">
          {items.map((t) => (
            <li key={t.key}>
              <Link href={t.href} className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-primary-light">
                <span className={clsx("mt-1.5 size-2.5 flex-none rounded-full", dot[t.tone])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">{t.label}</span>
                  <span className="block truncate text-[12.5px] text-muted">{t.detail}</span>
                </span>
                <ArrowRight className="mt-1 size-4 flex-none text-primary opacity-60 group-hover:opacity-100" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MottoBanner() {
  const { school } = useSchool();
  return (
    <div className="card relative flex min-h-[132px] items-center overflow-hidden bg-gradient-to-r from-[#e8f3ff] via-[#f3f9ff] to-[#eaf7f0] p-0">
      <img src="/assets/illustrations/students-pair.png" alt="" className="h-[132px] w-auto flex-none self-end object-contain object-bottom" />
      <div className="min-w-0 flex-1 py-4 pr-5">
        <p className="quote !text-[19px] leading-snug">“{school.motto}”</p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-muted">EduManage đồng hành cùng {school.name} trong hành trình xây dựng môi trường học tập hạnh phúc.</p>
      </div>
    </div>
  );
}
