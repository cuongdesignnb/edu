"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ShieldCheck, Building2, Presentation, ArrowRight, Users, Info, Lock, History, Code2, PlusCircle, MinusCircle } from "lucide-react";
import type { ActionKey } from "@/lib/model/types";
import { ACTION_LABELS } from "@/lib/permissions/actions";
import { staffRepo, type RepoError } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, TextArea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { Timeline } from "@/components/ui/timeline";
import { EmptyState, QueryState } from "@/components/ui/states";
import { fmtDateTime } from "@/lib/formatters";

/** SC13 — school role templates with Vietnamese descriptions. */
export function RolesScreen() {
  const { school } = useSchool();
  const q = useRepo(["school-roles", school.id], (c) => staffRepo.roles(c, school.id));
  const b = `/school/${school.id}`;
  return (
    <div className="page">
      <PageHeader title="Mẫu quyền nhà trường" subtitle="Quyền được cấp theo mẫu (cấp trường) hoặc theo phân công lớp/môn — không cộng dồn thành toàn quyền"
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Mẫu quyền" }]} quote={["Đúng người, đúng lớp,", "đúng môn, đúng thời gian"]} illustration="/assets/illustrations/teachers-trio.png" />
      <QueryState query={q} skeleton="cards">
        {(rows) => {
          const groups: { title: string; icon: React.ReactNode; hint: string; items: typeof rows }[] = [
            { title: "Mẫu quyền cấp trường", icon: <Building2 className="size-5 text-success-text" />, hint: "Gán trực tiếp cho thành viên (Quản trị trường, Ban giám hiệu, Giáo vụ).", items: rows.filter((r) => r.level === "school") },
            { title: "Mẫu quyền theo phân công", icon: <Presentation className="size-5 text-purple" />, hint: "Áp dụng cho đúng lớp/môn được phân công trong thời gian hiệu lực. Thay đổi áp dụng cho phân công mới.", items: rows.filter((r) => r.level === "class") },
          ];
          return groups.map((g) => (
            <section key={g.title} className="space-y-3">
              <div><h2 className="section-title flex items-center gap-2">{g.icon}{g.title}</h2><p className="text-[13px] text-muted">{g.hint}</p></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {g.items.map((r) => (
                  <Card key={r.id} className="flex flex-col gap-3 p-5">
                    <div className="flex items-start gap-3">
                      <span className={clsx("icon-tile", r.level === "school" ? "tone-green" : "tone-purple")} aria-hidden><ShieldCheck className="size-6" /></span>
                      <div className="min-w-0"><Link href={`${b}/roles/${r.id}`} className="text-[17px] font-bold text-ink hover:text-primary-strong">{r.name}</Link><p className="text-[12.5px] text-muted">{r.level === "school" ? "Cấp trường" : "Theo lớp/môn được phân công"} · phiên bản {r.version}</p></div>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-body">{r.description}</p>
                    <div className="flex flex-wrap gap-2 text-[12.5px]"><Badge tone="info" dot={false}>{r.actions.length} quyền</Badge><Badge tone="neutral" dot={false} icon={<Users className="size-3.5" />}>{r.memberCount} {r.level === "school" ? "thành viên" : "phân công đang hiệu lực"}</Badge></div>
                    <ButtonLink href={`${b}/roles/${r.id}`} size="sm" className="mt-auto self-start" iconRight={<ArrowRight className="size-4" />}>Xem chi tiết</ButtonLink>
                  </Card>
                ))}
              </div>
            </section>
          ));
        }}
      </QueryState>
    </div>
  );
}

type RoleData = Awaited<ReturnType<typeof staffRepo.role>>;

/** SC14 — role template detail: grouped checklist (Vietnamese labels), before/after diff, reason, confirmation. */
export function RoleDetail({ roleId }: { roleId: string }) {
  const { school } = useSchool();
  const q = useRepo(["school-role", school.id, roleId], (c) => staffRepo.role(c, school.id, roleId));
  return <QueryState query={q} skeleton="detail">{(d) => <RoleBody key={`${d.role.id}-${d.role.version}`} d={d} onReload={() => q.refetch()} />}</QueryState>;
}

function RoleBody({ d, onReload }: { d: RoleData; onReload: () => void }) {
  const { school, can } = useSchool();
  const b = `/school/${school.id}`;
  const [sel, setSel] = useState<Set<ActionKey>>(() => new Set(d.role.actions));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const mine = useMemo(() => new Set(d.myActions), [d.myActions]);
  const added = [...sel].filter((a) => !d.role.actions.includes(a));
  const removed = d.role.actions.filter((a) => !sel.has(a));
  const dirty = added.length + removed.length > 0;
  useUnsavedChanges(dirty);
  const ownRole = can("role.manage") && !d.canEdit;
  const cmd = useCommand((c, actions: ActionKey[], reasonText: string) => staffRepo.saveRole(c, school.id, d.role.id, actions, d.role.version, reasonText), {
    success: (r) => `Đã lưu mẫu quyền ${r.name} (phiên bản ${r.version})`,
    onError: (e) => { if (e.code === "CONFLICT") { setConfirm(false); setConflict(e); } else setErr(e.fieldErrors?.reason ?? e.message); }, silentError: true,
  });
  const groups = useMemo(() => {
    const m = new Map<string, typeof d.all>();
    d.all.forEach((a) => m.set(a.group, [...(m.get(a.group) ?? []), a]));
    return [...m.entries()];
  }, [d.all]);
  const escalation = (a: ActionKey) => d.role.level === "school" && !d.role.actions.includes(a) && !mine.has(a);
  return (
    <div className="page">
      <PageHeader title={d.role.name} subtitle={d.role.description} badge={<Badge tone={d.role.level === "school" ? "success" : "purple"} dot={false}>{d.role.level === "school" ? "Cấp trường" : "Theo phân công"}</Badge>}
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Mẫu quyền", href: `${b}/roles` }, { label: d.role.name }]} />
      {!can("role.manage") && <Callout tone="neutral" icon={<Lock />}>Bạn chỉ xem được mẫu quyền. Chỉnh sửa cần quyền “{ACTION_LABELS["role.manage"].label}”.</Callout>}
      {ownRole && <Callout tone="warning" icon={<Lock />} title="Bạn đang giữ mẫu quyền này">Không thể tự chỉnh mẫu quyền của chính mình. Nhờ một quản trị khác thực hiện nếu cần.</Callout>}
      {d.role.level === "class" && <Callout tone="info" icon={<Info />}>Mẫu theo phân công chỉ áp dụng trong đúng lớp/môn được giao. Thay đổi áp dụng cho phân công tạo mới; phân công hiện có giữ danh sách quyền đã cấp.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Hành động được phép" icon={<ShieldCheck className="size-5 text-primary" />} subtitle={`${sel.size}/${d.all.length} hành động · cập nhật ${fmtDateTime(d.role.updatedAt)}`} />
          <div className="space-y-4 px-5 pb-5">
            {groups.map(([group, items]) => (
              <fieldset key={group} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-[14px] font-bold text-ink">{group}</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {items.map((a) => {
                    const esc = escalation(a.key);
                    return <Checkbox key={a.key} label={a.label} checked={sel.has(a.key)} disabled={!d.canEdit || esc}
                      description={esc ? "Bạn không có quyền này nên không thể thêm" : undefined}
                      onChange={(on) => setSel((s) => { const n = new Set(s); if (on) n.add(a.key); else n.delete(a.key); return n; })} />;
                  })}
                </div>
              </fieldset>
            ))}
            <details className="rounded-xl border border-line bg-[#fafcff] p-3 text-[12.5px]">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-body"><Code2 className="size-4" aria-hidden />Chi tiết kỹ thuật (mã hành động)</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{[...sel].sort().map((k) => <li key={k} className="text-muted"><code className="font-mono text-ink">{k}</code> — {ACTION_LABELS[k].label}</li>)}</ul>
            </details>
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          {d.canEdit && (
            <Card>
              <CardHeader title="Thay đổi trước / sau" subtitle={dirty ? `${added.length} thêm · ${removed.length} bỏ` : "Chưa có thay đổi"} />
              <div className="space-y-3 px-5 pb-5">
                <DiffList added={added} removed={removed} />
                <TextArea label="Lý do thay đổi" required rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErr(undefined); }} disabled={!dirty} />
                {err && <p className="error-text" role="alert">{err}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" disabled={!dirty || cmd.pending} onClick={() => { setSel(new Set(d.role.actions)); setReason(""); setErr(undefined); }}>Hủy thay đổi</Button>
                  <Button variant="primary" disabled={!dirty} onClick={() => { if (reason.trim().length < 3) { setErr("Ghi lý do thay đổi (tối thiểu 3 ký tự)"); return; } setConfirm(true); }}>Xem tác động & lưu</Button>
                </div>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={d.role.level === "school" ? "Thành viên đang giữ" : "Phạm vi áp dụng"} icon={<Users className="size-5 text-primary" />} />
            <div className="px-5 pb-5">
              {d.role.level === "class" ? <p className="text-[13px] text-body">Mỗi phân công {d.role.key === "homeroom" ? "chủ nhiệm" : "bộ môn"} nhận danh sách quyền này cho đúng lớp{d.role.key === "subject" ? " và môn" : ""} được giao. Xem ở <Link href={`${b}/assignments`} className="font-semibold text-primary-strong hover:underline">Ma trận phân công</Link>.</p>
                : d.members.length === 0 ? <p className="text-[13px] text-muted">Chưa có thành viên.</p>
                : <ul className="space-y-1.5">{d.members.map((m) => <li key={m.membershipId}><Link href={`${b}/teachers/${m.membershipId}`} className="text-[13.5px] font-medium text-primary-strong hover:underline">{m.name}</Link></li>)}</ul>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Lịch sử thay đổi" icon={<History className="size-5 text-primary" />} />
            <div className="px-6 pb-5"><Timeline items={d.history.map((e) => ({ id: e.id, at: e.at, title: e.action, detail: [e.after?.added && `Thêm: ${e.after.added}`, e.before?.removed && `Bỏ: ${e.before.removed}`, e.reason && `Lý do: ${e.reason}`].filter(Boolean).join(" · "), actor: e.actorName }))} empty="Mẫu quyền chưa được chỉnh sửa." /></div>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} busy={cmd.pending} title={`Lưu mẫu quyền ${d.role.name}`} confirmLabel="Xác nhận lưu" object={`${d.role.name} — phiên bản ${d.role.version} → ${d.role.version + 1}`}
        consequence={d.role.level === "school" ? `Áp dụng ngay cho ${d.members.length} thành viên đang giữ mẫu này ở lần đọc/ghi kế tiếp.` : "Áp dụng cho phân công tạo mới; phân công hiện có không đổi."} error={err}
        onConfirm={async () => { const r = await cmd.run([...sel], reason.trim()); if (r) { setConfirm(false); setReason(""); } }}>
        <DiffList added={added} removed={removed} />
      </ConfirmDialog>
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={() => { setConflict(null); onReload(); }} mine={<DiffList added={added} removed={removed} />} />
    </div>
  );
}

function DiffList({ added, removed }: { added: ActionKey[]; removed: ActionKey[] }) {
  if (!added.length && !removed.length) return <EmptyState compact title="Chưa chọn thay đổi" description="Đánh dấu hoặc bỏ đánh dấu hành động ở danh sách bên trái." />;
  return (
    <ul className="space-y-1 text-[13px]">
      {added.map((a) => <li key={a} className="flex items-start gap-2 text-success-text"><PlusCircle className="mt-0.5 size-4 flex-none" aria-hidden />Thêm: {ACTION_LABELS[a].label}</li>)}
      {removed.map((a) => <li key={a} className="flex items-start gap-2 text-danger-text"><MinusCircle className="mt-0.5 size-4 flex-none" aria-hidden />Bỏ: {ACTION_LABELS[a].label}</li>)}
    </ul>
  );
}
