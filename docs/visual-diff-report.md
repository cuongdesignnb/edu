# Báo cáo đối chiếu thị giác R01–R10

Viewport đối chiếu 1448×1086, DemoClock 05/10/2026 08:00, dữ liệu seed cố định, `reducedMotion: reduce`. Ảnh chụp thật bằng Microsoft Edge (Playwright, `scripts/shot.mjs` và script QA từng nhóm), lưu trong `qa/screenshots/`. Đối chiếu bằng mắt từng cặp ảnh (tham chiếu ↔ ảnh chụp) theo thứ tự: shell → chữ → lưới/khoảng cách → thẻ/bảng → minh họa → tương tác. **Không đo pixel**; không tuyên bố “giống 100%”.

## Điều chỉnh chung so với ảnh (có chủ đích)

| Nội dung | Lý do |
|---|---|
| `--color-muted` #5C7091 (ảnh ~#667C9D), primary nút #0A72E6 (ảnh ~#087CFA) | Đạt tương phản chữ ≥ 4.5:1 (docs/04 §4) |
| Avatar là chữ viết tắt, không ảnh người | Không dùng ảnh người thật/AI-portrait làm dữ liệu (docs/03, AGENT §8) |
| Chữ viết tay trong ảnh → italic Be Vietnam Pro | Font tiếng Việt đủ dấu, host cục bộ (@fontsource) |
| Thanh “Bản demo” màu xanh đậm ở đầu mọi trang | Bắt buộc phân biệt prototype (C047) |
| Minh họa: trích phần trang trí thuần từ ảnh gốc (20 ảnh trong `public/assets/illustrations`, script `scripts/crop-illustrations.py`) | Không cắt thẻ có chữ/số; UI là HTML/component |
| Số liệu, tên, năm học | Luôn lấy từ seed 2026–2027; không chép số mâu thuẫn trong ảnh |

## Từng màn hình

| Mã | Route | Ảnh chụp | Đã bám | Ngoại lệ nghiệp vụ | Sai khác thị giác còn lại |
|---|---|---|---|---|---|
| R01 | `/platform` (u-bao) | `PL01-desktop.png`, `PL01-mobile.png` | Sidebar trái xanh nhạt + thẻ minh họa, topbar tìm kiếm/chuông/người dùng, tiêu đề + trích dẫn + minh họa trường, 4 KPI, dải 4 vai trò có minh họa, bảng trường (lọc/tìm/thêm/phân trang/menu dòng), “Hoạt động gần đây” | KPI 4 “Phụ huynh đang truy cập” → “Lượt mở link tra cứu” (không tài khoản phụ huynh); bỏ tăng trưởng % vì không có cơ sở so sánh; 8 trường giả định thay 128; bỏ “cập nhật Zalo”; thẻ “Nền tảng phát triển ổn định” → “Yêu cầu hỗ trợ đang mở” | Menu “Người dùng” của ảnh không có (platform không quản lý người dùng trường); cột Địa chỉ gộp vào dòng phụ tên trường |
| R02 | `/school/demo-school-a` (u-hanh) | `SC01-desktop.png` | Bố cục đầy đủ: thanh Nhà trường 🔒/Năm học, 4 KPI, Thao tác nhanh 4 thẻ pastel, Lớp cần xử lý, donut Tiến độ khởi tạo (tính từ dữ liệu), Thông báo gần đây, banner học sinh | “Phụ huynh đang xem” → “Link tra cứu hiệu lực/đã mở”; “Lịch công việc hôm nay” (giờ họp giả) → “Việc cần xử lý hôm nay” từ dữ liệu thật | Sidebar dùng nhóm thu gọn theo docs/04 thay danh sách phẳng của ảnh |
| R03 | `/school/demo-school-a/academic-years/y-a-2026` + drawer | `SC05-desktop.png`, `SC05-drawer-desktop.png`, `SC05-drawer-mobile.png` | Stepper 5 bước (theo độ hoàn thiện thật), thẻ năm học + nút, “Thông tin học kỳ” với mốc tuần, bảng lớp nhóm theo khối, drawer “Tạo lớp mới” | Năm học 2026–2027, HK1 07/09/2026; GVCN tùy chọn — lớp giữ Nháp nếu chưa có | Phần trích dẫn bị drawer che khi mở (giống ảnh) |
| R04 | `/school/demo-school-a/teachers` | `SC10-desktop.png`, `SC10-panel-mobile.png` | KPI, bảng giáo viên, bộ lọc, panel phải “Chi tiết phân quyền” có tab Phân quyền/Thông tin/Lịch sử, lời mời chờ, nhật ký | Quyền hiển thị nhãn tiếng Việt theo phạm vi Toàn trường/Theo lớp/Theo môn (không mã `attendance.record`, không công tắc giả chỉnh quyền) | 4 KPI trải toàn chiều rộng (ảnh: 3 KPI bên trái panel) |
| R05 | `/teacher/demo-school-a` (u-lan) | `TE01-desktop.png` | Thẻ lớp 10A1/10A2 có minh họa + khẩu hiệu, KPI, Việc cần làm hôm nay có nút, Hoạt động gần đây, Lịch của tôi, Lớp phụ trách | Bỏ nút “Nhắn tin” và mục “phụ huynh đã gửi tin nhắn”; số 40/42 hiện diện nhất quán với 38+2+1+1 | Thẻ “Thông báo chưa đọc” đặt dưới hàng KPI (ảnh: cạnh Việc cần làm) |
| R06 | `/classroom/demo-school-a/y-a-2026/c-a-10a1/students` | `CL02-desktop.png` | Header lớp + 4 thẻ, tab lớp, bảng học sinh (tổ, chức vụ, giám hộ, link), sơ đồ lớp thu nhỏ có bảng/bàn GV, Tổ & chức vụ | GVCN đúng Cô Trần Thị Lan, 42 HS, năm 2026–2027; “Phụ huynh đã kích hoạt / Đã xem” → “Học sinh có link tra cứu”, “Link đã được mở / Chưa cấp” | Tên trên ghế sơ đồ thu nhỏ viết tắt (ảnh: tên đầy đủ) — bản đầy đủ ở CL14 |
| R07 | `/school/demo-school-a/students/demo-student-a-001` | `SC18-desktop.png`, `SC18-desktop-full.png` | Thẻ đầu hồ sơ, Thông tin học sinh, Người giám hộ, Lịch sử lớp, Quyền xem của phụ huynh (link + QR thật), Nội dung được xem, Nhật ký, chú thích không tài khoản | Bỏ CCCD/dân tộc/email/SĐT/địa chỉ học sinh, bỏ IP; nhật ký ghi “Link cấp cho … được mở”; bỏ mục Kết quả học tập; QR/link chỉ hiện khi bấm “Hiện link/QR demo” | Không ảnh chân dung (chữ viết tắt) |
| R08 | `/classroom/.../attendance` + `/conduct` | `CL04-desktop.png`, `CL06-desktop.png` | Bộ chọn ngày/buổi, chip số lượng, bảng 5 trạng thái, ghi chú, chuyển “Điểm danh trong ngày / Thi đua theo tuần”; bảng ghi nhận thi đua, tổng kết tuần, bảng thao tác | Thêm trạng thái “Chưa điểm danh” (ST14); “Lưu tạm” bỏ — ghi nhận lưu ngay ở trạng thái chờ rà soát; “Chốt” ≠ “Công bố”; điểm ví dụ 100 − 5 + 2 = 97 | Ảnh gộp điểm danh + thi đua trên một trang; bản dựng tách thành CL04 và CL06 (có nút chuyển) để không quá tải |
| R09 | `/classroom/.../activities` | `CL17-desktop.png` | Tab Hoạt động/Minh chứng/Thông báo, thẻ hoạt động có minh họa, tiến độ x/y, tổng quan hoạt động, hoạt động gần đây, minh chứng chờ duyệt, thông báo sắp công bố | Lớp 10A1 thật thay 6A1; minh chứng do giáo viên ghi nhận; mẫu số = số học sinh được giao | Minh họa đầu trang thu nhỏ (kids-school crop) |
| R10 | `/p/binh-minh/overview` | `PA02-desktop.png`, `PA02-mobile.png` | Header cổng phụ huynh + minh họa gia đình, thẻ học sinh, 3 ô thông tin, giáo viên, điểm danh tuần (donut), thi đua đã công bố, lịch hôm nay, thông báo mới; mobile một cột + thanh đáy | Không tên/tài khoản phụ huynh; không menu Kết quả học tập; tuần 5 chưa công bố hiển thị “Chưa có dữ liệu công bố tuần này” (không 0); khung điện thoại không đưa vào desktop | Huy hiệu xếp loại dùng vòng tròn điểm (ảnh: huy chương chữ A) |

## Màn hình không có ảnh riêng (derived)

115 màn còn lại dựng lại bằng cùng design system (shell, `PageHeader`, `Card`, `DataTable`, form, badge, minh họa) — ảnh desktop/mobile của từng ID nằm trong `qa/screenshots/<ID>-*.png` và được liệt kê ở `docs/progress.md`. Đây là giao diện suy rộng, **không có ảnh thiết kế được duyệt riêng**.

## Responsive

Mọi route core/internal được chụp ở 390×844; kiểm tự động thêm ở 1448 và 390 trong `tests/e2e/smoke.spec.ts` (tràn ngang body, mojibake). Các chụp riêng ở 360/768/1024 cho luồng đại diện: xem `docs/test-report.md`.
