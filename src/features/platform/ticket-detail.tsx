"use client";
import { useState } from "react";
import Link from "next/link";
import { MessageSquareText, Send, Info, KeyRound, Building2, UserCheck, ShieldAlert } from "lucide-react";
import type { SupportTicket } from "@/lib/model/types";
import { platformRepo, SUPPORT_SCOPE_LABEL } from "@/lib/repositories";
import { effectiveGrantStatus } from "@/lib/repositories/platform";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { demoNowISO } from "@/lib/demo/clock";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { SelectField, TextArea } from "@/components/ui/form";
import { Timeline } from "@/components/ui/timeline";
import { useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";
import { GRANT_STATUS, TICKET_PRIORITY, TICKET_STATUS } from "./support-labels";
import { AssignDialog } from "./tickets-table";
import { RequestSupportDialog } from "./support-request-dialog";

type Data = Awaited<ReturnType<typeof platformRepo.ticket>>;

/** PL07 — ticket detail: content, updates, status, related grants. No "sign in as teacher". */
export function TicketDetail({ ticketId }: { ticketId: string }) {
  const q = useRepo(["platform-ticket", ticketId], (ctx) => platformRepo.ticket(ctx, ticketId));
  return <QueryState query={q} skeleton="detail">{(d) => <Body d={d} />}</QueryState>;
}

function Body({ d }: { d: Data }) {
  const t = d.ticket;
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"] | "">("");
  const [err, setErr] = useState<string>();
  const [assign, setAssign] = useState(false);
  const [request, setRequest] = useState(false);
  useUnsavedChanges(!!text.trim() || (!!status && status !== t.status));
  const cmd = useCommand((ctx, v: { text?: string; status?: SupportTicket["status"] }) => platformRepo.updateTicket(ctx, t.id, v), {
    success: "Đã ghi cập nhật (mô phỏng)", onSuccess: () => { setText(""); setStatus(""); }, onError: (e) => setErr(e.fieldErrors?.text),
  });
  const submit = () => {
    const st = status && status !== t.status ? status : undefined;
    if (!text.trim() && !st) { setErr("Nhập nội dung cập nhật hoặc đổi trạng thái"); return; }
    if (text.trim() && text.trim().length < 3) { setErr("Nội dung cập nhật tối thiểu 3 ký tự"); return; }
    setErr(undefined);
    cmd.run({ text: text.trim() || undefined, status: st });
  };
  const now = demoNowISO();
  return (
    <div className="page">
      <PageHeader title={t.title} subtitle={`${d.school.name} · tiếp nhận ${fmtDateTime(t.createdAt)}`} badge={<StatusBadge status={t.status} map={TICKET_STATUS} />}
        breadcrumbs={[{ label: "Tổng quan", href: "/platform" }, { label: "Yêu cầu hỗ trợ", href: "/platform/support" }, { label: t.title }]}
        actions={<>
          <Button icon={<UserCheck className="size-4" />} onClick={() => setAssign(true)} disabled={t.status === "resolved"}>Phân công</Button>
          <Button variant="primary" icon={<KeyRound className="size-4" />} onClick={() => setRequest(true)} disabled={d.school.status !== "active" || t.status === "resolved"}>Đề nghị quyền hỗ trợ</Button>
        </>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Nội dung yêu cầu" icon={<MessageSquareText className="size-5" />} action={<StatusBadge status={t.priority} map={TICKET_PRIORITY} />} />
            <p className="whitespace-pre-line px-5 pb-5 text-[14.5px] leading-relaxed text-body">{t.body}</p>
          </Card>
          <Card>
            <CardHeader title="Cập nhật xử lý" icon={<Send className="size-5" />} subtitle={`${t.updates.length} cập nhật`} />
            <div className="px-5 pb-2">
              <Timeline items={[...t.updates].reverse().map((u, i) => ({ id: `${u.at}-${i}`, at: u.at, title: u.side === "platform" ? "Nền tảng" : "Nhà trường", detail: u.text, actor: d.people[u.by] ?? "", tone: u.side === "platform" ? "blue" : "green" }))} empty="Chưa có cập nhật nào." />
            </div>
            <div className="space-y-3 border-t border-line p-5">
              <TextArea label="Thêm cập nhật" rows={3} maxChars={500} value={text} onChange={(e) => setText(e.target.value)} error={err} helper="Không ghi số giấy tờ, số điện thoại hay thông tin học sinh vào cập nhật." />
              <div className="flex flex-wrap items-end gap-3">
                <SelectField className="min-w-[200px] flex-1" label="Đổi trạng thái" value={status || t.status} onChange={(e) => setStatus(e.target.value as SupportTicket["status"])} options={Object.entries(TICKET_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
                <Button variant="ghost" onClick={() => { setText(""); setStatus(""); setErr(undefined); }} disabled={cmd.pending || (!text && !status)}>Hủy</Button>
                <Button variant="primary" icon={<Send className="size-4" />} loading={cmd.pending} onClick={submit}>Ghi cập nhật</Button>
              </div>
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Thông tin" icon={<Building2 className="size-5" />} />
            <dl className="divide-y divide-line px-5 pb-4">
              <InfoRow label="Trường"><Link href={`/platform/schools/${d.school.id}`} className="text-primary-strong hover:underline">{d.school.shortName}</Link></InfoRow>
              <InfoRow label="Người gửi">{d.people[t.createdBy] ?? "—"}</InfoRow>
              <InfoRow label="Người xử lý">{t.assigneeUserId ? d.people[t.assigneeUserId] : <span className="text-warning-text">Chưa phân công</span>}</InfoRow>
              <InfoRow label="Ưu tiên"><StatusBadge status={t.priority} map={TICKET_PRIORITY} /></InfoRow>
              <InfoRow label="Tiếp nhận">{fmtDateTime(t.createdAt)}</InfoRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Phạm vi hỗ trợ được cho phép" icon={<KeyRound className="size-5" />} />
            <ul className="space-y-3 px-5 pb-5">
              {d.grants.length === 0 && <li className="text-sm text-muted">Chưa có quyền hỗ trợ nào cho trường này. Nền tảng chỉ xem cấu hình vận hành.</li>}
              {d.grants.map((g) => (
                <li key={g.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={effectiveGrantStatus(g, now)} map={GRANT_STATUS} />{g.ticketId === t.id && <Badge tone="info" dot={false}>Gắn với yêu cầu này</Badge>}</div>
                  <p className="mt-1.5 text-body">{g.scopes.map((s) => SUPPORT_SCOPE_LABEL[s]).join(", ")}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{g.validFrom ? `${fmtDateTime(g.validFrom)} → ` : "Đến "}{fmtDateTime(g.validTo)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Callout tone="warning" icon={<ShieldAlert />} title="Không đăng nhập thay người dùng">Nền tảng không có chức năng đăng nhập thành giáo viên hay quản trị trường. Mọi thao tác hỗ trợ dữ liệu cần nhà trường cho phép, có thời hạn và được ghi nhật ký.</Callout>
          <Callout tone="neutral" icon={<Info />}>Cập nhật ở đây là mô phỏng: không gửi email hay tin nhắn cho nhà trường.</Callout>
        </div>
      </div>
      <AssignDialog ticket={assign ? t : null} onClose={() => setAssign(false)} />
      <RequestSupportDialog open={request} onClose={() => setRequest(false)} schoolId={d.school.id} ticketId={t.id} />
    </div>
  );
}
