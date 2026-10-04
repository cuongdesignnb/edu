# Tạo trực tiếp quản trị trường — v1.0.2

Base source: `994b338950d6ab4ae574c988c7f90cf768314fcc` (v1.0.1). Branch: `codex/new-machine-audit-20261002`. Không đổi v1.0.0/v1.0.1; không SSH hoặc deploy production.

Trang `/platform/schools/{schoolId}/admins` có hai nút riêng: **Tạo tài khoản quản trị** và **Gửi lời mời qua email**. Danh sách quản trị và lời mời tách riêng. Khi SMTP tắt, lời mời được cảnh báo là chờ gửi; tạo trực tiếp vẫn hoạt động và không gửi mail.

`createSchoolAdminAccount` và `assignExistingSchoolAdmin` yêu cầu session, CSRF, idempotency và `platform.admins.create_direct`, chỉ có trong template PLATFORM_OPERATOR. Migration `058-direct-school-admin.sql` bổ sung cờ đổi mật khẩu và cấp quyền mới cho các operator đang hoạt động có đầy đủ chín quyền nền tảng hiện hữu. Operator có quyền một phần, bị thu hồi hoặc chỉ hỗ trợ không được tự nâng quyền.

Identity ACTIVE, membership ACTIVE, grant SCHOOL_ADMIN với scope SCHOOL, audit và idempotency cùng transaction. Email chuẩn hóa và unique. Mật khẩu dùng Argon2; response, audit và cache không chứa mật khẩu/hash/token. Không tạo invitation/outbox ở luồng trực tiếp. Email đã tồn tại trả conflict và yêu cầu luồng gán riêng có xác nhận; không sửa mật khẩu, tên identity hoặc cờ đổi mật khẩu của identity hiện có. Thành viên đã thuộc trường, kể cả đã kết thúc, trả conflict để xử lý rõ ràng.

Cờ đổi mật khẩu bật mặc định trên form tạo mới. Đăng nhập được nhưng API chặn chức năng nghiệp vụ và UI chuyển đến `/account/security`. Đổi mật khẩu khác mật khẩu tạm thời xóa cờ, thu hồi phiên hiện có và yêu cầu đăng nhập lại. Hiệu lực quyền có thể bắt đầu trong tương lai; hiển thị “Chờ hiệu lực” và API không cấp quyền trước thời điểm đó. Ngày kết thúc phải sau ngày bắt đầu và không vượt thời hạn quyền cấp của operator.

## Kiểm thử phạm vi thay đổi

- PostgreSQL native: 8 ca tổng hợp, gồm SMTP disabled/enabled, đăng nhập, từ chối school admin/teacher/parent/support/operator mất quyền, CSRF, scope trường, email trùng/gán rõ ràng, rollback khi grant lỗi, mật khẩu/response/audit/cache, đổi mật khẩu và thu hồi phiên, quyền hẹn ngày, migration quyền và giữ luồng invitation.
- Hồi quy SMTP native PostgreSQL/TLS: 12 bài PASS, gồm cấu hình nóng, hàng đợi khi tắt, bảo vệ receipt và mất lease; không SMTP giả cho production.
- Backend unit/contract: 82 bài PASS. Frontend unit tập trung: 36 bài PASS. Typecheck frontend/backend và lint các file thay đổi PASS.
- Browser Edge: 5 ca PASS với HTTP fixture kiểm form thật, hai CTA, validation, success, gán explicit, lời mời khi SMTP tắt, responsive 320/390/768/1440 và bắt đổi mật khẩu. Quyền, identity và transaction được kiểm bằng PostgreSQL thật riêng biệt.
- Docker API/Web production build PASS với Node 24 được pin digest; kiểm cấu hình compose và workflow actionlint PASS. Production scripts: 13 bài, một bài Linux flock không chạy trên Windows; GitHub Actions chạy bài này trên Linux trước publish.
- Stack Docker production cô lập tại máy local: migration 058 và verify-installation PASS, API/worker/Web/gateway/PostgreSQL healthy với SMTP blank, không seed và không publish host port. Stack được dừng, giữ volumes; đây không phải kết quả deploy trên server thật.

Các log, screenshot, fixture secret và dữ liệu riêng giữ ngoài commit. Không audit toàn CMS, không seed production, không thay secret/volume/runtime cũ. Kết quả Actions và digest cuối cùng được bàn giao sau khi xác minh release.

## Owner tự cập nhật

Chỉ chạy khi tag v1.0.2 và cả hai image đã được báo publish PASS:

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.2
bash scripts/prod-status.sh
```

Script fetch đúng tag, kiểm source sạch, labels/digests, backup/migration/health theo trạng thái hiện có; giữ `.env.production`, `.secrets/production` và volumes. SMTP có thể tiếp tục để trống. Migration tự chạy qua release. Sau update, đăng nhập Platform Operator và mở trường → Quản trị trường → Tạo tài khoản quản trị. Owner chuyển mật khẩu tạm thời qua kênh riêng; không gửi password qua chat/log.
