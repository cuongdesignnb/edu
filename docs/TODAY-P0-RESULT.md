# EduManage — P0 ngày 05/10/2026, bản phát hành v1.0.3

Batch này thực hiện P0 trong tài liệu FULL HANDOFF, từ source nền `31c10f8eccf4f7e63d6a90a0b1ee0158a356c07f`, branch `codex/new-machine-audit-20261002`. Dừng sau khi phát hành P0; P1 được liệt kê bên dưới.

## Phần bàn giao

- **Tài khoản giáo viên:** Nhà trường → Giáo viên có hai nút Tạo tài khoản giáo viên / Gửi lời mời. School Admin có quyền trong trường được tạo trực tiếp; identity, membership, quyền và phân công tùy chọn nằm trong cùng transaction. Không invitation hoặc email; SMTP tắt vẫn dùng được. Mật khẩu Argon2, đổi lần đầu mặc định bật. Email đã có phải chọn gán explicit, giữ mật khẩu cũ. Platform Operator không tự trở thành quản trị mọi trường.
- **Hướng dẫn:** dùng driver.js và preference hiện có theo tài khoản, trường, tour key/version. Tour lớp theo chủ nhiệm/bộ môn/nhà trường; có bỏ qua, quay lại, tiếp theo, hoàn tất và xem lại từ Trợ giúp hoặc nút Hướng dẫn lớp này. Bỏ qua selector không xuất hiện; hỗ trợ điện thoại và giảm chuyển động. Giáo viên chưa phân công vẫn lưu được preference của tour giáo viên.
- **Cổng lớp + QR:** trong Báo cáo lớp → Cổng lớp công khai & QR. Mặc định tắt toàn bộ. Bật, lưu, sao chép link, tải QR, xem trước, đổi link hoặc tắt. URL `/lop/<slug-ngẫu-nhiên>` không chứa token tra cứu phụ huynh. Mọi người có URL đều có thể xem nội dung được bật; kết quả thi đua, chuyên cần, hoạt động, xếp hạng và sơ đồ là các lựa chọn riêng. Danh sách cho phép tìm tên/tổ/chức vụ và mở học sinh. Kết quả lấy từ publication đang công bố; không trả ghi chú nội bộ, liên hệ gia đình, uploads hoặc dữ liệu nháp. Thu hồi/đổi slug vô hiệu đường dẫn cũ.
- **PDF phụ huynh:** Báo cáo lớp → Phiếu báo cáo phụ huynh → chọn thời gian/học sinh, để trống học sinh cho cả lớp → Tải PDF phiếu phụ huynh. Dùng export queue/worker và download có kiểm tra quyền hiện có; mỗi học sinh bắt đầu một phiếu A4, tiếp trang khi dài. Font Noto, quốc hiệu/tiêu ngữ, trường/năm học/lớp/GVCN, khung điểm/xếp loại, chi tiết điểm cộng/trừ và chữ ký. Báo cáo ghim snapshot công bố tại lúc tạo, không tính lại bằng nội quy mới.
- **Nhập TKB:** Lịch lớp → Nhập từ file Excel/Spreadsheet. Đọc trực tiếp XLSX/XLS/XLSM/CSV/ODS trong worker trình duyệt; không OCR, converter hoặc chạy macro/công thức. Chọn sheet, nhận diện ma trận THỨ/TIẾT hoặc dòng chuẩn, ánh xạ cột thủ công khi cần. Giữ ngày hiệu lực và khối sáng/chiều, thứ gộp ô, tên lớp có hậu tố GVCN, môn/giáo viên có dấu gạch. Lớp/môn/giáo viên phải ánh xạ dữ liệu có thật, không tự tạo. Giờ tiết lấy cấu hình nhập của trường hoặc nhập giờ thực tế; thiếu giờ bị chặn. Alias môn/giáo viên và giờ có thể lưu theo trường khi có quyền `school.settings`. Preview cập nhật khi sửa ánh xạ, không đọc lại file. Có bỏ qua dòng/lớp, nhập lớp hiện tại hoặc các lớp có quyền sửa, kết quả riêng từng lớp. Lưu bản nháp → validate xung đột native → công bố explicit; giữ lịch sử và publication gates.

## Giới hạn rõ ràng của P0

PDF **tổng hợp điểm các tuần đã công bố**, ô xếp loại ghi **tuần cuối đã công bố**. Chưa gán xếp loại tháng/học kỳ/năm khi engine kỳ độc lập thuộc P1 chưa triển khai. Không xem điểm cộng các tuần là xếp loại tháng mới. Nội dung riêng của học sinh chỉ gồm các mục đã được chia sẻ trong snapshot.

Cấu hình giờ nhập bắt buộc do trường cung cấp, không tự đoán giờ theo ảnh mẫu. Thứ Việt Nam `2..7/CN` đổi sang ISO `1..7`; cột tiếng Anh Weekday/Day dùng ISO `1..7` hoặc Monday–Sunday. Tiết chiều cục bộ 1–5 lưu thành tiết 6–10 để dùng engine native. Thời gian thực vẫn lấy cấu hình trường. File tối đa 5 MB, 20 sheet, mỗi sheet 1.000 dòng/100 cột; kiểm giới hạn ZIP và timeout worker.

Migrations mới: **059** quyền tạo nhân sự/role TEACHER, **060** cổng lớp. Không đổi host config, SMTP secrets hoặc volumes. PDF tham chiếu của chủ hệ thống chỉ dùng đối chiếu cấu trúc; không đưa dữ liệu học sinh thật vào repository.

## Kiểm tra tập trung

- Parser/format unit: `npx vitest run tests/unit/timetable-import.test.ts` — 12 ca: ma trận, gộp thứ, nhiều khối, ngày, normalized/manual, ánh xạ/giờ/xung đột, English weekdays, năm định dạng thật, tiết đặc biệt SHDC/Sinh hoạt và giới hạn tệp.
- PostgreSQL native: `bash backend/tests/run-today-p0.sh` — direct create/assign/rollback, tenant/role, password lần đầu, preference, portal rotate/disable/privacy, alias scope, report catalog/snapshot/PDF, attendance opt-in, export queue/worker/download và timetable draft/validate/publish.
- Giao diện HTTP thật với PostgreSQL và Docker Web, viewport 1448/390: tạo giáo viên, cấu hình/public student, upload XLSX nhiều sheet, preview/draft/validate/publish, PDF qua worker, tour next/back/skip/replay; không mock API.
- PDF mẫu giả: một học sinh 1 trang, lớp 6 học sinh 6 trang, 85 ghi nhận dài 9 trang; đọc text và render kiểm tiếng Việt/phần cuối.
- API/Web typecheck + build Docker; lint các component đổi; production static config, Bash và actionlint. CI giữ các gate release hiện có và thêm test P0; không mở audit toàn CMS.

SHA release, Actions conclusion và digest API/Web phải được xác minh sau push/tag trong báo cáo bàn giao cuối. Chỉ cập nhật khi thông báo **READY_FOR_OWNER_UPDATE** và đủ hai image. Image local dùng nhãn candidate, không gán runtime local cho commit release chưa kiểm chứng.

## Chủ hệ thống cập nhật production

Trên server đang chạy v1.0.2 tại `/www/wwwroot/edu`, sau xác nhận READY:

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.3
bash scripts/prod-status.sh
```

Script giữ `.env.production`, `.secrets/production`, SSL/DNS/proxy và volumes; thực hiện backup/migration/health theo quy trình sẵn có. Không seed demo. Không dùng `latest`. Agent không SSH hoặc deploy production.

## P1 còn lại — chưa triển khai trong v1.0.3

1. Truy cập cán bộ lớp bằng PIN có hash và scope; nghiệp vụ tổ trưởng/lớp trưởng/lớp phó lao động.
2. Nộp/khóa tuần sau 5 phút; GVCN mở lại trong 30 phút có lý do và audit, khóa lại hoặc hết hạn.
3. Cải thiện minh chứng hoạt động/thi đua và uploads theo scope.
4. Hỗ trợ Zalo sao chép/mở, không tự gửi.
5. Kỳ thi đua tháng/học kỳ/năm, override/công bố và hoàn thiện xếp hạng kỳ.
