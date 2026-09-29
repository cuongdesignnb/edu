"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, ArrowLeftRight, Eye, Users2, History, LayoutGrid, Pencil, Crown, UserRound } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, positionLabel } from "@/lib/formatters";
import type { StudentPositionKey } from "@/lib/model/types";
import { useClassroom } from "@/features/classroom/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { InlineSelect } from "@/components/ui/form";
import { ActionMenu } from "@/components/ui/menu";
import { DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState, Skeleton } from "@/components/ui/states";
import { ChangeGroupDialog, TransferDialog } from "./dialogs";
import { ClassroomFrame, SeatMapView } from "./seat-view";

type Roster = Awaited<ReturnType<typeof classroomRepo.roster>>;
type Row = Roster["rows"][number];

export const LINK_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  none: { label: "Chưa cấp", tone: "neutral" },
  issued: { label: "Đã cấp link", tone: "info" },
  opened: { label: "Link đã được mở", tone: "success" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};
const POS_TONE: Record<string, "warning" | "info" | "purple"> = { "Lớp trưởng": "warning", "Bí thư": "purple" };
const PAGE = 10;

/** CL02 — class roster (R06) with groups / positions and a seating preview. */
export function ClassRoster() {
  const { schoolId, yearId, classId, base, can, readOnly, header } = useClassroom();
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [link, setLink] = useState("");
  const [page, setPage] = useState(1);
  const [groupFor, setGroupFor] = useState<Row | null>(null);
  const [transfer, setTransfer] = useState<{ open: boolean; preset: string | null }>({ open: false, preset: null });
  const all = useRepo(["class-roster", classId], (ctx) => classroomRepo.roster(ctx, schoolId, yearId, classId));
  const list = useRepo(["class-roster", classId, q, groupId, link], (ctx) => classroomRepo.roster(ctx, schoolId, yearId, classId, { q, groupId: groupId || undefined, linkStatus: link || undefined }), { placeholderData: (p) => p });
  const side = can("groups.manage") || can("seating.manage") || can("student.profile.view");
  const indexOf = useMemo(() => new Map((all.data?.rows ?? []).map((r, i) => [r.id, i + 1])), [all.data]);
  const reset = () => { setQ(""); setGroupId(""); setLink(""); setPage(1); };
  const active = !!q || !!groupId || !!link;

  return (
    <QueryState query={all} skeleton="none">
      {(d) => {
        const rows = list.data?.rows ?? d.rows;
        const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
        const cur = Math.min(page, pageCount);
        const pageRows = rows.slice((cur - 1) * PAGE, cur * PAGE);
        const columns: Column<Row>[] = [
          { key: "no", header: "#", cell: (r) => <span className="tabular-nums text-muted">{indexOf.get(r.id)}</span>, className: "w-10" },
          { key: "name", header: "Học sinh", cell: (r) => (
            <Link href={`${base}/students/${r.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
              <Avatar name={r.fullName} tone={r.avatarTone} size={34} />
              <span className="min-w-0"><span className="block truncate font-semibold text-ink">{r.fullName}</span><span className="block text-[12px] text-muted">{r.code}{r.transferredIn ? " · chuyển đến" : ""}</span></span>
            </Link>
          ) },
          { key: "group", header: "Tổ", cell: (r) => r.groupName ?? <span className="whitespace-nowrap text-warning-text">Chưa phân tổ</span>, className: "whitespace-nowrap" },
          { key: "pos", header: "Chức vụ", hideBelow: "sm", cell: (r) => r.positions.length ? <span className="flex flex-wrap gap-1">{r.positions.map((p) => <Badge key={p} tone={POS_TONE[p] ?? "info"} dot={false}>{p}</Badge>)}</span> : <span className="text-faint">—</span> },
          ...(d.seeGuardians ? [{ key: "guardian", header: "Người giám hộ", hideBelow: "md" as const, cell: (r: Row) => r.guardian ? <span className="block min-w-0"><span className="block truncate text-ink">{r.guardian.name}</span><span className="block text-[12px] text-muted">({r.guardian.relation}){r.guardian.verification !== "verified" ? " · chưa xác minh" : ""}</span></span> : <span className="text-warning-text">Chưa có</span> }] : []),
          ...(d.seeLinks ? [{ key: "link", header: "Link tra cứu", cell: (r: Row) => { const s = LINK_STATUS[r.link ?? "none"]; return <Badge tone={s.tone} className="whitespace-nowrap">{s.label}</Badge>; } }] : []),
          { key: "act", header: <span className="sr-only">Thao tác</span>, className: "w-12", cell: (r) => (
            <ActionMenu label={`Thao tác cho ${r.fullName}`} items={[
              { label: "Xem hồ sơ", icon: <Eye />, href: `${base}/students/${r.id}` },
              ...(d.canGroups && !readOnly ? [{ label: "Đổi tổ", icon: <Users2 />, onSelect: () => setGroupFor(r) }] : []),
              ...(d.canTransfer && !readOnly ? [{ label: "Đề nghị chuyển lớp", icon: <ArrowLeftRight />, onSelect: () => setTransfer({ open: true, preset: r.id }), hint: "Nhà trường duyệt, lịch sử được giữ" }] : []),
            ]} />
          ) },
        ];
        return (
          <div className={side ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_336px]" : ""}>
            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader title={`Danh sách học sinh (${d.rows.length})`} icon={<ClipboardList className="size-5 text-primary" />}
                  action={!readOnly && <>
                    {d.canAdd && <ButtonLink href={`/school/${schoolId}/students/new?classId=${classId}`} size="sm" variant="primary" icon={<Plus className="size-4" />}>Thêm học sinh</ButtonLink>}
                    {d.canTransfer && <Button size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={() => setTransfer({ open: true, preset: null })}>Chuyển lớp</Button>}
                  </>} />
                <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder="Tìm học sinh theo họ tên, mã…" active={active} onReset={reset}>
                  <InlineSelect label="Lọc theo tổ" value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} allLabel="Tất cả tổ" options={[...d.groups.map((g) => ({ value: g.id, label: g.name })), { value: "none", label: "Chưa phân tổ" }]} />
                  {d.seeLinks && <InlineSelect label="Trạng thái link" value={link} onChange={(v) => { setLink(v); setPage(1); }} allLabel="Tất cả trạng thái link" options={Object.entries(LINK_STATUS).map(([value, s]) => ({ value, label: s.label }))} />}
                </FilterBar>
                {!d.seeGuardians && <p className="mx-4 mb-3 rounded-lg bg-neutral-bg px-3 py-2 text-[12.5px] text-neutral-text">Bạn xem danh sách theo phạm vi giáo viên bộ môn: không hiển thị người giám hộ và link tra cứu.</p>}
                {d.rows.length === 0 ? <EmptyState title="Lớp chưa có học sinh" description={d.canAdd ? "Thêm học sinh hoặc nhập danh sách từ tệp ở phần Học sinh của nhà trường." : "Nhà trường chưa xếp học sinh vào lớp này."} />
                  : <div className="[&_td]:!px-2.5 [&_th]:!px-2.5 [&_td]:text-[13.5px]"><DataTable rows={pageRows} columns={columns} rowKey={(r) => r.id} caption={`Học sinh lớp ${header.class.name}`} minWidth={d.seeGuardians ? 680 : 520} dense empty={<EmptyFiltered onReset={reset} what="học sinh" />} /></div>}
                {rows.length > 0 && <Pagination page={cur} pageCount={pageCount} total={rows.length} pageSize={PAGE} onPage={setPage} what="học sinh" />}
              </Card>
              <Card>
                <CardHeader title="Học sinh đã chuyển đi / ngừng theo học" icon={<History className="size-5 text-primary" />} subtitle="Lịch sử được giữ — dữ liệu cũ vẫn có trong báo cáo đúng thời gian" />
                {d.leftRecently.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa có học sinh rời lớp trong năm học này.</p> : (
                  <ul className="divide-y divide-line px-5 pb-3">
                    {d.leftRecently.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                        <span className="min-w-[200px] flex-1"><span className="block font-semibold text-ink">{s.fullName} <span className="font-normal text-muted">· {s.code}</span></span><span className="block text-muted">Rời lớp {fmtDate(s.endDate)}{s.reason ? ` — ${s.reason}` : ""}</span></span>
                        <Link href={`${base}/students/${s.id}`} className="font-semibold text-primary-strong hover:underline">Xem lịch sử</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            {side && (
              <div className="min-w-0 space-y-5">
                <SeatingPreview />
                <GroupsSummary />
              </div>
            )}
            <ChangeGroupDialog open={!!groupFor} onOpenChange={(o) => { if (!o) setGroupFor(null); }} schoolId={schoolId} classId={classId} student={groupFor} groups={d.groups} />
            <TransferDialog open={transfer.open} onOpenChange={(o) => setTransfer((t) => ({ ...t, open: o }))} schoolId={schoolId} yearId={yearId} classId={classId} preset={transfer.preset} students={d.rows} />
          </div>
        );
      }}
    </QueryState>
  );
}

function SeatingPreview() {
  const { schoolId, yearId, classId, base, can, readOnly } = useClassroom();
  const q = useRepo(["class-seating", classId], (ctx) => classroomRepo.seating(ctx, schoolId, yearId, classId));
  return (
    <Card>
      <CardHeader title="Sơ đồ lớp" icon={<LayoutGrid className="size-5 text-primary" />}
        action={<ButtonLink href={`${base}/seating`} size="sm" icon={can("seating.manage") && !readOnly ? <Pencil className="size-4" /> : <Eye className="size-4" />}>{can("seating.manage") && !readOnly ? "Cập nhật sơ đồ" : "Xem sơ đồ"}</ButtonLink>} />
      <div className="px-4 pb-4">
        {q.isLoading ? <Skeleton className="h-72" /> : !q.data?.plan ? <EmptyState compact title="Chưa có sơ đồ lớp" description="Tạo sơ đồ để xếp chỗ ngồi theo phiên bản." /> : (
          <Link href={`${base}/seating`} className="block" aria-label="Mở sơ đồ lớp">
            <ClassroomFrame compact>
              <SeatMapView compact rows={q.data.plan.rows} cols={q.data.plan.cols} seats={q.data.plan.seats} names={new Map(q.data.students.map((s) => [s.id, s.fullName]))} />
            </ClassroomFrame>
            <p className="mt-2 text-[12px] text-muted">Phiên bản {q.data.plan.version} · áp dụng từ {fmtDate(q.data.plan.effectiveDate)}{q.data.unseated.length ? ` · ${q.data.unseated.length} học sinh chưa có chỗ` : ""}</p>
          </Link>
        )}
      </div>
    </Card>
  );
}

function GroupsSummary() {
  const { schoolId, yearId, classId, base, can, readOnly } = useClassroom();
  const q = useRepo(["class-groups", classId], (ctx) => classroomRepo.groups(ctx, schoolId, yearId, classId));
  const TONES = ["bg-[#fff4e0] text-[#9a5700]", "bg-[#f1ecff] text-[#5b3cc4]", "bg-[#e6f7f0] text-[#05744f]", "bg-[#e8f3ff] text-[#0659c2]"];
  return (
    <Card>
      <CardHeader title="Tổ & Chức vụ" icon={<Users2 className="size-5 text-primary" />} action={<ButtonLink href={`${base}/groups`} size="sm" icon={<UserRound className="size-4" />}>{can("groups.manage") && !readOnly ? "Phân vai trò" : "Xem chi tiết"}</ButtonLink>} />
      <div className="px-4 pb-4">
        {q.isLoading ? <Skeleton className="h-40" /> : q.data && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2">
              {q.data.groups.map((g, i) => {
                const leader = q.data!.positions.find((p) => p.position === "group_leader" && p.groupId === g.id);
                const special = q.data!.positions.filter((p) => p.position !== "group_leader" && g.members.some((m) => m.id === p.studentId));
                return (
                  <Link key={g.id} href={`${base}/groups`} className="rounded-xl border border-line bg-white p-2.5 hover:border-[#9cc7f5]">
                    <p className={`-mx-2.5 -mt-2.5 mb-2 rounded-t-xl px-2.5 py-1.5 text-[14px] font-bold ${TONES[i % 4]}`}>{g.name} <span className="text-[11.5px] font-normal">({g.members.length} học sinh)</span></p>
                    {special.map((p) => <p key={p.id} className="flex items-start gap-1.5 text-[12px]"><Crown className="mt-0.5 size-3.5 flex-none text-warning" aria-hidden /><span><b className="text-ink">{positionLabel[p.position as StudentPositionKey]}</b><span className="block text-muted">{p.studentName}</span></span></p>)}
                    <p className="flex items-start gap-1.5 text-[12px]"><UserRound className="mt-0.5 size-3.5 flex-none text-primary" aria-hidden /><span><b className="text-ink">Tổ trưởng</b><span className="block text-muted">{leader?.studentName ?? "Chưa phân công"}</span></span></p>
                  </Link>
                );
              })}
            </div>
            {q.data.unassigned.length > 0 && <p className="mt-2 text-[12.5px] text-warning-text">{q.data.unassigned.length} học sinh chưa phân tổ</p>}
          </>
        )}
      </div>
    </Card>
  );
}
