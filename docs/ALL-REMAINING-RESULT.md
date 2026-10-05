# EduManage — toàn bộ phần còn lại sau v1.0.4

Nguồn nghiệp vụ: tài liệu “EDUMANAGE — ALL REMAINING WORK AFTER v1.0.4” owner cung cấp ngày 05/10/2026. Nền source: `v1.0.4`, commit `50ea38ada55a6e38c5a4ba384d53879162b7015a`, schema 060. Branch bàn giao: `codex/new-machine-audit-20261002`. Release mục tiêu: **v1.0.5**; không di chuyển các tag trước.

## Source map và phần đã hoàn thiện

| Nghiệp vụ | Source chính | Hành vi bàn giao |
|---|---|---|
| Cán bộ lớp / PIN | `backend/src/modules/classroom/{notebook,officers}.service.ts`; `src/features/notebook/{notebook-page,officer-workspace}.tsx` | GVCN phân công theo học sinh, vai trò, tổ, chức vụ và khoảng hiệu lực; PIN Argon2 chỉ hiện khi cấp/đổi; sai 5 lần khóa tạm 15 phút. Session riêng 45 phút, cookie HttpOnly/SameSite, Secure khi production, CSRF và kiểm lại quyền/tổ/ghi danh/hiệu lực mỗi thao tác. |
| Phân quyền cán bộ | `officers.service.ts` | Tổ trưởng ghi đúng tổ hiện tại; lớp trưởng ghi các tổ trưởng đang hiệu lực, xem tiến độ và nhập/copy TKB nháp khi GVCN bật; lớp phó Lao động chỉ làm nháp trực nhật. Không lấy quyền nhân sự để đăng nhập cán bộ. |
| Nộp tuần / khóa | `notebook-common.ts`, worker, notebook UI | DRAFT → SUBMITTED → LOCKED; cửa sổ sửa tối đa 5 phút được kiểm bằng đồng hồ server. Mở lại 30 phút có lý do; khóa lại hoặc hết hạn tự khóa; audit riêng. Hạn trường, lớp và override theo tuần. |
| Chức vụ / điểm cộng | `backend/src/modules/conduct/position-bonus.ts` | Nhãn, mô tả, điểm/tuần, vai trò tùy chọn. Chụp phân công có hiệu lực và cộng đúng một lần khi chốt tuần; thay chính sách sau chốt không đổi lịch sử. |
| Tháng / học kỳ / năm | `periodic.service.ts`, `periodic-page.tsx` | Chỉ lấy tuần LOCKED có publication PUBLISHED. Chính sách AVERAGE/SUM và ngưỡng có phiên bản; lưu nguồn, điểm, gợi ý, xếp loại cuối, lý do override, người/thời điểm chốt. DRAFT → REVIEW → FINALIZED → PUBLISHED; bản chốt/công bố bất biến. Kiểm quyền theo cả hai đầu kỳ và chính sách quyền chốt/công bố của trường. |
| Excel / PDF kỳ | `backend/src/modules/reports/{report-data,parent-conduct-data,parent-conduct-pdf}.ts` | Phiếu A4 từng học sinh/cả lớp, font tiếng Việt; Excel giữ xếp loại cuối và lý do, thoát công thức. Ghim đúng bản định kỳ và nguồn tuần, không lấy xếp loại tuần cuối để gọi là xếp loại tháng/kỳ/năm. |
| Công khai / phụ huynh | `public-class.service.ts`, `parent.service.ts`, các view public/parent | Chọn tuần/tháng/học kỳ/năm, chỉ publication đã công bố. Public theo toggle lớp; xếp hạng chỉ khi bật. Link gia đình chỉ thấy con, năm học và allowedSections; không lộ nháp, lý do nội bộ, điện thoại hoặc upload riêng. |
| Hoạt động / minh chứng | `evidence-access.service.ts`, activity workspace / form / access / student view | Giữ lifecycle hiện có, thêm thời điểm bắt đầu và maxFiles 1–20. Link riêng học sinh + hoạt động, hash token, hạn/thu hồi, session 30 phút, CSRF, quota và rate limit. Ảnh PNG/JPEG/WebP được sniff/re-encode, không tin extension; tải lại phải có quyền. Giới hạn mặc định 10 MB, cấu hình `STUDENT_EVIDENCE_MAX_MB` 0.5–10. |
| Tiến độ / nhắc bài | `activity-access.tsx`, `message-template.ts` | Tổng/đã nộp/chưa nộp; lọc đã nộp, chưa nộp, muộn; xem và duyệt/cần bổ sung/ghi chú qua module hiện có. Mẫu editable, biến `{{student_name}}`, `{{class_name}}`, `{{activity_name}}`, `{{due_at}}`, `{{status}}`; copy tin chung hoặc tin từng học sinh/toàn bộ. |
| Zalo helper | `zalo-helper.ts`, `zalo-helper.tsx` | Chọn publication, lấy điểm/xếp loại/chuyên cần đã công bố cùng liên hệ giám hộ được phép. Mẫu editable/lưu theo lớp, copy một/tất cả, mở URL HTTPS Zalo từ số hợp lệ. GVCN tự gửi; không gọi API gửi tin hoặc tự động nhắn. |
| Lịch trực nhật / TKB | `schedule.service.ts`, `schedule-copy.tsx` | Nháp trực nhật 7 ngày, tổ/thành viên/nhiệm vụ; lớp phó nộp, GVCN công bố. Copy tuần trước lọc ghi danh hiện tại, reset trạng thái. TKB nhập tay tới tiết 12, copy tạo nháp, validate/publish hiện có. Rút tuần tương lai tạo revision mới, giữ tiết đã dùng và lịch sử. |
| An toàn tài khoản | `staff/credential-management.ts`, `staff-credentials.tsx` | Quản trị trường đặt mật khẩu mới cho nhân sự riêng của trường, bắt đổi lần sau và thu hồi session. Không đọc lại mật khẩu. Từ chối tự đặt lại, danh tính nhiều trường, platform identity hoặc người vượt trần quyền. Suspend/reactivate giữ workflow hiện có. |
| GVCN / điều hướng | class workspace header / context / `quick-status.tsx` | 16 mục lớp theo quyền; việc hôm nay, TKB/điểm danh/rà soát hiện có; thêm cán bộ chưa nộp, hoạt động đến hạn, xếp loại định kỳ và Zalo. Kiểm giao diện 390 px. |
| Parity hiện có | groups/seating, imports, rules, announcements, school ops | Reuse sơ đồ chỉnh cấu hình/đổi chỗ/phân tổ/shuffle; importer paste/file → preview/validate/confirm, cập nhật theo mã, giữ enrollment/history; nội quy; thông báo tạo/sửa/rút publication; danh tính trường/năm/tuần/tiết/alias và phân công nhân sự. Không đưa engine import hay CMS khác vào. |

Sự kiện học sinh nộp minh chứng giữ actor học sinh trong audit; history DTO cho phép actor không có staff identity. Chỉ trường actor này nullable; UUID các bản ghi vẫn bắt buộc. Các mutation input là schema đóng; aggregate workspace dùng native row DTO.

## Migration và kiểm thử có phạm vi

Migration mới 061–065: cán bộ/PIN/session; submission/deadline/idempotency; định kỳ/publication; capability minh chứng; notebook settings/bonus snapshot. Bảng có dữ liệu trường dùng FORCE RLS. Migration 001–060 giữ nguyên byte và checksum, bao gồm 059 `5d6b104ad36b5e2774737d849eef2b428c59d6d308ba7ae79c44201ab05123c5`.

- `bash backend/tests/run-all-remaining.sh`: **3 nhóm PASS** trên PostgreSQL 17, tài khoản migrator/app/worker/parent không BYPASSRLS. Tạo schema 060 có hai trường/lớp/học sinh/nhân sự/publication, gây lỗi ở 061 để kiểm rollback, retry và verify-installation 065; giữ dữ liệu/checksum cũ.
- Các ca quyền âm: sai tổ, lớp trưởng ghi học sinh thường, lớp phó ghi conduct, PIN lockout/rotate/revoke, hết cửa sổ/hết mở lại, cross-school, public draft, private evidence/file/quota/revoke, tự reset/shared identity/subject teacher reset. Dữ liệu mới được kiểm lại trong database và session mới.
- `bash backend/tests/run-migration-rls.sh`: **8 ca PASS**, gồm compatibility 058→059, failure atomic, checksum, concurrent runners, FORCE RLS và context cleanup đến schema hiện tại.
- Backend unit: 35 ca hiện có PASS; thêm 2 ca contract/navigation PASS. Frontend liên quan: 19 ca PASS (class header/organization/seating). Production guards: 12 PASS, 1 Linux flock handoff không chạy trên Windows; được kiểm ở Linux Actions.
- API/Web production Docker build **PASS** bằng Node image digest ghim trong workflow; typecheck/build PASS. Container local API readiness, Web và worker heartbeat PASS. Static package/config, Bash block và actionlint PASS với input tổng hợp; không phải preflight server thật.
- Trình duyệt Edge desktop/390 px: phân công/cấp PIN; đăng nhập/ghi một fact; preview/nộp/grace; khóa/mở lại/khóa lại; lớp phó nháp/nộp trực nhật + công bố; lớp trưởng tiến độ/copy TKB; tháng override/rà soát/chốt/công bố; phụ huynh/public chọn kỳ; tải PDF tháng; tạo hoạt động/link riêng/upload/filter/template/review; Zalo copy/open. Thêm GVCN home mobile và reset mật khẩu UI. Không page error; kiểm không tràn ngang ở màn mobile.
- MONTH/TERM/YEAR đều xuất được PDF cá nhân/cả lớp và XLSX thực tế. PDF tháng được render/đọc để đối chiếu xếp loại cuối khác xếp loại tuần. PDF tuần và parity P0 kế thừa source v1.0.4, đối chiếu báo cáo/kiểm tra liên quan hiện có.

Harness trình duyệt: `tests/browser/all-remaining.mjs`. Chạy sau fixture PostgreSQL có `ALL_REMAINING_EVIDENCE_PATH` trỏ tới thư mục riêng, gateway local trên `127.0.0.1:24173`, API 24174/Web 24172; đặt `ALL_REMAINING_BROWSER_EVIDENCE_DIR`, rồi `node tests/browser/all-remaining.mjs`. Fixture chứa mật khẩu/token ngẫu nhiên chỉ ở thư mục riêng. Không commit fixture, ảnh màn hình, log, secret, dump, backup hoặc upload.

## Bàn giao production

Tag dự kiến **v1.0.5**. Source SHA/tag, Actions và digest API/Web được xác minh sau push và trả trong `EDUMANAGE_ALL_REMAINING_RESULT`. Chỉ dùng release khi toàn bộ release gate PASS. Workflow **Publish production images** kiểm exact tag/SHA, các regression và build cả hai image trước khi publish; không dùng `latest`.

Owner chạy bằng SSH của owner:

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.5
bash scripts/prod-status.sh
```

Script kiểm source/tag/image digest/config, backup, migrate, verify-installation và health/HTTPS theo package hiện có. Giữ `.env.production`, `.secrets/production`, domain/SSL/reverse proxy, database, private uploads và volumes; SMTP vẫn optional và được quản lý ở `/platform/settings`. Chỉ gateway loopback; không mở 5432/3000/3001 ra Internet. Không seed demo. Agent **không SSH, không deploy production**.

Kỳ vọng sau owner update: `RELEASE=v1.0.5`, `MIGRATION=065-position-bonus-settings.sql`, `SCHEMA_MATCHES_RELEASE=YES`, API/worker/Web healthy, HTTPS PASS. Sau nâng schema, rollback về image schema cũ bị guard chặn; không hạ schema hoặc restore DB tự động. Khi lỗi, giữ dữ liệu và gửi status/output đã loại secret để làm hotfix phù hợp.

Không port kiến trúc cũ: Firebase/OCR/DeepSeek/AppsScript/hidden-superadmin/plaintext-passwords.
