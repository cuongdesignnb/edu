/**
 * SY03 / SY04 — DRAFT legal copy for review by the project owner / legal counsel.
 * Deliberately makes no certification or compliance claims and contains no payment terms.
 */
export interface LegalSection { id: string; title: string; paragraphs: string[]; bullets?: string[] }

export const PRIVACY_SECTIONS: LegalSection[] = [
  { id: "pham-vi", title: "1. Phạm vi của tài liệu", paragraphs: ["Tài liệu này mô tả dự kiến cách EduManage xử lý thông tin trong bản demo giao diện. Bản demo chỉ dùng dữ liệu giả định, chưa có máy chủ thật và chưa xác thực/phân quyền bảo mật thật.", "Nội dung sẽ được hoàn thiện sau khi chủ dự án và bộ phận pháp chế xem xét cùng kiến trúc backend chính thức."] },
  { id: "du-lieu", title: "2. Loại thông tin dự kiến xử lý", paragraphs: ["Khi đưa vào sử dụng thật, hệ thống dự kiến xử lý các nhóm thông tin sau, theo đúng nhu cầu nghiệp vụ của nhà trường:"], bullets: ["Thông tin nhân sự: họ tên, email công việc, số liên hệ công việc, trường và nhiệm vụ được giao.", "Thông tin học sinh do nhà trường quản lý: họ tên, lớp, chuyên cần, thi đua, hoạt động đã ghi nhận.", "Thông tin người giám hộ ở mức cần thiết để cấp đường dẫn tra cứu.", "Nhật ký thao tác để giải trình thay đổi."] },
  { id: "nguyen-tac", title: "3. Nguyên tắc sử dụng", paragraphs: ["Mỗi trường là một không gian riêng; dữ liệu của trường không hiển thị cho trường khác.", "Phụ huynh chỉ xem thông tin đã công bố của con qua đường dẫn riêng có thời hạn, không có tài khoản.", "Tài khoản vận hành nền tảng không mặc định xem hồ sơ học sinh hoặc gia đình; hỗ trợ dữ liệu chỉ diễn ra trong phạm vi và thời hạn nhà trường cho phép."] },
  { id: "chia-se", title: "4. Chia sẻ thông tin", paragraphs: ["Bản demo không gửi dữ liệu tới bên thứ ba, không gửi email hay tin nhắn. Việc tích hợp dịch vụ bên ngoài (nếu có) sẽ được mô tả cụ thể khi được phê duyệt."] },
  { id: "luu-tru", title: "5. Lưu trữ và thời hạn", paragraphs: ["Trong bản demo, dữ liệu chỉ lưu trên trình duyệt của người dùng (IndexedDB) và có thể xóa bằng chức năng đặt lại demo.", "Thời hạn lưu trữ chính thức, quy trình bàn giao khi trường ngừng sử dụng và sao lưu/khôi phục sẽ được xác định ở giai đoạn backend."] },
  { id: "quyen", title: "6. Quyền của người liên quan", paragraphs: ["Người dùng có thể đề nghị nhà trường xem, chỉnh sửa thông tin không chính xác hoặc thu hồi đường dẫn tra cứu. Quy trình tiếp nhận chính thức sẽ được bổ sung sau khi duyệt."] },
  { id: "lien-he", title: "7. Liên hệ", paragraphs: ["Câu hỏi về thông tin của học sinh xin gửi tới nhà trường trước. Câu hỏi về nền tảng gửi tới đầu mối hỗ trợ bên dưới (thông tin mẫu)."] },
];

export const TERMS_SECTIONS: LegalSection[] = [
  { id: "gioi-thieu", title: "1. Giới thiệu", paragraphs: ["Điều kiện sử dụng này là bản nháp cho bản demo giao diện EduManage. Bản demo chỉ để xem trải nghiệm, dùng dữ liệu giả định, không dùng cho dữ liệu học sinh thật."] },
  { id: "tai-khoan", title: "2. Tài khoản nhân sự", paragraphs: ["Nhân sự không tự đăng ký. Nhà trường mời và phân công; nhân sự chịu trách nhiệm dùng quyền đúng nhiệm vụ được giao.", "Phụ huynh không có tài khoản; đường dẫn tra cứu do nhà trường cấp và có thể bị thu hồi."] },
  { id: "su-dung", title: "3. Sử dụng hợp lệ", paragraphs: ["Người dùng không được cố truy cập dữ liệu ngoài phạm vi được giao, chia sẻ đường dẫn tra cứu cho người không liên quan, hoặc nhập dữ liệu cá nhân nhạy cảm không cần thiết cho nghiệp vụ."] },
  { id: "noi-dung", title: "4. Nội dung do nhà trường tạo", paragraphs: ["Thông báo, ghi nhận thi đua, minh chứng và tài liệu do nhà trường tạo thuộc trách nhiệm quản lý của nhà trường. Chỉ nội dung đã công bố mới hiển thị với phụ huynh."] },
  { id: "tam-dung", title: "5. Tạm dừng và ngừng sử dụng", paragraphs: ["Nền tảng có thể tạm dừng không gian của một trường vì lý do vận hành theo quy trình đã thỏa thuận. Tạm dừng không xóa dữ liệu. Quy trình bàn giao dữ liệu khi ngừng sử dụng sẽ được quy định riêng."] },
  { id: "gioi-han", title: "6. Giới hạn của bản demo", paragraphs: ["Bản demo không có backend, không có xác thực thật, không có sao lưu máy chủ và không cam kết tính sẵn sàng. Không dùng bản demo cho hoạt động thật của nhà trường."] },
  { id: "thay-doi", title: "7. Thay đổi điều kiện", paragraphs: ["Nội dung sẽ được cập nhật sau khi chủ dự án và bộ phận pháp chế thẩm định. Phiên bản chính thức sẽ ghi rõ ngày hiệu lực."] },
];
