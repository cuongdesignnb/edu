# Thiết kế lại "Lớp học của tôi" (không gian lớp)

Căn cứ: 6 màn mockup lớp 11A5 (Tổng quan, Học sinh, Hoạt động, Lịch & Tổ chức, Điểm danh & Rèn luyện, Phụ huynh & Báo cáo) do chủ dự án cung cấp ngày 07/10/2026.
Mục tiêu: giáo viên ít rành công nghệ mở lớp là biết việc cần làm, tìm chức năng trong tối đa 2 lần bấm.

## Điều hướng: 16 tab → 6 mục + mục con

API `workspace-header` không đổi, vẫn trả danh sách tab phẳng theo quyền. Frontend gom các tab đó thành 6 mục (`src/features/classroom/sections.ts`). Mục hoặc mục con chỉ hiện khi tab nguồn có trong danh sách server, nên việc gom nhóm không mở rộng quyền.

| Mục | Mục con (tab nguồn → đường dẫn) |
|---|---|
| Tổng quan | overview → `` |
| Học sinh | Danh sách (students), Tổ & chức vụ (groups), Sơ đồ chỗ ngồi (seating) |
| Điểm danh & Rèn luyện | Điểm danh (attendance), Rèn luyện tuần (conduct, kèm `/publications`, `/adjustments`, `/rules`), Báo cáo tuần (notebook), Xếp loại định kỳ (periodic) |
| Lịch & Tổ chức | Thời khóa biểu (timetable), Trực nhật (duties), Cài đặt lớp (notebook-settings) |
| Hoạt động | Hoạt động (activities), Minh chứng (`/evidence`, cần `evidence.manage` hoặc `report.class`), Thông báo (announcements), Tệp lớp (files) |
| Phụ huynh & Báo cáo | Cổng lớp & mã QR (public-portal), Báo cáo (reports), Tin nhắn Zalo (`/reports/zalo`, cần `guardian.view`) |

Mục con đang mở được xác định theo tiền tố đường dẫn dài nhất. Các thanh điều hướng con cũ trong từng trang (`ClassOrgNav`, `ActivitySectionTabs`, dòng liên kết trong sổ chủ nhiệm) đã bỏ vì bị trùng.

Hiển thị:
- Từ 1400px: 6 mục nằm một hàng ngang.
- Dưới 1400px: icon nằm trên nhãn, nhãn tự xuống dòng.
- Điện thoại: lưới 3 cột.
- Mục con là hàng nút bo tròn, cuộn ngang được.

## Đầu trang lớp (`ClassHeader`)

Gồm tên lớp, trạng thái lớp, nhiệm vụ của tôi, năm học, trường, khối và giáo viên chủ nhiệm.
- Giáo viên dạy từ 2 lớp trở lên có ô **Lớp đang mở** để chuyển lớp. Lớp mới luôn mở ở trang Tổng quan.
- Ảnh minh họa banner được cắt từ mockup (`public/assets/illustrations/class-banner.png`). Khẩu hiệu lấy từ `class.motto`.
- Trang con: tên lớp không còn là h1, tiêu đề trang mới là h1 (mỗi trang đúng một h1).
- Điện thoại: ẩn breadcrumb và dòng GVCN. Ô chuyển lớp chỉ hiện ở trang Tổng quan.

## Trang Tổng quan (`src/features/classroom/overview.tsx`)

- **Việc cần làm hôm nay** lên đầu. Mỗi việc có một nút động từ rõ ràng (Điểm danh, Rà soát, Duyệt, Chốt tuần, Xếp tổ, Công bố).
  - Tín hiệu sổ chủ nhiệm cũ (cán bộ chưa nộp báo cáo tuần, hoạt động sắp đến hạn) nay nằm trong cùng danh sách này.
- **Thao tác nhanh**: tối đa 6 ô, lọc theo quyền. Năm học lưu trữ thì ẩn các thao tác ghi.
- **Lịch học hôm nay**: dạng dòng thời gian, có trạng thái hủy hoặc thay đổi.
- **Điểm danh buổi sáng**, **Hoạt động đang diễn ra**, **Tổ của lớp**: giữ nguồn dữ liệu cũ.
- **Thống kê lớp**: gồm sĩ số, chờ rà soát và thi đua tuần.
  - Trước đây nằm ở đầu trang.
  - Đã sửa nhãn trạng thái tuần `OPEN`/`IN_REVIEW`, trước đây bị hiện thành "Chưa có kỳ…".
- **Giáo viên chủ nhiệm**, **Liên kết phụ huynh** (tỉ lệ có link, lối tắt Cổng lớp & QR), **Thông báo gần đây** (dùng chung cache với trang Thông báo).
- Bố cục:
  - 3 cột từ 1400px; 2 cột từ 1024px; 1 cột trên điện thoại.
  - Lỗi đọc tổng quan chỉ hiện một khối lỗi. Các thẻ lấy từ header vẫn hiển thị.

## Điểm danh nhanh

Màn điểm danh có thêm nút **"Có mặt cho N em còn lại"**:
- Chỉ đổi bản nháp những em đang "Chưa điểm danh" sang "Có mặt".
- Giáo viên sửa riêng các em vắng hoặc đi muộn rồi bấm **Lưu điểm danh** như cũ.
- Không tự lưu, không tự công bố.

## Hướng dẫn (tour)

Tour lớp rút còn 6 bước: lớp đang mở → sáu mục → việc cần làm → thao tác nhanh → chốt và công bố → nút hướng dẫn.

## Kiểm thử và phát hành

Kết quả kiểm tra mới nhất, các lỗi có sẵn, điều kiện go/no-go, quy trình phát hành và rollback: [PRE-DEPLOY-LOP-HOC-CUA-TOI.md](PRE-DEPLOY-LOP-HOC-CUA-TOI.md).

Quy tắc nghiệp vụ, kịch bản UAT và các câu hỏi cần BA chốt: [BA-REVIEW-LOP-HOC-CUA-TOI.md](BA-REVIEW-LOP-HOC-CUA-TOI.md).

## Còn lại / gợi ý bước sau

- Mockup "Phụ huynh" (danh sách phụ huynh của lớp với trạng thái liên kết) chưa có API cấp lớp tương ứng. Hiện dẫn sang Danh sách học sinh để cấp link theo từng em.
- Các script QA thủ công cũ (`scripts/verify-form-data-browser.mjs`) còn kiểm tra thanh tab cũ (`data-class-tabs`, menu "Thêm"), cần cập nhật nếu chạy lại.
- Nội dung bên trong từng trang con (roster, thi đua tuần, hoạt động…) giữ nguyên; có thể tinh chỉnh tiếp theo mockup từng màn.
