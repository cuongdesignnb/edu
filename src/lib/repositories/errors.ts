export type RepoErrorCode =
  | "NETWORK"        // acknowledgement unavailable; keep the same logical command for retry
  | "CONFLICT"       // version changed since it was read
  | "FORBIDDEN"      // actor lacks the grant for this scope
  | "NOT_FOUND"
  | "VALIDATION"
  | "DUPLICATE"
  | "LOCKED"         // period locked/published — must go through adjustment
  | "REVOKED"        // membership/link revoked
  | "EXPIRED"
  | "SUSPENDED"      // school suspended/archived
  | "UNVERIFIED"     // guardian relationship not verified
  | "READ_ERROR"
  | "NO_SESSION";

export const ERROR_MESSAGES: Record<RepoErrorCode, string> = {
  NETWORK: "Chưa nhận được xác nhận lưu từ máy chủ. Nội dung của bạn vẫn còn; hãy thử lại.",
  CONFLICT: "Dữ liệu đã được người khác thay đổi sau khi bạn mở. Hãy xem bản mới trước khi lưu.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này trong phạm vi hiện tại.",
  NOT_FOUND: "Không tìm thấy dữ liệu hoặc dữ liệu không thuộc phạm vi của bạn.",
  VALIDATION: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra các trường được đánh dấu.",
  DUPLICATE: "Có thể trùng với một ghi nhận đã có.",
  LOCKED: "Kỳ này đã chốt. Mọi thay đổi phải đi qua đề nghị điều chỉnh.",
  REVOKED: "Quyền truy cập đã bị thu hồi.",
  EXPIRED: "Quyền truy cập đã hết hạn.",
  SUSPENDED: "Trường đang tạm dừng hoặc đã lưu trữ. Không thể thao tác dữ liệu.",
  UNVERIFIED: "Người giám hộ chưa được xác minh. Cần xác minh trước khi cấp link.",
  READ_ERROR: "Không tải được dữ liệu. Vui lòng thử lại.",
  NO_SESSION: "Phiên đăng nhập đã hết hoặc bạn chưa đăng nhập.",
};

export class RepoError extends Error {
  code: RepoErrorCode;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  constructor(code: RepoErrorCode, message?: string, extra?: { details?: Record<string, unknown>; fieldErrors?: Record<string, string> }) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "RepoError";
    this.code = code;
    this.details = extra?.details;
    this.fieldErrors = extra?.fieldErrors;
  }
}

export function isRepoError(e: unknown): e is RepoError {
  return e instanceof RepoError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "RepoError");
}

export function errorMessage(e: unknown): string {
  if (isRepoError(e)) return e.message;
  return "Đã có lỗi không mong muốn. Vui lòng thử lại.";
}
