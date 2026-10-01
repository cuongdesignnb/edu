"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { LifeBuoy, Plus, KeyRound, ShieldCheck, ShieldX, Ban, Check, AlertTriangle, MessageSquare, Send, ArrowRight, Info } from "lucide-react";
import type { SupportTicket } from "@/lib/model/types";
import { supportRepo, type RepoError } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { DataTable, FilterBar, Pagination, useListQuery, type Column } from "@/components/data/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, CardLink, InfoRow } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { ErrorSummary, InlineSelect, RadioGroup, TextArea, TextField } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { EmptyFiltered, EmptyState } from "@/components/ui/states";
import { Avatar } from "@/components/ui/avatar";
import { nativeActionLabel } from "@/lib/api/action-labels";
import { GRANT_STATUS, TICKET_STATUS } from "@/features/platform/support-labels";
import { SchoolSourceState, FormError } from "@/features/school-org/common";

type Overview = Awaited<ReturnType<typeof supportRepo.overview>>;
type Grant = NonNullable<Overview["grants"]>["items"][number];
type Ticket = Overview["tickets"]["items"][number];
const PRIORITY: Record<SupportTicket["priority"], { label: string; tone: "neutral" | "info" | "danger" }> = { low: { label: "Thấp", tone: "neutral" }, normal: { label: "Bình thường", tone: "info" }, high: { label: "Cao", tone: "danger" } };


/* ------------------------------ O34 grant table ------------------------------ */
export function SupportGrants({ schoolId, grants, compact }: { schoolId: string; grants: Grant[]; compact?: boolean }) {
  const [act, setAct] = useState<{ g: Grant; d: "approve" | "decline" | "revoke" } | null>(null);
  const cmd = useCommand((ctx, id: string, d: "approve" | "decline" | "revoke", reason: string) => supportRepo.decideGrant(ctx, schoolId, id, d, act?.g.version, reason), {
    success: (g) => g.canonicalStatus === "APPROVED" ? "Đã cho phép hỗ trợ tạm thời" : g.canonicalStatus === "REJECTED" ? "Đã từ chối quyền hỗ trợ" : "Đã thu hồi quyền hỗ trợ", onSuccess: () => setAct(null),
  });
  const columns: Column<Grant>[] = [
    { key: "scope", header: "Phạm vi được hỗ trợ", cell: (g) => <div className="min-w-[220px]"><ul className="space-y-0.5 text-[13px] text-ink">{g.allowedActions.map((a) => <li key={a}>{nativeActionLabel(a).label}</li>)}</ul><p className="mt-0.5 text-[12px] text-muted">Lý do: {g.reason}</p></div> },
    { key: "status", header: "Trạng thái", cell: (g) => <StatusBadge status={g.status} map={GRANT_STATUS} /> },
    { key: "time", header: "Hiệu lực", hideBelow: "md", cell: (g) => <span className="text-[13px]">{g.validFrom ? `${fmtDateTime(g.validFrom)} → ` : "Đến "}{fmtDateTime(g.validTo)}</span> },
    { key: "who", header: "Đề nghị · cho phép", hideBelow: "lg", cell: (g) => <span className="text-[13px]">{g.requestedByName ?? "—"}{g.approvedByName && g.approvedBy ? <span className="block text-muted">Cho phép: {g.approvedByName}</span> : null}</span> },
    { key: "act", header: <span className="sr-only">Thao tác</span>, cell: (g) => (
      <div className="flex flex-wrap justify-end gap-1.5">
        {g.status === "requested" && <><Button size="sm" variant="primary" icon={<Check className="size-4" />} onClick={() => setAct({ g, d: "approve" })}>Cho phép</Button><Button size="sm" variant="ghost" onClick={() => setAct({ g, d: "decline" })}>Từ chối</Button></>}
        {g.canonicalStatus === "APPROVED" && (g.status === "active" || g.status === "inactive") && <Button size="sm" variant="danger-soft" icon={<Ban className="size-4" />} onClick={() => setAct({ g, d: "revoke" })}>Thu hồi</Button>}
      </div>
    ) },
  ];
  const t = act?.d;
  return (
    <>
      {grants.length ? compact ? (
        <ul className="divide-y divide-line px-4">{grants.map((g) => (
          <li key={g.id} className="space-y-1.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={g.status} map={GRANT_STATUS} /><span className="text-[12px] text-muted">Đến {fmtDateTime(g.validTo)}</span></div>
            <ul className="text-[13px] text-ink">{g.allowedActions.map((a) => <li key={a}>{nativeActionLabel(a).label}</li>)}</ul>
            <p className="text-[12px] text-muted">Lý do: {g.reason} · Đề nghị: {g.requestedByName ?? "—"}</p>
            {columns[columns.length - 1].cell(g)}
          </li>
        ))}</ul>
      ) : <div className="px-4 pb-4"><DataTable caption="Quyền hỗ trợ" rows={grants} columns={columns} rowKey={(g) => g.id} minWidth={640} /></div>
        : <EmptyState compact icon={<KeyRound className="size-6" />} title="Chưa có đề nghị quyền hỗ trợ" description="Đơn vị vận hành chỉ gửi đề nghị khi cần xem dữ liệu cấu hình để hỗ trợ." />}
      <ConfirmDialog open={!!act} onOpenChange={(o) => !o && setAct(null)} busy={cmd.pending} variant={t === "approve" ? "primary" : "danger"}
        title={t === "approve" ? "Cho phép hỗ trợ tạm thời" : t === "decline" ? "Từ chối đề nghị hỗ trợ" : "Thu hồi quyền hỗ trợ"} confirmLabel={t === "approve" ? "Cho phép" : t === "decline" ? "Từ chối" : "Thu hồi"}
        object={act && <div><ul className="list-disc pl-5 text-[13px]">{act.g.allowedActions.map((a) => <li key={a}>{nativeActionLabel(a).label}</li>)}</ul><p className="mt-1 text-[12.5px] font-normal text-muted">Hết hạn: {fmtDateTime(act.g.validTo)}</p></div>}
        key={act ? `${act.g.id}:${act.g.version}:${act.d}` : "closed"} error={cmd.error?.message} reasonLabel={t === "approve" ? undefined : "Lý do"} reasonRequired={t !== "approve"}
        consequence={t === "approve" ? <div className="space-y-1"><p>Đơn vị vận hành được xem đúng các phạm vi trên cho tới {act && fmtDateTime(act.g.validTo)}, sau đó tự hết hạn. Nhà trường có thể thu hồi bất cứ lúc nào.</p><p className="font-semibold">Mặc định nền tảng không đọc hồ sơ học sinh, gia đình, điểm danh hay thi đua; các phạm vi này không bao gồm dữ liệu đó.</p></div>
          : t === "decline" ? "Đơn vị vận hành không được cấp quyền; yêu cầu hỗ trợ vẫn được trao đổi bình thường." : "Quyền hỗ trợ chấm dứt ngay ở lần đọc tiếp theo. Thao tác được ghi vào nhật ký của trường và nền tảng."}
        onConfirm={async (reason) => { if (act) await cmd.run(act.g.id, act.d, reason); }} />
    </>
  );
}

/* ------------------------------ create ticket ------------------------------ */
function CreateTicket({ schoolId, open, onOpenChange }: { schoolId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", body: "", priority: "normal" as SupportTicket["priority"] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = open && !!(f.title || f.body);
  useUnsavedChanges(dirty);
  const cmd = useCommand((ctx) => supportRepo.createTicket(ctx, schoolId, f), {
    success: "Đã tạo yêu cầu hỗ trợ", onSuccess: (t) => { setF({ title: "", body: "", priority: "normal" }); onOpenChange(false); router.push(`/school/${schoolId}/support/${t.id}`); },
    onError: (e: RepoError) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? {}); },
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e.title = "Tiêu đề tối thiểu 5 ký tự";
    if (f.body.trim().length < 10) e.body = "Mô tả tối thiểu 10 ký tự";
    setErrors(e);
    if (!Object.keys(e).length) void cmd.run();
  };
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) setErrors({}); onOpenChange(o); }} title="Tạo yêu cầu hỗ trợ" description="Gửi tới đơn vị vận hành nền tảng." size="md" busy={cmd.pending}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant="primary" icon={<Send className="size-4" />} loading={cmd.pending} onClick={submit}>Tạo yêu cầu</Button></>}>
      <div className="space-y-4">
        <Callout tone="warning" icon={<AlertTriangle />}>Không ghi thông tin cá nhân của học sinh/gia đình (họ tên đầy đủ, số điện thoại, số giấy tờ) vào yêu cầu hỗ trợ. Mô tả vấn đề ở mức cấu hình hoặc thao tác.</Callout>
        <ErrorSummary errors={errors} labels={{ title: "Tiêu đề", body: "Mô tả" }} /><FormError message={cmd.error?.code !== "VALIDATION" ? cmd.error?.message : undefined} />
        <div data-field="title"><TextField label="Tiêu đề" required disabled={cmd.pending} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} placeholder="Ví dụ: Không thấy lớp 12A1 trong ma trận phân công" /></div>
        <div data-field="body"><TextArea label="Mô tả vấn đề" required disabled={cmd.pending} rows={5} maxChars={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} error={errors.body} helper="Các bước đã làm, màn hình gặp lỗi, thời điểm" /></div>
        <RadioGroup label="Mức ưu tiên" direction="row" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={[{ value: "low" as const, label: "Thấp" }, { value: "normal" as const, label: "Bình thường" }, { value: "high" as const, label: "Cao" }].map(o=>({...o,disabled:cmd.pending}))} />
      </div>
    </Modal>
  );
}

/* ------------------------------ SC42 ------------------------------ */
export function SupportOverview({ schoolId }: { schoolId: string }) {
  const tickets=useListQuery({pageSize:8}),grants=useListQuery({pageSize:8});
  const q=useRepo(["school-support",schoolId,tickets.query,grants.query],c=>supportRepo.overview(c,schoolId,tickets.query,grants.query));
  return <SchoolSourceState query={q}>{d=><SupportOverviewBody schoolId={schoolId} data={d} tickets={tickets} grants={grants} />}</SchoolSourceState>;
}
function SupportOverviewBody({schoolId,data:d,tickets,grants}:{schoolId:string;data:Overview;tickets:ReturnType<typeof useListQuery>;grants:ReturnType<typeof useListQuery>}) {
  const router=useRouter(),[creating,setCreating]=useState(false);
  const columns: Column<Ticket>[] = [
    { key: "title", header: "Yêu cầu", cell: (t) => <div className="min-w-[220px]"><p className="font-semibold text-ink">{t.title}</p><p className="line-clamp-1 text-[12.5px] text-muted">{t.body}</p></div> },
    { key: "priority", header: "Ưu tiên", hideBelow: "sm", cell: (t) => <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge> },
    { key: "status", header: "Trạng thái", cell: (t) => <StatusBadge status={t.status} map={TICKET_STATUS} /> },
    { key: "by", header: "Người tạo", hideBelow: "md", cell: (t) => <span className="text-[13px]">{t.createdByName}<span className="block text-muted">{fmtDateTime(t.createdAt)}</span></span> },
    { key: "upd", header: "Phản hồi", align: "right", hideBelow: "lg", cell: (t) => t.messageCount },
    { key: "go", header: <span className="sr-only">Mở</span>, cell: (t) => <ArrowRight className="size-4 text-primary" aria-label={`Mở ${t.title}`} /> },
  ];
  return <div className="page">
    <PageHeader title="Hỗ trợ và ủy quyền hỗ trợ" subtitle="Yêu cầu hỗ trợ của trường và quyền hỗ trợ tạm thời do nhà trường cho phép" actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={()=>setCreating(true)}>Tạo yêu cầu hỗ trợ</Button>} />
    <Callout tone="info" icon={<ShieldCheck />} title="Nhà trường giữ quyền quyết định">Nền tảng không mặc định đọc hồ sơ học sinh/gia đình. Mọi quyền hỗ trợ có phạm vi và hạn dùng do nhà trường cho phép, và có thể thu hồi ngay.</Callout>
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="card min-w-0">
        <div className="card-header"><h2 className="card-title"><LifeBuoy className="size-5" aria-hidden />Yêu cầu hỗ trợ</h2><span className="text-sm text-muted">{d.counts.total} yêu cầu</span></div>
        <FilterBar q={tickets.query.q??""} onQ={tickets.setQ} placeholder="Tìm yêu cầu…" active={tickets.active} onReset={tickets.reset}>
          <InlineSelect label="Lọc trạng thái" allLabel="Mọi trạng thái" value={tickets.query.filters?.status??""} onChange={v=>tickets.setFilter("status",v)} options={Object.entries(TICKET_STATUS).map(([value,s])=>({value,label:s.label}))} />
        </FilterBar>
        <div className="px-4"><DataTable caption="Yêu cầu hỗ trợ" rows={d.tickets.items} columns={columns} rowKey={t=>t.id} minWidth={560} onRowClick={t=>router.push(`/school/${schoolId}/support/${t.id}`)} empty={tickets.active?<EmptyFiltered onReset={tickets.reset} what="yêu cầu" />:<EmptyState compact title="Chưa có yêu cầu hỗ trợ" action={<Button size="sm" onClick={()=>setCreating(true)}>Tạo yêu cầu</Button>} />} /></div>
        <Pagination page={d.tickets.page} pageCount={d.tickets.pageCount} total={d.tickets.total} pageSize={d.tickets.pageSize} onPage={tickets.setPage} what="yêu cầu" />
      </section>
      <Card className="min-w-0">
        <CardHeader title="Quyền hỗ trợ tạm thời" icon={<KeyRound className="size-5" />} subtitle="Đề nghị từ đơn vị vận hành — cho phép, từ chối hoặc thu hồi" />
        {d.grants===null?<p className="px-5 pb-4 text-sm text-muted">Bạn không được phép xem đề nghị quyền hỗ trợ.</p>:<>
          <FilterBar q={grants.query.q??""} onQ={grants.setQ} placeholder="Tìm lý do, người hỗ trợ…" active={grants.active} onReset={grants.reset}>
            <InlineSelect label="Lọc quyền hỗ trợ" allLabel="Mọi trạng thái" value={grants.query.filters?.status??""} onChange={v=>grants.setFilter("status",v)} options={Object.entries(GRANT_STATUS).map(([value,s])=>({value,label:s.label}))} />
          </FilterBar>
          {grants.active&&!d.grants.items.length?<EmptyFiltered onReset={grants.reset} what="quyền hỗ trợ" />:<SupportGrants schoolId={schoolId} grants={d.grants.items} />}
          <Pagination page={d.grants.page} pageCount={d.grants.pageCount} total={d.grants.total} pageSize={d.grants.pageSize} onPage={grants.setPage} what="quyền hỗ trợ" />
        </>}
      </Card>
    </div>
    <CreateTicket schoolId={schoolId} open={creating} onOpenChange={setCreating} />
  </div>;
}

/* ------------------------------ SC43 ------------------------------ */
type TicketData = Awaited<ReturnType<typeof supportRepo.ticket>>;
export function SupportTicketView({ schoolId, data }: { schoolId: string; data: TicketData }) {
  const t = data.ticket;
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  useUnsavedChanges(!!text.trim());
  const cmd = useCommand((ctx) => supportRepo.addUpdate(ctx, schoolId, t.id, text), { success: "Đã ghi cập nhật", onSuccess: () => setText(""), onError: (e) => setErr(e.fieldErrors?.text ?? e.message) });
  const base = `/school/${schoolId}/support`;
  return (
    <div className="page">
      <PageHeader title={t.title} badge={<StatusBadge status={t.status} map={TICKET_STATUS} />} subtitle={`Tạo bởi ${data.createdByName} lúc ${fmtDateTime(t.createdAt)}`} breadcrumbs={[{ label: "Hỗ trợ", href: base }, { label: t.title }]} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5"><p className="whitespace-pre-line text-[14.5px] leading-relaxed text-body">{t.body}</p></Card>
          <Card>
            <CardHeader title="Trao đổi" icon={<MessageSquare className="size-5" />} subtitle="Các cập nhật từ nhà trường và đơn vị vận hành." />
            <ol className="space-y-3 px-5 pb-4">
              {data.updates.length ? data.updates.map((u) => (
                <li key={u.id} className={clsx("flex gap-3", u.side === "school" && "flex-row-reverse text-right")}>
                  <Avatar name={u.byName} size={32} tone={u.side === "school" ? "blue" : "purple"} />
                  <div className={clsx("max-w-[80%] rounded-2xl px-4 py-2.5 text-left", u.side === "school" ? "bg-primary-light" : "bg-[#f4f1fd]")}>
                    <p className="text-[12px] font-semibold text-ink">{u.byName} · {u.side === "school" ? "Nhà trường" : u.side === "platform" ? "Vận hành nền tảng" : "Không có thông tin bên gửi"}</p>
                    <p className="whitespace-pre-line text-sm text-body">{u.text}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">{fmtDateTime(u.at)}</p>
                  </div>
                </li>
              )) : <p className="text-sm text-muted">Chưa có trao đổi.</p>}
            </ol>
            {["resolved", "closed"].includes(t.status) ? <p className="border-t border-line px-5 py-4 text-sm text-muted">Yêu cầu đã kết thúc, không nhận thêm cập nhật.</p> : <div className="space-y-2 border-t border-line px-5 py-4">
              <TextArea label="Thêm cập nhật" rows={3} value={text} onChange={(e) => { setText(e.target.value); setErr(undefined); }} disabled={cmd.pending} error={err} helper="Không ghi thông tin cá nhân học sinh." />
              <div className="flex justify-end"><Button variant="primary" icon={<Send className="size-4" />} loading={cmd.pending} onClick={() => { if (text.trim().length < 3) { setErr("Nội dung tối thiểu 3 ký tự"); return; } void cmd.run(); }}>Ghi cập nhật</Button></div>
            </div>}
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Thông tin" icon={<Info className="size-5" />} />
            <dl className="px-5 pb-4">
              <InfoRow label="Trạng thái"><StatusBadge status={t.status} map={TICKET_STATUS} /></InfoRow>
              <InfoRow label="Ưu tiên"><Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge></InfoRow>
              <InfoRow label="Người xử lý">{t.assigneeUserId ? data.assigneeName : "Chưa phân công"}</InfoRow>
              <InfoRow label="Số phản hồi">{data.updates.length}</InfoRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Quyền hỗ trợ của yêu cầu" icon={data.grants?.some((g) => g.status === "active") ? <ShieldX className="size-5" /> : <KeyRound className="size-5" />} action={<CardLink href={base}>Tất cả quyền</CardLink>} />
            <div className="pb-2">{data.grants === null ? <p className="px-5 pb-4 text-sm text-muted">Bạn không được phép xem đề nghị quyền hỗ trợ.</p> : <SupportGrants schoolId={schoolId} grants={data.grants} compact />}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
