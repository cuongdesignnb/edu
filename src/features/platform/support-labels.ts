import type { StatusLabel } from "@/lib/formatters";

export const TICKET_STATUS: Record<string, StatusLabel> = {
  open: { label: "Mới tiếp nhận", tone: "info" },
  in_progress: { label: "Đang xử lý", tone: "purple" },
  waiting_school: { label: "Chờ nhà trường", tone: "warning" },
  resolved: { label: "Đã xử lý", tone: "success" },
  closed: { label: "Đã đóng", tone: "neutral" },
};

export const TICKET_PRIORITY: Record<string, StatusLabel> = {
  high: { label: "Ưu tiên cao", tone: "danger" },
  normal: { label: "Bình thường", tone: "neutral" },
  low: { label: "Thấp", tone: "neutral" },
};

export const GRANT_STATUS: Record<string, StatusLabel> = {
  requested: { label: "Chờ nhà trường cho phép", tone: "warning" },
  active: { label: "Đang hiệu lực", tone: "success" },
  expired: { label: "Hết hạn", tone: "neutral" },
  inactive: { label: "Chưa có hiệu lực", tone: "warning" },
  revoked: { label: "Đã thu hồi / rút lại", tone: "danger" },
  declined: { label: "Nhà trường từ chối", tone: "neutral" },
};
