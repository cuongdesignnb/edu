"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, User, Users, History, Lock, Eye, RefreshCw, Ban, BarChart3, Info, PlusCircle, GraduationCap, School as SchoolIcon, UserRound, Shuffle,
  CalendarCheck, Trophy, CalendarDays, Brush, Sparkles, Megaphone, UsersRound, FileText, ShieldCheck, ShieldOff, Link2, QrCode, Star, Circle } from "lucide-react";
import type { ParentModule } from "@/lib/model/types";
import { studentsRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, studentStatus, verificationStatus, parentModuleLabel } from "@/lib/formatters";
import { diffDays } from "@/lib/calendar";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, CardLink, Callout, InfoRow } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/states";
import { ACCESS_STATUS, ENROLLMENT_STATUS, CopyButton, ALL_MODULES, MODULE_HINT } from "./shared";
import { SchoolSourceState } from "@/features/school-org/common";
import { GuardianDialog, IssueAccessDialog, RevokeAccessDialog, TransferDialog, VerifyDialog, type GuardianEditTarget } from "./dialogs";

const MODULE_ICON: Record<ParentModule, { icon: React.ReactNode; tone: string }> = {
  attendance: { icon: <CalendarCheck />, tone: "tone-blue" }, conduct: { icon: <Trophy />, tone: "tone-amber" }, timetable: { icon: <CalendarDays />, tone: "tone-blue" },
  duties: { icon: <Brush />, tone: "tone-green" }, activities: { icon: <Sparkles />, tone: "tone-amber" }, announcements: { icon: <Megaphone />, tone: "tone-pink" },
  teachers: { icon: <UsersRound />, tone: "tone-purple" }, documents: { icon: <FileText />, tone: "tone-green" },
};

type Profile = Awaited<ReturnType<typeof studentsRepo.profile>>;

/** SC18 — student profile (R07). All data from studentsRepo.profile(); actions follow perms. */
export function StudentProfile({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const {yearId} = useSchool();
  const q = useRepo(["student-profile", schoolId, studentId, yearId], (ctx) => studentsRepo.profile(ctx, schoolId, studentId, undefined, yearId || undefined));
  return (
    <SchoolSourceState query={q}>
      {(d) => <ProfileBody d={d} schoolId={schoolId} />}
    </SchoolSourceState>
  );
}

function ProfileBody({ d, schoolId }: { d: Profile; schoolId: string }) {
  const { school } = useSchool();
  const s = d.student;
  const base = `/school/${schoolId}`;
  const studying = s.status === "studying";
  const [guardianDlg, setGuardianDlg] = useState<{ existing: GuardianEditTarget | null } | null>(null);
  const [verify, setVerify] = useState<Parameters<typeof VerifyDialog>[0]["target"]>(null);
  const [transfer, setTransfer] = useState(false);
  const [issue, setIssue] = useState<{ relationshipId?: string; replace?: { accessId: string; version: number; relationshipId: string; modules: ParentModule[]; allowDownload?: boolean; label: string } | null } | null>(null);
  const [revoke, setRevoke] = useState<{ accessId: string; label: string } | null>(null);
  const [selId, setSelId] = useState<string | undefined>();

  const links = d.links;
  const primaryRel = d.relationships?.find((r) => r.isPrimaryContact)?.id;
  const preferred = links?.find((l) => l.status === "active" && l.relationshipId === primaryRel) ?? links?.find((l) => l.status === "active") ?? links?.[0];
  useEffect(() => { if (!selId || !links?.some((l) => l.id === selId)) setSelId(preferred?.id); }, [links, selId, preferred?.id]);
  const link = links?.find((l) => l.id === selId) ?? preferred;
  const daysLeft = link ? diffDays(link.expiresAt.slice(0, 10), d.today) : 0;
  const linkLabel = (l: NonNullable<typeof links>[number]) => `Link cấp cho ${l.relation.toLowerCase()} (${l.guardianName})`;


  return (
    <div className="page">
      <PageHeader compact title="Hồ sơ học sinh" breadcrumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: s.fullName }]}
        actions={<>
          <ButtonLink href={`${base}/students`} icon={<ArrowLeft className="size-4" />}>Quay lại danh sách</ButtonLink>
          {d.perms.transfer && studying && <Button icon={<Shuffle className="size-4" />} onClick={() => setTransfer(true)}>Chuyển lớp / ngừng theo học</Button>}
          {d.perms.edit && <ButtonLink href={`${base}/students/${s.id}/edit`} variant="primary" icon={<Pencil className="size-4" />}>Sửa thông tin</ButtonLink>}
        </>} />

      {d.level === "subject-minimal" && <Callout tone="neutral" icon={<Lock/>} title="Hồ sơ rút gọn theo phạm vi giáo viên bộ môn">Không hiển thị ngày sinh, giới tính, người giám hộ, link và ghi chú nội bộ.</Callout>}
      {/* Header card */}
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <Avatar name={s.fullName} tone="blue" size={104} className="!text-[34px] ring-4 ring-primary-light" />
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-[26px] font-extrabold leading-tight text-ink">{s.fullName}</h2><StatusBadge status={s.status} map={studentStatus} /></div>
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-muted">Mã học sinh: <span className="font-semibold text-body">{s.code}</span><CopyButton text={s.code} what="mã học sinh" label="Sao chép mã học sinh" /></p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:divide-x sm:divide-line">
            <HeadFact icon={<GraduationCap className="size-5" />} label="Lớp" value={d.currentClass?.name ?? "—"} />
            <HeadFact icon={<SchoolIcon className="size-5" />} label="Trường" value={school.name} className="sm:pl-4" />
            <HeadFact icon={<UserRound className="size-5" />} label="Giáo viên chủ nhiệm" value={d.currentClass?.homeroom ?? "—"} className="sm:pl-4" />
          </div>
        </div>
        <div className="hidden flex-none items-center gap-3 border-l border-line pl-6 2xl:flex" aria-hidden>
          <p className="quote max-w-[250px] text-right">“Nỗ lực hôm nay<br />kiến tạo ngày mai tươi sáng”</p>
          <img src="/assets/illustrations/books-plant.png" alt="" className="h-[84px] w-auto" />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Thông tin học sinh" icon={<User className="size-5" />} />
            <div className="grid gap-x-8 px-5 pb-4 sm:grid-cols-2 sm:divide-x sm:divide-line">
              <dl>
                <InfoRow label="Họ và tên">{s.fullName}</InfoRow>
                <InfoRow label="Ngày sinh">{s.dob === null ? "Không hiển thị theo quyền" : fmtDate(s.dob)}</InfoRow>
                <InfoRow label="Giới tính">{s.gender ?? "Không hiển thị theo quyền"}</InfoRow>
                <InfoRow label="Mã học sinh">{s.code}</InfoRow>
              </dl>
              <dl className="sm:pl-8">
                <InfoRow label="Lớp">{d.currentClass?.name ?? (d.lastClass ? `${d.lastClass.name} (lớp đã kết thúc)` : "—")}</InfoRow>
                <InfoRow label="Năm học">{d.year?.name ?? "—"}</InfoRow>
                <InfoRow label="Tổ">{d.level === "subject-minimal" ? "Không hiển thị theo quyền" : d.group ?? "Chưa phân tổ"}</InfoRow>
                <InfoRow label="Chức vụ">{d.positions === null ? "Không hiển thị theo quyền" : d.positions.length ? d.positions.join(", ") : "—"}</InfoRow>
              </dl>
            </div>
            {d.perms.seeInternalNote && s.internalNote && <div className="mx-5 mb-4 rounded-xl bg-[#f7fbff] px-4 py-2.5 text-[13.5px]"><span className="font-semibold text-ink">Ghi chú nội bộ: </span>{s.internalNote}</div>}
          </Card>

          <Card>
            <CardHeader title="Người giám hộ" icon={<Users className="size-5" />} subtitle="Liên hệ ưu tiên và quyền nhận thông tin là hai việc tách biệt." />
            {d.relationships === null ? <EmptyState compact icon={<Lock className="size-6" />} title="Không hiển thị người giám hộ" description="Vai trò của bạn không bao gồm quyền xem người giám hộ." /> : (
              <div className="px-5 pb-5">
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 560 }}>
                    <thead><tr><th>Họ và tên</th><th>Quan hệ</th><th>Số điện thoại</th><th className="center">Liên hệ ưu tiên</th><th>Trạng thái xác minh</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
                    <tbody>
                      {d.relationships.length === 0 && <tr><td colSpan={6} className="text-center text-muted">Chưa có người giám hộ.</td></tr>}
                      {d.relationships.map((r) => (
                        <tr key={r.id}>
                          <td className="font-semibold text-ink">{r.guardian.fullName}</td>
                          <td>{r.relation}</td>
                          <td className="whitespace-nowrap tabular-nums">{r.guardian.phoneMasked}</td>
                          <td className="center">{r.isPrimaryContact ? <span className="inline-flex items-center gap-1 text-primary-strong"><Star className="size-4 fill-current" aria-hidden /><span className="sr-only">Có</span></span> : <Circle className="mx-auto size-4 text-line-strong" aria-label="Không" />}</td>
                          <td><StatusBadge status={r.verification} map={verificationStatus} /></td>
                          <td className="center">
                            {(d.perms.editGuardians || d.perms.verifyGuardians || d.perms.manageLinks) && (
                              <ActionMenu label={`Thao tác với ${r.guardian.fullName}`} items={[
                                ...(d.perms.editGuardians ? [{ label: "Sửa thông tin liên hệ", icon: <Pencil />, onSelect: () => setGuardianDlg({ existing: { guardianId: r.guardianId, relationshipId: r.id, fullName: r.guardian.fullName, relation: r.relation, phoneMasked: r.guardian.phoneMasked, email: r.guardian.email, isPrimaryContact: r.isPrimaryContact } }) }] : []),
                                ...(d.perms.verifyGuardians && r.verification !== "verified" ? [{ label: "Xác minh quan hệ", icon: <ShieldCheck />, onSelect: () => setVerify({ relationshipId: r.id, version: r.version, to: "verified", guardianName: r.guardian.fullName, relation: r.relation, studentName: s.fullName, activeLinks: links === null ? null : links.filter(l => l.relationshipId === r.id && l.status === "active").length }) }] : []),
                                ...(d.perms.verifyGuardians && r.verification === "verified" ? [{ label: "Thu hồi quan hệ", icon: <ShieldOff />, danger: true, onSelect: () => setVerify({ relationshipId: r.id, version: r.version, to: "revoked", guardianName: r.guardian.fullName, relation: r.relation, studentName: s.fullName, activeLinks: links === null ? null : links.filter(l => l.relationshipId === r.id && l.status === "active").length }) }] : []),
                                ...(d.perms.issueLinks && studying ? [{ label: "Cấp link tra cứu", icon: <Link2 />, separatorBefore: true, disabled: r.verification !== "verified" || !r.canReceiveInfo, hint: r.verification !== "verified" ? "Cần xác minh trước" : !r.canReceiveInfo ? "Chưa có quyền nhận thông tin" : undefined, onSelect: () => setIssue({ relationshipId: r.id }) }] : []),
                                { label: "Mở hồ sơ người giám hộ", icon: <Eye />, href: `${base}/guardians/${r.guardianId}` },
                              ]} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {d.perms.editGuardians && (
                  <button type="button" onClick={() => setGuardianDlg({ existing: null })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-2.5 text-sm font-semibold text-primary-strong hover:bg-primary-light">
                    <PlusCircle className="size-4" aria-hidden />Thêm người giám hộ
                  </button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Lịch sử lớp" icon={<History className="size-5" />} subtitle="Lớp cũ được giữ nguyên; báo cáo quá khứ không đổi lớp." />
            <div className="table-wrap px-5 pb-5">
              <table className="table" style={{ minWidth: 560 }}>
                <thead><tr><th>Năm học</th><th>Lớp</th><th>Thời gian</th><th>Giáo viên chủ nhiệm</th><th>Trạng thái</th></tr></thead>
                <tbody>{d.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.yearLabel}</td><td className="font-semibold text-ink">{h.className}</td>
                    <td className="tabular-nums">{fmtDate(h.startDate)} – {h.endDate ? fmtDate(h.endDate) : "nay"}</td>
                    <td>{h.homeroom}</td>
                    <td><StatusBadge status={h.viewStatus} map={ENROLLMENT_STATUS}/><span className="mt-0.5 block text-[12px] text-muted">Mốc {fmtDate(h.referenceDate)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column — parent access */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="!flex-nowrap !items-start" title="Quyền xem của phụ huynh" icon={<Lock className="size-5" />} action={link ? <StatusBadge status={link.status} map={ACCESS_STATUS} /> : undefined}
              subtitle="Phụ huynh xem thông tin đã công bố qua đường link riêng, không cần đăng ký hay đăng nhập." />
            {links === null ? <EmptyState compact icon={<Lock className="size-6" />} title="Không quản lý link tra cứu" description={d.perms.issueLinks?"Vai trò của bạn không được xem danh sách link đã cấp.":"Vai trò của bạn không bao gồm quyền cấp hoặc xem link tra cứu của học sinh này."}
              action={d.perms.issueLinks&&studying?<Button variant="primary" size="sm" icon={<Link2 className="size-4"/>} onClick={()=>setIssue({})}>Cấp link mới</Button>:undefined}/> : links.length === 0 ? (
              <EmptyState compact icon={<Link2 className="size-6" />} title="Chưa cấp link tra cứu" description="Cấp link riêng cho từng người giám hộ đã xác minh."
                action={d.perms.issueLinks && studying ? <Button variant="primary" size="sm" icon={<Link2 className="size-4" />} onClick={() => setIssue({})}>Cấp link mới</Button> : undefined} />
            ) : link && (
              <div className="space-y-3 px-5 pb-5">
                {links.length > 1 && (
                  <select aria-label="Chọn link để xem" className="select" value={link.id} onChange={(e) => setSelId(e.target.value)}>
                    {links.map((l) => <option key={l.id} value={l.id}>{linkLabel(l)} — {ACCESS_STATUS[l.status as keyof typeof ACCESS_STATUS]?.label ?? l.status}</option>)}
                  </select>
                )}
                <div className="grid gap-4 rounded-xl bg-[#f7fbff] p-4 sm:grid-cols-[minmax(0,1fr)_132px]">
                  <dl className="min-w-0 [&>div]:grid-cols-[104px_1fr] [&>div]:gap-2">
                    <InfoRow label="Cấp cho">{link.relation} — {link.guardianName}</InfoRow>
                    <InfoRow label="Ngày cấp">{fmtDate(link.issuedAt)}</InfoRow>
                    <InfoRow label="Hạn sử dụng">{fmtDate(link.expiresAt)}{link.status === "active" && <span className="font-normal text-muted"> (còn {daysLeft} ngày)</span>}</InfoRow>
                    <InfoRow label="Trạng thái"><StatusBadge status={link.status} map={ACCESS_STATUS} /></InfoRow>
                    <InfoRow label="Lượt mở link">{link.opens}{link.lastOpenedAt && <span className="block text-[12px] font-normal text-muted">gần nhất {fmtDateTime(link.lastOpenedAt)}</span>}</InfoRow>
                  </dl>
                  <div className="flex flex-col items-center justify-center gap-1.5 text-center">
                    <span className="flex size-[112px] items-center justify-center rounded-lg border border-dashed border-line-strong bg-white text-muted"><QrCode className="size-10" aria-hidden /></span>
                    <span className="text-[12px] text-muted">QR hiển thị khi cấp link</span>
                  </div>
                </div>
                <Callout tone="neutral">Link và QR chỉ hiển thị khi cấp. Hồ sơ đã lưu không trả lại mã truy cập riêng.</Callout>
                {link.status === "revoked" && link.revokeReason && <Callout tone="danger" icon={<Ban />}>Đã thu hồi: {link.revokeReason}</Callout>}
                <div className="flex flex-wrap gap-2">
                  {d.perms.issueLinks && studying && <Button variant="primary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => setIssue({})}>Cấp link mới</Button>}
                  {d.perms.revokeLinks && link.status === "active" && <Button variant="danger-soft" size="sm" icon={<Ban className="size-4" />} onClick={() => setRevoke({ accessId: link.id, label: linkLabel(link) })}>Thu hồi</Button>}

                  <ButtonLink size="sm" href={`${base}/parent-access/${link.id}`} icon={<BarChart3 className="size-4" />}>Xem nhật ký truy cập</ButtonLink>
                </div>
              </div>
            )}
          </Card>

          {d.perms.manageLinks && link && (
            <Card>
              <CardHeader title="Nội dung phụ huynh được xem" icon={<Eye className="size-5" />} subtitle={`Theo ${linkLabel(link).charAt(0).toLowerCase() + linkLabel(link).slice(1)}. Chỉ đọc — muốn đổi thì cấp lại link.`}
                action={d.perms.issueLinks && link.status === "active" && studying ? <Button size="sm" variant="ghost" onClick={() => setIssue({ relationshipId: link.relationshipId, replace: { accessId: link.id, version: link.version, relationshipId: link.relationshipId, modules: link.modules, allowDownload: link.allowDownload, label: linkLabel(link) } })}>Cấp lại với mục khác</Button> : undefined} />
              <ul className="divide-y divide-line px-5 pb-3">
                {ALL_MODULES.map((m) => {
                  const on = link.modules.includes(m);
                  return (
                    <li key={m} className="flex items-center gap-3 py-1.5">
                      <span className={`icon-tile icon-tile-sm !size-9 ${MODULE_ICON[m].tone} [&>svg]:size-[18px]`} aria-hidden>{MODULE_ICON[m].icon}</span>
                      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-ink">{parentModuleLabel[m]}</span><span className="block truncate text-[12px] text-muted">{MODULE_HINT[m]}</span></span>
                      <span className={`relative inline-flex h-6 w-11 flex-none rounded-full ${on ? "bg-primary" : "bg-[#cfdcec]"}`} aria-hidden><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow ${on ? "left-[22px]" : "left-0.5"}`} /></span>
                      <span className="sr-only">{on ? "Được xem" : "Không chia sẻ"}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {d.accessLog !== null && (
        <Card>
          <CardHeader title="Nhật ký sử dụng link" icon={<History className="size-5" />} subtitle="Ghi nhận link được mở; không xác định được ai thực sự cầm link."
            action={link ? <CardLink href={`${base}/parent-access/${link.id}`}>Xem tất cả</CardLink> : undefined} />
          <div className="px-5 pb-4">
            {d.accessLog.length === 0 ? <EmptyState compact title="Chưa có lượt sử dụng link" /> : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 680 }}>
                  <thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Nội dung xem</th><th>Thiết bị</th></tr></thead>
                  <tbody>{d.accessLog.slice(0, 8).map((l) => (
                    <tr key={l.id}><td className="whitespace-nowrap tabular-nums">{fmtDateTime(l.at)}</td><td>{l.label} · {l.event}</td><td>{l.module ? (l.module === "overview" ? "Trang tổng quan" : parentModuleLabel[l.module as ParentModule] ?? l.module) : "—"}</td><td className="text-muted">{l.device ?? "—"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {d.accessLogHasMore && <p className="text-[12px] text-muted">Có thêm sự kiện; mở nhật ký link để xem đầy đủ.</p>}
          </div>
        </Card>
      )}
      <Callout tone="info" icon={<Info />}>Phụ huynh không cần đăng ký tài khoản hay đăng nhập. Nhà trường cấp đường link riêng (hoặc mã QR) cho từng người giám hộ đã xác minh để xem thông tin đã công bố của học sinh.</Callout>

      {guardianDlg && <GuardianDialog open onOpenChange={(o) => { if (!o) setGuardianDlg(null); }} schoolId={schoolId} studentId={s.id} studentName={s.fullName} existing={guardianDlg.existing} />}
      <VerifyDialog target={verify} onClose={() => setVerify(null)} schoolId={schoolId} />
      {transfer && <TransferDialog open onOpenChange={(o) => { if (!o) setTransfer(false); }} schoolId={schoolId} canDecide={d.perms.transfer} student={{ id: s.id, fullName: s.fullName, className: d.currentClass?.name ?? "—", classId: d.currentClass?.id }} />}
      {issue && <IssueAccessDialog open onOpenChange={(o) => { if (!o) setIssue(null); }} schoolId={schoolId} studentId={s.id} relationshipId={issue.relationshipId} replace={issue.replace} />}
      <RevokeAccessDialog target={revoke} onClose={() => setRevoke(null)} schoolId={schoolId} />
    </div>
  );
}

function HeadFact({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className ?? ""}`}>
      <span className="icon-tile icon-tile-sm tone-blue" aria-hidden>{icon}</span>
      <span className="min-w-0"><span className="block text-[12.5px] text-muted">{label}</span><span className="block truncate text-[15px] font-bold text-ink">{value}</span></span>
    </div>
  );
}
