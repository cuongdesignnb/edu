"use client";
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { UserCog, Lock, Unlock, UserX, ShieldCheck, History, Briefcase, Mail, Phone, Building2, Ban, RefreshCw, Info, KeyRound } from "lucide-react";
import { staffRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { Checkbox, TextArea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Timeline } from "@/components/ui/timeline";
import { EmptyState, QueryState } from "@/components/ui/states";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { staffMembershipStatus } from "./staff-display";
import { AssignDrawer, type AssignPrefill } from "./assign-drawer";
import { PermissionSummary } from "./permission-summary";
import { assignmentStatusLabel, fmtRange, SchoolSourceState } from "./common";

type Member = Awaited<ReturnType<typeof staffRepo.member>>;
type Asg = NonNullable<Member["assignments"]>[number];

/** SC11 — member profile & assignments: grants with validity, assign (O06/O07), revoke (O08), membership status, school roles, history. */
export function MemberDetail({ membershipId }: { membershipId: string }) {
  const { school } = useSchool();
  const q = useRepo(["school-member", school.id, membershipId], (c) => staffRepo.member(c, school.id, membershipId));
  return <SchoolSourceState query={q}>{(m) => <Body m={m} />}</SchoolSourceState>;
}

function Body({ m }: { m: Member }) {
  const { school, yearId } = useSchool();
  const b = `/school/${school.id}`;
  const [assign, setAssign] = useState<AssignPrefill | null>(null);
  const [revoke, setRevoke] = useState<Asg | null>(null);
  const [status, setStatus] = useState<{ to: "active" | "suspended" | "revoked"; version: number } | null>(null);
  const [statusErr, setStatusErr] = useState<string>();
  const [rolesTarget, setRolesTarget] = useState<Member | null>(null);
  const [filter, setFilter] = useState<"all" | "live" | "ended" | "revoked">("all");
  const revokeCmd = useCommand((c, source: Asg, reason: string) => staffRepo.revokeAssignment(c, school.id, source.id, reason, source.version), { success: "Đã thu hồi phân công — có hiệu lực ở lần đọc/ghi kế tiếp" });
  const statusCmd = useCommand((c, to: "active" | "suspended" | "revoked", reason: string) => staffRepo.setMembershipStatus(c, school.id, m.membership.id, to, reason, status?.version), {
    success: (x) => x.status === "active" ? "Đã mở khóa thành viên" : x.status === "suspended" ? "Đã tạm khóa thành viên tại trường này" : "Đã thu hồi thành viên tại trường này",
    onError: (e) => setStatusErr(e.message), silentError: true,
  });
  const active = m.membership.status === "active";
  const rows = (m.assignments ?? []).filter((a) => {
    const st = assignmentStatusLabel(a, m.referenceDate).label;
    return filter === "all" || (filter === "live" ? st === "Đang hiệu lực" || st === "Chưa bắt đầu" || st.startsWith("Tạm dừng") : filter === "ended" ? st === "Đã kết thúc" : st === "Đã thu hồi");
  });
  const counts = { live: m.assignments === null ? null : m.assignments.filter(a => a.live).length };
  const statusItems: MenuItem[] = m.canSuspend ? [
    ...(active ? [{ label: "Tạm khóa tại trường", icon: <Lock />, onSelect: () => { setStatusErr(undefined); setStatus({to:"suspended",version:m.membership.version}); }, disabled: m.isSelf, hint: m.isSelf ? "Không thể tự khóa chính mình" : undefined }] : []),
    ...(m.membership.status === "suspended" ? [{ label: "Mở khóa", icon: <Unlock />, onSelect: () => { setStatusErr(undefined); setStatus({to:"active",version:m.membership.version}); } }] : []),
    ...(m.membership.status !== "revoked" ? [{ label: "Thu hồi thành viên", icon: <UserX />, danger: true, separatorBefore: true, onSelect: () => { setStatusErr(undefined); setStatus({to:"revoked",version:m.membership.version}); }, disabled: m.isSelf, hint: m.isSelf ? "Không thể tự thu hồi chính mình" : "Kết thúc mọi phân công tại trường này" }] : []),
  ] : [];

  return (
    <div className="page">
      <PageHeader title={m.user.displayName} subtitle={[m.membership.department, m.membership.staffCode && `Mã ${m.membership.staffCode}`].filter(Boolean).join(" · ")} badge={<StatusBadge status={m.membership.status} map={staffMembershipStatus} />}
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Giáo viên", href: `${b}/teachers` }, { label: m.user.displayName }]}
        actions={<>
          {m.canAssign && active && <Button variant="primary" icon={<UserCog className="size-4" />} onClick={() => setAssign({ membershipId: m.membership.id, yearId })}>Phân công mới</Button>}
          {statusItems.length > 0 && <ActionMenu label="Trạng thái thành viên" items={statusItems} trigger={<Button icon={<ShieldCheck className="size-4" />}>Trạng thái thành viên</Button>} />}
        </>} />
      {m.membership.statusReason && !active && <Callout tone="warning" title={`${staffMembershipStatus[m.membership.status].label}`}>{m.membership.statusReason} — mọi quyền tại trường này đang bị chặn; danh tính và lịch sử được giữ.</Callout>}
      {m.isSelf && <Callout tone="neutral" icon={<Info />}>Đây là hồ sơ của chính bạn. Bạn không thể tự khóa, tự thu hồi hoặc tự đổi mẫu quyền của mình.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Phân công" icon={<Briefcase className="size-5 text-primary" />} subtitle={counts.live === null ? "Bạn không được phép xem phân công" : `${counts.live} phân công đang hiệu lực`} action={
              <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc phân công">
                {(["all", "live", "ended", "revoked"] as const).map((k) => <button key={k} type="button" className={clsx("chip", filter === k && "chip-active")} aria-pressed={filter === k} onClick={() => setFilter(k)}>{{ all: "Tất cả", live: "Đang hiệu lực", ended: "Đã kết thúc", revoked: "Đã thu hồi" }[k]}</button>)}
              </div>
            } />
            {m.assignments === null ? <p className="px-5 pb-5 text-sm text-muted">Bạn không được phép xem phân công.</p> : m.assignments.length === 0 ? <EmptyState compact title="Chưa có phân công" description="Giáo viên chưa được giao lớp/môn nào tại trường này." action={m.canAssign && active ? <Button size="sm" variant="primary" onClick={() => setAssign({ membershipId: m.membership.id, yearId })}>Phân công mới</Button> : undefined} />
              : rows.length === 0 ? <EmptyState compact title="Không có phân công khớp bộ lọc" action={<Button size="sm" onClick={() => setFilter("all")}>Xem tất cả</Button>} /> : (
              <div className="px-4 pb-4">
                <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Phân công" tabIndex={0}>
                  <table className="table" style={{ minWidth: 680 }}>
                    <thead><tr><th>Nhiệm vụ</th><th>Hiệu lực</th><th>Trạng thái</th><th>Người giao</th><th className="center">Thao tác</th></tr></thead>
                    <tbody>
                      {rows.map((a) => {
                        const st = assignmentStatusLabel(a, m.referenceDate);
                        const items: MenuItem[] = [
                          ...(a.live ? [{ label: "Mở không gian lớp", href: `/classroom/${school.id}/${yearId}/${a.classId}` }] : []),
                          ...(m.canAssign && a.type === "homeroom" && a.status === "active" ? [{ label: "Bàn giao chủ nhiệm", icon: <RefreshCw />, href: `${b}/handovers?class=${a.classId}` }] : []),
                          ...(m.canAssign && a.status === "active" ? [{ label: "Thu hồi phân công", icon: <Ban />, danger: true, separatorBefore: true, onSelect: () => setRevoke(a) }] : []),
                        ];
                        return (
                          <tr key={a.id}>
                            <td className="min-w-[160px]"><p className="whitespace-nowrap font-semibold text-ink">{a.label}</p><p className="whitespace-nowrap text-[12px] text-muted">{a.type === "homeroom" ? "Giáo viên chủ nhiệm" : "Giáo viên bộ môn"}</p></td>
                            <td className="whitespace-nowrap text-[13px]">{fmtRange(a.validFrom, a.validTo)}</td>
                            <td><Badge tone={st.tone} className="whitespace-nowrap">{st.label}</Badge></td>
                            <td className="whitespace-nowrap text-[13px]">{a.createdByName}<p className="text-[12px] text-muted">{fmtDate(a.createdAt)}</p></td>
                            <td className="center">{items.length ? <ActionMenu label={`Thao tác với ${a.label}`} items={items} /> : <span className="text-muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
          <Card id="lich-su">
            <CardHeader title="Lịch sử" icon={<History className="size-5 text-primary" />} subtitle="Thay đổi thành viên và phân công tại trường này" />
            <div className="px-6 pb-5">
              {m.history === null ? <p className="text-sm text-muted">Bạn không được phép xem lịch sử.</p> : <Timeline items={m.history.map(e => ({ id: e.id, at: e.at, title: e.actionLabel, detail: [e.changes.map(c => `${c.field}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join(" · "), e.reason && `Lý do: ${e.reason}`].filter(Boolean).join(" · "), actor: e.actorName }))} empty="Chưa có thay đổi nào được ghi." />}
            </div>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5">
            <div className="flex items-center gap-4"><Avatar name={m.user.fullName} tone={m.user.avatarTone} size={64} /><div className="min-w-0"><p className="truncate text-[18px] font-bold text-ink">{m.user.displayName}</p><p className="text-[13px] text-muted">{m.membership.department}</p></div></div>
            <dl className="mt-3">
              <InfoRow label={<span className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden />Email</span>}>{m.user.email ?? "—"}</InfoRow>
              <InfoRow label={<span className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden />Điện thoại</span>}>{m.user.workPhone ?? "—"}</InfoRow>
              <InfoRow label="Tham gia trường">{fmtDate(m.membership.joinedAt)}</InfoRow>
              <InfoRow label={<span className="flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden />Trường khác</span>}>{m.otherSchools ? `${m.otherSchools} trường khác` : "Không"}</InfoRow>
            </dl>
            {m.otherSchools > 0 && <p className="mt-2 text-[12.5px] text-muted">Chỉ hiển thị số lượng. Phân công, dữ liệu và danh tính ở trường khác không bị ảnh hưởng bởi thao tác tại đây.</p>}
          </Card>
          <Card>
            <CardHeader title="Mẫu quyền nhà trường" icon={<KeyRound className="size-5 text-primary" />} action={m.canRole ? <Button size="sm" onClick={() => setRolesTarget(m)} disabled={m.isSelf} title={m.isSelf ? "Không thể tự đổi mẫu quyền của mình" : undefined}>Thay đổi</Button> : undefined} />
            <div className="px-5 pb-5">
              {m.roles.length === 0 ? <p className="text-[13px] text-muted">Chưa có mẫu quyền cấp trường.</p> : <ul className="flex flex-wrap gap-1.5">{m.roles.map((r) => <li key={r.id}><Badge tone="success" dot={false}>{r.roleLabel}</Badge><p className="text-[11px] text-muted">Từ {fmtDateTime(r.validFrom)}{r.validUntil ? ` đến trước ${fmtDateTime(r.validUntil)}` : " — không thời hạn"}</p></li>)}</ul>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Quyền đang có hiệu lực" icon={<ShieldCheck className="size-5 text-primary" />} subtitle="Tổng hợp từ mẫu quyền và phân công — chỉ xem" />
            <div className="px-5 pb-5"><PermissionSummary m={m} /></div>
          </Card>
        </div>
      </div>
      <AssignDrawer prefill={assign} onClose={() => setAssign(null)} />
      <ConfirmDialog open={!!revoke} onOpenChange={(o) => { if (!o) setRevoke(null); }} busy={revokeCmd.pending} title="Thu hồi phân công" variant="danger" confirmLabel="Thu hồi"
        object={revoke ? `${m.user.displayName} — ${revoke.label}` : undefined}
        consequence={<>Phân công bị thu hồi ngay; giáo viên mất quyền ở lần đọc/ghi kế tiếp (kể cả tab đang mở). Dữ liệu và tác giả các ghi nhận cũ giữ nguyên. {revoke?.type === "homeroom" && <b>Lớp sẽ không có GVCN — nên dùng Bàn giao chủ nhiệm.</b>}</>}
        reasonLabel="Lý do thu hồi" reasonRequired
        onConfirm={async (reason) => { if (!revoke) return; const r = await revokeCmd.run(revoke, reason); if (r) setRevoke(null); }} />
      <ConfirmDialog open={!!status} onOpenChange={(o) => { if (!o) setStatus(null); }} busy={statusCmd.pending} object={`${m.user.displayName} — ${school.name}`}
        title={status?.to === "active" ? "Mở khóa thành viên" : status?.to === "suspended" ? "Tạm khóa thành viên" : "Thu hồi thành viên"} variant={status?.to === "active" ? "primary" : "danger"}
        confirmLabel={status?.to === "active" ? "Mở khóa" : status?.to === "suspended" ? "Tạm khóa" : "Thu hồi thành viên"}
        consequence={status?.to === "active" ? "Các phân công còn hiệu lực được dùng lại." : status?.to === "suspended" ? "Mọi quyền tại trường này bị chặn cho đến khi mở khóa. Phân công được giữ." : "Kết thúc mọi phân công đang hoạt động tại trường này. Không xóa danh tính toàn hệ thống, không ảnh hưởng trường khác, lịch sử được giữ."}
        reasonLabel="Lý do" reasonRequired error={statusErr}
        onConfirm={async (reason) => { if (!status) return; const r = await statusCmd.run(status.to, reason); if (r) setStatus(null); }} />
      {rolesTarget && <RolesModal key={`${rolesTarget.membership.id}-${rolesTarget.membership.version}`} m={rolesTarget} onClose={() => setRolesTarget(null)} />}
    </div>
  );
}

function RolesModal({ m, onClose }: { m: Member; onClose: () => void }) {
  const { school } = useSchool();
  const init = m.membership.roleTemplateIds;
  const [sel, setSel] = useState<string[]>(init);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  const choices = m.roleTemplates;
  const newLimits = (choices ?? []).filter(t => sel.includes(t.id) && !init.includes(t.id) && t.delegationUntil).map(t => t.delegationUntil!).sort();
  const deadline = newLimits[0];
  const cmd = useCommand((c, ids: string[], r: string) => staffRepo.setMemberRoles(c, school.id, m.membership.id, ids, r, m.membership.version, deadline), { success: "Đã cập nhật mẫu quyền nhà trường", onError: e => setErr(e.message), silentError: true });
  const name = (ids: string[]) => ids.map(i => choices?.find(t => t.id === i)?.label ?? m.roles.find(t => t.roleId === i)?.roleLabel ?? "Mẫu quyền đã chọn").join(", ") || "Không có";
  const changed = JSON.stringify([...sel].sort()) !== JSON.stringify([...init].sort());
  return <Modal open onOpenChange={o => { if (!o) onClose(); }} busy={cmd.pending} size="md" title="Thay đổi mẫu quyền nhà trường" description={`${m.user.displayName} — nguồn phiên bản ${m.membership.version}`}
    footer={<><Button variant="ghost" onClick={onClose} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} disabled={!choices || !changed || reason.trim().length < 3} onClick={async () => { if (await cmd.run(sel, reason.trim())) onClose(); }}>Lưu thay đổi</Button></>}>
    <div className="space-y-4">
      {choices === null ? <Callout tone="neutral">Bạn không được phép đổi mẫu quyền.</Callout> : <div className="space-y-2">{m.roles.filter(held => !choices.some(t => t.id === held.roleId)).map(held => <Checkbox key={held.id} label={held.roleLabel} description="Chỉ thu hồi quyền đã cấp; không thể cấp lại từ lựa chọn hiện tại." disabled={cmd.pending || !held.roleId || !sel.includes(held.roleId)} checked={!!held.roleId && sel.includes(held.roleId)} onChange={() => setSel(s => s.filter(id => id !== held.roleId))} />)}{choices.map(t => <Checkbox key={t.id} label={t.label} description={!t.canDelegate && !sel.includes(t.id) ? "Vượt quá quyền hiện tại — không thể cấp." : t.delegationUntil ? `Hạn cấp mới: ${fmtDateTime(t.delegationUntil)}` : "Mẫu quyền cấp trường"} disabled={cmd.pending || !t.canDelegate && !sel.includes(t.id)} checked={sel.includes(t.id)} onChange={on => setSel(s => on ? [...s, t.id] : s.filter(x => x !== t.id))} />)}</div>}
      {changed && <div className="rounded-xl border border-line bg-[#f7fbff] p-3 text-[13px]"><p><span className="text-muted">Trước:</span> {name(init)}</p><p><span className="text-muted">Sau:</span> {name(sel)}</p>{deadline && <p>Quyền cấp mới đến trước {fmtDateTime(deadline)}.</p>}<p>Quyền giữ lại giữ nguyên thời hạn đã cấp.</p></div>}
      <TextArea label="Lý do thay đổi" required rows={2} value={reason} onChange={e => setReason(e.target.value)} helper="Ghi vào nhật ký nhà trường." />
      {err && <p className="error-text" role="alert">{err}</p>}
    </div>
  </Modal>;
}
