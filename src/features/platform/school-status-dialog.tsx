"use client";
import type { SchoolStatus } from "@/lib/model/types";
import { platformRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { schoolStatus } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/ui/dialog";

/** O01 — change school status. Suspending never deletes data; platform-only. */
export function SchoolStatusDialog({ target, onClose }: { target: { id: string; name: string; version: number; to: SchoolStatus } | null; onClose: () => void }) {
  const cmd = useCommand((ctx, id: string, to: SchoolStatus, reason: string) => platformRepo.changeSchoolStatus(ctx, id, to, reason, target?.version), {
    success: (s) => `${s.name}: ${schoolStatus[s.status].label}`, onSuccess: onClose,
  });
  if (!target) return null;
  const text: Record<SchoolStatus, { title: string; consequence: string; label: string; variant: "primary" | "danger" }> = {
    active: { title: "Kích hoạt trường", consequence: "Nhân sự được cấp quyền của trường có thể đăng nhập và làm việc. Cần có ít nhất một quản trị trường đang hoạt động.", label: "Kích hoạt", variant: "primary" },
    suspended: { title: "Tạm dừng trường", consequence: "Chặn thao tác nghiệp vụ và link phụ huynh của trường. Dữ liệu được giữ nguyên, không bị xóa. Đây là quyết định vận hành, không liên quan thanh toán.", label: "Tạm dừng", variant: "danger" },
    archived: { title: "Lưu trữ trường", consequence: "Trường chuyển sang chỉ lưu trữ theo quy trình bàn giao. Dữ liệu không bị xóa tự động.", label: "Lưu trữ", variant: "danger" },
    draft: { title: "Chuyển về nháp", consequence: "Trường trở về trạng thái chờ kích hoạt.", label: "Chuyển về nháp", variant: "primary" },
  };
  const t = text[target.to];
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={t.title} object={target.name} consequence={t.consequence} confirmLabel={t.label} variant={t.variant}
      reasonLabel="Lý do" reasonRequired busy={cmd.pending} error={cmd.error?.message}
      onConfirm={(reason) => cmd.run(target.id, target.to, reason)} />
  );
}
