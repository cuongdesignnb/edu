"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  CalendarDays, Plus, CalendarRange, Users, ChevronDown, ChevronRight, ArrowRight, Pencil, Eye, UserCog, Power, CalendarClock, Clock3, Flag,
  GraduationCap, RefreshCw, Search, Layers,
} from "lucide-react";
type Term = Awaited<ReturnType<typeof schoolRepo.yearDetail>>["terms"][number];
type ClassRow = Awaited<ReturnType<typeof schoolRepo.classes>>["items"][number];
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { EmptyState, QueryState } from "@/components/ui/states";
import { classStatus, fmtDate, matches } from "@/lib/formatters";
import { ClassDrawer, type ClassDrawerTarget, type ClassEditTarget } from "./class-drawer";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";
import { TermDialog } from "./term-dialog";
import { CompletenessSteps, yearStatus } from "./common";

type Detail = Awaited<ReturnType<typeof schoolRepo.yearDetail>>;

/** SC05 — academic year detail (R03): completeness stepper, year card, terms accordion, classes grouped by grade, O03 drawer. */
export function YearDetail({ yearId }: { yearId: string }) {
  const { school, years } = useSchool();
  const q = useRepo(["school-year-detail", school.id, yearId], (c) => schoolRepo.yearDetail(c, school.id, yearId));
  const [classTarget, setClassTarget] = useState<ClassDrawerTarget | ClassEditTarget | null>(null);
  const [assign, setAssign] = useState<AssignPrefill | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const b = `/school/${school.id}`;
  return (
    <QueryState query={q}>
      {(d) => {
        const archived = d.year.status === "archived";
        const canAddClass = d.canManageClasses && !archived;
        return (
          <div className="page">
            <PageHeader title="Năm học & Lớp học" subtitle="Quản lý cấu trúc năm học, học kỳ, khối lớp, lớp học và phân công giáo viên chủ nhiệm"
              breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học", href: `${b}/academic-years` }, { label: d.year.label }]}
              quote={["Tổ chức hôm nay", "cho những thế hệ vững vàng ngày mai"]} illustration="/assets/illustrations/school-header.png" />
            <Card className="min-w-0 max-w-full overflow-hidden px-5 py-4"><CompletenessSteps steps={steps(d, b)} /></Card>
            <YearCard d={d} onCreateClass={canAddClass ? () => setClassTarget({ mode: "create", yearId: d.year.id }) : undefined} />
            {archived && <Callout tone="neutral" title="Năm học đã lưu trữ — chỉ xem">Dữ liệu năm cũ được giữ nguyên để tra cứu và báo cáo. Không tạo/sửa lớp trong năm này.</Callout>}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.5fr)]">
              <TermsCard d={d} onEdit={d.canManage && !archived ? setTerm : undefined} />
              <ClassesByGrade d={d} years={years} canAdd={canAddClass}
                onAdd={(gradeId) => setClassTarget({ mode: "create", yearId: d.year.id, gradeId })} onEdit={(r) => setClassTarget({ mode: "edit", row: r })}
                onAssign={(classId) => setAssign({ kind: "homeroom", classId, yearId: d.year.id })} />
            </div>
            <ClassDrawer target={classTarget} onClose={() => setClassTarget(null)} />
            <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
            <TermDialog term={term} year={d.year} lockedWeeks={term ? d.weeks.filter((w) => w.termId === term.id && w.locked).length : 0} onClose={() => setTerm(null)} />
          </div>
        );
      }}
    </QueryState>
  );
}

function steps(d: Detail, b: string) {
  const activeGrades = (d.grades ?? []).filter((g) => g.status === "active");
  const gradesWithClasses = activeGrades.filter((g) => d.classesByGrade?.some((x) => x.grade.id === g.id && x.classes.length));
  const drafts = d.classesByGrade?.flatMap((x) => x.classes).filter((c) => c.status === "draft").length;
  return [
    { label: "Năm học", done: d.year.status !== "draft", detail: yearStatus[d.year.status].label.replace(" — chỉ xem", ""), href: `${b}/academic-years` },
    { label: "Học kỳ", done: d.terms.length > 0 && d.weeks.length > 0, detail: `${d.terms.length} học kỳ · ${d.weeks.length} tuần`, href: `${b}/academic-years/${d.year.id}/calendar` },
    { label: "Khối", done: d.grades === null || d.classesByGrade === null ? null : activeGrades.length > 0 && gradesWithClasses.length === activeGrades.length, detail: d.grades === null ? "Không có quyền xem danh mục khối" : d.classesByGrade === null ? "Không có quyền xem lớp theo khối" : `${gradesWithClasses.length}/${activeGrades.length} khối có lớp`, href: `${b}/dictionaries` },
    { label: "Lớp học", done: d.totalClasses === null ? null : d.totalClasses > 0 && drafts === 0, detail: d.totalClasses === null ? "Không có quyền xem lớp" : `${d.totalClasses} lớp${drafts ? ` · ${drafts} nháp` : ""}`, href: `${b}/classes` },
    { label: "Phân công GVCN", done: d.totalClasses === null ? null : d.totalClasses > 0 && d.assignedHomeroom === d.totalClasses, detail: d.totalClasses === null ? "Không có quyền xem phân công" : `${d.assignedHomeroom}/${d.totalClasses} lớp`, href: `${b}/assignments` },
  ];
}

function YearCard({ d, onCreateClass }: { d: Detail; onCreateClass?: () => void }) {
  const { school, can } = useSchool();
  const b = `/school/${school.id}`;
  return (
    <Card className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span className="icon-tile tone-blue !size-16" aria-hidden><CalendarDays className="size-8" /></span>
      <div className="min-w-0 flex-[1_1_260px]">
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-[22px] font-extrabold text-ink">Năm học {d.year.label.replace("–", " - ")}</h2><StatusBadge status={d.year.status} map={yearStatus} /></div>
        <p className="mt-0.5 text-[14px] text-muted">Thời gian: {fmtDate(d.year.startDate)} - {fmtDate(d.year.endDate)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {can("year.manage") && <ButtonLink href={`${b}/academic-years/new`} variant="primary" icon={<Plus className="size-4" />}>Tạo năm học</ButtonLink>}
        <ButtonLink href={`${b}/academic-years/${d.year.id}/calendar`} icon={<CalendarRange className="size-4" />}>Học kỳ, tuần & ngày nghỉ</ButtonLink>
        {can("year.manage") && d.year.status === "active" && <ButtonLink href={`${b}/academic-years/${d.year.id}/rollover`} icon={<RefreshCw className="size-4" />}>Chuẩn bị năm mới</ButtonLink>}
        {can("staff.view") && <ButtonLink href={`${b}/assignments`} icon={<Users className="size-4" />}>Phân công GVCN</ButtonLink>}
        {onCreateClass && <Button icon={<Layers className="size-4" />} onClick={onCreateClass} className="xl:hidden">Thêm lớp</Button>}
      </div>
    </Card>
  );
}

function termState(t: Term, today: string) {
  if (today < t.startDate) return { label: "Chưa bắt đầu", tone: "neutral" as const };
  if (today > t.endDate) return { label: "Đã kết thúc", tone: "neutral" as const };
  return { label: "Đang diễn ra", tone: "success" as const };
}

function TermsCard({ d, onEdit }: { d: Detail; onEdit?: (t: Term) => void }) {
  const ctx = useCtx();
  const { school } = useSchool();
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(d.terms.map((t, i) => [t.id, i < 2])));
  return (
    <Card className="min-w-0">
      <CardHeader title="Thông tin học kỳ" icon={<CalendarDays className="size-6 text-primary" />} />
      {d.terms.length === 0 ? <EmptyState compact title="Chưa có học kỳ" description="Thiết lập học kỳ ở màn hình Học kỳ, tuần & ngày nghỉ." /> : (
        <div className="space-y-3 px-4 pb-4">
          {d.terms.map((t) => {
            const st = termState(t, ctx.today);
            const weeks = d.weeks.filter((w) => w.termId === t.id);
            const isOpen = open[t.id];
            const shown = weeks.length > 4 ? [...weeks.slice(0, 3), null, weeks[weeks.length - 1]] : weeks;
            return (
              <section key={t.id} className="rounded-xl border border-line">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button type="button" onClick={() => setOpen((s) => ({ ...s, [t.id]: !s[t.id] }))} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={clsx("size-3 flex-none rounded-full", st.tone === "success" ? "bg-primary" : "bg-faint")} aria-hidden />
                    <span className="text-[16px] font-bold text-primary-strong">{t.name}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <ChevronDown className={clsx("ml-auto size-5 text-primary transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {onEdit && <IconButton size="sm" label={`Sửa mốc ${t.name}`} icon={<Pencil className="size-4" />} onClick={() => onEdit(t)} />}
                </div>
                {isOpen && (
                  <div className="border-t border-line px-4 py-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13.5px]">
                      <Fact icon={<CalendarDays />} label="Thời gian" value={`${fmtDate(t.startDate)} - ${fmtDate(t.endDate)}`} wide />
                      <Fact icon={<Clock3 />} label="Số tuần học" value={`${weeks.length || t.weekCount} tuần`} />
                      <Fact icon={<Flag />} label="Ngày khai giảng" value={t.openingDate ? fmtDate(t.openingDate) : "—"} />
                      <Fact icon={<CalendarClock />} label="Ngày kết thúc" value={fmtDate(t.endDate)} />
                    </dl>
                    {weeks.length > 0 && (
                      <div className="mt-3 border-t border-dashed border-line pt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[13.5px] font-semibold text-ink">Mốc tuần <span className="font-normal text-muted">({t.name})</span></p>
                          <Link href={`/school/${school.id}/academic-years/${d.year.id}/calendar?term=${t.id}`} className="card-link">Xem chi tiết<ArrowRight className="size-3.5" aria-hidden /></Link>
                        </div>
                        <ol className="relative ml-1.5 space-y-1.5 border-l-2 border-[#cfe3fb] pl-4">
                          {shown.map((w, i) => w === null ? <li key={`gap${i}`} className="text-[13px] text-muted">…</li> : (
                            <li key={w.id} className="relative grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
                              <span className={clsx("absolute -left-[22px] size-2.5 rounded-full", w.isCurrent ? "bg-success ring-4 ring-success-bg" : "bg-primary")} aria-hidden />
                              <span className="font-medium text-ink">Tuần {w.index}</span>
                              <span className="whitespace-nowrap text-body">{dm(w.startDate)} - {dm(w.endDate)}/{w.endDate.slice(0, 4)}</span>
                              <span>{w.isCurrent ? <Badge tone="success">Hiện tại</Badge> : w.locked ? <Badge tone="purple">Đã chốt</Badge> : null}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {d.holidays.length > 0 && <p className="px-1 text-[12.5px] text-muted">{d.holidays.length} kỳ nghỉ trong năm — xem ở “Học kỳ, tuần & ngày nghỉ”.</p>}
        </div>
      )}
    </Card>
  );
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Fact({ icon, label, value, wide }: { icon: React.ReactNode; label: string; value: string; wide?: boolean }) {
  return (
    <div className={clsx("relative pl-[26px]", wide && "col-span-2")}>
      <dt className="text-body"><span className="absolute left-0 top-0.5 text-muted [&>svg]:size-4" aria-hidden>{icon}</span>{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function ClassesByGrade({ d, years, canAdd, onAdd, onEdit, onAssign }: { d: Detail; years: { id: string; label: string; status: string }[] | null; canAdd: boolean; onAdd: (gradeId?: string) => void; onEdit: (r: ClassRow) => void; onAssign: (classId: string) => void }) {
  const { school, can } = useSchool();
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const activate = useCommand((c, row: ClassRow) => schoolRepo.setClassStatus(c, school.id, row.id, "active", row.version), { success: "Đã kích hoạt lớp" });
  const groups = useMemo(() => (d.classesByGrade ?? []).filter((g) => !grade || g.grade.id === grade).map((g) => ({ ...g, classes: g.classes.filter((c) => matches(q, c.name, c.homeroomName)) })), [d, grade, q]);
  const total = groups.reduce((n, g) => n + g.classes.length, 0);
  const archived = d.year.status === "archived";
  if (d.classesByGrade === null) return <Card><EmptyState compact title="Không có quyền xem lớp của năm học" /></Card>;
  const menu = (r: ClassRow): MenuItem[] => [
    { label: "Mở không gian lớp", icon: <Eye />, href: `/classroom/${school.id}/${d.year.id}/${r.id}` },
    ...(canAdd ? [{ label: "Sửa thông tin lớp", icon: <Pencil />, onSelect: () => onEdit(r) }] : []),
    ...(can("assignment.manage") && !r.homeroomName && !archived ? [{ label: "Phân công GVCN", icon: <UserCog />, onSelect: () => onAssign(r.id) }] : []),
    ...(canAdd && r.status === "draft" ? [{ label: "Kích hoạt lớp", icon: <Power />, disabled: !r.homeroomName, hint: r.homeroomName ? undefined : "Cần phân công GVCN trước", onSelect: () => activate.run(r) }] : []),
    { label: "Xem trong danh sách lớp", icon: <GraduationCap />, href: `/school/${school.id}/classes?q=${encodeURIComponent(r.name)}&year=${d.year.id}`, separatorBefore: true },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader title="Danh sách lớp học theo khối" icon={<GraduationCap className="size-6 text-primary" />} action={canAdd ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => onAdd(grade || undefined)}>Thêm lớp</Button> : undefined} />
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {years !== null && <InlineSelect label="Năm học" className="!w-auto min-w-[170px] flex-[1_1_170px]" value={d.year.id} onChange={(v) => router.push(`/school/${school.id}/academic-years/${v}`)} options={years.map((y) => ({ value: y.id, label: `Năm học ${y.label}` }))} />}
        <InlineSelect label="Khối" className="!w-auto min-w-[140px] flex-[1_1_140px]" allLabel="Tất cả khối" value={grade} onChange={setGrade} options={(d.classesByGrade ?? []).map((g) => ({ value: g.grade.id, label: g.grade.name }))} />
        <div className="input-icon min-w-[200px] flex-[2_1_220px]"><Search className="size-4" aria-hidden /><input className="input" type="search" placeholder="Tìm kiếm lớp học, giáo viên…" aria-label="Tìm kiếm lớp học, giáo viên" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {d.totalClasses === 0 ? (
        <EmptyState compact title="Năm học chưa có lớp" description="Tạo lớp để bắt đầu phân công giáo viên và nhập danh sách học sinh." action={canAdd ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => onAdd()}>Thêm lớp</Button> : undefined} />
      ) : total === 0 ? (
        <EmptyState compact title="Không có lớp khớp bộ lọc" description="Bộ lọc vẫn được giữ." action={<Button size="sm" onClick={() => { setGrade(""); setQ(""); }}>Xóa bộ lọc</Button>} />
      ) : (
        <div className="px-4 pb-4">
          <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Lớp học theo khối" tabIndex={0}>
            <table className="table" style={{ minWidth: 620 }}>
              <thead><tr><th>Lớp</th><th>GVCN</th><th className="num">Sĩ số</th><th>Giáo viên bộ môn</th><th>Trạng thái</th><th className="center">Thao tác</th></tr></thead>
              {groups.filter((g) => g.classes.length || !q).map((g) => (
                <tbody key={g.grade.id}>
                  <tr className="bg-[#f7fbff]">
                    <td colSpan={6} className="!py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" className="flex items-center gap-2 font-bold text-primary-strong" aria-expanded={!collapsed[g.grade.id]} onClick={() => setCollapsed((s) => ({ ...s, [g.grade.id]: !s[g.grade.id] }))}>
                          {collapsed[g.grade.id] ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{g.grade.name}<span className="font-normal text-muted">({g.classes.length} lớp)</span>
                        </button>
                        {canAdd && g.grade.status === "active" && <button type="button" className="ml-auto text-[12.5px] font-semibold text-primary-strong hover:underline" onClick={() => onAdd(g.grade.id)}>+ Thêm lớp {g.grade.name.replace("Khối ", "")}</button>}
                      </div>
                    </td>
                  </tr>
                  {!collapsed[g.grade.id] && g.classes.length === 0 && <tr><td colSpan={6} className="text-[13px] text-muted">Chưa có lớp trong khối này.</td></tr>}
                  {!collapsed[g.grade.id] && g.classes.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/classroom/${school.id}/${d.year.id}/${r.id}`} className="font-semibold text-ink hover:text-primary-strong hover:underline">{r.name}</Link></td>
                      <td>{r.homeroomName ?? <span className="font-medium text-danger-text">Chưa phân công</span>}</td>
                      <td className="num">{r.size ?? "—"}<span className="text-muted">/{r.capacity}</span></td>
                      <td>{r.subjectTeacherCount} giáo viên</td>
                      <td><StatusBadge status={r.status} map={classStatus} /></td>
                      <td className="center"><ActionMenu label={`Thao tác với lớp ${r.name}`} items={menu(r)} /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{d.assignedHomeroom}/{d.totalClasses} lớp đã có GVCN. Lớp chưa có GVCN giữ trạng thái Nháp.</p>
        </div>
      )}
    </Card>
  );
}
