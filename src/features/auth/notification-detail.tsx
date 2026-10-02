"use client";
import { useEffect, useRef } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/states";

export function NotificationDetail({ notificationId }: { notificationId: string }) {
  const { actor } = useSession();
  // Reuse the owned feed. Do not fetch a target belonging to another recipient.
  const q = useRepo(["notifications", "center"], ctx => sessionRepo.notifications(ctx), { enabled: actor.kind === "staff", refetchOnMount: "always" });
  const row = q.data?.find(item => item.id === notificationId);
  const attempted = useRef<string | null>(null);
  const mark = useCommand((ctx, id: string) => sessionRepo.markNotificationsRead(ctx, [id]));
  useEffect(() => {
    if (q.isFetching || q.error || !row || row.readAt || attempted.current === row.id) return;
    attempted.current = row.id;
    void mark.run(row.id);
  }, [q.isFetching, q.error, row, mark]);

  if (actor.kind === "staff" && (q.isLoading || q.isFetching)) return <PageSkeleton />;
  if (q.error) return <div className="page"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  if (!row || actor.kind !== "staff") return <div className="page"><PageHeader title="Chi tiết thông báo" /><Card><EmptyState icon={<Bell className="size-6" />} title="Thông báo không khả dụng" description="Thông báo không tồn tại hoặc không thuộc tài khoản và phạm vi hiện tại của bạn." action={<ButtonLink href="/notifications">Danh sách thông báo</ButtonLink>} /></Card></div>;
  return <div className="page">
    <PageHeader title="Chi tiết thông báo" breadcrumbs={[{ label: "Thông báo của tôi", href: "/notifications" }, { label: "Chi tiết" }]}
      actions={<ButtonLink href="/notifications">Danh sách thông báo</ButtonLink>} />
    <Card className="card-pad">
      <div className="flex items-start gap-3">
        <span className="icon-tile icon-tile-sm tone-blue" aria-hidden><Bell className="size-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-bold text-ink">{row.title}</h2><p className="mt-1 text-sm text-muted">{row.schoolName} · {fmtDateTime(row.createdAt)}</p></div>
        <Badge tone={row.readAt ? "neutral" : "info"}>{row.readAt ? "Đã đọc" : "Chưa đọc"}</Badge>
      </div>
      <p className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-7 text-body">{row.body || "Thông báo này không có nội dung bổ sung."}</p>
      {!row.accessible && <Callout className="mt-5" tone="warning" title="Quyền truy cập đã thay đổi">Nội dung gốc nằm ngoài quyền hiện tại. Bạn có thể đọc thông tin trạng thái ở đây.</Callout>}
      <div className="mt-6 flex flex-wrap gap-2">
        {!row.readAt && <Button variant="secondary" icon={<Check className="size-4" />} loading={mark.pending} onClick={() => mark.run(row.id)}>Đánh dấu đã đọc</Button>}
        {row.accessible && row.href && <ButtonLink href={row.href} variant="primary" icon={<ExternalLink className="size-4" />}>Mở nội dung liên quan</ButtonLink>}
      </div>
    </Card>
  </div>;
}
