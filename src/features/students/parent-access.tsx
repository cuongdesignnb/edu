"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, CheckCircle2, Clock, Ban, Eye, RefreshCw, MonitorSmartphone, Plus, QrCode, Printer, AlertTriangle, History, KeyRound, Info, ExternalLink } from "lucide-react";
import type { ParentModule } from "@/lib/model/types";
import { schoolRepo, studentsRepo } from "@/lib/repositories";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtNumber, parentModuleLabel } from "@/lib/formatters";
import { diffDays } from "@/lib/demo/clock";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered, EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { ACCESS_STATUS, LinkBox, QrImage, QrPrintCard, accessUrl, logLabel, moduleOfLog, usePrintQr } from "./shared";
import { IssueAccessDialog, RevokeAccessDialog } from "./dialogs";

type Row = Awaited<ReturnType<typeof studentsRepo.accessList>>["items"][number];

/** Loads the old link (relationship + modules) then opens O12 in "reissue" mode (O14). */
function ReissueDialog({ schoolId, accessId, onClose }: { schoolId: string; accessId: string; onClose: () => void }) {
  const q = useRepo(["parent-access", schoolId, accessId], (ctx) => studentsRepo.access(ctx, schoolId, accessId));
  if (!q.data) return null;
  const d = q.data;
  return <IssueAccessDialog open onOpenChange={(o) => { if (!o) onClose(); }} schoolId={schoolId} studentId={d.student.id} relationshipId={d.relationship.id}
    replace={{ accessId: d.access.id, relationshipId: d.relationship.id, modules: d.access.modules, label: `Link cấp cho ${d.relationship.relation.toLowerCase()} (${d.guardian.fullName})` }} />;
}

/* ------------------------------ SC23 — parent access list ------------------------------ */
export function AccessListPage({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const base = `/school/${schoolId}`;
  const list = useListQuery({ pageSize: 10, sort: "issuedAt", dir: "desc" });
  const q = useRepo(["parent-access-list", schoolId, list.query], (ctx) => studentsRepo.accessList(ctx, schoolId, list.query));
  const classes = useRepo(["class-options", schoolId], (ctx) => schoolRepo.classOptions(ctx, schoolId));
  const [issue, setIssue] = useState(false);
  const [reissue, setReissue] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<{ accessId: string; label: string } | null>(null);
  const label = (r: Row) => `Link cấp cho ${r.relation.toLowerCase()} (${r.guardianName}) — em ${r.studentName}`;

  const columns: Column<Row>[] = [
    { key: "student", header: "Học sinh", sortable: true, cell: (r) => <span className="block min-w-[160px]"><Link href={`${base}/students/${r.studentId}`} className="font-semibold text-ink hover:underline">{r.studentName}</Link><span className="block text-[12px] text-muted">{r.studentCode} · {r.className}</span></span> },
    { key: "guardian", header: "Cấp cho", cell: (r) => <span className="block min-w-[150px]"><span className="block font-medium text-ink">{r.relation}</span><span className="block text-[12px] text-muted">{r.guardianName}</span></span> },
    { key: "year", header: "Năm học", hideBelow: "lg", cell: (r) => r.yearLabel },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={ACCESS_STATUS} /> },
    { key: "issuedAt", header: "Ngày cấp", sortable: true, hideBelow: "md", cell: (r) => <span className="tabular-nums">{fmtDate(r.issuedAt)}</span> },
    { key: "expires", header: "Hạn", cell: (r) => <span className="tabular-nums">{fmtDate(r.expiresAt)}</span> },
    { key: "modules", header: "Phạm vi", hideBelow: "lg", cell: (r) => <span title={r.modules.map((m) => parentModuleLabel[m]).join(", ")}>{r.modules.length}/8 mục</span> },
    { key: "opens", header: "Lượt mở", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{r.opens}{r.lastOpenedAt && <span className="block text-[11.5px] text-muted">{fmtDate(r.lastOpenedAt)}</span>}</span> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, align: "center", cell: (r) => (
      <ActionMenu label={`Thao tác với ${label(r)}`} items={[
        { label: "Xem chi tiết và nhật ký", icon: <Eye />, href: `${base}/parent-access/${r.id}` },
        { label: "Xem trước trang phụ huynh", icon: <MonitorSmartphone />, href: `${base}/parent-access/${r.id}/preview` },
        ...(r.status === "active" ? [{ label: "Thu hồi", icon: <Ban />, danger: true, separatorBefore: true, onSelect: () => setRevoke({ accessId: r.id, label: label(r) }) }] : []),
        { label: "Cấp lại", icon: <RefreshCw />, separatorBefore: r.status !== "active", hint: "Thu hồi link này và cấp link mới", onSelect: () => setReissue(r.id) },
      ]} />
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Quyền tra cứu phụ huynh" subtitle="Mỗi dòng là một link riêng: một người giám hộ đã xác minh, một học sinh, một năm học. Nhật ký chỉ ghi link được mở, không khẳng định ai đã mở."
        breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Quyền tra cứu" }]}
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setIssue(true)}>Cấp link</Button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Đang hoạt động" value={q.data ? fmtNumber(q.data.kpi.active) : "—"} icon={<CheckCircle2 className="size-7" />} tone="green" hint="Mở được trong thời hạn" />
        <KpiCard label="Hết hạn" value={q.data ? fmtNumber(q.data.kpi.expired) : "—"} icon={<Clock className="size-7" />} tone="neutral" hint="Cần cấp lại nếu phụ huynh còn cần xem" />
        <KpiCard label="Đã thu hồi" value={q.data ? fmtNumber(q.data.kpi.revoked) : "—"} icon={<Ban className="size-7" />} tone="pink" hint="Lần mở mới đều bị chặn" />
      </div>
      <Card>
        <CardHeader title={`Danh sách link${q.data ? ` (${q.data.total})` : ""}`} icon={<Link2 className="size-5" />} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo học sinh, mã hoặc người giám hộ…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(ACCESS_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          <InlineSelect label="Lọc theo lớp" allLabel="Tất cả lớp" value={list.query.filters?.classId ?? ""} onChange={(v) => list.setFilter("classId", v)} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : q.data!.total === 0 && !list.active ? <EmptyState icon={<Link2 className="size-6" />} title="Chưa cấp link nào" description="Cấp link riêng cho từng người giám hộ đã xác minh." action={<Button variant="primary" size="sm" onClick={() => setIssue(true)}>Cấp link</Button>} />
          : (
            <>
              <div className="px-4"><DataTable caption="Link tra cứu phụ huynh" rows={q.data!.items} columns={columns} rowKey={(r) => r.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort} onRowClick={(r) => router.push(`${base}/parent-access/${r.id}`)} empty={<EmptyFiltered onReset={list.reset} what="link" />} minWidth={900} /></div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="link" />
            </>
          )}
      </Card>
      {issue && <IssueAccessDialog open onOpenChange={(o) => { if (!o) setIssue(false); }} schoolId={schoolId} />}
      {reissue && <ReissueDialog schoolId={schoolId} accessId={reissue} onClose={() => setReissue(null)} />}
      <RevokeAccessDialog target={revoke} onClose={() => setRevoke(null)} schoolId={schoolId} />
    </div>
  );
}

/* ------------------------------ SC24 — access detail ------------------------------ */
export function AccessDetailPage({ schoolId, accessId }: { schoolId: string; accessId: string }) {
  const q = useRepo(["parent-access", schoolId, accessId], (ctx) => studentsRepo.access(ctx, schoolId, accessId));
  const ctx = useCtx();
  const { can } = useSchool();
  const base = `/school/${schoolId}`;
  const [reveal, setReveal] = useState(false);
  const [reissue, setReissue] = useState(false);
  const [revoke, setRevoke] = useState<{ accessId: string; label: string } | null>(null);
  const { print, node } = usePrintQr();
  return (
    <QueryState query={q} skeleton="detail">
      {(d) => {
        const a = d.access;
        const who = `Link cấp cho ${d.relationship.relation.toLowerCase()} (${d.guardian.fullName})`;
        const url = accessUrl(d.school.slug, a.token);
        const days = diffDays(a.expiresAt.slice(0, 10), ctx.today);
        const opens = d.logs.filter((l) => l.event === "opened" || l.event === "viewed").length;
        return (
          <div className="page">
            {node}
            <PageHeader title="Chi tiết quyền tra cứu" subtitle={`${who} — em ${d.student.fullName}`} badge={<StatusBadge status={a.status} map={ACCESS_STATUS} />}
              breadcrumbs={[...(can("parentAccess.manage.all") ? [{ label: "Quyền tra cứu", href: `${base}/parent-access` }] : [{ label: d.student.fullName, href: `${base}/students/${d.student.id}` }]), { label: "Chi tiết" }]}
              actions={<>
                <ButtonLink href={`${base}/parent-access/${a.id}/preview`} icon={<MonitorSmartphone className="size-4" />}>Xem trước trang phụ huynh</ButtonLink>
                {a.status === "active" && <Button variant="danger-soft" icon={<Ban className="size-4" />} onClick={() => setRevoke({ accessId: a.id, label: `${who} — em ${d.student.fullName}` })}>Thu hồi</Button>}
                <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => setReissue(true)}>Cấp lại</Button>
              </>} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-5">
                <Card>
                  <CardHeader title="Thông tin quyền" icon={<KeyRound className="size-5" />} />
                  <dl className="grid gap-x-8 px-5 pb-4 sm:grid-cols-2">
                    <div>
                      <InfoRow label="Người được cấp">{d.relationship.relation} — {d.guardian.fullName}</InfoRow>
                      <InfoRow label="Điện thoại">{d.guardian.phoneMasked}</InfoRow>
                      <InfoRow label="Học sinh"><Link href={`${base}/students/${d.student.id}`} className="hover:underline">{d.student.fullName}</Link> <span className="font-normal text-muted">({d.student.code} · {d.student.className})</span></InfoRow>
                      <InfoRow label="Năm học">{d.yearLabel}</InfoRow>
                    </div>
                    <div>
                      <InfoRow label="Ngày cấp">{fmtDateTime(a.issuedAt)}</InfoRow>
                      <InfoRow label="Người cấp">{d.issuedByName}</InfoRow>
                      <InfoRow label="Hạn sử dụng">{fmtDate(a.expiresAt)}{a.status === "active" && <span className="font-normal text-muted"> (còn {days} ngày)</span>}</InfoRow>
                      <InfoRow label="Lượt mở link">{opens}</InfoRow>
                    </div>
                  </dl>
                  {a.revokedAt && <div className="mx-5 mb-4"><Callout tone="danger" icon={<Ban />} title={`Đã thu hồi lúc ${fmtDateTime(a.revokedAt)} — ${d.revokedByName}`}>{a.revokeReason}{d.replacedBy && <> · <Link href={`${base}/parent-access/${d.replacedBy}`} className="font-semibold underline">Xem link thay thế</Link></>}</Callout></div>}
                  <div className="px-5 pb-5">
                    <p className="mb-2 text-sm font-semibold text-ink">Mục được xem ({a.modules.length}/8)</p>
                    <div className="flex flex-wrap gap-1.5">{(Object.keys(parentModuleLabel) as ParentModule[]).map((m) => <span key={m} className={`chip ${a.modules.includes(m) ? "chip-active" : "opacity-60 line-through"}`}>{parentModuleLabel[m]}</span>)}</div>
                    <p className="mt-2 text-[12.5px] text-muted">Muốn đổi mục được xem: dùng “Cấp lại” — link cũ bị thu hồi và link mới được tạo.</p>
                  </div>
                </Card>
              </div>
              <div className="min-w-0 space-y-5">
                <Card>
                  <CardHeader title="Link và mã QR" icon={<QrCode className="size-5" />} />
                  <div className="space-y-3 px-5 pb-5">
                    {a.status !== "active" ? <Callout tone="neutral" icon={<Info />}>Link không còn hiệu lực nên không hiển thị. Dùng “Cấp lại” để tạo link mới.</Callout> : !reveal ? (
                      <>
                        <Callout tone="warning" icon={<AlertTriangle />} title="Chỉ hiện khi cần trao link">Ai có link đều mở được trang tra cứu. Chỉ gửi riêng cho người được cấp, <b>không đăng vào nhóm chung</b>.</Callout>
                        <Button icon={<Eye className="size-4" />} onClick={() => setReveal(true)}>Hiện link/QR demo</Button>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-center"><span className="rounded-xl border border-line bg-white p-3"><QrImage url={url} size={168} /></span></div>
                        <LinkBox url={url} />
                        <p className="text-[12.5px] text-warning-text">Không đăng vào nhóm chung. Đây là link demo, không phải thiết kế bảo mật chính thức.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button icon={<Printer className="size-4" />} onClick={() => print(<QrPrintCard url={url} studentName={d.student.fullName} className={d.student.className} relation={d.relationship.relation} schoolName={d.school.name} expiresAt={a.expiresAt} />)}>In thẻ QR</Button>
                          <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost">Mở thử <ExternalLink className="size-4" aria-hidden /></a>
                          <Button variant="ghost" onClick={() => setReveal(false)}>Ẩn</Button>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Link khác của học sinh" icon={<Link2 className="size-5" />} subtitle="Thu hồi hoặc cấp lại link này không ảnh hưởng link của người giám hộ khác." />
                  <ul className="divide-y divide-line px-5 pb-4">
                    {d.siblings.length === 0 && <li className="py-2 text-[13px] text-muted">Không có link khác.</li>}
                    {d.siblings.map((s) => <li key={s.id} className="flex items-center gap-3 py-2 text-[13px]"><span className="flex-1">Link cấp cho {s.relation?.toLowerCase() ?? "người giám hộ"}</span><StatusBadge status={s.status} map={ACCESS_STATUS} /><Link href={`${base}/parent-access/${s.id}`} className="card-link">Mở</Link></li>)}
                  </ul>
                </Card>
              </div>
            </div>
            <Card>
              <CardHeader title="Nhật ký link" icon={<History className="size-5" />} subtitle="Ghi nhận link được mở trên thiết bị (nhãn mẫu); không khẳng định danh tính người mở." />
              <div className="px-5 pb-5">
                {d.logs.length === 0 ? <EmptyState compact title="Chưa có sự kiện" /> : (
                  <div className="table-wrap">
                    <table className="table" style={{ minWidth: 640 }}>
                      <thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Nội dung xem</th><th>Thiết bị (mẫu)</th><th>Ghi chú</th></tr></thead>
                      <tbody>{d.logs.map((l) => (
                        <tr key={l.id}><td className="whitespace-nowrap tabular-nums">{fmtDateTime(l.at)}</td><td>{logLabel(d.relationship.relation, d.guardian.fullName, l.event)}</td><td>{moduleOfLog(l.module)}</td><td className="text-muted">{l.device ?? "—"}</td><td className="text-[12.5px] text-muted">{l.note ?? ""}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
            {reissue && <IssueAccessDialog open onOpenChange={(o) => { if (!o) setReissue(false); }} schoolId={schoolId} studentId={d.student.id} relationshipId={d.relationship.id}
              replace={{ accessId: a.id, relationshipId: d.relationship.id, modules: a.modules, label: who }} />}
            <RevokeAccessDialog target={revoke} onClose={() => setRevoke(null)} schoolId={schoolId} />
          </div>
        );
      }}
    </QueryState>
  );
}
