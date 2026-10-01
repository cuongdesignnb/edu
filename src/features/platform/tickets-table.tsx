"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, UserCheck, LifeBuoy, Inbox, Loader, Clock, CheckCircle2 } from "lucide-react";
import { platformRepo } from "@/lib/repositories";
import { platformExtraRepo } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect, SelectField } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { TICKET_PRIORITY, TICKET_STATUS } from "./support-labels";

type Row = Awaited<ReturnType<typeof platformRepo.tickets>>["items"][number];

/** PL06 — support queue: search, filter, sort, paging, internal assignment (mock). */
export function SupportQueue() {
  const router = useRouter();
  const list = useListQuery({ pageSize: 10, sort: "createdAt", dir: "desc" });
  const q = useRepo(["platform-tickets", list.query], (ctx) => platformRepo.tickets(ctx, list.query));
  const stats = useRepo(["platform-ticket-stats"], (ctx) => platformExtraRepo.ticketStats(ctx));
  const [assign, setAssign] = useState<Row | null>(null);
  const cols: Column<Row>[] = [
    { key: "title", header: "Yêu cầu", cell: (t) => <span className="block min-w-[220px]"><span className="block font-semibold text-ink">{t.title}</span><span className="block text-[12.5px] text-muted">{t.schoolName} · {t.messageCount} cập nhật</span></span> },
    { key: "priority", header: "Ưu tiên", sortable: true, cell: (t) => <StatusBadge status={t.priority} map={TICKET_PRIORITY} /> },
    { key: "status", header: "Trạng thái", cell: (t) => <StatusBadge status={t.status} map={TICKET_STATUS} /> },
    { key: "assignee", header: "Người xử lý", cell: (t) => t.assigneeName || <span className="text-warning-text">Chưa phân công</span>, hideBelow: "md" },
    { key: "createdAt", header: "Tiếp nhận", sortable: true, cell: (t) => fmtDateTime(t.createdAt), hideBelow: "lg" },
    { key: "act", header: <span className="sr-only">Hành động</span>, align: "center", cell: (t) => (
      <span onClick={(e) => e.stopPropagation()}><ActionMenu label={`Thao tác với ${t.title}`} items={[
        { label: "Mở yêu cầu", icon: <Eye />, href: `/platform/support/${t.id}` },
        { label: "Phân công người xử lý", icon: <UserCheck />, onSelect: () => setAssign(t), disabled: t.status === "resolved" },
      ]} /></span>
    ) },
  ];
  const st = stats.data;
  return (
    <div className="page">
      <PageHeader title="Yêu cầu hỗ trợ" subtitle="Yêu cầu từ các trường, mức ưu tiên, trạng thái và người xử lý" breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Yêu cầu hỗ trợ" }]}
        quote={["Hỗ trợ đúng phạm vi", "nhà trường cho phép"]} illustration="/assets/illustrations/girl-clipboard.png" />
      {st ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Mới tiếp nhận" value={fmtNumber(st.open)} icon={<Inbox className="size-7" />} tone="blue" hint={`${fmtNumber(st.total)} yêu cầu tất cả`} />
          <KpiCard label="Đang xử lý" value={fmtNumber(st.inProgress)} icon={<Loader className="size-7" />} tone="purple" hint={`${fmtNumber(st.high)} ưu tiên cao chưa xong`} />
          <KpiCard label="Chờ nhà trường" value={fmtNumber(st.waitingSchool)} icon={<Clock className="size-7" />} tone="amber" hint="Đang chờ phản hồi từ trường" />
          <KpiCard label="Đã xử lý" value={fmtNumber(st.resolved)} icon={<CheckCircle2 className="size-7" />} tone="green" hint="Tổng từ trước tới nay" />
        </div>
      ) : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[14px]" />)}</div>}
      <Card>
        <CardHeader title="Hàng đợi hỗ trợ" icon={<LifeBuoy className="size-6" />} />
        <FilterBar q={list.query.q ?? ""} onQ={list.setQ} placeholder="Tìm theo tiêu đề, tên trường…" onReset={list.reset} active={list.active}>
          <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status ?? ""} onChange={(v) => list.setFilter("status", v)} options={Object.entries(TICKET_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          <InlineSelect label="Lọc ưu tiên" allLabel="Mọi mức ưu tiên" value={list.query.filters?.priority ?? ""} onChange={(v) => list.setFilter("priority", v)} options={Object.entries(TICKET_PRIORITY).map(([value, s]) => ({ value, label: s.label }))} />
        </FilterBar>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : st && st.total === 0 ? <EmptyState compact icon={<LifeBuoy className="size-6" />} title="Chưa có yêu cầu hỗ trợ" description="Nhà trường gửi yêu cầu từ mục Hỗ trợ trong không gian của trường." />
          : (
            <>
              <div className="px-4"><DataTable caption="Yêu cầu hỗ trợ" rows={q.data!.items} columns={cols} rowKey={(t) => t.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort}
                onRowClick={(t) => router.push(`/platform/support/${t.id}`)} empty={<EmptyFiltered what="yêu cầu" onReset={list.reset} />} minWidth={640} /></div>
              <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} what="yêu cầu" />
            </>
          )}
      </Card>
      <Callout tone="neutral">Không có chức năng đăng nhập thay giáo viên. Khi cần xem dữ liệu, gửi đề nghị quyền hỗ trợ tạm thời để nhà trường cho phép.</Callout>
      <AssignDialog ticket={assign} onClose={() => setAssign(null)} />
    </div>
  );
}

export function AssignDialog({ ticket, onClose }: { ticket: { id: string; title: string; version:number; assigneeUserId?: string } | null; onClose: () => void }) {
  const { actor } = useSession();
  const ops = useRepo(["platform-operators"], (ctx) => platformExtraRepo.operators(ctx), { enabled: !!ticket });
  const [who, setWho] = useState("");
  const cmd = useCommand((ctx, id: string, uid: string) => platformExtraRepo.assignTicket(ctx, id, uid, ticket?.version), { success: "Đã phân công người xử lý", onSuccess: onClose });
  const value = who || ticket?.assigneeUserId || (actor.kind === "platform" ? actor.userId : "");
  return (
    <Modal open={!!ticket} onOpenChange={(o) => { if (!o) { setWho(""); onClose(); } }} size="sm" busy={cmd.pending} title="Phân công người xử lý" description={ticket?.title}
      footer={<><Button variant="ghost" onClick={onClose} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} disabled={!value || value === ticket?.assigneeUserId} onClick={() => ticket && cmd.run(ticket.id, value)}>Phân công</Button></>}>
      <SelectField label="Người xử lý (vận hành nền tảng)" value={value} onChange={(e) => setWho(e.target.value)} options={(ops.data ?? []).map((o) => ({ value: o.id, label: o.name }))} helper="Chỉ phân công nội bộ nền tảng. Việc này không cấp quyền xem dữ liệu của trường." />
    </Modal>
  );
}
