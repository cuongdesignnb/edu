"use client";
import { useState, type ReactNode } from "react";
import { announcementsRepo, classroomRepo, conductRepo, reportsRepo, staffRepo, studentsRepo } from "@/lib/repositories/demo-index";
import { useRepo } from "@/lib/query/demo-hooks";
import type { SnapshotRow } from "@/lib/model/types";
import { registryById } from "@/lib/routing/registry";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/ui/timeline";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { SchoolContextProvider } from "@/components/layout/shells";
import { SchoolsTable } from "@/features/platform/schools-table";
import { AssignDrawer } from "@/features/school-org/assign-drawer";
import { ClassHeroCard } from "@/features/teacher/shared";
import { QrImage, LinkBox, QrPrintCard, accessUrl, logLabel, ACCESS_STATUS } from "@/features/students/shared";
import { StatusBadge } from "@/components/ui/badge";
import { TransferDialog } from "@/features/students/dialogs";
import { WeeklyConductTable, ExplainDrawer } from "@/features/conduct/week-table";
import { PeriodStateBanner } from "@/features/conduct/shared";
import { SeatMapView, ClassroomFrame } from "@/features/class-org/seat-view";
import { AnnouncementComposer, ParentPreview } from "@/features/announcements/composer";
import { ReportViewer } from "@/features/reports/viewer";
import { StatusButtons, StatusLegend } from "@/features/attendance/status";
import type { AttendanceStatus } from "@/lib/model/types";
import { Identity } from "@/components/ui/avatar";
import { OpenButton, PARENT_LINKS, accessHref } from "../open";
import { NeedPersona, Frame } from "./common";

const A = "demo-school-a";
const Y = "y-a-2026";
const C = "c-a-10a1";

function Loading() { return <Skeleton className="h-24" />; }

/** Opens the route that hosts a domain component that needs a class workspace. */
function Host({ ids, note }: { ids: string[]; note: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-body">{note}</p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => { const e = registryById(id)!; return <OpenButton key={id} persona={e.persona} href={e.href} label={`Mở ${id} — ${e.title}`} />; })}
      </div>
    </div>
  );
}

function TeacherClassCards() {
  const q = useRepo(["preview-teacher-classes"], (ctx) => classroomRepo.teacherClasses(ctx, A));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {q.data.map((c) => <ClassHeroCard key={c.id} href={`/classroom/${A}/${c.yearId}/${c.id}`} name={c.name} roles={c.duties.map((d) => d.label)} size={c.size} motto={c.motto} homeroom={c.duties.some((d) => d.kind === "homeroom")} />)}
    </div>
  );
}

function MemberPermissions() {
  const q = useRepo(["preview-member", "m-a-lan"], (ctx) => staffRepo.member(ctx, A, "m-a-lan"));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  return <div className="space-y-2"><p className="text-[13px] font-semibold text-ink">{q.data.user.displayName}</p><p className="text-sm text-muted">Minh họa cũ: {q.data.roles.map(r => r.name).join(", ") || "Theo phân công lớp/môn"}.</p></div>;
}

function AccessCard() {
  const q = useRepo(["preview-access", "pa-minhanh-me"], (ctx) => studentsRepo.access(ctx, A, "pa-minhanh-me"));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const url = accessUrl(d.school.slug, d.access.token);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-2">
        <div className="overflow-x-auto"><QrPrintCard url={url} studentName={d.student.fullName} className={d.student.className} relation={d.relationship.relation} schoolName={d.school.name} expiresAt={d.access.expiresAt} /></div>
      </div>
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-body">Trạng thái link: <StatusBadge status={d.access.status} map={ACCESS_STATUS} /> · năm {d.yearLabel} · cấp bởi {d.issuedByName}</p>
        <LinkBox url={url} />
        <div className="flex items-center gap-3"><QrImage url={url} size={96} /><span className="text-[12.5px] text-muted">QR mã hóa đúng link demo ở trên.</span></div>
        <p className="text-[13px] font-semibold text-ink">Nhật ký link (C057)</p>
        <Timeline items={d.logs.slice(0, 5).map((l) => ({ id: l.id, at: l.at, title: logLabel(d.relationship.relation, d.guardian.fullName, l.event), detail: l.device }))} empty="Link chưa được mở." />
      </div>
    </div>
  );
}

function ConductSnapshot() {
  const q = useRepo(["preview-snapshot", "snap-c-a-10a1-w4-v1"], (ctx) => conductRepo.snapshot(ctx, A, Y, C, "snap-c-a-10a1-w4-v1"));
  const [row, setRow] = useState<SnapshotRow | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const rs = d.ruleSet;
  return (
    <div className="space-y-3">
      <PeriodStateBanner status={d.snapshot.status === "published" ? "published" : "locked"} snapshot={{ versionNo: d.snapshot.versionNo, publishedAt: d.snapshot.publishedAt, ruleSetName: rs.name, ruleSetVersionNo: rs.versionNo }} lockedAt={d.snapshot.lockedAt} lockedByName={d.lockedByName} />
      <div className="-mx-3 rounded-xl border border-line bg-white pt-3 sm:mx-0">
        <WeeklyConductTable rows={d.snapshot.rows} bands={rs.bands} compact pageSize={5} onExplain={setRow} caption={`Thi đua ${d.className} tuần ${d.week.index}`} />
      </div>
      <ExplainDrawer row={row} ruleSet={{ name: rs.name, versionNo: rs.versionNo, baseScore: rs.baseScore, cap: rs.cap, floor: rs.floor, bands: rs.bands }} official onClose={() => setRow(null)} weekText={`Tuần ${d.week.index}`} />
      <p className="text-[12.5px] text-muted">Bản công bố {d.versions.length > 1 ? `có ${d.versions.length} phiên bản` : "phiên bản 1"}; đổi nội quy hiện tại không đổi snapshot này.</p>
    </div>
  );
}

function SeatMap() {
  const q = useRepo(["preview-seating"], (ctx) => classroomRepo.seating(ctx, A, Y, C));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data.plan;
  if (!p) return <p className="text-[13px] text-muted">Lớp chưa có sơ đồ đang hiệu lực.</p>;
  const names = new Map(q.data.students.map((s) => [s.id, s.fullName]));
  return <div className="overflow-x-auto"><div className="min-w-[520px]"><ClassroomFrame compact><SeatMapView rows={p.rows} cols={p.cols} seats={p.seats} names={names} compact /></ClassroomFrame></div></div>;
}

function Composer() {
  const [open, setOpen] = useState(false);
  const an = useRepo(["preview-an", "an-1"], (ctx) => announcementsRepo.detail(ctx, A, "an-1"));
  return (
    <div className="space-y-3">
      {an.data ? <ParentPreview title={an.data.title} summary={an.data.summary} body={an.data.body} audience={an.data.audience} files={[]} isPublic={an.data.isPublic} />
        : an.error ? <ErrorState compact error={an.error} onRetry={() => an.refetch()} /> : <Loading />}
      {an.data && <p className="text-[12.5px] text-muted">Xem trước phía phụ huynh của thông báo “{an.data.title}” (an-1) đọc từ repository.</p>}
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Ẩn trình soạn thật" : "Mở trình soạn thật (AnnouncementComposer)"}</Button>
      {open && <Frame><AnnouncementComposer schoolId={A} origin="school" onDone={() => setOpen(false)} /></Frame>}
    </div>
  );
}

function Report() {
  const q = useRepo(["preview-o30"], (ctx) => reportsRepo.school(ctx, A, "attendance", {}));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  return <ReportViewer data={q.data} fileBase={q.data.title} />;
}

function AssignTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <SchoolContextProvider schoolId={A} loading={<Loading />}>
      {() => <><Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Mở drawer phân công</Button>{open && <AssignDrawer prefill={{ kind: "subject", yearId: Y }} onClose={() => setOpen(false)} />}</>}
    </SchoolContextProvider>
  );
}

function TransferTrigger() {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Mở hộp thoại chuyển lớp</Button><TransferDialog open={open} onOpenChange={setOpen} schoolId={A} canDecide /></>;
}

/** C058 / C059 — the real attendance status control on real roster rows (local state only, not saved). */
function AttendanceRows({ large }: { large?: boolean }) {
  const q = useRepo(["preview-roster"], (ctx) => classroomRepo.roster(ctx, A, Y, C));
  const [v, setV] = useState<Record<string, AttendanceStatus>>({});
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data.rows.slice(0, large ? 1 : 3);
  return (
    <div className="space-y-2">
      <ul className={large ? "max-w-sm space-y-2" : "divide-y divide-line rounded-xl border border-line bg-white"}>
        {rows.map((r) => (
          <li key={r.id} className={large ? "card space-y-3 p-3" : "flex flex-wrap items-center gap-3 px-3 py-2"}>
            <Identity name={r.fullName} sub={r.code} size={32} />
            <div className={large ? "" : "ml-auto"}><StatusButtons name={r.fullName} value={v[r.id] ?? "unmarked"} onChange={(x) => setV({ ...v, [r.id]: x })} large={large} /></div>
          </li>
        ))}
      </ul>
      {!large && <StatusLegend />}
      <p className="text-[12.5px] text-muted">Mặc định “Chưa điểm danh”, không tự tính có mặt. Ví dụ này không lưu — điểm danh thật ở CL04.</p>
    </div>
  );
}

const staff = (u: string) => ({ kind: "staff" as const, userId: u });

export const DOMAIN_EXAMPLES: Record<string, () => ReactNode> = {
  C048: () => <NeedPersona need={{ kind: "platform", userId: "u-bao" }} why="Danh sách trường đọc từ platformRepo (vai trò vận hành nền tảng)."><div className="-mx-3 rounded-xl border border-line bg-white pt-3 sm:mx-0"><SchoolsTable pageSize={4} showCreate={false} /></div></NeedPersona>,
  C049: () => <NeedPersona need={staff("u-hanh")}><AssignTrigger /></NeedPersona>,
  C050: () => <NeedPersona need={staff("u-hanh")} why="Tóm tắt quyền của Cô Lan đọc từ staffRepo.member (Quản trị trường A)."><MemberPermissions /></NeedPersona>,
  C051: () => <NeedPersona need={staff("u-lan")} why="Thẻ lớp đọc từ classroomRepo.teacherClasses (Cô Lan)."><TeacherClassCards /></NeedPersona>,
  C052: () => <Host ids={["CL02", "SC16"]} note="Roster lớp dùng ngữ cảnh lớp (ClassroomLayout) nên chỉ xem được trong route thật; giáo viên bộ môn thấy bản tối giản." />,
  C053: () => <Host ids={["SC18", "CL03"]} note="Hồ sơ học sinh có hai mức chiếu dữ liệu (đầy đủ / bộ môn tối giản) — mở bằng hai vai trò để so sánh." />,
  C054: () => <Host ids={["SC22", "SC21"]} note="Thẻ quan hệ giám hộ: chưa xác minh / đã xác minh / đã thu hồi (xác minh thật ở overlay O10 trang Trạng thái)." />,
  C055: () => <NeedPersona need={staff("u-hanh")} why="Thẻ link của mẹ Minh Anh đọc từ studentsRepo.access (Quản trị trường A)."><AccessCard /></NeedPersona>,
  C056: () => <p className="text-[13px] text-body">QR, ô sao chép link và thẻ in hiển thị trực tiếp trong ví dụ C055 (QrImage, LinkBox, QrPrintCard thật).</p>,
  C057: () => <p className="text-[13px] text-body">Nhật ký link (“Link cấp cho … được mở”) hiển thị trong ví dụ C055, đọc từ repository.</p>,
  C058: () => <NeedPersona need={staff("u-lan")} why="Dòng điểm danh dùng roster 10A1 từ classroomRepo.roster (Cô Lan)."><div className="space-y-2"><AttendanceRows /><Host ids={["CL04"]} note="Bảng điểm danh đầy đủ (lưu, sửa có lịch sử, hàng loạt có xác nhận):" /></div></NeedPersona>,
  C059: () => <NeedPersona need={staff("u-lan")}><AttendanceRows large /></NeedPersona>,
  C060: () => <Host ids={["CL06"]} note="Chọn quy định cộng/trừ theo bộ nội quy đang hiệu lực — trong biểu mẫu ghi nhận thi đua." />,
  C061: () => <Host ids={["CL06"]} note="Biểu mẫu ghi nhận có chống trùng sự kiện nguồn (hộp thoại O18)." />,
  C062: () => <NeedPersona need={staff("u-lan")} why="Bảng thi đua tuần 4 đọc từ snapshot đã công bố (Cô Lan)."><ConductSnapshot /></NeedPersona>,
  C063: () => <Host ids={["CL08", "SC36"]} note="Bảng rà soát, chốt và công bố — phân biệt lưu / chốt / công bố." />,
  C064: () => <p className="text-[13px] text-body">Banner trạng thái bản công bố và giải trình điểm hiển thị thật trong ví dụ C062 (PeriodStateBanner, ExplainDrawer).</p>,
  C065: () => <Host ids={["CL13"]} note="Tổ và chức vụ là dữ liệu học sinh, không cấp quyền đăng nhập." />,
  C066: () => <NeedPersona need={staff("u-lan")} why="Sơ đồ lớp 10A1 đọc từ classroomRepo.seating (Cô Lan)."><div className="space-y-2"><SeatMap /><Host ids={["CL14"]} note="Trình sửa sơ đồ (chọn ghế qua form, hoàn tác, ngày hiệu lực) nằm ở route thật." /></div></NeedPersona>,
  C067: () => <Host ids={["CL15", "TE03", "SC32"]} note="Lưới tuần trên desktop, danh sách theo ngày trên điện thoại." />,
  C068: () => <Host ids={["CL16"]} note="Phân công trực nhật; phụ huynh chỉ thấy nhiệm vụ của con." />,
  C069: () => <Host ids={["CL17", "CL19"]} note="Thẻ tiến độ hoạt động: mẫu số là số học sinh được giao." />,
  C070: () => <Host ids={["CL20"]} note="Duyệt / yêu cầu bổ sung / từ chối minh chứng có lý do." />,
  C071: () => <NeedPersona need={staff("u-hanh")} why="Trình soạn thông báo đọc đối tượng từ repository (Quản trị trường A)."><Composer /></NeedPersona>,
  C072: () => <Host ids={["SC27", "SC28"]} note="Trình nhập: tệp → ánh xạ → kiểm tra → xem trước → kết quả." />,
  C073: () => <NeedPersona need={staff("u-hanh")}><div className="space-y-2"><TransferTrigger /><Host ids={["SC15"]} note="Bàn giao chủ nhiệm có ngày hiệu lực và xem trước thay đổi quyền." /></div></NeedPersona>,
  C074: () => <NeedPersona need={staff("u-hanh")} why="Báo cáo chuyên cần trường A tạo từ reportsRepo (Quản trị trường A); xuất CSV/XLSX thật."><Report /></NeedPersona>,
  C075: () => (
    <div className="space-y-2">
      <p className="text-[13px] text-body">Khung phụ huynh chỉ đọc: không đăng ký, đăng nhập, tải lên, chat hay chọn học sinh tùy ý. Mở trong tab mới:</p>
      <div className="flex flex-wrap gap-2">
        <OpenButton persona={{ kind: "parent", slug: PARENT_LINKS.me.slug, token: PARENT_LINKS.me.token }} href={accessHref(PARENT_LINKS.me.slug, PARENT_LINKS.me.token)} label="Tổng quan (link của mẹ)" />
        <OpenButton persona={{ kind: "parent", slug: PARENT_LINKS.limited.slug, token: PARENT_LINKS.limited.token }} href={accessHref(PARENT_LINKS.limited.slug, PARENT_LINKS.limited.token)} label="Link chỉ 2 mục" />
        <OpenButton persona={{ kind: "parent", slug: PARENT_LINKS.revoked.slug, token: PARENT_LINKS.revoked.token }} href={accessHref(PARENT_LINKS.revoked.slug, PARENT_LINKS.revoked.token)} label="Link bị thu hồi" />
      </div>
    </div>
  ),
};

/** Components rendered live from real code on this page (the rest link to their route). */
export const DOMAIN_LIVE = ["C058", "C059", "C048", "C049", "C050", "C051", "C055", "C056", "C057", "C062", "C064", "C071", "C073", "C074"];
