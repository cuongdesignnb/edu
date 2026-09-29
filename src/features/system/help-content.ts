/**
 * AU10 — help centre content. This is product documentation (static copy), not sample data.
 * Sections map to the four areas of the product plus the publication process.
 */
export interface HelpArticle { id: string; title: string; paragraphs: string[]; steps?: string[] }
export interface HelpSection { id: string; title: string; intro: string; audience: string; image: string; articles: HelpArticle[] }

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "nen-tang", title: "Nền tảng", audience: "Chủ nền tảng / vận hành", image: "role-platform",
    intro: "Mở không gian cho từng trường, chỉ định quản trị đầu tiên, theo dõi vận hành và hỗ trợ khi nhà trường cho phép.",
    articles: [
      { id: "tao-truong", title: "Tạo trường mới", paragraphs: ["Tạo trường qua trình hướng dẫn gồm bốn bước: thông tin trường, quản trị đầu tiên, kiểm tra và hoàn tất. Trường mới luôn ở trạng thái “Chờ kích hoạt”."], steps: ["Nhập tên, mã trường và đường dẫn công khai (không trùng).", "Nhập họ tên và email của quản trị đầu tiên; hệ thống tạo lời mời demo, không gửi email.", "Kiểm tra lại và lưu. Có thể lưu nháp ở bất kỳ bước nào.", "Kích hoạt trường khi quản trị đầu tiên đã chấp nhận lời mời."] },
      { id: "tam-dung", title: "Tạm dừng, kích hoạt, lưu trữ", paragraphs: ["Tạm dừng là quyết định vận hành, không liên quan thanh toán và không xóa dữ liệu. Khi tạm dừng, thao tác nghiệp vụ và link phụ huynh của trường bị chặn.", "Mọi thay đổi trạng thái cần ghi lý do và được lưu trong nhật ký nền tảng."] },
      { id: "ho-tro", title: "Hỗ trợ dữ liệu có phạm vi", paragraphs: ["Tài khoản vận hành không mặc định xem hồ sơ học sinh hay gia đình. Khi cần hỗ trợ, nền tảng gửi đề nghị với phạm vi, lý do và thời hạn; nhà trường là bên cho phép hoặc từ chối.", "Không có chức năng đăng nhập thay giáo viên. Mọi truy cập hỗ trợ được ghi lại."] },
    ],
  },
  {
    id: "nha-truong", title: "Nhà trường", audience: "Quản trị trường, ban giám hiệu, giáo vụ", image: "role-school",
    intro: "Tổ chức năm học, lớp, giáo viên và học sinh; giao đúng người, đúng lớp, đúng môn; quyết định chính sách công bố.",
    articles: [
      { id: "moi-nhan-su", title: "Mời nhân sự và phân công", paragraphs: ["Nhân sự không tự đăng ký. Quản trị trường gửi lời mời; người được mời chấp nhận qua đường dẫn. Nếu người đó đã có danh tính EduManage ở trường khác, chấp nhận chỉ thêm thành viên ở trường mới.", "Quyền làm việc đến từ phân công: chủ nhiệm lớp, môn dạy ở lớp nào, trong thời gian hiệu lực nào. Chủ nhiệm một lớp không tự có quyền quản lý lớp khác nơi chỉ dạy bộ môn."] },
      { id: "thu-hoi", title: "Tạm khóa, thu hồi và bàn giao", paragraphs: ["Tạm khóa hoặc thu hồi thành viên chặn các lần mở mới ngay lập tức. Dữ liệu đã ghi vẫn thuộc nhà trường.", "Khi đổi giáo viên chủ nhiệm giữa năm, dùng bàn giao để giữ lịch sử và chuyển việc đang dở."] },
      { id: "cho-phep-ho-tro", title: "Cho phép hoặc thu hồi hỗ trợ", paragraphs: ["Đề nghị hỗ trợ từ nền tảng xuất hiện trong mục Hỗ trợ của trường. Chỉ cho phép phạm vi cần thiết, trong thời hạn ngắn, và có thể thu hồi bất kỳ lúc nào."] },
    ],
  },
  {
    id: "giao-vien", title: "Giáo viên", audience: "Giáo viên chủ nhiệm, giáo viên bộ môn", image: "role-teacher",
    intro: "Làm việc hằng ngày trong đúng lớp/môn được giao: điểm danh, ghi nhận thi đua, hoạt động, thông báo lớp.",
    articles: [
      { id: "chon-khong-gian", title: "Chọn không gian làm việc", paragraphs: ["Sau khi đăng nhập, nếu bạn làm việc ở nhiều trường hoặc vừa quản lý vừa dạy, hãy chọn “Quản lý nhà trường” hoặc “Lớp học của tôi” cho đúng trường.", "Trường tạm dừng hoặc thành viên bị tạm khóa sẽ hiển thị bị khóa kèm lời giải thích."] },
      { id: "quyen-theo-lop", title: "Quyền theo lớp và môn", paragraphs: ["Ở lớp chủ nhiệm, bạn quản lý hồ sơ, giám hộ, link tra cứu và chốt tuần theo chính sách trường. Ở lớp chỉ dạy bộ môn, bạn chỉ thấy phần liên quan đến môn của mình.", "Khi phân công kết thúc, lớp tự biến khỏi danh sách “Lớp học của tôi”."] },
    ],
  },
  {
    id: "phu-huynh", title: "Phụ huynh", audience: "Cha mẹ, người giám hộ", image: "role-parent",
    intro: "Xem thông tin đã công bố của con qua đường dẫn riêng do nhà trường cấp. Không cần tài khoản, không đăng nhập.",
    articles: [
      { id: "link-tra-cuu", title: "Đường dẫn tra cứu", paragraphs: ["Mỗi đường dẫn gắn với một học sinh, một người giám hộ và có thời hạn. Nhà trường có thể thu hồi đường dẫn; các lần mở mới sẽ bị chặn.", "Phụ huynh chỉ xem thông tin đã công bố và các mục được nhà trường chia sẻ. Không có chat, không gửi đơn, không tải lên tệp."] },
      { id: "trang-cong-khai", title: "Trang công khai của trường", paragraphs: ["Trang công khai chỉ gồm thông tin liên hệ chính thức và tin công khai. Trang này không có công cụ chọn học sinh để tra cứu."] },
    ],
  },
  {
    id: "quy-trinh-cong-bo", title: "Quy trình công bố", audience: "Mọi nhân sự", image: "role-school",
    intro: "Ba trạng thái khác nhau: Đã lưu, Đã chốt, Đã công bố. Phụ huynh chỉ thấy bản đã công bố.",
    articles: [
      { id: "luu-chot-cong-bo", title: "Lưu ≠ chốt ≠ công bố", paragraphs: ["Đã lưu: dữ liệu được ghi lại nhưng vẫn có thể sửa; phụ huynh không thấy.", "Đã chốt: kỳ (ví dụ một tuần thi đua) được khóa thành bản chụp; mọi thay đổi sau đó phải đi qua đề nghị điều chỉnh.", "Đã công bố: bản chốt được đưa tới phụ huynh qua link tra cứu. Công bố lại sau điều chỉnh tạo phiên bản mới, không âm thầm sửa bản cũ."], steps: ["Giáo viên ghi nhận và lưu trong tuần.", "Chủ nhiệm rà soát rồi chốt tuần (theo chính sách của trường).", "Người được giao quyền công bố xác nhận công bố.", "Nếu cần sửa sau chốt: tạo điều chỉnh, được duyệt, rồi công bố lại."] },
      { id: "chinh-sach", title: "Ai được chốt, ai được công bố", paragraphs: ["Mỗi trường tự quy định trong “Quy trình chốt, công bố”: có trường cho chủ nhiệm tự công bố, có trường yêu cầu lãnh đạo duyệt. Nút chỉ hiện khi bạn có quyền tương ứng."] },
    ],
  },
];
