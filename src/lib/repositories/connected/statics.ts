import type {ParentAccess} from '../../model/types';

import {RepoError} from '../errors';

export const SCHOOL_REPORTS = [
  { type: "attendance", title: "Chuyên cần theo lớp", description: "Tỷ lệ có mặt, đi muộn, nghỉ có/không phép theo các buổi đã lưu." },
  { type: "conduct", title: "Thi đua theo tuần", description: "Trạng thái rà soát/chốt/công bố và phân bố xếp loại theo bản đã chốt." },
  { type: "activities", title: "Hoạt động và minh chứng", description: "Tiến độ hoàn thành trên số học sinh được giao." },
  { type: "class-progress", title: "Tiến độ vận hành lớp", description: "Lớp thiếu phân công, chưa điểm danh, việc còn mở." },
  { type: "links", title: "Sử dụng link tra cứu", description: "Số link đang hiệu lực và đã được mở — không xác định danh tính người mở." },
] as const;

export const CLASS_REPORTS = [
  { type: "attendance", title: "Chuyên cần học sinh", description: "Tổng hợp theo từng học sinh trong khoảng thời gian." },
  { type: "conduct", title: "Thi đua theo tuần", description: "Bảng đã chốt/công bố hoặc bản xem trước có ghi chú." },
  { type: "activities", title: "Hoạt động của lớp", description: "Tình trạng từng học sinh theo hoạt động." },
  { type: "student", title: "Báo cáo cá nhân", description: "Chuyên cần, thi đua đã công bố và hoạt động của một học sinh." },
] as const;

export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "len", label: "Từ 12 đến 256 ký tự", test: (p) => p.length >= 12 && p.length <= 256 },
  { key: "letter", label: "Có chữ cái", test: (p) => /[A-Za-zÀ-ỹ]/.test(p) },
  { key: "digit", label: "Có chữ số", test: (p) => /\d/.test(p) },
  { key: "space", label: "Không có khoảng trắng ở đầu/cuối", test: (p) => p.length > 0 && p.trim() === p },
];

export function passwordErrors(password: string, confirm: string, current?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const failed = PASSWORD_RULES.filter((r) => !r.test(password));
  if (!password) errors.password = "Vui lòng nhập mật khẩu mới";
  else if (failed.length) errors.password = `Mật khẩu chưa đạt: ${failed.map((r) => r.label.toLowerCase()).join(", ")}`;
  else if (current !== undefined && current === password) errors.password = "Mật khẩu mới phải khác mật khẩu hiện tại";
  if (!confirm) errors.confirm = "Vui lòng nhập lại mật khẩu mới";
  else if (confirm !== password) errors.confirm = "Mật khẩu nhập lại không khớp";
  return errors;
}

export const SUPPORT_SCOPE_LABEL: Record<string, string> = {
  school_config: "Cấu hình trường (không gồm hồ sơ học sinh)",
  class_structure: "Cấu trúc lớp và phân công",
  staff_directory: "Danh sách nhân sự",
  import_logs: "Nhật ký nhập dữ liệu",
};

/** School-side support: the SCHOOL grants/revokes limited, time-boxed support scopes. */

export type AccessStatus = "active" | "expired" | "revoked";
export function accessStatus(pa: ParentAccess, now: string): AccessStatus {
  if (pa.revokedAt) return "revoked";
  if (pa.expiresAt < now) return "expired";
  return "active";
}

export const UPLOAD_LIMITS = { maxBytes: 5 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "application/pdf"] };

export async function unavailableBlob(_key:string):Promise<Blob|undefined>{throw new RepoError('READ_ERROR','Không tải được tệp. Vui lòng thử lại sau.');}
