"use client";
import { useMemo, useState } from "react";
import { KeyRound, ShieldCheck, Clock, Undo2, Plus, Info } from "lucide-react";
import { platformRepo, SUPPORT_SCOPE_LABEL } from "@/lib/repositories";
import { platformExtraRepo } from "@/lib/repositories/platform-extra";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DataTable, FilterBar, Pagination, useClientList, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { GRANT_STATUS } from "./support-labels";
import { RequestSupportDialog } from "./support-request-dialog";

type Row = Awaited<ReturnType<typeof platformRepo.supportGrants>>[number];

/** PL08 — temporary support access: view, request (O34), withdraw/end early. Approval is school-side only. */
export function SupportGrants() {
  const q = useRepo(["platform-grants"], (ctx) => platformRepo.supportGrants(ctx));
  return <QueryState query={q} skeleton="table">{(rows) => <Body rows={rows} />}</QueryState>;
}

function Body({ rows }: { rows: Row[] }) {
  const [status, setStatus] = useState("");
  const [school, setSchool] = useState("");
  const [request, setRequest] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);
  const filtered = useMemo(() => rows.filter((g) => (!status || g.status === status) && (!school || g.schoolId === school)), [rows, status, school]);
  const list = useClientList(filtered, { search: (g) => `${g.schoolName} ${g.reason} ${g.requestedByName} ${g.scopes.map((s) => SUPPORT_SCOPE_LABEL[s]).join(" ")}`, pageSize: 10 });
  const schools = useMemo(() => [...new Map(rows.map((g) => [g.schoolId, g.schoolName])).entries()].map(([value, label]) => ({ value, label })), [rows]);
  const cmd = useCommand((ctx, id: string, reason: string) => platformExtraRepo.relinquishGrant(ctx, id, reason), { success: "Đã cập nhật quyền hỗ trợ", onSuccess: () => setTarget(null) });
  const count = (s: string) => rows.filter((g) => g.status === s).length;
  const active = !!(list.q || status || school);
  const reset = () => { list.setQ(""); setStatus(""); setSchool(""); };
  const cols: Column<Row>[] = [
    { key: "school", header: "Trường", cell: (g) => <span className="whitespace-nowrap font-semibold text-ink">{g.schoolName}</span> },
    { key: "scopes", header: "Phạm vi · lý do", cell: (g) => <span className="block min-w-[220px] text-[13px]">{g.scopes.map((s) => SUPPORT_SCOPE_LABEL[s]).join("; ")}<span className="block text-muted">Lý do: {g.reason}</span></span> },
    { key: "who", header: "Đề nghị / cho phép", cell: (g) => <span className="text-[13px]">{g.requestedByName}<span className="block text-muted">{g.approvedByName ? `Cho phép: ${g.approvedByName}` : "Chưa có người cho phép"}</span></span>, hideBelow: "md" },
    { key: "valid", header: "Hiệu lực", cell: (g) => <span className="whitespace-nowrap text-[13px]">{g.validFrom ? fmtDateTime(g.validFrom) : "Chưa bắt đầu"}<span className="block text-muted">đến {fmtDateTime(g.validTo)}</span></span>, hideBelow: "sm" },
    { key: "status", header: "Trạng thái", cell: (g) => <StatusBadge status={g.status} map={GRANT_STATUS} /> },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (g) => (g.status === "requested" || g.status === "active") ? (
      <ActionMenu label={`Thao tác với quyền hỗ trợ ${g.schoolName}`} items={[{ label: g.status === "requested" ? "Rút đề nghị" : "Kết thúc sớm (trả quyền)", icon: <Undo2 />, danger: true, onSelect: () => setTarget(g) }]} />
    ) : <span className="text-[12.5px] text-muted">—</span> },
  ];
  return (
    <div className="page">
      <PageHeader title="Quyền hỗ trợ tạm thời" subtitle="Phạm vi dữ liệu nhà trường cho phép nền tảng xem để hỗ trợ, có lý do và thời hạn" breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Quyền hỗ trợ tạm thời" }]}
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRequest(true)}>Đề nghị quyền hỗ trợ</Button>} />
      <Callout tone="info" icon={<Info />} title="Nền tảng chỉ được đề nghị">Nhà trường là bên cho phép, từ chối hoặc thu hồi. Nền tảng không tự cấp quyền cho mình và không có phạm vi nào gồm hồ sơ học sinh hay gia đình.</Callout>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Đang hiệu lực" value={fmtNumber(count("active"))} icon={<ShieldCheck className="size-7" />} tone="green" hint="Có thể bị trường thu hồi bất kỳ lúc nào" />
        <KpiCard label="Chờ nhà trường" value={fmtNumber(count("requested"))} icon={<Clock className="size-7" />} tone="amber" hint="Đề nghị chưa được xử lý" />
        <KpiCard label="Đã kết thúc" value={fmtNumber(count("expired") + count("revoked") + count("declined"))} icon={<KeyRound className="size-7" />} tone="neutral" hint="Hết hạn, thu hồi hoặc từ chối" />
      </div>
      <Card>
        <CardHeader title="Danh sách quyền hỗ trợ" icon={<KeyRound className="size-5" />} subtitle={`${rows.length} bản ghi`} />
        <FilterBar q={list.q} onQ={list.setQ} placeholder="Tìm theo trường, lý do, phạm vi…" onReset={reset} active={active}>
          <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={Object.entries(GRANT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          <InlineSelect label="Lọc trường" allLabel="Tất cả trường" value={school} onChange={(v) => { setSchool(v); list.setPage(1); }} options={schools} />
        </FilterBar>
        {rows.length === 0 ? <EmptyState compact icon={<KeyRound className="size-6" />} title="Chưa có quyền hỗ trợ nào" /> : (
          <>
            <div className="px-4"><DataTable caption="Quyền hỗ trợ tạm thời" rows={list.items} columns={cols} rowKey={(g) => g.id} empty={<EmptyFiltered what="quyền hỗ trợ" onReset={reset} />} minWidth={760} /></div>
            <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="bản ghi" />
          </>
        )}
      </Card>
      <RequestSupportDialog open={request} onClose={() => setRequest(false)} />
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title={target?.status === "requested" ? "Rút đề nghị quyền hỗ trợ" : "Kết thúc sớm quyền hỗ trợ"}
        object={target ? `${target.schoolName} — ${target.scopes.map((s) => SUPPORT_SCOPE_LABEL[s]).join(", ")}` : ""}
        consequence={target?.status === "requested" ? "Đề nghị sẽ không còn chờ nhà trường xử lý." : "Nền tảng trả lại quyền ngay; muốn xem tiếp phải gửi đề nghị mới để nhà trường cho phép."}
        confirmLabel={target?.status === "requested" ? "Rút đề nghị" : "Kết thúc quyền"} variant="danger" reasonLabel="Ghi chú (không bắt buộc)" busy={cmd.pending}
        error={cmd.error?.code === "VALIDATION" ? cmd.error.message : undefined} onConfirm={async (r) => { if (target) await cmd.run(target.id, r); }} />
    </div>
  );
}
