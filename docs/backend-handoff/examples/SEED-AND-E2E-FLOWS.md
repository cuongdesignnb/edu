# Seed local và kịch bản kiểm thử liên thông

Đây là hợp đồng fixture để Agent viết `seed-local`, không phải database hoặc tài khoản đã tạo. Dữ liệu hoàn toàn giả định. Tất cả mật khẩu được đọc từ stdin khi chạy CLI, không có mật khẩu mặc định trong source/ZIP.

## Fixture tối thiểu

| Nhóm | Dữ liệu giả định |
|---|---|
| Nền tảng | Một platform operator, không membership tự động ở mọi trường |
| Trường | `TEST-A` và `TEST-B`, slug `truong-thu-a`/`truong-thu-b` |
| Năm | 2026–2027, `[2026-09-01, 2027-06-01)`; tuần test `[2026-09-07, 2026-09-14)` |
| Lớp | A: 10A1, 10A2; B: 10A1 (cùng tên, khác school_id) |
| Quản trị | `admin-a@example.invalid`, `admin-b@example.invalid` |
| GVCN + bộ môn | `teacher-a@example.invalid`: chủ nhiệm A/10A1, Toán A/10A2 |
| Giáo viên khác | `teacher-b@example.invalid`: chỉ Toán A/10A1; một user hai membership A/B để thử thu hồi độc lập |
| Học sinh | Tối thiểu 6 em/lớp; hai em có cùng displayName nhưng code/ID khác nhau |
| Giám hộ | Hai người giám hộ độc lập của HS-A-0001; thêm một quan hệ chưa xác minh |
| Nội quy | Base100, min0, max120; đi muộn −5, phát biểu +2; ngưỡng90/70; chỉ ví dụ của tenant test |
| Tệp | Một ảnh giả an toàn, một CSV có lỗi và một file giả mạo MIME để test reject |

ID có thể sinh UUIDv5 theo namespace seed cố định để chạy lại không nhân đôi; không dùng cùng ID làm token bí mật. Seed chỉ upsert dữ liệu trong namespace TEST, không đặt lại password/user thật. Không tự seed mỗi lần ứng dụng khởi động.

## Luồng cần chứng minh từ browser

1. Admin A đăng nhập → tạo lớp → phân công giáo viên → teacher chỉ thấy đúng lớp/phạm vi.
2. Teacher mở 10A1 → điểm danh trạng thái UNMARKED ban đầu → ghi đi muộn HS-A-0001 → ghi nhận conduct từ nguồn attendance.
3. Teacher bộ môn thêm +2; retry cùng command không tạo thêm điểm.
4. Parent mở link trước khi publish → không thấy thi đua nháp, không trả điểm 0 thay “chưa công bố”.
5. GVCN rà soát và công bố → parent thấy97, có giải thích −5/+2, không có danh sách điểm cả lớp.
6. Ban hành rule mới cho tuần tiếp theo → tuần đã công bố vẫn97.
7. Điều chỉnh nhầm đi muộn → tạo yêu cầu, duyệt, công bố revision mới → parent thấy102 (max120 trong fixture), vẫn có lịch sử bản97.
8. Revoke link của guardian1 → guardian1 không đọc/tải mới; guardian2 còn quyền theo link riêng.
9. Chuyển HS-A-0001 sang10A2 trong cùng năm → lịch sử tuần cũ vẫn10A1; link vẫn đúng em và năm được cấp, không hiện học sinh khác.
10. Thu hồi membership teacher tại A → request mới của A bị chặn; quyền B độc lập.
11. Backup → restore project khác → đối soát counts/files + lặp các test quyền âm.

## Điều khiển thời gian trong test

Dùng Clock injectable ở test hoặc khởi tạo timestamp thích hợp. Không thêm HTTP header/query công khai cho người dùng tùy ý thay giờ hiện tại nhằm vượt hạn link hoặc hạn chốt. Production sử dụng thời gian máy chủ được đồng bộ.

CLI được phép in mã trường/email local và số lượng tạo/cập nhật. Không in mật khẩu, cookie, raw invitation/parent token. Link parent phải phát hành qua API/UI có quyền để kiểm đúng quy trình.
