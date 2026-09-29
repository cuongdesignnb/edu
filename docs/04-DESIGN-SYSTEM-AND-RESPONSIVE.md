# Hệ thống thiết kế và responsive

Các thông số dưới đây là điểm xuất phát đề xuất để hiện thực hóa ảnh, không phải kích thước đo chính xác từ file Figma. Agent đối chiếu ảnh rồi tinh chỉnh bằng tokens dùng chung, không vá mỗi trang một kiểu.

## 1. Tokens nền tảng

| Nhóm | Đề xuất |
|---|---|
| Font chính | Be Vietnam Pro có đủ bộ ký tự tiếng Việt; 400/500/600/700/800. Cài/local-host từ nguồn có giấy phép phù hợp; không phụ thuộc CDN mỗi lần mở. |
| Font dự phòng | system-ui, Segoe UI, sans-serif; không dùng monospace cho nội dung nghiệp vụ. |
| Primary | `#087CFA`; hover `#0668DC`; light `#E8F3FF`. |
| Chữ | Tiêu đề `#10234A`; body `#344D72`; muted `#667C9D`. |
| Nền | App `#F4F8FD`; surface `#FFFFFF`; sidebar `#EEF6FF`; border `#E2ECF7`. |
| Màu nghiệp vụ | Success xanh ngọc; warning vàng/cam; danger đỏ; hoạt động tím. Màu nhạt cho nền badge, chữ đủ tương phản. |
| Spacing | Thang 4/8/12/16/20/24/32/40; không đặt margin ngẫu nhiên 37/53 cho từng trang. |
| Radius | Input/button 8–10 px; card/panel 12–16 px; chip 999 px. |
| Shadow | Mềm và mảnh; ưu tiên border thay bóng đậm. |
| Sidebar | 252–272 px desktop; thu gọn 76 px; mobile drawer. |
| Topbar | Khoảng 68 px desktop, 60 px mobile; context không bị cắt. |
| Nội dung | Padding 24 px desktop, 16 px tablet, 12–16 px mobile; gap 16–24 px. |
| Page title | 28–32 px desktop, 22–24 px mobile; line-height 1.2–1.35. |
| Body/table | Body 14–16 px; bảng desktop 13–14 px; parent mobile 15–16 px. Không thu chữ xuống 10 px để ép vừa bảng. |
| Form | Chiều cao control 40–44 px desktop, ít nhất 44 px touch; có label luôn nhìn thấy. |
| Icon | Dùng cùng bộ SVG icon, stroke/size thống nhất 18–22 px; không emoji. |

Dùng `--color-*`, `--space-*`, `--radius-*` hoặc token theme tương đương. Component không chứa các bản sao khác nhau của cùng giá trị. Chữ viết tay trang trí có thể thay bằng italic phù hợp nếu chưa có font tiếng Việt đúng; không làm lỗi dấu chỉ để giống một khẩu hiệu.

## 2. Bố cục theo vai trò

### PlatformShell

Sidebar: Tổng quan, Trường học, Quản trị trường, Hỗ trợ, Vận hành, Nhật ký, Cấu hình. Không lẫn các menu điểm học sinh, phụ huynh toàn hệ thống hoặc thanh toán. Bảng nhiều trường là trọng tâm.

### SchoolShell

Sidebar: Tổng quan, Năm học & lớp, Giáo viên & phân công, Học sinh & gia đình, Nội quy, Lịch, Thông báo & công bố, Báo cáo, Quyền tra cứu, Cài đặt. Menu dài nhóm theo công việc, có collapsible group. BGH/Giáo vụ nhận phần menu theo quyền.

### TeacherShell + ClassWorkspace

Menu toàn cục gọn: Việc cần làm, Lớp học của tôi, Lịch dạy, Thông báo, Báo cáo. Khi vào lớp, có header trường/năm/lớp và điều hướng nghiệp vụ của lớp. Không lặp menu quản trị toàn trường. GVCN và GVBM cùng component nhưng khác actions/field theo scope.

### ParentShell

Không account dropdown, không nút đăng ký/đăng nhập, không chọn trường/học sinh tùy ý, không nút chat/nộp bài. Trên desktop có menu phụ gọn; trên mobile dùng thanh đáy Tổng quan/Lịch/Chuyên cần/Thêm và menu phần còn lại. Không nhét mọi mục vào thanh 7–8 nút.

## 3. Bảng quy tắc responsive

| Chiều rộng | Hành vi |
|---|---|
| 1448 / 1536 | Sidebar mở, layout theo ảnh; 3–4 KPI cùng hàng; bảng và panel phụ 2 cột khi đủ chỗ. |
| 1024 | Sidebar có thể thu gọn; bỏ phần trang trí dư; form/detail vẫn đủ nhãn. |
| 768 | Sidebar drawer; cards 2 cột; bảng chỉ scroll trong container cần thiết. |
| 390 / 375 / 360 | Một cột; parent/read-only dễ đọc; giáo viên điểm danh bằng cards; action theo ngữ cảnh; không tràn body. |

Bảng roster/báo cáo desktop có scroll ngang được chỉ dẫn hoặc chuyển sang card với phần chi tiết. Timetable chuyển grid tuần thành agenda ngày, không co nguyên bảng bảy cột vào màn hình nhỏ. Permission matrix chia theo scope và accordion. Drawer form trên điện thoại chuyển full-screen khi dài. Sticky footer luôn có khoảng đệm cho nội dung cuối và bàn phím.

Sơ đồ ghế có container cuộn/zoom nội bộ, nút zoom fit, danh sách thay thế và thao tác “Chọn học sinh → Chọn ghế”. Không bắt người dùng phải kéo thả chính xác trên điện thoại.

## 4. Hệ thống tương tác

- Hover/focus 120–180 ms; drawer/modal 180–240 ms; không parallax/animation liên tục trong bảng tác nghiệp.
- Tôn trọng `prefers-reduced-motion`; không đẩy nội dung nhảy khi tải dữ liệu.
- Mọi button/icon có tên đọc được; focus-visible rõ; modal giữ focus, trả focus khi đóng.
- Trạng thái không chỉ là chấm màu: luôn có “Nháp”, “Đã chốt”, “Đã công bố”, “Chưa điểm danh”…
- Thiết kế với độ tương phản chữ thông thường mục tiêu tối thiểu 4.5:1; nếu màu trong ảnh quá nhạt thì điều chỉnh token, ghi rõ sai khác.
- Không dấu bị vỡ, ký tự thay thế `�`, chuỗi mojibake, text chồng hoặc cắt mất dấu tiếng Việt.
- Dữ liệu bảng dùng số căn chỉnh, tên đủ đọc; tooltip chỉ hỗ trợ không thay nội dung quan trọng.

## 5. Màn hình tham chiếu phải đối chiếu kỹ

R01 → platform tổng quan; R02 → school tổng quan; R03 → năm học/lớp và drawer tạo lớp; R04 → giáo viên + drawer quyền; R05 → lớp học của tôi; R06 → danh sách học sinh lớp + sơ đồ preview; R07 → hồ sơ + quyền link; R08 → điểm danh/thi đua theo tab; R09 → hoạt động/minh chứng/thông báo; R10 → parent desktop + responsive.

Ở các màn hình này, không bỏ banner/illustration/card chỉ để hoàn thành nhanh. Được đổi những chi tiết đã nêu ở tài liệu corrections, nhưng phải giữ cùng ngôn ngữ thẩm mỹ. Các trang nghiệp vụ phát sinh không bắt buộc lặp lại banner lớn; ưu tiên hiệu quả sử dụng.
