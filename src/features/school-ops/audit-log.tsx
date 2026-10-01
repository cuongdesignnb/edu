"use client";
import { useState } from "react";
import { FileText, ScrollText, Eye, ShieldCheck } from "lucide-react";
import { supportRepo, RepoError, errorMessage } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, InfoRow } from "@/components/ui/card";
import { DateField, InlineSelect } from "@/components/ui/form";
import { Drawer } from "@/components/ui/dialog";
import { AuditDiff } from "@/components/ui/timeline";
import { EmptyFiltered, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { SchoolSourceState } from "@/features/school-org/common";

type Data = Awaited<ReturnType<typeof supportRepo.audit>>;
type Row = Data["items"][number];

export const ENTITY_LABEL: Record<string, string> = {
  announcement: "Thông báo", ruleSet: "Nội quy", policy: "Quy trình công bố", settings: "Cài đặt", lessonChange: "Đổi tiết", export: "Bản xuất", ticket: "Yêu cầu hỗ trợ",
  "support-access": "Quyền hỗ trợ", "support-message": "Cập nhật hỗ trợ", "parent-access": "Link tra cứu", member: "Thành viên", grant: "Quyền được cấp", handover: "Bàn giao", "conduct-period": "Thi đua tuần", "attendance-session": "Buổi điểm danh",
  supportGrant: "Quyền hỗ trợ", class: "Lớp học", student: "Học sinh", guardian: "Người giám hộ", parentAccess: "Link tra cứu", membership: "Thành viên", assignment: "Phân công",
  invitation: "Lời mời", conductPeriod: "Thi đua tuần", snapshot: "Bảng thi đua", adjustment: "Điều chỉnh", attendance: "Điểm danh", attendanceSession: "Buổi điểm danh", year: "Năm học",
  school: "Trường", import: "Nhập dữ liệu", activity: "Hoạt động", evidence: "Minh chứng", file: "Tệp", role: "Mẫu quyền", roleTemplate: "Mẫu quyền", transfer: "Chuyển lớp", seating: "Sơ đồ lớp", duty: "Trực nhật",
};
const label = (t: string) => ENTITY_LABEL[t] ?? t;

/** SC40 — read-only school audit log: filters, table, detail drawer (before/after + reason), filtered CSV export. */
export function AuditLog({ schoolId }: { schoolId: string }) {
  const list = useListQuery({ pageSize: 10 });
  const q = useRepo(["school-audit", schoolId, list.query], (c) => supportRepo.audit(c, schoolId, list.query));
  return <SchoolSourceState query={q}>{data=><AuditBody data={data} list={list} />}</SchoolSourceState>;
}
function AuditBody({data,list}:{data:Data;list:ReturnType<typeof useListQuery>}) {
  const toast = useToast();
  const [sel, setSel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const f = list.query.filters ?? {};
  const exportCsv = async () => {
    setBusy(true);
    try {
      throw new RepoError('READ_ERROR','Chức năng xuất nhật ký chưa sẵn sàng. Nội dung đang xem được giữ nguyên.');
    } catch (error) {
      toast.push({ tone: "error", title: "Chưa xuất được tệp", detail: errorMessage(error) });
    } finally { setBusy(false); }
  };
  const columns: Column<Row>[] = [
    { key: "at", header: "Thời điểm", cell: (r) => <span className="whitespace-nowrap text-[13px]">{fmtDateTime(r.at)}</span> },
    { key: "actor", header: "Người thao tác", cell: (r) => <span className="text-[13px] text-ink">{r.actorName}</span> },
    { key: "action", header: "Hành động", cell: (r) => <div className="min-w-[200px]"><p className="font-medium text-ink">{r.action===r.operationId?"Thao tác đã ghi nhận":r.action}</p><p className="text-[12.5px] text-muted">{r.entityLabel}</p></div> },
    { key: "type", header: "Đối tượng", hideBelow: "md", cell: (r) => <Badge tone="neutral" dot={false}>{label(r.entityType)}</Badge> },
    { key: "reason", header: "Lý do", hideBelow: "lg", cell: (r) => <span className="line-clamp-2 max-w-[220px] text-[12.5px] text-body">{r.reason ?? "—"}</span> },
    { key: "act", header: <span className="sr-only">Chi tiết</span>, cell: (r) => <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setSel(r)} aria-label={`Xem chi tiết: ${r.action===r.operationId?"Thao tác đã ghi nhận":r.action}`}>Chi tiết</Button> },
  ];
  return (
    <div className="space-y-4">
      <Callout tone="info" icon={<ShieldCheck />}>Nhật ký chỉ đọc: không sửa hoặc xóa từ giao diện. Chỉ ghi nhận thao tác trong phạm vi trường; hoạt động mở link tra cứu không xác định danh tính người mở.</Callout>
      <section className="card">
        <div className="card-header"><h2 className="card-title"><ScrollText className="size-5" aria-hidden />Nhật ký nhà trường</h2>
          <Button size="sm" icon={<FileText className="size-4" />} loading={busy} onClick={exportCsv} disabled={!data.total}>Xuất CSV theo bộ lọc</Button></div>
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Từ khóa: hành động, đối tượng, người, lý do…" onReset={list.reset} active={list.active}
          advanced={<>
            <DateField label="Từ ngày" value={f.from} max={f.to} onChange={(v) => list.setFilter("from", v)} helper=" " />
            <DateField label="Đến ngày" value={f.to} min={f.from} onChange={(v) => list.setFilter("to", v)} helper=" " />
          </>}>
          <InlineSelect label="Lọc đối tượng" allLabel="Mọi đối tượng" value={f.entityType ?? ""} onChange={(v) => list.setFilter("entityType", v)} options={data.entityTypes.map((t) => ({ value: t, label: label(t) }))} />
          <InlineSelect label="Lọc người thao tác" allLabel="Mọi người thao tác" value={f.actor ?? ""} onChange={(v) => list.setFilter("actor", v)} options={data.actors.map((a) => ({ value: a.id, label: a.name }))} />
        </FilterBar>
        <div className="px-4"><DataTable caption="Nhật ký nhà trường" rows={data.items} columns={columns} rowKey={r=>r.id} minWidth={640} onRowClick={setSel}
          empty={list.active?<EmptyFiltered onReset={list.reset} what="sự kiện" />:<EmptyState compact title="Chưa có sự kiện nhật ký" />} /></div>
        <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="sự kiện" />
      </section>
      <Drawer open={!!sel} onOpenChange={(o) => !o && setSel(null)} title="Chi tiết nhật ký" description="Chỉ đọc — không sửa, không xóa." width={560} footer={<Button onClick={() => setSel(null)}>Đóng</Button>}>
        {sel && <div className="space-y-4">
          <dl>
            <InfoRow label="Thời điểm">{fmtDateTime(sel.at)}</InfoRow>
            <InfoRow label="Người thao tác">{sel.actorName}</InfoRow>
            <InfoRow label="Hành động">{sel.action===sel.operationId?"Thao tác đã ghi nhận":sel.action}</InfoRow>
            <InfoRow label="Đối tượng">{label(sel.entityType)} — {sel.entityLabel}</InfoRow>
            <InfoRow label="Lý do">{sel.reason ?? "Không ghi lý do"}</InfoRow>
          </dl>
          <div><p className="mb-2 text-sm font-semibold text-ink">Giá trị trước / sau</p><AuditDiff before={sel.before} after={sel.after} /></div>
          <details className="rounded-lg border border-line px-3 py-2 text-[12.5px] text-muted"><summary className="cursor-pointer">Chi tiết kỹ thuật</summary><p className="mt-1 break-all">Thao tác: {sel.operationId} · Mã sự kiện: {sel.id} · Loại: {sel.entityType} · Mã đối tượng: {sel.entityId}</p></details>
        </div>}
      </Drawer>
    </div>
  );
}
