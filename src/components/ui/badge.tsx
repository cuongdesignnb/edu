import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/formatters";

const TONE_CLASS: Record<Tone, string> = {
  success: "badge-success", warning: "badge-warning", danger: "badge-danger", info: "badge-info", neutral: "badge-neutral", purple: "badge-purple",
};

/** C029 — status is always text + dot/icon, never colour alone. */
export function Badge({ tone = "neutral", children, dot = true, icon, className, title }: { tone?: Tone; children: ReactNode; dot?: boolean; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span className={clsx("badge", TONE_CLASS[tone], dot && !icon && "badge-dot", className)} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({ status, map, className }: { status: string; map: Record<string, { label: string; tone: Tone }>; className?: string }) {
  const s = map[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} className={className}>{s.label}</Badge>;
}

/** Common publication states used across modules (ST15–ST19). */
export const PUBLICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Đang mở", tone: "neutral" },
  none: { label: "Chưa có dữ liệu", tone: "neutral" },
  draft: { label: "Nháp", tone: "neutral" },
  saved: { label: "Đã lưu, chưa công bố", tone: "info" },
  pending_review: { label: "Chờ rà soát", tone: "warning" },
  locked: { label: "Đã chốt, chưa công bố", tone: "purple" },
  published: { label: "Đã công bố", tone: "success" },
  scheduled: { label: "Đã đặt lịch (mô phỏng)", tone: "info" },
  superseded: { label: "Đã thay bằng bản mới", tone: "neutral" },
  withdrawn: { label: "Đã thu hồi", tone: "danger" },
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  void: { label: "Đã loại", tone: "neutral" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  active: { label: "Đang hiệu lực", tone: "success" },
  expired: { label: "Hết hạn", tone: "neutral" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
  archived: { label: "Lưu trữ", tone: "neutral" },
  closed: { label: "Đã kết thúc", tone: "neutral" },
  requested: { label: "Chờ nhà trường cho phép", tone: "warning" },
  declined: { label: "Đã từ chối", tone: "neutral" },
  ready: { label: "Sẵn sàng tải", tone: "success" },
  running: { label: "Đang tạo (mô phỏng)", tone: "info" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
  supplement: { label: "Cần bổ sung", tone: "danger" },
  resolved: { label: "Đã xử lý", tone: "success" },
  in_progress: { label: "Đang xử lý", tone: "info" },
  waiting_school: { label: "Chờ nhà trường", tone: "warning" },
  retired: { label: "Ngừng áp dụng", tone: "neutral" },
};

export function DemoTag(_props: { children?: ReactNode }) { return null; }
