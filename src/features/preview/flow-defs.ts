/**
 * F01–F12 walkthrough definitions (docs/05-MOCK-DATA-AND-FLOWS.md §5). Steps point at
 * registry screen IDs (URL resolved with fixture ids) or explicit fixture routes.
 * This is lab content (instructions), not product data.
 */
import { registryById, type Persona } from "@/lib/routing/registry";
import { PARENT_LINKS, accessHref } from "./open";

export interface FlowStep { text: string; persona: Persona; href: string; screenId?: string; expect: string; newTab?: boolean }
export interface FlowDef { id: string; title: string; goal: string; personas: string[]; expected: string; steps: FlowStep[]; highlight?: boolean }

const staff = (userId: string): Persona => ({ kind: "staff", userId });
const platform: Persona = { kind: "platform", userId: "u-bao" };
const parentOf = (k: keyof typeof PARENT_LINKS): Persona => ({ kind: "parent", slug: PARENT_LINKS[k].slug, token: PARENT_LINKS[k].token });
const S = "/school/demo-school-a";
const C = (cls = "c-a-10a1") => `/classroom/demo-school-a/y-a-2026/${cls}`;

function scr(id: string, persona: Persona, text: string, expect: string): FlowStep {
  const e = registryById(id);
  return { text, persona, href: e?.href ?? "/", screenId: id, expect };
}
function link(k: keyof typeof PARENT_LINKS, text: string, expect: string): FlowStep {
  return { text, persona: parentOf(k), href: accessHref(PARENT_LINKS[k].slug, PARENT_LINKS[k].token), expect, newTab: true };
}
function parentPage(k: keyof typeof PARENT_LINKS, path: string, text: string, expect: string, screenId?: string): FlowStep {
  return { text, persona: parentOf(k), href: `/p/${PARENT_LINKS[k].slug}${path}`, expect, newTab: true, screenId };
}
function route(href: string, persona: Persona, text: string, expect: string, screenId?: string): FlowStep {
  return { text, persona, href, expect, screenId };
}

export const FLOWS: FlowDef[] = [
  {
    id: "F01", title: "Một trường bắt đầu sử dụng", goal: "Từ tạo trường đến lớp đủ điều kiện hoạt động.",
    personas: ["Vận hành nền tảng (u-bao)", "Quản trị trường A (u-hanh)"],
    expected: "Lớp đủ phân công chuyển hoạt động; lớp khác thiếu phân công hiện cảnh báo, không bị lấp bằng dữ liệu giả ngoài fixture.",
    steps: [
      scr("PL03", platform, "Tạo trường mới (nháp).", "Trường mới ở trạng thái nháp trong danh sách trường."),
      scr("PL05", platform, "Mời quản trị trường (email demo, không gửi thật).", "Lời mời có thời hạn; không mất quản trị cuối."),
      scr("SC04", staff("u-hanh"), "Thiết lập năm học, học kỳ, tuần.", "Năm học mới có kỳ/tuần hợp lệ, không chồng kỳ."),
      scr("SC09", staff("u-hanh"), "Tạo lớp và xem trạng thái lớp.", "Lớp nháp 10A3/12A1 hiện cảnh báo thiếu phân công."),
      scr("SC12", staff("u-hanh"), "Gán giáo viên chủ nhiệm / bộ môn.", "Ma trận phân công cập nhật; kiểm trùng chủ nhiệm chính."),
      scr("SC27", staff("u-hanh"), "Nhập danh sách học sinh từ file giả.", "Có bước ánh xạ cột, báo lỗi dòng, xem trước trước khi xác nhận."),
    ],
  },
  {
    id: "F02", title: "Giáo viên có hai nhiệm vụ khác nhau", goal: "Quyền theo nhiệm vụ × lớp/môn, không theo tên vai trò.",
    personas: ["Cô Lan (u-lan) — GVCN 10A1, Ngữ văn 10A2"],
    expected: "10A1 đủ quyền chủ nhiệm; 10A2 chỉ phần Ngữ văn. Mở trực tiếp route sửa giám hộ bị repository từ chối (không chỉ ẩn nút).",
    steps: [
      scr("TE02", staff("u-lan"), "Xem “Lớp học của tôi”.", "Hai thẻ lớp: 10A1 (Chủ nhiệm) và 10A2 (Ngữ văn)."),
      route(C(), staff("u-lan"), "Vào lớp 10A1.", "Đủ tab chủ nhiệm: điểm danh, thi đua, sơ đồ, giám hộ theo quyền.", "CL01"),
      route(C("c-a-10a2"), staff("u-lan"), "Vào lớp 10A2.", "Chỉ phần việc Ngữ văn; không có sơ đồ, chốt thi đua, giám hộ.", "CL01"),
      route(`${S}/guardians/gd-2`, staff("u-lan"), "Mở trực tiếp route sửa người giám hộ.", "Màn hình “Không có quyền” — dữ liệu không được trả về.", "SC22"),
    ],
  },
  {
    id: "F03", title: "Một tuần từ nhập đến phụ huynh xem", goal: "Ghi nhận → rà soát → chốt/công bố → phụ huynh xem.", highlight: true,
    personas: ["Cô Lan (u-lan)", "Phụ huynh — link của mẹ Minh Anh"],
    expected: "Minh Anh: 100 − 5 (đi muộn) + 2 (phát biểu) = 97 ở tuần đã công bố. Trước khi công bố, phụ huynh không thấy bản nháp tuần hiện tại.",
    steps: [
      scr("CL06", staff("u-lan"), "Ghi nhận đi muộn −5 và phát biểu +2 cho Minh Anh.", "Ghi nhận ở trạng thái chờ rà soát, thuộc tuần 5 đang mở."),
      scr("CL07", staff("u-lan"), "Xem tổng hợp tuần.", "Bảng giải trình phép tính: điểm gốc, từng ghi nhận, tổng."),
      scr("CL08", staff("u-lan"), "Rà soát và chốt tuần (công bố nếu đủ quyền).", "Tách “Đã chốt, chưa công bố” và “Đã công bố”."),
      parentPage("me", "/conduct", "Mở trang thi đua phụ huynh (tab mới).", "Tuần 4 đã công bố = 97; tuần 5 chưa công bố không hiện 0 điểm.", "PA04"),
    ],
  },
  {
    id: "F04", title: "Chốt và công bố là hai trạng thái khác nhau", goal: "Người chỉ được chốt không làm lộ kết quả cho phụ huynh.", highlight: true,
    personas: ["Cô Lan (u-lan)", "BGH A (u-dung)", "Phụ huynh"],
    expected: "Chốt tạo “Đã chốt, chưa công bố”; chỉ người có quyền công bố mới làm phụ huynh thấy. Nút gộp chỉ khi đủ hai quyền và không còn lỗi chặn.",
    steps: [
      scr("CL08", staff("u-lan"), "Chốt tuần hiện tại.", "Trạng thái tuần: Đã chốt, chưa công bố."),
      parentPage("me", "/conduct", "Kiểm tra phía phụ huynh.", "Phụ huynh vẫn chỉ thấy bản đã công bố trước đó.", "PA04"),
      scr("SC36", staff("u-dung"), "BGH công bố ở Trung tâm rà soát và công bố.", "Trạng thái chuyển Đã công bố, có phiên bản và thời điểm."),
      parentPage("me", "/conduct", "Tải lại trang phụ huynh.", "Kết quả tuần vừa công bố hiện cho phụ huynh.", "PA04"),
    ],
  },
  {
    id: "F05", title: "Điều chỉnh kết quả đã công bố", goal: "Bỏ ghi nhận nhầm −5 mà không ghi đè bản cũ.", highlight: true,
    personas: ["Cô Lan (u-lan)", "BGH A (u-dung)", "Phụ huynh"],
    expected: "Bản 97 giữ nguyên → đề nghị bỏ −5 có lý do → duyệt → bản mới 102 (fixture không đặt trần) → công bố bản mới. Snapshot cũ không bị ghi đè.",
    steps: [
      scr("CL10", staff("u-lan"), "Xem bản công bố tuần 4.", "Minh Anh = 97, phiên bản 1."),
      scr("CL11", staff("u-lan"), "Xem/tạo đề nghị điều chỉnh (adj-1 đang chờ duyệt).", "Đề nghị bỏ ghi nhận −5, có lý do."),
      scr("CL11", staff("u-dung"), "BGH duyệt và công bố bản điều chỉnh.", "Bản mới 102; bản 97 đánh dấu “Đã thay bằng bản mới”."),
      scr("CL09", staff("u-lan"), "Xem lịch sử công bố.", "Cả hai phiên bản còn trong lịch sử."),
      parentPage("me", "/conduct/y-a-2026-w4", "Phụ huynh xem chi tiết tuần 4.", "Hiện 102 (bản điều chỉnh đã công bố).", "PA05"),
    ],
  },
  {
    id: "F06", title: "Cấp / thu hồi link không có tài khoản phụ huynh", goal: "Mỗi giám hộ một link riêng; thu hồi chặn lần đọc mới.", highlight: true,
    personas: ["Quản trị trường A (u-hanh)", "Link mẹ và link bố Minh Anh"],
    expected: "Mở link mẹ không cần đăng nhập → thu hồi → đọc/tải mới bị chặn. Link của bố vẫn hoạt động độc lập. Nhật ký chỉ ghi “Link cấp cho … được mở”.",
    steps: [
      scr("SC22", staff("u-hanh"), "Xác minh quan hệ giám hộ.", "Quan hệ Đã xác minh; quyền nhận thông tin tách khỏi số điện thoại."),
      scr("SC23", staff("u-hanh"), "Xem danh sách quyền tra cứu; cấp link cho mẹ.", "Mỗi dòng: một học sinh × một trường × một năm."),
      scr("SC24", staff("u-hanh"), "Chi tiết link của mẹ: sao chép / QR.", "QR mã hóa đúng link demo; có nhật ký mở link."),
      link("me", "Mở link của mẹ (tab mới).", "Vào trang thông tin của con, không có đăng nhập."),
      scr("SC24", staff("u-hanh"), "Thu hồi link của mẹ (xác nhận + lý do).", "Link chuyển Đã thu hồi."),
      link("me", "Mở lại link của mẹ.", "Trang “Link không sử dụng được”, không lộ thông tin học sinh."),
      link("bo", "Mở link của bố.", "Vẫn hoạt động bình thường."),
    ],
  },
  {
    id: "F07", title: "Điểm danh không đếm trùng thi đua", goal: "Một sự việc đi muộn chỉ trừ điểm một lần.",
    personas: ["Cô Lan (u-lan)"],
    expected: "Ghi đi muộn từ điểm danh → nhập lại từ thi đua báo trùng, không tạo thêm −5. Chưa điểm danh không tự tính có mặt; điểm danh hàng loạt cần xác nhận.",
    steps: [
      scr("CL04", staff("u-lan"), "Điểm danh buổi sáng 10A1, đánh dấu đi muộn.", "Tổng khớp sĩ số 42 (38/2/1/1); “Chưa điểm danh” tách riêng."),
      scr("CL06", staff("u-lan"), "Ghi nhận “Đi muộn” thủ công cho cùng học sinh, cùng ngày.", "Hộp thoại xử lý trùng (O18), không tạo bản ghi thứ hai."),
    ],
  },
  {
    id: "F08", title: "Chuyển lớp và bàn giao chủ nhiệm", goal: "Lịch sử đúng thời gian, quyền người cũ bị thu hồi.",
    personas: ["Giáo vụ A (u-quan)", "Quản trị trường A (u-hanh)"],
    expected: "Chuyển lớp có ngày hiệu lực, báo cáo cũ giữ lớp cũ; bàn giao GVCN giữ tác giả record lịch sử nhưng thu hồi quyền thao tác tiếp của người cũ.",
    steps: [
      scr("SC20", staff("u-quan"), "Tạo yêu cầu chuyển lớp với ngày hiệu lực.", "Xem trước lớp cũ/mới trước khi xác nhận."),
      scr("SC15", staff("u-hanh"), "Bàn giao giáo viên chủ nhiệm.", "Ngày hiệu lực và preview thay đổi quyền."),
      scr("CL02", staff("u-lan"), "Kiểm tra roster lớp.", "Học sinh đã chuyển hiện đúng theo ngày."),
    ],
  },
  {
    id: "F09", title: "Import có lỗi", goal: "Không ghi đè âm thầm, báo dòng lỗi rõ.",
    personas: ["Giáo vụ A (u-quan)"],
    expected: "Chọn CSV/XLSX cục bộ → ánh xạ cột → báo dòng lỗi/trùng → xem trước → xác nhận phần hợp lệ → kết quả và file lỗi. Hai người trùng tên không tự gộp.",
    steps: [
      scr("SC27", staff("u-quan"), "Nhập danh sách bằng file cục bộ.", "Các bước file → ánh xạ → kiểm tra → xem trước."),
      scr("SC28", staff("u-quan"), "Xem kết quả lượt nhập mẫu.", "Số dòng thành công/lỗi, tải file lỗi."),
    ],
  },
  {
    id: "F10", title: "Hoạt động và minh chứng", goal: "Giáo viên ghi nhận minh chứng; phụ huynh chỉ đọc.",
    personas: ["Cô Lan (u-lan)", "Phụ huynh"],
    expected: "Giao hoạt động → ghi nhận tệp nhận từ bên ngoài → duyệt/yêu cầu bổ sung → công bố tình trạng. Phụ huynh không upload, không tự cộng điểm.",
    steps: [
      scr("CL18", staff("u-lan"), "Tạo hoạt động cho lớp.", "Mẫu số tiến độ = số học sinh được giao."),
      scr("CL19", staff("u-lan"), "Chi tiết hoạt động: ghi nhận minh chứng.", "Người tải là giáo viên; tệp chỉ lưu cục bộ."),
      scr("CL20", staff("u-lan"), "Duyệt / yêu cầu bổ sung minh chứng.", "Từ chối/yêu cầu bổ sung bắt buộc có lý do."),
      parentPage("me", "/activities", "Phụ huynh xem hoạt động của con.", "Chỉ tệp đã chia sẻ của chính con; không có nút tải lên.", "PA08"),
    ],
  },
  {
    id: "F11", title: "Lịch và thông báo riêng tư", goal: "Đổi tiết có hiệu lực; tin riêng chỉ đúng gia đình nhận.",
    personas: ["Cô Lan (u-lan)", "Link mẹ Minh Anh", "Link gia đình trường B"],
    expected: "Đổi tiết phát hiện trùng giáo viên/phòng; thông báo riêng cho Minh Anh không hiện ở gia đình khác; thu hồi tin dừng lần đọc mới.",
    steps: [
      scr("CL15", staff("u-lan"), "Xem/đổi tiết trong lịch lớp.", "Cảnh báo trùng giáo viên/phòng, có ngày áp dụng."),
      scr("CL22", staff("u-lan"), "Soạn thông báo riêng cho Minh Anh.", "Phạm vi người nhận hiển thị rõ."),
      parentPage("me", "/announcements", "Phụ huynh Minh Anh xem thông báo.", "Có tin dành riêng cho gia đình.", "PA10"),
      link("anhoa", "Mở link gia đình khác (trường B).", "Không có tin riêng của Minh Anh."),
    ],
  },
  {
    id: "F12", title: "Lỗi, xung đột và khôi phục giao diện", goal: "Không thành công giả, không ghi đè âm thầm.",
    personas: ["Bất kỳ nhân sự", "Người duyệt demo"],
    expected: "Lỗi mạng khi lưu: giữ bản nháp, không báo thành công, thử lại không nhân đôi. Xung đột phiên bản: hiện bản mới, yêu cầu xác nhận. Đổi vai trò/đổi trường không rò ngữ cảnh cũ.",
    steps: [
      route("/preview/states", staff("u-lan"), "Chọn kịch bản “Lần lưu kế tiếp lỗi mạng” rồi lưu biểu mẫu mẫu.", "Toast lỗi, nội dung vẫn còn, không có thông báo thành công.", "DV06"),
      route("/preview/states", staff("u-lan"), "Chọn “Xung đột phiên bản” rồi lưu.", "Hộp thoại Dữ liệu đã thay đổi (ST20/O33).", "DV06"),
      scr("AU06", staff("u-lan"), "Thử lại trên màn hình hồ sơ cá nhân.", "Lưu thành công một lần, không nhân đôi."),
      route("/demo", { kind: "public" }, "Đổi vai trò ở trang demo.", "Bộ nhớ đệm xóa, không còn dữ liệu của vai trò cũ.", "DV01"),
    ],
  },
];
