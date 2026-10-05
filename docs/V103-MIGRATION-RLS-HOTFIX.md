# EDUMANAGE_V103_MIGRATION_HOTFIX_RESULT — v1.0.4

Ngày: 2026-10-05. Phạm vi: migration compatibility và phát hành hotfix; không tiếp tục P1.

## Production do owner xác nhận

- Active release v1.0.2, schema 058; HTTPS và stack v1.0.2 healthy.
- Lần cập nhật v1.0.3 lỗi tại 059: `new row violates row-level security policy for table "roles"`.
- Agent không có SSH và không thao tác production. Trạng thái host ở trên là thông tin của owner.

## Nguyên nhân và bản sửa

Migration 059 ghi `app.roles` từ toàn bộ `platform.schools` khi chưa có `app.school_id`. Các bảng roles/role_permissions có FORCE RLS, kể cả với chủ bảng `edu_migrator` NOBYPASSRLS. Test P0 trước đây migrate database trống rồi mới tạo trường, vì vậy không phát hiện lỗi nâng cấp trên dữ liệu đã có.

Runner nhận diện riêng `059-direct-school-staff.sql` với SHA256 cố định:

```text
5d6b104ad36b5e2774737d849eef2b428c59d6d308ba7ae79c44201ab05123c5
```

Trong transaction của 059, runner lấy danh sách trường, đặt tenant context bằng `set_config(..., true)` với parameter binding và giới hạn nguồn SELECT trường theo `app.tenant_id()`. Các truy vấn role/permission còn lại tiếp tục qua RLS. Sau khi xử lý tất cả trường, runner khôi phục context cũ và ghi checksum nguồn gốc vào ledger. Lỗi bất kỳ tenant nào rollback toàn bộ 059; advisory lock tiếp tục tuần tự hóa các runner.

Không sửa file SQL 059, checksum đã ghi hoặc tag v1.0.3. Không tắt RLS, thêm BYPASSRLS/superuser, tăng quyền edu_app, viết SQL tay trên production hoặc restore database. Migration thông thường vẫn dùng đường chạy cũ; không áp dụng biến đổi này cho migration khác hoặc source 059 đã bị sửa.

## Kiểm thử có mục tiêu

Lệnh: `bash backend/tests/run-migration-rls.sh`.

Kết quả local: **8/8 PASS**, PostgreSQL 17.11; migrations chạy bằng `edu_migrator` NOSUPERUSER/NOBYPASSRLS. Fixture dùng database và project Docker riêng, không đụng database/volume hiện có.

1. Schema 058 có ba trường ACTIVE/SUSPENDED/ARCHIVED: SQL gốc 059 lỗi 42501; hotfix nâng 058 → 059 → 060, giữ lịch sử 001–058, identity/profile/custom permissions và chạy lại không ghi thêm.
2. Database 058 không có trường và fresh install 001–060 đều PASS, lưu checksum gốc 059.
3. Lỗi có kiểm soát ở tenant thứ hai: mọi ghi role/permission của tenant trước và ledger 059 rollback; 060 chưa chạy, retry PASS.
4. Từ chối source 059 bị sửa khi chưa áp dụng hoặc đã áp dụng; checksum guard của migration khác vẫn hoạt động.
5. Hai runner đồng thời: advisory lock cho kết quả một lần áp dụng, một lần no-op.
6. FORCE RLS giữ nguyên; edu_app không được chạy migration, app/migrator không đọc hoặc ghi tenant khác.
7. TEACHER role và permission đã tồn tại giữ nguyên identity/scope, bổ sung quyền thiếu theo ON CONFLICT gốc.
8. Khôi phục tenant context trước khi ghi ledger; không rò context sang transaction tiếp theo.

`verify-installation` chạy trong các fixture nâng cấp: 60 migrations, checksum khớp, rolesSafe=true, forceRls=true. Typecheck và lint các file sửa PASS. Workflow release thêm gate regression 058 → 060 trước khi publish API/Web. Các gate release sẵn có được giữ nguyên.

Production API Docker build local PASS với Node 24 được pin digest, nhãn `v1.0.4-candidate`/`hotfix-candidate` (không gán cho commit hoặc runtime production). Static config/package/15 block Bash/actionlint PASS trên input tổng hợp, gateway bind 127.0.0.1; không xác minh config/host production qua SSH. Production guard tests local: 12 PASS, một kiểm tra Linux flock skip trên Windows; workflow Linux giữ kiểm tra này.

Build/image/tag/digest và kết quả Actions cuối cùng phải lấy từ báo cáo phát hành sau publish; tài liệu này không tự chứng nhận host production hoặc runtime đang chạy commit mới.

## Owner cập nhật khi nhận đủ xác nhận release

Sau báo cáo phát hành xác nhận tag v1.0.4 đúng source SHA, Actions PASS, cả API/Web image đã publish và production static config PASS:

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.4
bash scripts/prod-status.sh
```

Không đổi .env.production/base secrets, không bật SMTP giả, không seed demo, không mở 5432/3000/3001 ra Internet. Script hiện có thực hiện preflight/source/digest check, backup, maintenance, migrate, verify-installation và health/HTTPS. Sau thành công mong đợi release v1.0.4, schema 060, SCHEMA_MATCHES_RELEASE=YES và HTTPS=PASS. Giữ dữ liệu nếu có lỗi, không chỉnh ledger/checksum hoặc restore để vượt gate.

Hướng dẫn copy/paste đầy đủ tại [OWNER-SSH-FIRST-DEPLOY.md](OWNER-SSH-FIRST-DEPLOY.md), mục 10. Agent không SSH hoặc deploy production.

## Nguồn yêu cầu

Không tìm thấy `AGENT-FIX-V103-MIGRATION-RLS.md` trong D:\Edu hoặc cây thư mục C:\Users\Home_PC. Hotfix được thực hiện theo các yêu cầu cụ thể owner đã ghi trực tiếp trong tin nhắn, không suy diễn thêm tính năng.
