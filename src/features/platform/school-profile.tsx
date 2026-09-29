"use client";
import { useEffect, useState } from "react";
import { Pencil, Power, PauseCircle, Archive, UserCog, Building2, ListChecks, Activity, History, ShieldAlert, CheckCircle2, Circle, Globe, LifeBuoy, KeyRound, Users, Layers } from "lucide-react";
import type { School, SchoolStatus } from "@/lib/model/types";
import { platformRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtNumber, schoolStatus, invitationStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, CardLink, Callout, InfoRow } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { SchoolMark } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress";
import { Timeline } from "@/components/ui/timeline";
import { Drawer } from "@/components/ui/dialog";
import { TextField, ErrorSummary } from "@/components/ui/form";
import { ConflictDialog, useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";
import { SchoolStatusDialog } from "./school-status-dialog";

export const ONBOARDING_LABELS: Record<keyof School["onboarding"], string> = {
  profileDone: "Hồ sơ trường", adminAssigned: "Quản trị trường đầu tiên", yearCreated: "Năm học", classesCreated: "Lớp học",
  teachersInvited: "Mời giáo viên", studentsImported: "Danh sách học sinh", homeroomAssigned: "Phân công chủ nhiệm", rulesPublished: "Nội quy thi đua",
};

type Data = Awaited<ReturnType<typeof platformRepo.school>>;

/** PL04 — operational school profile. Never links to student, guardian, attendance or conduct data. */
export function SchoolProfile({ schoolId }: { schoolId: string }) {
  const q = useRepo(["platform-school", schoolId], (ctx) => platformRepo.school(ctx, schoolId));
  return <QueryState query={q} skeleton="detail">{(d) => <Body d={d} reload={() => q.refetch()} />}</QueryState>;
}

function Body({ d, reload }: { d: Data; reload: () => void }) {
  const s = d.school;
  const [status, setStatus] = useState<{ id: string; name: string; to: SchoolStatus } | null>(null);
  const [edit, setEdit] = useState(false);
  const activeAdmins = d.admins.filter((a) => a.status === "active");
  const pendingInv = d.invitations.filter((i) => i.status === "pending");
  const steps = Object.entries(s.onboarding) as [keyof School["onboarding"], boolean][];
  const done = steps.filter(([, v]) => v).length;
  return (
    <div className="page">
      <PageHeader title={s.name} subtitle={`${s.level} · ${s.province} · Mã ${s.code}`} badge={<StatusBadge status={s.status} map={schoolStatus} />}
        breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Danh sách trường", href: "/platform/schools" }, { label: s.shortName }]}
        actions={<>
          <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Sửa thông tin vận hành</Button>
          {(s.status === "draft" || s.status === "suspended") && <Button variant="primary" icon={<Power className="size-4" />} onClick={() => setStatus({ id: s.id, name: s.name, to: "active" })}>Kích hoạt</Button>}
          {s.status === "active" && <Button variant="danger-soft" icon={<PauseCircle className="size-4" />} onClick={() => setStatus({ id: s.id, name: s.name, to: "suspended" })}>Tạm dừng</Button>}
          {s.status === "suspended" && <Button variant="ghost" icon={<Archive className="size-4" />} onClick={() => setStatus({ id: s.id, name: s.name, to: "archived" })}>Lưu trữ</Button>}
        </>} />

      {s.status === "draft" && activeAdmins.length === 0 && (
        <Callout tone="warning" icon={<ShieldAlert />} title="Chưa kích hoạt được" action={<ButtonLink size="sm" href={`/platform/schools/${s.id}/admins`} variant="primary">Mời quản trị</ButtonLink>}>
          Trường chưa có quản trị đang hoạt động{pendingInv.length ? ` (${pendingInv.length} lời mời đang chờ chấp nhận)` : ""}. Kích hoạt chỉ thực hiện được khi đã có quản trị.
        </Callout>
      )}
      {(s.status === "suspended" || s.status === "archived") && s.statusReason && (
        <Callout tone="warning" icon={<PauseCircle />} title={s.status === "suspended" ? "Trường đang tạm dừng" : "Trường đã lưu trữ"}>Lý do: {s.statusReason}. Dữ liệu được giữ nguyên, không bị xóa.</Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Thông tin vận hành" icon={<Building2 className="size-5" />} subtitle={`Phiên bản ${s.version}`} action={s.status === "active" ? <ButtonLink size="sm" variant="ghost" href={`/schools/${s.slug}`} icon={<Globe className="size-4" />} target="_blank">Trang công khai</ButtonLink> : undefined} />
          <div className="flex items-center gap-4 px-5 pb-2"><SchoolMark name={s.name} size={56} color={s.status === "active" ? s.accentColor : "#8a9bb6"} /><p className="text-[13.5px] text-body">{s.publicIntro || "Chưa có giới thiệu công khai (nhà trường tự cập nhật)."}</p></div>
          <dl className="grid gap-x-8 px-5 pb-5 md:grid-cols-2">
            <InfoRow label="Tên ngắn">{s.shortName}</InfoRow>
            <InfoRow label="Đường dẫn công khai">/schools/{s.slug}</InfoRow>
            <InfoRow label="Địa chỉ">{s.address || "—"}</InfoRow>
            <InfoRow label="Tỉnh/thành">{s.province}</InfoRow>
            <InfoRow label="Email công khai">{s.publicEmail || "—"}</InfoRow>
            <InfoRow label="Điện thoại công khai">{s.publicPhone || "—"}</InfoRow>
            <InfoRow label="Ngày tạo">{fmtDate(s.createdAt)}</InfoRow>
            <InfoRow label="Ngày kích hoạt">{s.activatedAt ? fmtDate(s.activatedAt) : "Chưa kích hoạt"}</InfoRow>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Chỉ số vận hành" icon={<Activity className="size-5" />} />
          <ul className="grid grid-cols-2 gap-3 px-5 pb-5">
            {[
              { label: "Lớp năm hiện tại", v: d.row.classCount, icon: <Layers className="size-4" /> },
              { label: "Nhân sự hoạt động", v: d.row.staffCount, icon: <Users className="size-4" /> },
              { label: "Yêu cầu hỗ trợ", v: d.tickets, icon: <LifeBuoy className="size-4" /> },
              { label: "Quyền hỗ trợ hiệu lực", v: d.activeGrants, icon: <KeyRound className="size-4" /> },
            ].map((k) => (
              <li key={k.label} className="rounded-xl border border-line p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><span className="text-primary" aria-hidden>{k.icon}</span>{k.label}</p>
                <p className="mt-1 text-[22px] font-bold text-ink">{fmtNumber(k.v)}</p>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-5 text-[12.5px] text-muted">Chỉ số tổng hợp. Nền tảng không mở hồ sơ học sinh, điểm danh, thi đua hay thông tin gia đình.</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Checklist khởi tạo" icon={<ListChecks className="size-5" />} subtitle="Nhà trường tự hoàn thành các bước sau kích hoạt" />
          <div className="space-y-3 px-5 pb-5">
            <ProgressBar value={done} total={steps.length} label={`${done}/${steps.length} bước`} />
            <ul className="space-y-1.5">
              {steps.map(([k, v]) => <li key={k} className={`flex items-center gap-2 text-[13.5px] ${v ? "text-ink" : "text-muted"}`}>{v ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4" aria-hidden />}{ONBOARDING_LABELS[k]}<span className="sr-only">{v ? " — đã xong" : " — chưa xong"}</span></li>)}
            </ul>
          </div>
        </Card>
        <Card>
          <CardHeader title="Quản trị trường" icon={<UserCog className="size-5" />} action={<CardLink href={`/platform/schools/${s.id}/admins`}>Quản lý</CardLink>} />
          <ul className="space-y-2.5 px-5 pb-5">
            {d.admins.length === 0 && <li className="text-sm text-warning-text">Chưa có quản trị.</li>}
            {d.admins.map((a) => <li key={a.membershipId} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{a.name}</span><span className="block text-[12.5px] text-muted">{a.email}</span></span><StatusBadge status={a.status} map={{ active: { label: "Đang hoạt động", tone: "success" }, suspended: { label: "Tạm khóa", tone: "warning" }, revoked: { label: "Đã thu hồi", tone: "danger" } }} /></li>)}
            {pendingInv.map((i) => <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{i.fullName}</span><span className="block text-[12.5px] text-muted">{i.email} · hạn {fmtDate(i.expiresAt)}</span></span><StatusBadge status={i.status} map={invitationStatus} /></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Lịch sử vận hành" icon={<History className="size-5" />} action={<CardLink href="/platform/audit">Nhật ký</CardLink>} />
          <div className="px-5 pb-5">
            <Timeline items={d.history.slice(0, 6).map((h) => ({ id: h.id, at: h.at, title: h.action, detail: h.reason ? `Lý do: ${h.reason}` : undefined, tone: h.action.includes("Tạm dừng") || h.action.includes("Lưu trữ") ? "amber" : h.action.includes("Kích hoạt") ? "green" : "blue" }))} empty="Chưa có sự kiện vận hành." />
          </div>
        </Card>
      </div>
      <SchoolStatusDialog target={status} onClose={() => setStatus(null)} />
      <EditOpsDrawer open={edit} onClose={() => setEdit(false)} school={s} reload={reload} />
    </div>
  );
}

function EditOpsDrawer({ open, onClose, school, reload }: { open: boolean; onClose: () => void; school: School; reload: () => void }) {
  const init = { name: school.name, shortName: school.shortName, province: school.province, address: school.address, publicEmail: school.publicEmail, publicPhone: school.publicPhone };
  const [f, setF] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setF({ name: school.name, shortName: school.shortName, province: school.province, address: school.address, publicEmail: school.publicEmail, publicPhone: school.publicPhone }); setErrors({}); } }, [open, school]);
  const dirty = open && JSON.stringify(f) !== JSON.stringify(init);
  useUnsavedChanges(dirty);
  const leave = useLeaveGuard();
  const cmd = useCommand((ctx, v: typeof f) => platformRepo.updateSchoolOps(ctx, school.id, { ...v, version: school.version }), { success: "Đã lưu thông tin vận hành", onSuccess: onClose, onError: (e) => e.fieldErrors && setErrors(e.fieldErrors) });
  const submit = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 5) e.name = "Tên trường tối thiểu 5 ký tự";
    if (!f.shortName.trim()) e.shortName = "Nhập tên ngắn";
    if (!f.province.trim()) e.province = "Nhập tỉnh/thành";
    if (f.publicEmail && !/^\S+@\S+\.\S+$/.test(f.publicEmail)) e.publicEmail = "Email chưa hợp lệ";
    setErrors(e);
    if (Object.keys(e).length) return;
    cmd.run({ ...f, name: f.name.trim(), shortName: f.shortName.trim() });
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()} busy={cmd.pending} width={520} title="Sửa thông tin vận hành" description="Chỉ thông tin vận hành và liên hệ công khai. Không gồm dữ liệu học sinh."
        beforeClose={() => { if (!dirty) return true; leave(onClose); return false; }}
        footer={<><Button variant="ghost" onClick={onClose} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} disabled={!dirty} onClick={submit}>Lưu thay đổi</Button></>}>
        <div className="space-y-4">
          <ErrorSummary errors={errors} labels={{ name: "Tên trường", shortName: "Tên ngắn", province: "Tỉnh/thành", publicEmail: "Email công khai" }} />
          <div data-field="name"><TextField label="Tên trường" required value={f.name} onChange={set("name")} error={errors.name} /></div>
          <div data-field="shortName"><TextField label="Tên ngắn" required value={f.shortName} onChange={set("shortName")} error={errors.shortName} /></div>
          <div data-field="province"><TextField label="Tỉnh/thành" required value={f.province} onChange={set("province")} error={errors.province} /></div>
          <TextField label="Địa chỉ" value={f.address} onChange={set("address")} />
          <div data-field="publicEmail"><TextField label="Email công khai" type="email" value={f.publicEmail} onChange={set("publicEmail")} error={errors.publicEmail} /></div>
          <TextField label="Điện thoại công khai" value={f.publicPhone} onChange={set("publicPhone")} />
          <p className="text-[12.5px] text-muted">Mã trường và đường dẫn công khai không đổi sau khi tạo.</p>
        </div>
      </Drawer>
      <ConflictDialog error={cmd.error} onClose={cmd.reset} onReload={() => { cmd.reset(); onClose(); reload(); }} />
    </>
  );
}
