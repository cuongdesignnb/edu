"use client";
import { useState } from "react";
import { UserCog, MailPlus, Repeat, ShieldOff, Link2, Copy, Ban, History, ShieldAlert, ExternalLink } from "lucide-react";
import { platformRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, invitationStatus, membershipStatus, schoolStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Identity } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data/table";
import { Timeline } from "@/components/ui/timeline";
import { DeniedState, EmptyState, QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { InviteAdminDialog } from "./invite-admin-dialog";
import {DirectAdminDialog} from './direct-admin-dialog';
import type {ApiSchemas} from '@/lib/api/generated';

type Data = Awaited<ReturnType<typeof platformRepo.school>>;
type Admin = NonNullable<Data["admins"]>[number];
type Inv = NonNullable<Data["invitations"]>[number];

/** PL05 — school admins, invitations, validity and history. Last-admin guard in UI and repository. */
export function SchoolAdmins({ schoolId }: { schoolId: string }) {
  const q = useRepo(["platform-school", schoolId], (ctx) => platformRepo.school(ctx, schoolId));
  return <QueryState query={q} skeleton="table">{(d) => d.admins===null || d.invitations===null ? <DeniedState message="Bạn không có quyền quản lý quản trị và lời mời của trường." /> : <Body d={{...d,admins:d.admins,invitations:d.invitations}} />}</QueryState>;
}

function Body({ d }: { d: Data & {admins:NonNullable<Data["admins"]>;invitations:NonNullable<Data["invitations"]>} }) {
  const toast = useToast();
  const s = d.school;
  const [invite, setInvite] = useState<null | "invite" | "replace">(null);
  const [direct,setDirect]=useState(false),[created,setCreated]=useState<ApiSchemas['DirectSchoolAdmin']|null>(null);
  const [revokeAdmin, setRevokeAdmin] = useState<Admin | null>(null);
  const [revokeInv, setRevokeInv] = useState<Inv | null>(null);
  const active = d.admins.filter((a) => a.status === "active");
  const isLast = (a: Admin) => a.status === "active" && active.length <= 1;
  const revokeA = useCommand((ctx, m: string, reason: string) => platformRepo.revokeSchoolAdmin(ctx, s.id, m, reason, revokeAdmin?.version), { success: "Đã thu hồi quyền quản trị", onSuccess: () => setRevokeAdmin(null) });
  const revokeI = useCommand((ctx, id: string) => platformRepo.revokeInvitation(ctx, id, s.id, revokeInv?.version, "Thu hồi lời mời quản trị"), { success: "Đã thu hồi lời mời", onSuccess: () => setRevokeInv(null) });


  const adminCols: Column<Admin>[] = [
    { key: "name", header: "Quản trị", cell: (a) => <Identity name={a.name} sub={a.email} size={34} /> },
    { key: "status", header: "Trạng thái", cell: (a) => <StatusBadge status={a.status} map={{...membershipStatus,scheduled:{label:'Chờ hiệu lực',tone:'info'}}} /> },
    { key: "since", header: "Hiệu lực từ", cell: (a) => fmtDate(a.since), hideBelow: "sm" },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (a) => a.status !== "active" ? <span className="text-[12.5px] text-muted">—</span> : (
      <ActionMenu label={`Thao tác với ${a.name}`} items={[
        { label: "Thay người phụ trách", icon: <Repeat />, onSelect: () => setInvite("replace") },
        { label: "Thu hồi quyền quản trị", hint: isLast(a) ? "Quản trị cuối cùng — mời người thay thế trước" : undefined, icon: <ShieldOff />, danger: true, disabled: isLast(a), onSelect: () => setRevokeAdmin(a), separatorBefore: true },
      ]} />
    ) },
  ];
  const invCols: Column<Inv>[] = [
    { key: "who", header: "Người được mời", cell: (i) => <span><span className="block font-semibold text-ink">{i.fullName}</span><span className="block text-[12.5px] text-muted">{i.email}</span></span> },
    { key: "status", header: "Trạng thái", cell: (i) => <StatusBadge status={i.status} map={invitationStatus} /> },
    { key: "created", header: "Ngày mời", cell: (i) => fmtDate(i.createdAt), hideBelow: "md" },
    { key: "expires", header: "Hạn chấp nhận", cell: (i) => fmtDateTime(i.expiresAt), hideBelow: "sm" },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (i) => (
      <ActionMenu label={`Thao tác với lời mời ${i.email}`} items={[
        ...(i.status === "pending" ? [
          { label: "Email chờ gửi khi SMTP được bật", icon: <MailPlus />, disabled: true },
          { label: "Thu hồi lời mời", icon: <Ban />, danger: true, onSelect: () => setRevokeInv(i), separatorBefore: true },
        ] : []),
      ]} />
    ) },
  ];
  const history = [
    ...(d.history===null?[]:d.history.map((h) => ({ id: h.id, at: h.at, title: h.action, detail: h.reason ? `Lý do: ${h.reason}` : undefined, tone: "blue" as const }))),
    ...d.invitations.map((i) => ({ id: `inv-${i.id}`, at: i.createdAt, title: `Mời quản trị: ${i.fullName}`, detail: `${i.email} — hiện: ${invitationStatus[i.status].label.toLowerCase()}`, tone: "purple" as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="page">
      <PageHeader title="Quản trị trường" subtitle={s.name} badge={<StatusBadge status={s.status} map={schoolStatus} />}
        breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Danh sách trường", href: "/platform/schools" }, { label: s.shortName, href: `/platform/schools/${s.id}` }, { label: "Quản trị trường" }]}
        illustration="/assets/illustrations/teachers-trio.png"
        actions={<>
          {active.length > 0 && <Button icon={<Repeat className="size-4" />} onClick={() => setInvite("replace")}>Thay quản trị</Button>}
          {d.canCreateDirect&&<Button variant="primary" icon={<UserCog className="size-4"/>} onClick={()=>setDirect(true)}>Tạo tài khoản quản trị</Button>}
          <Button icon={<MailPlus className="size-4" />} onClick={() => setInvite("invite")}>Gửi lời mời qua email</Button>
        </>} />
      {active.length <= 1 && (
        <Callout tone={active.length ? "info" : "warning"} icon={<ShieldAlert />} title={active.length ? "Trường chỉ còn một quản trị đang hoạt động" : "Trường chưa có quản trị đang hoạt động"}>
          {active.length ? "Không thể thu hồi quản trị cuối cùng. Tạo quản trị mới hoặc mời người thay thế trước." : "Tạo tài khoản quản trị ngay hoặc gửi lời mời. Trường không kích hoạt được khi thiếu quản trị còn hiệu lực."}
        </Callout>
      )}
      <Card>
        <CardHeader title="Quản trị viên đang hoạt động" icon={<UserCog className="size-5" />} subtitle={`${active.length} đang hoạt động / ${d.admins.length} tổng`} />
        {d.admins.length === 0 ? <EmptyState compact icon={<UserCog className="size-6" />} title="Chưa có quản trị" action={<Button variant="primary" size="sm" onClick={() => setInvite("invite")}>Mời quản trị</Button>} /> : (
          <div className="px-4 pb-4"><DataTable caption="Quản trị hiện tại" rows={d.admins} columns={adminCols} rowKey={(a) => a.membershipId} minWidth={520} /></div>
        )}
      </Card>
      <Card>
        <CardHeader title="Lời mời đang chờ" icon={<Link2 className="size-5" />} subtitle="Trạng thái lời mời email và lịch sử phản hồi; không hiển thị mã bí mật" />
        {d.invitations.length === 0 ? <EmptyState compact icon={<Link2 className="size-6" />} title="Chưa có lời mời" /> : (
          <div className="px-4 pb-4"><DataTable caption="Lời mời quản trị" rows={[...d.invitations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} columns={invCols} rowKey={(i) => i.id} minWidth={560} /></div>
        )}
      </Card>
      <Card>
        <CardHeader title="Lịch sử" icon={<History className="size-5" />} action={<ButtonLink size="sm" variant="ghost" href="/platform/audit">Nhật ký nền tảng</ButtonLink>} />
        <div className="px-5 pb-5">{d.history===null?<DeniedState message="Bạn không có quyền xem nhật ký." />:<Timeline items={history.slice(0, 10)} empty="Chưa có lịch sử quản trị." />}</div>
      </Card>

      {created&&<Callout tone="success" title={new Date(created.validFrom).getTime()>Date.now()?'Đã tạo tài khoản; quyền có hiệu lực theo lịch':'Tài khoản quản trị đã hoạt động'}>{created.displayName} · {created.email}. Không gửi email. {created.mustChangePassword?'Người dùng phải đổi mật khẩu lần đầu.':''}</Callout>}
      {d.canCreateDirect&&<DirectAdminDialog open={direct} onClose={()=>setDirect(false)} schoolId={s.id} schoolName={s.name} onCreated={setCreated}/>}
      <InviteAdminDialog open={!!invite} initialMode={invite ?? "invite"} onClose={() => setInvite(null)} schoolId={s.id} schoolName={s.name} smtpEnabled={d.smtpEnabled} admins={active.map((a) => ({ membershipId: a.membershipId, name: a.name }))} />
      <ConfirmDialog open={!!revokeAdmin} onOpenChange={(o) => !o && setRevokeAdmin(null)} title="Thu hồi quyền quản trị" object={revokeAdmin ? `${revokeAdmin.name} — ${s.name}` : ""}
        consequence="Người này mất quyền quản trị trường nhưng vẫn là thành viên (nếu có nhiệm vụ khác). Hệ thống từ chối nếu đây là quản trị cuối cùng." confirmLabel="Thu hồi quyền" variant="danger"
        reasonLabel="Lý do" reasonRequired busy={revokeA.pending} error={revokeA.error?.code === "VALIDATION" ? revokeA.error.message : undefined}
        onConfirm={async (r) => { if (revokeAdmin) await revokeA.run(revokeAdmin.membershipId, r); }} />
      <ConfirmDialog open={!!revokeInv} onOpenChange={(o) => !o && setRevokeInv(null)} title="Thu hồi lời mời" object={revokeInv ? `${revokeInv.fullName} — ${revokeInv.email}` : ""}
        consequence="Đường dẫn lời mời sẽ không dùng được nữa. Người nhận sẽ thấy thông báo lời mời đã bị thu hồi." confirmLabel="Thu hồi lời mời" variant="danger"
        busy={revokeI.pending} error={revokeI.error?.code === "VALIDATION" ? revokeI.error.message : undefined} onConfirm={async () => { if (revokeInv) await revokeI.run(revokeInv.id); }} />
    </div>
  );
}
