"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Bell, CheckCheck, ClipboardList, Megaphone, ShieldCheck, Settings2, ExternalLink, Lock, Check } from "lucide-react";
import type { StaffNotification } from "@/lib/model/types";
import { sessionRepo } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/formatters";
import { demoNowISO } from "@/lib/calendar";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineSelect } from "@/components/ui/form";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { FilterBar, Pagination, useClientList } from "@/components/data/table";
import { EmptyState, EmptyFiltered, ErrorState, Skeleton } from "@/components/ui/states";

type Row = StaffNotification & { schoolName: string; accessible: boolean };

const KIND: Record<StaffNotification["kind"], { label: string; icon: React.ReactNode; tone: string }> = {
  task: { label: "Việc cần xử lý", icon: <ClipboardList className="size-4" />, tone: "tone-blue" },
  announcement: { label: "Thông báo", icon: <Megaphone className="size-4" />, tone: "tone-green" },
  system: { label: "Hệ thống", icon: <Settings2 className="size-4" />, tone: "tone-purple" },
  permission: { label: "Quyền truy cập", icon: <ShieldCheck className="size-4" />, tone: "tone-amber" },
};

/** AU09 — staff notification centre: all/unread, by school and type, mark read, open only accessible targets. */
export function NotificationsCenter() {
  const { actor } = useSession();
  if (actor.kind === "platform") {
    return (
      <div className="page">
        <PageHeader title="Thông báo của tôi" />
        <Card><EmptyState icon={<Bell className="size-6" />} title="Tài khoản vận hành nền tảng không nhận thông báo của trường" description="Các sự kiện vận hành được ghi trong nhật ký nền tảng và hàng đợi yêu cầu hỗ trợ." action={<><ButtonLink href="/platform/audit" variant="primary">Mở nhật ký nền tảng</ButtonLink><ButtonLink href="/platform/support">Yêu cầu hỗ trợ</ButtonLink></>} /></Card>
      </div>
    );
  }
  return <StaffNotifications />;
}

function StaffNotifications() {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [school, setSchool] = useState("");
  const [kind, setKind] = useState("");
  const q = useRepo(["notifications", "center"], (ctx) => sessionRepo.notifications(ctx));
  const all = q.data ?? [];
  const unreadCount = all.filter((n) => !n.readAt).length;
  const filtered = useMemo(() => (q.data ?? []).filter((n) => (tab === "all" || !n.readAt) && (!school || n.schoolId === school) && (!kind || n.kind === kind)), [q.data, tab, school, kind]);
  const list = useClientList(filtered, { search: (n) => `${n.title} ${n.body} ${n.schoolName}`, pageSize: 8 });
  const schools = useMemo(() => [...new Map((q.data ?? []).map((n) => [n.schoolId, n.schoolName])).entries()].map(([value, label]) => ({ value, label })), [q.data]);
  const mark = useCommand((ctx, ids: string[] | "all") => sessionRepo.markNotificationsRead(ctx, ids), { success: (n) => n ? `Đã đánh dấu ${n} thông báo là đã đọc` : "Không có thông báo chưa đọc" });
  const unreadVisible = filtered.filter((n) => !n.readAt).map((n) => n.id);
  const filtersActive = !!(list.q || school || kind);

  const open = async (n: Row) => {
    if (!n.accessible || !n.href) return;
    if (!n.readAt) await mark.run([n.id]);
    router.push(n.href);
  };

  return (
    <div className="page">
      <PageHeader title="Thông báo của tôi" subtitle="Thông báo nội bộ theo trường và nhiệm vụ được giao" breadcrumbs={[{ label: "Tài khoản", href: "/choose-school" }, { label: "Thông báo" }]}
        actions={<Button variant="secondary" icon={<CheckCheck className="size-4" />} disabled={!unreadVisible.length} loading={mark.pending} onClick={() => mark.run(unreadVisible.length === unreadCount && !filtersActive ? "all" : unreadVisible)}>
          Đánh dấu đã đọc {unreadVisible.length ? `(${unreadVisible.length})` : ""}
        </Button>} />
      <Card>
        <Tabs className="[&>[role=tablist]]:mx-4 [&>[role=tablist]]:mt-4" tabs={[{ value: "all", label: "Tất cả", count: all.length }, { value: "unread", label: "Chưa đọc", count: unreadCount }]} value={tab} onChange={(v) => { setTab(v); list.setPage(1); }}>
        <TabPanel value={tab} className="!mt-0">
        <div className="pt-3">
          <FilterBar q={list.q} onQ={list.setQ} placeholder="Tìm trong tiêu đề, nội dung…" active={filtersActive} onReset={() => { list.setQ(""); setSchool(""); setKind(""); }}>
            <InlineSelect label="Lọc theo trường" allLabel="Tất cả trường" value={school} onChange={(v) => { setSchool(v); list.setPage(1); }} options={schools} />
            <InlineSelect label="Lọc theo loại" allLabel="Tất cả loại" value={kind} onChange={(v) => { setKind(v); list.setPage(1); }} options={Object.entries(KIND).map(([value, k]) => ({ value, label: k.label }))} />
          </FilterBar>
        </div>
        {q.isLoading ? <div className="space-y-2 px-4 pb-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          : all.length === 0 ? <EmptyState icon={<Bell className="size-6" />} title="Chưa có thông báo" description="Thông báo về việc cần xử lý, lời mời và quyền truy cập sẽ xuất hiện ở đây." compact />
          : list.total === 0 ? (tab === "unread" && !filtersActive ? <EmptyState icon={<CheckCheck className="size-6" />} title="Bạn đã đọc hết thông báo" compact /> : <EmptyFiltered what="thông báo" onReset={() => { list.setQ(""); setSchool(""); setKind(""); setTab("all"); }} />)
          : (
            <>
              <ul className="divide-y divide-line border-t border-line" aria-label="Danh sách thông báo">
                {list.items.map((n) => (
                  <li key={n.id} className={clsx("flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap", !n.readAt && "bg-[#f5faff]")}>
                    <span className={clsx("icon-tile icon-tile-sm !size-10 flex-none", KIND[n.kind].tone)} aria-hidden>{KIND[n.kind].icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={clsx("text-[14.5px] text-ink", !n.readAt ? "font-bold" : "font-medium")}>{n.title}</span>
                        {!n.readAt && <Badge tone="info">Chưa đọc</Badge>}
                      </p>
                      <p className="mt-0.5 text-[13.5px] text-body">{n.body}</p>
                      <p className="mt-1 text-[12px] text-muted"><span title={fmtDateTime(n.createdAt)}>{fmtRelative(n.createdAt, demoNowISO())}</span> · {n.schoolName} · {KIND[n.kind].label}</p>
                      {!n.accessible && <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-warning-text"><Lock className="size-3.5" aria-hidden />Bạn không còn quyền mở mục này tại trường {n.schoolName}.</p>}
                    </div>
                    <div className="flex flex-none gap-1.5 max-sm:w-full max-sm:justify-end">
                      {!n.readAt && <Button size="sm" variant="ghost" icon={<Check className="size-4" />} onClick={() => mark.run([n.id])} disabled={mark.pending} aria-label={`Đánh dấu đã đọc: ${n.title}`}>Đã đọc</Button>}
                      {n.href && <Button size="sm" variant="secondary" icon={n.accessible ? <ExternalLink className="size-4" /> : <Lock className="size-4" />} disabled={!n.accessible || mark.pending} onClick={() => open(n)}
                        title={n.accessible ? undefined : "Không còn quyền truy cập mục này"}>Mở</Button>}
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="thông báo" />
            </>
          )}
        </TabPanel>
        </Tabs>
      </Card>
      <Callout tone="neutral">Thông báo chỉ là lối tắt. Khi mở, hệ thống kiểm tra lại quyền theo phân công hiện tại; mục đã bị thu hồi quyền sẽ không hiển thị nội dung.</Callout>
    </div>
  );
}
