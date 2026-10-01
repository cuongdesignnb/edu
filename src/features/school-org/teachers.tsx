"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Users, UserCheck, Clock, UserX, UserPlus, Download, Presentation, X, Pencil, Mail, Phone, Eye, UserCog, Lock, Unlock, Ban,
  ShieldCheck, History, UserRound, ChevronDown, FileSpreadsheet, FileText, ArrowRight, UserMinus, RefreshCw,
} from "lucide-react";

import { staffRepo } from "@/lib/repositories";

import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { Card, CardHeader, InfoRow } from "@/components/ui/card";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Timeline } from "@/components/ui/timeline";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { fmtDate, fmtNumber, fmtRelative, invitationStatus } from "@/lib/formatters";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { InviteModal } from "./invite-modal";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";
import { PermissionSummary } from "./permission-summary";
import { useIsWide } from "./common";
import { useToast } from "@/components/ui/toast";
import { staffMembershipStatus } from "./staff-display";
type TeacherRow = Awaited<ReturnType<typeof staffRepo.teachers>>["items"][number];
type InvitationTarget = { id: string; name: string; version: number };

const ROLE_TONE: Record<string, "info" | "warning" | "purple" | "success" | "neutral"> = {
  "GVCN": "info", "Giáo viên bộ môn": "info", "Ban giám hiệu": "warning", "Giáo vụ": "purple", "Quản trị trường": "success", "Lời mời": "warning", "Chưa phân công": "neutral",
};

type StatusTarget = { membershipId: string; name: string; version: number; to: "active" | "suspended" | "revoked" } | null;

/** SC10 — teachers & permissions (R04): KPIs, filtered table, detail panel, invitations, recent changes. */
export function TeachersScreen() {
  const { school } = useSchool();
  const ctx = useCtx();
  const toast = useToast();
  const wide = useIsWide();
  const list = useListQuery({ pageSize: 10, sort: "name", dir: "asc" });
  const q = useRepo(["school-teachers", school.id, list.query], (c) => staffRepo.teachers(c, school.id, list.query));
  const [selected, setSelected] = useState<TeacherRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const [assign, setAssign] = useState<AssignPrefill | null>(null);
  const [status, setStatus] = useState<StatusTarget>(null);
  const [revokeInv, setRevokeInv] = useState<InvitationTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  // Desktop: keep a row selected (first member) so the panel mirrors R04.
  useEffect(() => {
    if (!q.data) return;
    if (selected && q.data.items.some((r) => r.id === selected.id)) return;
    if (wide) setSelected(q.data.items.find((r) => r.kind === "member") ?? null);
  }, [q.data, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  const suspend = useCommand((c, t: NonNullable<StatusTarget>, reason: string) => staffRepo.setMembershipStatus(c, school.id, t.membershipId, t.to, reason, t.version), {
    success: (m) => m.status === "active" ? "Đã mở khóa thành viên" : m.status === "suspended" ? "Đã tạm khóa thành viên tại trường này" : "Đã thu hồi thành viên tại trường này",
  });
  const revoke = useCommand((c, target: InvitationTarget, reason: string) => staffRepo.revokeInvitation(c, school.id, target.id, target.version, reason), { success: "Đã thu hồi lời mời" });

  const roleOptions = useMemo(() => (q.data?.roleOptions ?? []).map(v => ({value:v,label:v})), [q.data?.roleOptions]);

  const exportRows = async (fmt: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const all = await staffRepo.teachers(ctx, school.id, { ...list.query, page: 1, pageSize: 100000 });
      const cols = [{ key: "name", label: "Họ tên" }, { key: "email", label: "Email" }, { key: "code", label: "Mã" }, { key: "dept", label: "Bộ phận" }, { key: "roles", label: "Vai trò" }, { key: "duties", label: "Phân công" }, { key: "status", label: "Trạng thái" }];
      const rows = all.items.map((r) => ({ name: r.fullName, email: r.email, code: r.staffCode, dept: r.department, roles: r.roleLabels.join("; "), duties: r.dutyLabels.join("; "), status: r.kind === "invitation" ? "Lời mời chờ xác nhận" : staffMembershipStatus[r.status].label }));
      const file = `giao-vien-${school.slug}`;
      if (fmt === "csv") downloadCSV(cols, rows, file);
      else await downloadXLSX(cols, rows, file, { title: `Danh sách giáo viên — ${school.name}`, subtitle: `${rows.length} dòng theo bộ lọc hiện tại` });
    } catch (e) { toast.push({ tone: "error", title: "Không xuất được dữ liệu", detail: e instanceof Error ? e.message : undefined }); } finally { setExporting(false); }
  };

  const select = (r: TeacherRow) => { setSelected(r); if (!wide) setPanelOpen(true); };

  const columns: Column<TeacherRow>[] = [
    { key: "idx", header: "#", cell: (r) => <span className="text-muted">{(q.data!.page - 1) * q.data!.pageSize + q.data!.items.indexOf(r) + 1}</span> },
    { key: "name", header: "Giáo viên", sortable: true, cell: (r) => (
      <span className="flex min-w-[200px] items-center gap-2.5">
        <Avatar name={r.fullName} tone={r.avatarTone} size={36} />
        <span className="min-w-0"><span className="block truncate font-semibold text-primary-strong">{r.displayName}</span><span className="block truncate text-[12px] text-muted">{r.email}</span></span>
      </span>
    ) },
    { key: "department", header: "Bộ phận", sortable: true, className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell", cell: (r) => <span className="text-body">{r.department}</span> },
    { key: "roles", header: "Vai trò", cell: (r) => <span className="flex max-w-[150px] flex-wrap gap-1">{r.roleLabels.map((l) => <Badge key={l} tone={ROLE_TONE[l] ?? "info"} dot={false} className="whitespace-nowrap">{l}</Badge>)}</span> },
    { key: "duty", header: "Phân công", hideBelow: "md", cell: (r) => <span className="line-clamp-2 block max-w-[140px] text-[12.5px] leading-snug text-body" title={r.dutyLabels.join(", ")}>{r.dutyLabels.length ? r.dutyLabels.slice(0, 2).join(", ") + (r.dutyLabels.length > 2 ? ` +${r.dutyLabels.length - 2}` : "") : <span className="text-muted">—</span>}</span> },
    { key: "status", header: "Trạng thái", className: "whitespace-nowrap", cell: (r) => r.kind === "invitation" ? <StatusBadge status="pending" map={invitationStatus} /> : <StatusBadge status={r.status} map={staffMembershipStatus} /> },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (r) => <ActionMenu label={`Thao tác với ${r.displayName}`} items={rowMenu(r)} /> },
  ];

  function rowMenu(r: TeacherRow): MenuItem[] {
    if (r.kind === "invitation") return [
      { label: "Xem lời mời", icon: <Eye />, onSelect: () => select(r) },
      ...(q.data?.canInvite ? [{ label: "Thu hồi lời mời", icon: <Ban />, danger: true, onSelect: () => setRevokeInv({ id: r.id, name: r.fullName, version: r.version }), separatorBefore: true }] : []),
    ];
    return [
      { label: "Xem phân quyền", icon: <ShieldCheck />, onSelect: () => select(r) },
      { label: "Hồ sơ & phân công", icon: <UserRound />, href: `/school/${school.id}/teachers/${r.membershipId}` },
      ...(q.data?.canAssign && r.status === "active" ? [{ label: "Phân công mới", icon: <UserCog />, onSelect: () => setAssign({ membershipId: r.membershipId }) }] : []),
      ...(q.data?.canSuspend && r.status === "active" ? [{ label: "Tạm khóa tại trường", icon: <Lock />, danger: true, separatorBefore: true, onSelect: () => setStatus({ membershipId: r.membershipId, name: r.displayName, version: r.version, to: "suspended" }) }] : []),
      ...(q.data?.canSuspend && r.status === "suspended" ? [{ label: "Mở khóa", icon: <Unlock />, separatorBefore: true, onSelect: () => setStatus({ membershipId: r.membershipId, name: r.displayName, version: r.version, to: "active" }) }] : []),
    ];
  }

  const panel = selected && <DetailPanel row={selected} onClose={() => { setSelected(null); setPanelOpen(false); }} onRevokeInvite={(id, name, version) => setRevokeInv({ id, name, version })} onAssign={(mid) => setAssign({ membershipId: mid })} canInvite={!!q.data?.canInvite} canAssign={!!q.data?.canAssign} framed={wide} />;

  return (
    <div className="page">
      <PageHeader title="Giáo viên & Phân quyền" subtitle="Quản lý thông tin giáo viên, vai trò và phân quyền trong nhà trường" quote={["Mỗi thầy cô", "là một ngọn lửa thắp sáng tương lai"]} illustration="/assets/illustrations/teachers-trio.png" />
      {q.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Tổng số nhân sự" value={fmtNumber(q.data.kpi.total)} icon={<Users className="size-7" />} tone="blue" hint="Thành viên của trường (mọi trạng thái)" />
          <KpiCard label="Đang hoạt động" value={fmtNumber(q.data.kpi.active)} icon={<UserCheck className="size-7" />} tone="green" hint={q.data.kpi.total ? `${Math.round((q.data.kpi.active / q.data.kpi.total) * 1000) / 10}% tổng nhân sự` : undefined} />
          <KpiCard label="Chờ xác nhận lời mời" value={fmtNumber(q.data.kpi.pendingInvites)} icon={<Clock className="size-7" />} tone="amber" hint="Lời mời còn hạn, chưa phản hồi" />
          <KpiCard label="Tạm khóa / thu hồi" value={fmtNumber(q.data.kpi.suspended)} icon={<UserX className="size-7" />} tone="pink" hint="Danh tính và lịch sử được giữ nguyên" />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader title="Danh sách giáo viên" icon={<Presentation className="size-6 text-primary" />} action={<>
            {q.data?.canInvite && <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInvite(true)}>Mời giáo viên</Button>}
            {q.data?.canExport && <ActionMenu label="Xuất dữ liệu" trigger={<Button icon={<Download className="size-4" />} loading={exporting} iconRight={<ChevronDown className="size-4" />}>Xuất dữ liệu</Button>} items={[
              { label: "Tệp CSV (UTF-8)", icon: <FileText />, hint: "Theo bộ lọc hiện tại", onSelect: () => exportRows("csv") },
              { label: "Tệp Excel (.xlsx)", icon: <FileSpreadsheet />, hint: "Theo bộ lọc hiện tại", onSelect: () => exportRows("xlsx") },
            ]} />}
          </>} />
          <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tên, email, bộ phận, lớp/môn…" onReset={list.reset} active={list.active}>
            <InlineSelect className="!min-w-[150px]" label="Lọc bộ phận" allLabel="Tất cả bộ phận" value={list.query.filters?.department ?? ""} onChange={(v) => list.setFilter("department", v)} options={(q.data?.departments ?? []).map((d) => ({ value: d, label: d }))} />
            <InlineSelect className="!min-w-[150px]" label="Lọc vai trò" allLabel="Tất cả vai trò" value={list.query.filters?.role ?? ""} onChange={(v) => list.setFilter("role", v)} options={roleOptions} />
            <InlineSelect className="!min-w-[150px]" label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={[
              { value: "active", label: "Đang hoạt động" }, { value: "suspended", label: "Tạm khóa" }, { value: "revoked", label: "Đã thu hồi" }, { value: "invited", label: "Lời mời chờ xác nhận" },
            ]} />
          </FilterBar>
          {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
            : (
              <>
                <div className="px-4">
                  <DataTable caption="Danh sách giáo viên" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort}
                    onRowClick={select} rowSelectedKey={selected?.id} minWidth={620}
                    empty={list.active ? <EmptyFiltered onReset={list.reset} what="giáo viên" /> : <EmptyState compact title="Chưa có nhân sự" description="Mời giáo viên để bắt đầu phân công." />} />
                </div>
                <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="nhân sự" />
              </>
            )}
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          {wide && panel}
          <InvitationsPanel onRevoke={(id, name, version) => setRevokeInv({ id, name, version })} onShowAll={() => list.setFilter("status", "invited")} />
          <RecentChanges />
        </div>
      </div>
      {!wide && (
        <Drawer open={panelOpen && !!selected} onOpenChange={(o) => { if (!o) setPanelOpen(false); }} title="Chi tiết phân quyền" width={420}>
          {panel}
        </Drawer>
      )}
      <InviteModal open={invite} onClose={() => setInvite(false)} />
      <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
      <ConfirmDialog open={!!status} onOpenChange={(o) => { if (!o) setStatus(null); }} busy={suspend.pending}
        title={status?.to === "active" ? "Mở khóa thành viên" : "Tạm khóa thành viên tại trường"} object={status?.name}
        variant={status?.to === "active" ? "primary" : "danger"} confirmLabel={status?.to === "active" ? "Mở khóa" : "Tạm khóa"}
        consequence={status?.to === "active" ? "Người này dùng lại được các phân công còn hiệu lực tại trường này." : "Mọi quyền tại trường này bị chặn ở lần đọc/ghi kế tiếp, kể cả tab đang mở. Danh tính, phân công và lịch sử được giữ; các trường khác không bị ảnh hưởng."}
        reasonLabel="Lý do" reasonRequired
        onConfirm={async (reason) => { if (!status) return; const r = await suspend.run(status, reason); if (r) setStatus(null); }} />
      <ConfirmDialog open={!!revokeInv} onOpenChange={(o) => { if (!o) setRevokeInv(null); }} busy={revoke.pending} title="Thu hồi lời mời" object={revokeInv?.name} variant="danger" confirmLabel="Thu hồi lời mời"
        consequence="Đường dẫn nhận lời mời sẽ không dùng được nữa. Có thể mời lại sau." reasonLabel="Lý do thu hồi" reasonRequired
        onConfirm={async reason => { if (!revokeInv) return; const r = await revoke.run(revokeInv, reason); if (r) { setRevokeInv(null); if (selected?.id === revokeInv.id) setSelected(null); } }} />
    </div>
  );
}

/* ------------------------------ right panel: Chi tiết phân quyền ------------------------------ */
function DetailPanel({ row, onClose, onRevokeInvite, onAssign, canInvite, canAssign, framed }: { row: TeacherRow; onClose: () => void; onRevokeInvite: (id: string, name: string, version: number) => void; onAssign: (mid: string) => void; canInvite: boolean; canAssign: boolean; framed: boolean }) {
  const { school } = useSchool();
  if (row.kind === "invitation") return <InvitationDetail row={row} onClose={onClose} onRevoke={onRevokeInvite} canInvite={canInvite} framed={framed} />;
  return <MemberDetailPanel key={row.membershipId} membershipId={row.membershipId} schoolId={school.id} onClose={onClose} onAssign={onAssign} canAssign={canAssign} framed={framed} />;
}

function PanelFrame({ framed, title, onClose, children }: { framed: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!framed) return <div>{children}</div>;
  return (
    <Card aria-label={title}>
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h2 className="card-title"><UserRound className="size-5 text-primary" aria-hidden />{title}</h2>
        <IconButton label="Đóng chi tiết" icon={<X className="size-5" />} onClick={onClose} size="sm" />
      </div>
      {children}
    </Card>
  );
}

function MemberDetailPanel({ membershipId, schoolId, onClose, onAssign, canAssign, framed }: { membershipId: string; schoolId: string; onClose: () => void; onAssign: (mid: string) => void; canAssign: boolean; framed: boolean }) {
  const q = useRepo(["school-member", schoolId, membershipId], (c) => staffRepo.member(c, schoolId, membershipId));
  const [tab, setTab] = useState("perm");
  return (
    <PanelFrame framed={framed} title="Chi tiết phân quyền" onClose={onClose}>
      {q.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : q.data && (() => {
        const m = q.data;
        const homeroom = (m.assignments ?? []).filter((a) => a.live && a.type === "homeroom").map((a) => a.label.replace("Chủ nhiệm", "GVCN lớp"));
        return (
          <div className={framed ? "px-5 pb-5" : ""}>
            <div className="mt-3 flex items-start gap-3.5">
              <Avatar name={m.user.fullName} tone={m.user.avatarTone} size={64} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold text-ink">{m.user.displayName}</p>
                <StatusBadge status={m.membership.status} map={staffMembershipStatus} className="mt-1" />
                <div className="mt-1.5 space-y-0.5 text-[12.5px] text-body">
                  {homeroom.length > 0 && <p>{homeroom.join(", ")}</p>}
                  <p>Mã GV: {m.membership.staffCode} · {m.membership.department}</p>
                  <p className="flex min-w-0 items-center gap-1.5"><Mail className="size-3.5 flex-none text-muted" aria-hidden /><span className="truncate">{m.user.email}</span></p>
                  <p className="flex items-center gap-1.5"><Phone className="size-3.5 text-muted" aria-hidden />{m.user.workPhone}</p>
                </div>
              </div>
            </div>
            <Tabs variant="underline" className="mt-4" value={tab} onChange={setTab} tabs={[{ value: "perm", label: "Phân quyền" }, { value: "info", label: "Thông tin" }, { value: "history", label: "Lịch sử" }]}>
              <TabPanel value="perm" className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-ink">Quyền đang được cấp</p>
                  <Link href={`/school/${schoolId}/teachers/${membershipId}`} className="btn btn-secondary btn-sm">{canAssign ? <><Pencil className="size-3.5" aria-hidden />Chỉnh sửa</> : "Xem hồ sơ"}</Link>
                </div>
                <PermissionSummary m={m} compact />
                {canAssign && m.membership.status === "active" && <Button size="sm" className="mt-3" block icon={<UserCog className="size-4" />} onClick={() => onAssign(membershipId)}>Phân công mới</Button>}
              </TabPanel>
              <TabPanel value="info" className="mt-3">
                <dl>
                  <InfoRow label="Họ và tên">{m.user.fullName}</InfoRow>
                  <InfoRow label="Mã nhân sự">{m.membership.staffCode}</InfoRow>
                  <InfoRow label="Bộ phận">{m.membership.department}</InfoRow>
                  <InfoRow label="Email công việc">{m.user.email}</InfoRow>
                  <InfoRow label="Điện thoại công việc">{m.user.workPhone}</InfoRow>
                  <InfoRow label="Tham gia trường">{fmtDate(m.membership.joinedAt)}</InfoRow>
                  {m.membership.statusReason && <InfoRow label="Ghi chú trạng thái">{m.membership.statusReason}</InfoRow>}
                  <InfoRow label="Trường khác">{m.otherSchools ? `Tham gia thêm ${m.otherSchools} trường khác (không hiển thị dữ liệu của trường đó)` : "Không"}</InfoRow>
                </dl>
              </TabPanel>
              <TabPanel value="history" className="mt-3">
                {m.history === null ? <p className="text-sm text-muted">Bạn không được phép xem lịch sử.</p> : <Timeline items={m.history.slice(0, 6).map(e => ({id:e.id,at:e.at,title:e.actionLabel,detail:e.reason ?? undefined,actor:e.actorName}))} empty="Chưa có thay đổi nào được ghi." />}
                {m.history && m.history.length > 6 && <Link href={`/school/${schoolId}/teachers/${membershipId}#lich-su`} className="card-link mt-3">Xem toàn bộ lịch sử<ArrowRight className="size-3.5" aria-hidden /></Link>}
              </TabPanel>
            </Tabs>
          </div>
        );
      })()}
    </PanelFrame>
  );
}

function InvitationDetail({ row, onClose, onRevoke, canInvite, framed }: { row: TeacherRow; onClose: () => void; onRevoke: (id: string, name: string, version: number) => void; canInvite: boolean; framed: boolean }) {
  const { school } = useSchool();
  const ctx = useCtx();
  const q = useRepo(["school-invitations", school.id], (c) => staffRepo.invitations(c, school.id), {enabled: canInvite});
  const inv = q.data?.find((i) => i.id === row.id);
  return (
    <PanelFrame framed={framed} title="Lời mời chờ xác nhận" onClose={onClose}>
      <div className={clsx("space-y-3", framed && "px-5 pb-5")}>
        <div className="mt-3 flex items-center gap-3"><Avatar name={row.fullName} tone="amber" size={52} /><div className="min-w-0"><p className="truncate text-[16px] font-bold text-ink">{row.fullName}</p><StatusBadge status="pending" map={invitationStatus} /></div></div>
        {inv ? (
          <dl>
            <InfoRow label="Email">{inv.email}</InfoRow>
            <InfoRow label="Nhiệm vụ dự kiến">{inv.proposedDuty}</InfoRow>
            <InfoRow label="Người mời">{inv.inviterName}</InfoRow>
            <InfoRow label="Gửi lúc">{fmtRelative(inv.createdAt, ctx.now)}</InfoRow>
            <InfoRow label="Hết hạn">{fmtDate(inv.expiresAt)}</InfoRow>
            <InfoRow label="Gửi email">{inv.deliveryState === "QUEUED" ? "Đã xếp hàng gửi" : "Không có trạng thái giao email"}</InfoRow>
          </dl>
        ) : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : q.isLoading ? <Skeleton className="h-32" /> : <p className="text-sm text-muted">Lời mời không còn trong danh sách hiện tại.</p>}
        <p className="text-[12.5px] text-muted">Chưa có quyền nào cho đến khi người được mời chấp nhận và được phân công.</p>
        {canInvite && inv?.status === "pending" && <Button variant="danger-soft" size="sm" icon={<UserMinus className="size-4" />} onClick={() => onRevoke(inv.id, inv.fullName, inv.version)}>Thu hồi lời mời</Button>}
      </div>
    </PanelFrame>
  );
}

function InvitationsPanel({ onRevoke, onShowAll }: { onRevoke: (id: string, name: string, version: number) => void; onShowAll: () => void }) {
  const { school, can } = useSchool();
  const ctx = useCtx();
  const q = useRepo(["school-invitations", school.id], (c) => staffRepo.invitations(c, school.id), {enabled: can("staff.invite")});
  const pending = (q.data ?? []).filter((i) => i.status === "pending");
  if (!can("staff.invite")) return <Card className="p-5"><p className="text-sm text-muted">Bạn không được phép xem lời mời.</p></Card>;
  return (
    <Card>
      <CardHeader title={`Lời mời chờ xác nhận (${q.data ? pending.length : "—"})`} icon={<Clock className="size-5 text-primary" />} action={pending.length > 2 ? <button type="button" className="card-link" onClick={onShowAll}>Xem tất cả<ArrowRight className="size-3.5" aria-hidden /></button> : undefined} />
      {q.isLoading ? <div className="px-5 pb-4"><Skeleton className="h-16" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : pending.length === 0 ? <p className="px-5 pb-4 text-[13px] text-muted">Không có lời mời đang chờ.</p> : (
        <ul className="space-y-2.5 px-5 pb-4">
          {pending.slice(0, 3).map((i) => (
            <li key={i.id} className="flex items-center gap-2.5">
              <Avatar name={i.fullName} tone="amber" size={34} />
              <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-ink">{i.fullName}</p><p className="truncate text-[12px] text-muted">{i.proposedDuty} · gửi {fmtRelative(i.createdAt, ctx.now)}</p></div>
              {can("staff.invite") ? <Button size="sm" variant="ghost" className="!px-2 text-danger-text" onClick={() => onRevoke(i.id, i.fullName, i.version)} aria-label={`Thu hồi lời mời ${i.fullName}`}>Thu hồi</Button> : <Badge tone="warning">Chờ xác nhận</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentChanges() {
  const { school, can } = useSchool();
  const ctx = useCtx();
  const q = useRepo(["school-staff-activity", school.id], (c) => staffRepo.staffActivity(c, school.id, { limit: 4 }), {enabled:can("audit.view")});
  const icon = (a: string) => a.includes("khóa") || a.includes("Thu hồi") ? { i: <Lock className="size-4" />, t: "tone-pink" } : a.includes("Mời") ? { i: <UserPlus className="size-4" />, t: "tone-green" } : a.includes("Bàn giao") ? { i: <RefreshCw className="size-4" />, t: "tone-amber" } : { i: <History className="size-4" />, t: "tone-blue" };
  if (!can("audit.view")) return <Card className="p-5"><p className="text-sm text-muted">Bạn không được phép xem nhật ký.</p></Card>;
  return (
    <Card>
      <CardHeader title="Nhật ký thay đổi gần đây" icon={<History className="size-5 text-primary" />} action={q.data?.canViewAudit ? <Link href={`/school/${school.id}/audit`} className="card-link">Xem tất cả<ArrowRight className="size-3.5" aria-hidden /></Link> : undefined} />
      {q.isLoading ? <div className="px-5 pb-4"><Skeleton className="h-20" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : !q.data?.items.length ? <p className="px-5 pb-4 text-[13px] text-muted">Chưa có thay đổi nhân sự hoặc phân quyền.</p> : (
        <ul className="space-y-3 px-5 pb-4">
          {q.data.items.map((e) => {
            const ic = icon(e.action);
            return (
              <li key={e.id} className="flex gap-2.5">
                <span className={`icon-tile icon-tile-sm !size-8 flex-none !rounded-full ${ic.t}`} aria-hidden>{ic.i}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-snug text-ink">{e.action}</p>
                  <p className="text-[12px] text-muted">Bởi {e.actorName} · {fmtRelative(e.at, ctx.now)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
