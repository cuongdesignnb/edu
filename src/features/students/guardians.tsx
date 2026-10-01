"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, ShieldCheck, ShieldAlert, Link2, Eye, Pencil, ShieldOff, Ban, History, Info, UserRound, Phone, Mail, Star } from "lucide-react";
import { studentsRepo } from "@/lib/repositories";
import { studentsExtraRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtNumber, verificationStatus } from "@/lib/formatters";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Identity } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { Timeline } from "@/components/ui/timeline";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { SchoolSourceState } from "@/features/school-org/common";
import { ACCESS_STATUS } from "./shared";
import { GuardianDialog, IssueAccessDialog, RevokeAccessDialog, VerifyDialog, type GuardianEditTarget } from "./dialogs";

type Row = Awaited<ReturnType<typeof studentsRepo.guardians>>["items"][number];

/** SC21 — guardians of the school. Contacts, related students, verification. No parent accounts. */
export function GuardiansPage({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const base = `/school/${schoolId}`;
  const list = useListQuery({ pageSize: 10, sort: "name", dir: "asc" });
  const q = useRepo(["guardians", schoolId, list.query], (ctx) => studentsRepo.guardians(ctx, schoolId, list.query));
  const sum = useRepo(["guardian-summary", schoolId], (ctx) => studentsExtraRepo.guardianSummary(ctx, schoolId));

  const columns: Column<Row>[] = [
    { key: "name", header: "Người giám hộ", sortable: true, cell: (r) => <Identity name={r.fullName} sub={r.phoneMasked ?? undefined} tone="purple" size={34} className="min-w-[190px]" /> },
    { key: "students", header: "Học sinh liên quan", cell: (r) => (
      <ul className="min-w-[220px] space-y-1">{r.students.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-[13px]"><Link href={`${base}/students/${s.id}`} className="font-semibold text-ink hover:underline">{s.name}</Link><span className="text-muted">{s.relation} · {s.className ?? "Không có lớp hiện tại"}</span>{s.verification !== "verified" && <StatusBadge status={s.verification} map={verificationStatus} />}</li>
      ))}</ul>
    ) },
    { key: "count", header: "Số học sinh", align: "right", hideBelow: "md", cell: (r) => r.relationshipCount },
    { key: "verify", header: "Xác minh", cell: (r) => r.unverified ? <Badge tone="warning">{r.unverified} chưa xác minh</Badge> : r.verified ? <Badge tone="success">Đã xác minh</Badge> : <Badge tone="danger">Đã thu hồi</Badge> },
    { key: "links", header: "Link đang hoạt động", align: "right", hideBelow: "sm", cell: (r) => r.activeLinks === null ? "Không hiển thị theo quyền" : r.activeLinks },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "center", cell: (r) => <ActionMenu label={`Thao tác với ${r.fullName}`} items={[{ label: "Mở quan hệ và quyền nhận thông tin", icon: <Eye />, href: `${base}/guardians/${r.id}` }]} /> },
  ];

  return (
    <div className="page">
      <PageHeader title="Người giám hộ" subtitle="Liên hệ và quan hệ với học sinh trong trường. Không tạo tài khoản phụ huynh; không gộp người theo số điện thoại."
        breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Người giám hộ" }]} illustration="/assets/illustrations/family-header.png" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Người giám hộ" value={sum.data ? fmtNumber(sum.data.guardians) : "—"} icon={<Users className="size-7" />} tone="purple" hint="Hồ sơ liên hệ trong trường" />
        <KpiCard label="Quan hệ đã xác minh" value={sum.data ? fmtNumber(sum.data.verified) : "—"} icon={<ShieldCheck className="size-7" />} tone="green" hint="Quyền nhận thông tin được xác nhận riêng" />
        <KpiCard label="Quan hệ chưa xác minh" value={sum.data ? fmtNumber(sum.data.unverified) : "—"} icon={<ShieldAlert className="size-7" />} tone="amber" hint="Cần xác minh trước khi cấp link" />
        <KpiCard label="Link đang hoạt động" value={sum.data?.activeLinks === null ? "Không hiển thị theo quyền" : sum.data ? fmtNumber(sum.data.activeLinks) : "—"} icon={<Link2 className="size-7" />} tone="blue" hint="Mỗi link cho một giám hộ và một học sinh" />
      </div>
      {sum.error && <ErrorState error={sum.error} onRetry={() => sum.refetch()} compact />}
      <Card>
        <CardHeader title={`Danh sách${q.data ? ` (${q.data.total})` : ""}`} icon={<Users className="size-5" />} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tên người giám hộ hoặc học sinh…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Lọc xác minh" allLabel="Mọi trạng thái xác minh" value={list.query.filters?.verification ?? ""} onChange={(v) => list.setFilter("verification", v)} options={[{ value: "unverified", label: "Có quan hệ chưa xác minh" }, { value: "verified", label: "Có quan hệ đã xác minh" }]} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : q.data!.total === 0 && !list.active ? <EmptyState icon={<Users className="size-6" />} title="Chưa có người giám hộ" description="Người giám hộ được thêm từ hồ sơ học sinh hoặc khi nhập danh sách." />
          : (
            <>
              <div className="px-4"><DataTable caption="Người giám hộ" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort} onRowClick={(r) => router.push(`${base}/guardians/${r.id}`)} empty={<EmptyFiltered onReset={list.reset} what="người giám hộ" />} minWidth={820} /></div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} what="người giám hộ" />
            </>
          )}
      </Card>
    </div>
  );
}

/* ------------------------------ SC22 — relationships & information rights ------------------------------ */
export function GuardianDetail({ schoolId, guardianId }: { schoolId: string; guardianId: string }) {
  const q = useRepo(["guardian", schoolId, guardianId], (ctx) => studentsRepo.guardian(ctx, schoolId, guardianId));
  const { can } = useSchool();
  const base = `/school/${schoolId}`;
  const [edit, setEdit] = useState<null | { studentId: string; studentName: string; relationshipId: string; relation: GuardianEditTarget }>(null);
  const [verify, setVerify] = useState<Parameters<typeof VerifyDialog>[0]["target"]>(null);
  const [issue, setIssue] = useState<{ studentId: string; relationshipId: string } | null>(null);
  const [revoke, setRevoke] = useState<{ accessId: string; label: string } | null>(null);
  return (
    <SchoolSourceState query={q}>
      {(d) => (
        <div className="page">
          <PageHeader title="Quan hệ và quyền nhận thông tin" subtitle={d.guardian.fullName} breadcrumbs={[...(can("guardian.manage.all") ? [{ label: "Người giám hộ", href: `${base}/guardians` }] : []), { label: d.guardian.fullName }]}
            actions={can("guardian.manage.all") ? <ButtonLink href={`${base}/guardians`}>Quay lại danh sách</ButtonLink> : undefined} />
          <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex items-center gap-3"><Avatar name={d.guardian.fullName} tone="purple" size={56} /><div className="min-w-0"><p className="text-lg font-bold text-ink">{d.guardian.fullName}</p><p className="text-[13px] text-muted">{d.relationships.length} quan hệ với học sinh</p></div></div>
                <dl className="mt-4">
                  <InfoRow label={<span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden />Điện thoại</span>}>{d.guardian.phoneMasked ?? "Chưa lưu số điện thoại"}</InfoRow>
                  <InfoRow label={<span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden />Email</span>}>{d.guardian.email ?? "—"}</InfoRow>
                </dl>
              </Card>
              <Callout tone="info" icon={<Info />} title="Không phải tài khoản">Người giám hộ không có tài khoản, không đăng nhập. Quyền xem thông tin được xác minh riêng cho từng học sinh và cấp bằng link riêng. Hệ thống không tự gộp người giám hộ trùng số điện thoại.</Callout>
              <Card>
                <CardHeader title="Lịch sử thay đổi" icon={<History className="size-5" />} />
                <div className="px-5 pb-5">{d.history === null ? <p className="text-sm text-muted">Lịch sử thay đổi không thuộc phạm vi được phép xem.</p> : <><Timeline items={d.history.map((a) => ({ id: a.id, at: a.at, title: a.action, detail: a.reason ? `Lý do/căn cứ: ${a.reason}` : a.entityType, actor: a.actorName ?? undefined, tone: a.action.includes("Thu hồi") ? "red" : a.action.includes("Xác minh") ? "green" : "blue" }))} empty="Chưa có thay đổi nào được ghi nhận." />{d.historyHasMore && <p className="text-[12px] text-muted">Có thêm thay đổi; mở nhật ký của trường để xem đầy đủ.</p>}</>}</div>
              </Card>
            </div>
            <div className="space-y-5">
              {d.relationships.length === 0 && <EmptyState title="Chưa có quan hệ với học sinh nào" />}
              {d.relationships.map((r) => (
                <Card key={r.id}>
                  <CardHeader title={<Link href={`${base}/students/${r.student.id}`} className="hover:underline">{r.student.name}</Link>} icon={<UserRound className="size-5" />}
                    subtitle={`${r.student.code} · ${r.student.className ? `Lớp ${r.student.className}` : "Không có lớp hiện tại"} · ${r.relation}${r.isPrimaryContact ? " · liên hệ ưu tiên" : ""}`}
                    action={<StatusBadge status={r.verification} map={verificationStatus} />} />
                  <div className="space-y-4 px-5 pb-5">
                    <dl className="grid gap-x-8 sm:grid-cols-2">
                      <InfoRow label="Quan hệ">{r.relation}</InfoRow>
                      <InfoRow label="Quyền nhận thông tin">{r.canReceiveInfo ? "Được nhận thông tin đã công bố" : "Chưa được nhận thông tin"}</InfoRow>
                      <InfoRow label="Liên hệ ưu tiên">{r.isPrimaryContact ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-current text-primary" aria-hidden />Có</span> : "Không"}</InfoRow>
                      <InfoRow label="Người xác minh">{r.verification === "verified" ? r.verifiedByName : "—"}</InfoRow>
                      <InfoRow label="Thời điểm xác minh">{r.verifiedAt ? fmtDateTime(r.verifiedAt) : "—"}</InfoRow>
                    </dl>
                    {r.verificationNote && r.verification === "verified" && <p className="rounded-xl bg-success-bg px-3.5 py-2 text-[13px] text-success-text">Căn cứ: {r.verificationNote}</p>}
                    {r.verification === "revoked" && r.revokedReason && <p className="rounded-xl bg-danger-bg px-3.5 py-2 text-[13px] text-danger-text">Đã thu hồi: {r.revokedReason}</p>}
                    {r.verification === "unverified" && <Callout tone="warning" icon={<ShieldAlert />}>Chưa xác minh — cần xác minh trước khi cấp link tra cứu.</Callout>}
                    <div>
                      <p className="mb-2 text-sm font-semibold text-ink">Link tra cứu {r.links === null ? "" : `(${r.links.length})`}</p>
                      {r.links === null ? <p className="text-[13px] text-muted">Link tra cứu không thuộc phạm vi được phép xem.</p> : r.links.length === 0 ? <p className="text-[13px] text-muted">Chưa cấp link nào.</p> : (
                        <ul className="divide-y divide-line rounded-xl border border-line">
                          {r.links.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-[13px]">
                              <StatusBadge status={l.status} map={ACCESS_STATUS} />
                              <span className="min-w-0 flex-1">Năm {l.yearLabel} · cấp {fmtDate(l.issuedAt)} · hạn {fmtDate(l.expiresAt)} · {l.modules.length} mục</span>
                              <Link href={`${base}/parent-access/${l.id}`} className="card-link">Chi tiết</Link>
                              {r.canRevokeLinks && l.status === "active" && <Button size="sm" variant="danger-soft" icon={<Ban className="size-4" />} onClick={() => setRevoke({ accessId: l.id, label: `Link cấp cho ${r.relation.toLowerCase()} em ${r.student.name}` })}>Thu hồi</Button>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.canEdit && <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEdit({ studentId: r.student.id, studentName: r.student.name, relationshipId: r.id, relation: { guardianId: d.guardian.id, relationshipId: r.id, fullName: d.guardian.fullName, relation: r.relation, phoneMasked: d.guardian.phoneMasked, email: d.guardian.email, isPrimaryContact: r.isPrimaryContact } })}>Sửa liên hệ</Button>}
                      {r.canVerify && r.verification !== "verified" && <Button size="sm" variant="success" icon={<ShieldCheck className="size-4" />} onClick={() => setVerify({ relationshipId: r.id, version: r.version, to: "verified", guardianName: d.guardian.fullName, relation: r.relation, studentName: r.student.name, activeLinks: r.links === null ? null : r.links.filter(l => l.status === "active").length })}>Xác minh</Button>}
                      {r.canVerify && r.verification === "verified" && <Button size="sm" variant="danger-soft" icon={<ShieldOff className="size-4" />} onClick={() => setVerify({ relationshipId: r.id, version: r.version, to: "revoked", guardianName: d.guardian.fullName, relation: r.relation, studentName: r.student.name, activeLinks: r.links === null ? null : r.links.filter((l) => l.status === "active").length })}>Thu hồi quan hệ</Button>}
                      {r.canIssue && <Button size="sm" variant="primary" icon={<Link2 className="size-4" />} disabled={r.verification !== "verified" || !r.canReceiveInfo} title={r.verification !== "verified" ? "Cần xác minh trước" : !r.canReceiveInfo ? "Chưa có quyền nhận thông tin" : undefined} onClick={() => setIssue({ studentId: r.student.id, relationshipId: r.id })}>Cấp link</Button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
          {edit && <GuardianDialog open onOpenChange={(o) => { if (!o) setEdit(null); }} schoolId={schoolId} studentId={edit.studentId} studentName={edit.studentName} existing={edit.relation} />}
          <VerifyDialog target={verify} onClose={() => setVerify(null)} schoolId={schoolId} />
          {issue && <IssueAccessDialog open onOpenChange={(o) => { if (!o) setIssue(null); }} schoolId={schoolId} studentId={issue.studentId} relationshipId={issue.relationshipId} />}
          <RevokeAccessDialog target={revoke} onClose={() => setRevoke(null)} schoolId={schoolId} />
        </div>
      )}
    </SchoolSourceState>
  );
}
