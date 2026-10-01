"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Send, Ban, Trash2, Eye, Paperclip, Lock, History, Users, Download, Info, School } from "lucide-react";
import { announcementEstimateLine } from '@/lib/repositories/connected/announcements';
import { announcementsRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Timeline } from "@/components/ui/timeline";
import { downloadFileAsset } from "@/components/ui/file";
import { AnnouncementBody } from "./body";
import { ParentPreview, type AnnouncementDetail } from "./composer";

/** SC35 — announcement detail: content, audience, estimate, status, history, attachments, internal note. */
export function AnnouncementDetailView({ schoolId, a }: { schoolId: string; a: AnnouncementDetail }) {
  const router = useRouter();
  const base = `/school/${schoolId}/announcements`;
  const [dlg, setDlg] = useState<"publish" | "withdraw" | "delete" | null>(null);
  const [preview, setPreview] = useState(false);
  const publish = useCommand((ctx) => announcementsRepo.publish(ctx, schoolId, a.source), { success: "Đã công bố thông báo", onSuccess: () => setDlg(null) });
  const withdraw = useCommand((ctx, reason: string) => announcementsRepo.withdraw(ctx, schoolId, a.source, reason), { success: "Đã thu hồi thông báo", onSuccess: () => setDlg(null) });
  const remove = useCommand((ctx) => announcementsRepo.deleteDraft(ctx, schoolId, a.source), { success: "Đã xóa bản nháp", onSuccess: () => router.push(base) });
  const canEdit = a.canEdit && a.origin === "school";
  const estimateLine = announcementEstimateLine(a.estimate, a.audience);
  const files = a.attachments.filter(Boolean) as NonNullable<AnnouncementDetail["attachments"][number]>[];
  return (
    <div className="page">
      <PageHeader title={a.title} badge={<StatusBadge status={a.status} map={PUBLICATION_STATUS} />}
        subtitle={a.origin === "class" ? `Thông báo của lớp ${a.className} — nhà trường theo dõi, chỉ giáo viên lớp được sửa.` : "Thông báo nhà trường"}
        breadcrumbs={[{ label: "Thông báo", href: base }, { label: a.title }]}
        actions={<>
          <Button icon={<Eye className="size-4" />} onClick={() => setPreview(true)}>Xem như phụ huynh</Button>
          {canEdit && (a.status === "draft" || a.status === "scheduled") && <ButtonLink href={`${base}/${a.id}/edit`} icon={<PenLine className="size-4" />}>Sửa</ButtonLink>}
          {a.canDelete && a.status === "draft" && <Button variant="danger-soft" icon={<Trash2 className="size-4" />} onClick={() => setDlg("delete")}>Xóa nháp</Button>}
          {a.canWithdraw && (a.status === "published" || a.status === "scheduled") && <Button variant="danger-soft" icon={<Ban className="size-4" />} onClick={() => setDlg("withdraw")}>Thu hồi</Button>}
          {a.canPublish && (a.status === "draft" || a.status === "scheduled") && <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setDlg("publish")}>Công bố ngay</Button>}
        </>} />
      {a.status === "withdrawn" && <Callout tone="danger" icon={<Ban />} title={`Đã thu hồi lúc ${fmtDateTime(a.withdrawnAt)}`}>Lý do: {a.withdrawReason}. Phụ huynh không còn thấy thông báo ở lần mở trang tiếp theo.</Callout>}
      {a.status === "scheduled" && <Callout tone="info" icon={<Info />} title={`Đã đặt lịch công bố lúc ${fmtDateTime(a.scheduledAt)}`}>Máy chủ sẽ kiểm tra lại quyền và người nhận khi đến lịch công bố. Có thể công bố ngay hoặc thu hồi lịch.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <p className="text-[15px] font-medium text-body">{a.summary}</p>
            <div className="my-4 h-px bg-line" />
            <AnnouncementBody body={a.body} />
          </Card>
          <Card>
            <CardHeader title="Tệp đính kèm" icon={<Paperclip className="size-5" />} />
            <div className="px-5 pb-5">
              {files.length ? <ul className="space-y-2">{files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <Paperclip className="size-4 text-primary" aria-hidden /><span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
                  <Button size="sm" variant="ghost" icon={<Download className="size-4" />} disabled={!f.canDownload} onClick={() => downloadFileAsset(f)}>Tải xuống</Button>
                </li>
              ))}</ul> : <p className="text-sm text-muted">Không có tệp đính kèm.</p>}
            </div>
          </Card>
          {a.historyView !== null && <Card>
            <CardHeader title="Lịch sử" icon={<History className="size-5" />} subtitle="Chỉ đọc — lịch sử không sửa được từ giao diện." />
            <div className="px-6 pb-5"><Timeline items={[...a.historyView].reverse().map((h) => ({ id: h.id, at: h.at, title: h.action, actor: h.byName, tone: h.action.startsWith("Thu hồi") ? "red" : h.action.startsWith("Công bố") ? "green" : "blue" }))} /></div>
          </Card>}
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Người nhận" icon={<Users className="size-5" />} />
            <dl className="px-5 pb-4">
              <InfoRow label="Nguồn">{a.origin === "school" ? <Badge tone="info" dot={false} icon={<School className="size-3" aria-hidden />}>Nhà trường</Badge> : <Badge tone="purple">Lớp {a.className}</Badge>}</InfoRow>
              <InfoRow label="Phạm vi">{a.scopeLabel}</InfoRow>
              <InfoRow label="Đối tượng">{a.audienceLabel}</InfoRow>
              <InfoRow label="Ước tính">{estimateLine}</InfoRow>
              <InfoRow label="Trang công khai">{a.isPublic ? "Có" : "Không"}</InfoRow>
              <InfoRow label="Người tạo">{a.createdByName}</InfoRow>
              <InfoRow label="Tạo lúc">{fmtDateTime(a.createdAt)}</InfoRow>
              {a.publishedAt && <InfoRow label="Công bố lúc">{fmtDateTime(a.publishedAt)}</InfoRow>}
              <InfoRow label="Phiên bản">{a.version}</InfoRow>
            </dl>
            <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Ước tính từ học sinh đang học và link hiện có. Không gửi email/Zalo thật.</p>
          </Card>
          {a.canViewInternal && <Card className="border-dashed">
            <CardHeader title="Ghi chú nội bộ" icon={<Lock className="size-5" />} action={<Badge tone="neutral">Nội bộ</Badge>} />
            <p className="px-5 pb-5 text-sm text-body">{a.internalNote || "Không có ghi chú."} <span className="block pt-1 text-[12px] text-muted">Không bao giờ hiển thị với phụ huynh.</span></p>
          </Card>}
        </div>
      </div>
      <Modal open={preview} onOpenChange={setPreview} title="Xem trước như phụ huynh" size="md" footer={<Button onClick={() => setPreview(false)}>Đóng</Button>}
        description={a.status === "published" ? "Nội dung gia đình trong phạm vi đang thấy." : "Gia đình chưa thấy — thông báo chưa công bố."}>
        <ParentPreview title={a.title} summary={a.summary} body={a.body} audience={a.audience} files={files} isPublic={a.isPublic} />
      </Modal>
      <ConfirmDialog open={dlg === "publish"} onOpenChange={(o) => !o && setDlg(null)} title="Công bố thông báo" object={a.title} confirmLabel="Công bố" busy={publish.pending} error={publish.error?.code === "VALIDATION" ? Object.values(publish.error.fieldErrors ?? {}).join("; ") || publish.error.message : undefined}
        consequence={<div className="space-y-1"><p><b>Phạm vi:</b> {a.scopeLabel} · <b>Đối tượng:</b> {a.audienceLabel}</p><p><b>Ước tính:</b> {estimateLine}</p><p>Người nhận thấy thông báo ở lần mở trang tiếp theo. Có thể thu hồi sau, nhưng không thu hồi được nội dung đã được đọc hoặc chụp màn hình.</p></div>}
        onConfirm={async () => { await publish.run(); }} />
      <ConfirmDialog open={dlg === "withdraw"} onOpenChange={(o) => !o && setDlg(null)} title={a.status === "scheduled" ? "Thu hồi lịch công bố" : "Thu hồi thông báo"} object={a.title} variant="danger" confirmLabel="Thu hồi" busy={withdraw.pending}
        reasonLabel="Lý do thu hồi" reasonRequired error={withdraw.error?.code === "VALIDATION" ? withdraw.error.fieldErrors?.reason ?? withdraw.error.message : undefined}
        consequence={<div className="space-y-1"><p>Thông báo chuyển sang “Đã thu hồi”; gia đình và nhân sự không thấy ở lần mở trang tiếp theo. Lịch sử và lý do được giữ lại.</p><p className="font-semibold">Lưu ý: nội dung đã được đọc, tải về hoặc chụp màn hình trước đó không thể thu hồi.</p></div>}
        onConfirm={async (reason) => { await withdraw.run(reason); }} />
      <ConfirmDialog open={dlg === "delete"} onOpenChange={(o) => !o && setDlg(null)} title="Xóa bản nháp thông báo" object={a.title} variant="danger" confirmLabel="Xóa bản nháp" busy={remove.pending} error={remove.error?.code === "VALIDATION" ? remove.error.message : undefined}
        consequence="Bản nháp chưa từng công bố sẽ bị xóa. Thao tác được ghi vào nhật ký nhà trường." onConfirm={async () => { await remove.run(); }} />
    </div>
  );
}
