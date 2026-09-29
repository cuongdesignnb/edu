import type {
  AttendanceStatus, ClassStatus, MembershipStatus, SchoolStatus, StudentStatus, VerificationStatus,
  SubmissionStatus, ParentModule, InvitationStatus, StudentPositionKey,
} from "@/lib/model/types";

const TZ = "Asia/Ho_Chi_Minh";

function toDate(value: string): Date {
  return value.length === 10 ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
}

/** dd/MM/yyyy */
export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** dd/MM */
export function fmtDayMonth(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(toDate(value));
}

export function fmtTime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  return `${fmtTime(value)} ${fmtDate(value)}`;
}

const WEEKDAYS = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
const WEEKDAYS_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export function weekdayLabel(n: number, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[n] ?? "";
}
export function fmtDateLong(date: string): string {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${weekdayLabel(d === 0 ? 7 : d)}, ${fmtDate(date)}`;
}

export function fmtNumber(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function fmtPercent(num: number, den: number, digits = 0): string {
  if (!den) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format((num / den) * 100)}%`;
}

export function fmtPoints(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Relative time vs the demo clock ("2 giờ trước"). */
export function fmtRelative(iso: string, nowIso: string): string {
  const diff = (Date.parse(nowIso) - Date.parse(iso)) / 1000;
  if (diff < 0) {
    const f = -diff;
    if (f < 3600) return `sau ${Math.max(1, Math.round(f / 60))} phút`;
    if (f < 86400) return `sau ${Math.round(f / 3600)} giờ`;
    return `sau ${Math.round(f / 86400)} ngày`;
  }
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.round(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.round(diff / 3600)} giờ trước`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} ngày trước`;
  return fmtDate(iso);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const prev = parts.length > 1 ? parts[parts.length - 2] : "";
  return ((prev[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/** Remove Vietnamese diacritics for search matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fields.some((f) => f && fold(f).includes(q));
}

/** Vietnamese-aware compare for sorting names. */
export function viCompare(a: string, b: string): number {
  return a.localeCompare(b, "vi", { sensitivity: "base" });
}

/** Sort Vietnamese full names by given name (last word) then full name. */
export function nameCompare(a: string, b: string): number {
  const la = a.trim().split(/\s+/).pop() ?? a;
  const lb = b.trim().split(/\s+/).pop() ?? b;
  return viCompare(la, lb) || viCompare(a, b);
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "purple";
export interface StatusLabel { label: string; tone: Tone }

export const schoolStatus: Record<SchoolStatus, StatusLabel> = {
  draft: { label: "Chờ kích hoạt", tone: "neutral" },
  active: { label: "Đang hoạt động", tone: "success" },
  suspended: { label: "Tạm dừng", tone: "warning" },
  archived: { label: "Đã lưu trữ", tone: "neutral" },
};
export const classStatus: Record<ClassStatus, StatusLabel> = {
  draft: { label: "Nháp", tone: "neutral" },
  active: { label: "Đang hoạt động", tone: "success" },
  archived: { label: "Lưu trữ", tone: "neutral" },
};
export const membershipStatus: Record<MembershipStatus, StatusLabel> = {
  active: { label: "Đang hoạt động", tone: "success" },
  suspended: { label: "Tạm khóa", tone: "warning" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};
export const invitationStatus: Record<InvitationStatus, StatusLabel> = {
  pending: { label: "Chờ xác nhận", tone: "warning" },
  accepted: { label: "Đã nhận", tone: "success" },
  declined: { label: "Đã từ chối", tone: "neutral" },
  expired: { label: "Hết hạn", tone: "neutral" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};
export const studentStatus: Record<StudentStatus, StatusLabel> = {
  studying: { label: "Đang học", tone: "success" },
  transferred_out: { label: "Đã chuyển đi", tone: "neutral" },
  left: { label: "Ngừng theo học", tone: "neutral" },
};
export const verificationStatus: Record<VerificationStatus, StatusLabel> = {
  unverified: { label: "Chưa xác minh", tone: "warning" },
  verified: { label: "Đã xác minh", tone: "success" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};
export const attendanceStatus: Record<AttendanceStatus, StatusLabel & { short: string }> = {
  unmarked: { label: "Chưa điểm danh", short: "Chưa", tone: "neutral" },
  present: { label: "Có mặt", short: "Có mặt", tone: "success" },
  late: { label: "Đi muộn", short: "Muộn", tone: "warning" },
  excused: { label: "Nghỉ có phép", short: "Có phép", tone: "info" },
  unexcused: { label: "Nghỉ không phép", short: "K.phép", tone: "danger" },
};
export const submissionStatus: Record<SubmissionStatus, StatusLabel> = {
  not_received: { label: "Chưa nhận", tone: "neutral" },
  received: { label: "Đã nhận", tone: "info" },
  pending_review: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  needs_supplement: { label: "Cần bổ sung", tone: "danger" },
};
export const parentModuleLabel: Record<ParentModule, string> = {
  attendance: "Chuyên cần",
  conduct: "Thi đua đã công bố",
  timetable: "Lịch học",
  duties: "Trực nhật",
  activities: "Hoạt động",
  announcements: "Thông báo",
  teachers: "Giáo viên phụ trách",
  documents: "Tài liệu được chia sẻ",
};
export const positionLabel: Record<StudentPositionKey, string> = {
  class_monitor: "Lớp trưởng",
  secretary: "Bí thư",
  vice_study: "Lớp phó học tập",
  vice_labor: "Lớp phó lao động",
  group_leader: "Tổ trưởng",
};
