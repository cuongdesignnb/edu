/**
 * Lab-only form layouts for overlays whose real dialog lives inside a class workspace
 * (needs ClassroomLayout) or is not built yet. They are rendered as clearly labelled
 * "Mẫu tương đương" dialogs that validate but never write data; each links to the route
 * where the real overlay lives. Field labels follow docs/02 (fields column).
 */
export type FieldType = "text" | "email" | "select" | "date" | "textarea" | "number" | "readonly" | "checkbox";
export interface FieldSpec { key: string; label: string; type: FieldType; options?: string[]; required?: boolean; value?: string; helper?: string }
export interface OverlaySpec {
  container: "modal" | "drawer" | "sheet" | "confirm";
  screen: string; // registry id of the route that owns the real overlay
  fields: FieldSpec[];
  danger?: boolean;
  confirm?: { object: string; consequence: string; label: string; reason?: boolean };
  note?: string;
}

const reason: FieldSpec = { key: "reason", label: "Lý do", type: "textarea", required: true };
const from: FieldSpec = { key: "from", label: "Hiệu lực từ", type: "date", required: true };

export const OVERLAY_SPECS: Record<string, OverlaySpec> = {
  O02: { container: "modal", screen: "PL05", fields: [
    { key: "school", label: "Trường", type: "readonly", value: "Trường THPT Bình Minh" },
    { key: "email", label: "Email công việc (demo, không gửi thật)", type: "email", required: true, helper: "Dùng tên miền .test" },
    { key: "role", label: "Vai trò", type: "select", options: ["Quản trị trường", "Quản trị trường (thay thế người hiện tại)"], required: true },
    { key: "expires", label: "Hết hạn lời mời", type: "date", required: true },
  ], note: "Không cho gỡ quản trị cuối cùng của trường." },
  O04: { container: "modal", screen: "SC06", fields: [
    { key: "term", label: "Học kỳ", type: "select", options: ["Học kỳ I", "Học kỳ II"], required: true },
    { key: "start", label: "Ngày bắt đầu", type: "date", required: true }, { key: "end", label: "Ngày kết thúc", type: "date", required: true },
    { key: "deadline", label: "Hạn chốt tuần (số ngày sau tuần)", type: "number", required: true },
  ], note: "Không cho chồng kỳ; tuần đã chốt không bị áp ngược." },
  O07: { container: "drawer", screen: "SC11", fields: [
    { key: "who", label: "Người được phân công", type: "readonly", value: "Cô Trần Thị Lan" },
    { key: "before", label: "Quyền trước", type: "readonly", value: "Ngữ văn 10A2" },
    { key: "after", label: "Quyền sau", type: "readonly", value: "Ngữ văn 10A2 · Chủ nhiệm 10A1 (nhập điểm danh, ghi nhận thi đua, rà soát tuần)" },
    { key: "ack", label: "Tôi đã xem tác động theo từng lớp/môn", type: "checkbox", required: true },
  ], note: "Không có nút “Toàn quyền tất cả lớp”." },
  O08: { container: "confirm", screen: "SC11", fields: [], danger: true, confirm: { object: "Thầy Nguyễn Văn Hùng — Toán 10A2", consequence: "Thu hồi phân công từ thời điểm đã chọn. Danh tính và lịch sử dữ liệu người này đã ghi được giữ nguyên.", label: "Thu hồi phân công", reason: true } },
  O10: { container: "confirm", screen: "SC22", fields: [], confirm: { object: "Người giám hộ của học sinh Minh Anh", consequence: "Xác minh quan hệ giám hộ dựa trên căn cứ ghi chú. Quyền nhận thông tin tách biệt với trường liên hệ.", label: "Xác minh", reason: true } },
  O15: { container: "drawer", screen: "CL04", fields: [
    { key: "student", label: "Học sinh", type: "readonly", value: "Nguyễn Minh Anh — 10A1" },
    { key: "session", label: "Buổi/tiết", type: "select", options: ["Buổi sáng", "Buổi chiều"], required: true },
    { key: "status", label: "Trạng thái", type: "select", options: ["Chưa điểm danh", "Có mặt", "Đi muộn", "Nghỉ có phép", "Nghỉ không phép"], required: true },
    reason,
  ], note: "Sửa bản đã công bố phải có lịch sử." },
  O16: { container: "confirm", screen: "CL04", fields: [], confirm: { object: "10A1 — 12 học sinh đã chọn trên trang này", consequence: "Đặt trạng thái “Có mặt” cho đúng 12 dòng đã chọn. Không ghi đè dòng ngoài lựa chọn; “Chưa điểm danh” không tự thành có mặt.", label: "Áp dụng cho 12 dòng" } },
  O17: { container: "drawer", screen: "CL06", fields: [
    { key: "student", label: "Học sinh", type: "readonly", value: "Nguyễn Minh Anh — 10A1" },
    { key: "rule", label: "Quy định (phiên bản đang hiệu lực)", type: "select", options: ["Đi muộn (−5)", "Phát biểu xây dựng bài (+2)"], required: true },
    { key: "date", label: "Ngày", type: "date", required: true }, { key: "reason", label: "Nội dung sự việc", type: "textarea", required: true },
  ], note: "Cùng sự kiện nguồn không ghi điểm hai lần." },
  O18: { container: "modal", screen: "CL06", fields: [
    { key: "old", label: "Ghi nhận đã có", type: "readonly", value: "Đi muộn −5 · 05/10/2026 · từ điểm danh buổi sáng" },
    { key: "choice", label: "Cách xử lý", type: "select", options: ["Giữ ghi nhận cũ, bỏ bản mới", "Đây là sự việc khác (ghi giải thích)"], required: true },
    { key: "note", label: "Giải thích (nếu là sự việc khác)", type: "textarea" },
  ], note: "Không có nút “cứ lưu 2 lần” mặc định." },
  O19: { container: "drawer", screen: "CL07", fields: [
    { key: "base", label: "Điểm gốc", type: "readonly", value: "100" },
    { key: "records", label: "Ghi nhận đã duyệt", type: "readonly", value: "Đi muộn −5 · Phát biểu +2" },
    { key: "total", label: "Tổng", type: "readonly", value: "100 − 5 + 2 = 97 (bộ nội quy không đặt trần/sàn)" },
  ] },
  O20: { container: "confirm", screen: "CL08", fields: [], confirm: { object: "10A1 — tuần 5 (05/10–11/10/2026)", consequence: "Công bố cho phụ huynh xem bản kết quả tuần. Chỉ khi đủ quyền và không còn lỗi chặn; bản nháp không rò sang phụ huynh.", label: "Công bố" } },
  O21: { container: "modal", screen: "CL11", fields: [
    { key: "old", label: "Bản đã công bố", type: "readonly", value: "Tuần 4 · Minh Anh = 97 (phiên bản 1)" },
    { key: "kind", label: "Loại điều chỉnh", type: "select", options: ["Bỏ ghi nhận nhầm", "Sửa số điểm", "Thêm ghi nhận bị sót"], required: true },
    reason,
  ], note: "Giữ snapshot cũ; bản điều chỉnh cần duyệt rồi công bố lại." },
  O22: { container: "drawer", screen: "SC30", fields: [
    { key: "group", label: "Nhóm", type: "select", options: ["Nề nếp", "Học tập", "Hoạt động"], required: true },
    { key: "label", label: "Tên quy định", type: "text", required: true }, { key: "points", label: "Điểm (âm hoặc dương)", type: "number", required: true }, from,
  ], note: "Bản đã ban hành không sửa âm thầm; không áp lại quá khứ." },
  O23: { container: "modal", screen: "CL13", fields: [
    { key: "student", label: "Học sinh", type: "readonly", value: "Nguyễn Minh Anh" },
    { key: "group", label: "Tổ", type: "select", options: ["Tổ 1", "Tổ 2", "Tổ 3", "Tổ 4"], required: true },
    { key: "position", label: "Chức vụ", type: "select", options: ["Không", "Lớp trưởng", "Lớp phó học tập", "Tổ trưởng"] }, from,
  ], note: "Chức vụ là dữ liệu học sinh, không tạo tài khoản học sinh." },
  O24: { container: "modal", screen: "CL14", fields: [
    { key: "src", label: "Ghế nguồn", type: "text", required: true, helper: "Ví dụ: Dãy 2 — bàn 3 — ghế trái" },
    { key: "dst", label: "Ghế đích", type: "text", required: true }, from,
  ], note: "Một học sinh chỉ một ghế trong cùng phiên bản; Hủy không thay đổi." },
  O25: { container: "drawer", screen: "CL15", fields: [
    { key: "subject", label: "Môn", type: "select", options: ["Toán", "Ngữ văn", "Vật lý"], required: true },
    { key: "teacher", label: "Giáo viên", type: "readonly", value: "Theo phân công hiện hành" },
    { key: "room", label: "Phòng", type: "text", required: true }, { key: "date", label: "Ngày áp dụng", type: "date", required: true },
  ], note: "Hiện xung đột giáo viên/phòng; không ghi đè lịch quá khứ." },
  O26: { container: "sheet", screen: "CL16", fields: [
    { key: "date", label: "Ngày", type: "date", required: true },
    { key: "group", label: "Tổ / học sinh", type: "select", options: ["Tổ 1", "Tổ 2", "Tổ 3", "Tổ 4"], required: true },
    { key: "task", label: "Nhiệm vụ", type: "text", required: true },
  ], note: "Phụ huynh chỉ thấy nhiệm vụ của con mình." },
  O27: { container: "drawer", screen: "CL20", fields: [
    { key: "student", label: "Học sinh", type: "readonly", value: "Nguyễn Minh Anh" },
    { key: "activity", label: "Hoạt động", type: "select", options: ["Theo danh sách hoạt động của lớp"], required: true },
    { key: "status", label: "Quyết định", type: "select", options: ["Duyệt", "Yêu cầu bổ sung", "Từ chối"], required: true },
    { key: "comment", label: "Nhận xét", type: "textarea" },
  ], note: "Người tải là giáo viên; tệp chỉ lưu cục bộ, có giới hạn loại/dung lượng." },
  O29: { container: "confirm", screen: "CL23", fields: [], confirm: { object: "Thông báo lớp 10A1 — riêng gia đình Minh Anh", consequence: "Công bố tới đúng đối tượng. Thu hồi sau này chỉ dừng lần đọc mới; lịch hẹn chỉ mô phỏng, không có máy chủ chạy nền.", label: "Công bố thông báo" } },
  O31: { container: "confirm", screen: "SC09", fields: [], danger: true, confirm: { object: "Lớp nháp 10A3 (năm 2026–2027)", consequence: "Bản ghi có lịch sử sẽ được lưu trữ thay vì xóa; xóa vĩnh viễn không phải lựa chọn mặc định.", label: "Lưu trữ", reason: true } },
  O34: { container: "modal", screen: "SC42", fields: [
    { key: "school", label: "Trường", type: "readonly", value: "Trường THPT Bình Minh" },
    { key: "scope", label: "Phạm vi hỗ trợ", type: "select", options: ["Cấu hình trường", "Năm học & lớp", "Nhập dữ liệu"], required: true },
    { key: "until", label: "Hạn ủy quyền", type: "date", required: true }, reason,
  ], note: "Trường cho phép; nền tảng không tự cấp quyền đọc hồ sơ học sinh." },
};
