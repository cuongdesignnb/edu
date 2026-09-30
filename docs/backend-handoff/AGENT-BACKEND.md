# AGENT TASK — BACKEND THẬT, POSTGRESQL, NỐI FRONTEND, DOCKER LOCAL

**Đọc trước khi sửa repo. Giai đoạn này thay thế lệnh “chưa làm backend” trong handoff frontend cũ, không thay thế nghiệp vụ và thiết kế đã chốt.**

## 1. Mục tiêu và giới hạn

Hoàn thiện backend của EduManage mới hoàn toàn, nối giao diện đã được xây từ `AGENT-FRONTEND.md`, triển khai Docker local tại `127.0.0.1:18763`. Chuẩn bị cấu hình production aaPanel nhưng **không tự deploy vào máy chủ thật** chưa có domain, quyền truy cập và chấp thuận release.

Không sử dụng repo/source/tài khoản/database cũ. Không chuyển dữ liệu cũ. Không tự thêm thanh toán, SaaS billing, đăng ký nhân sự tự do, tài khoản phụ huynh/học sinh, chat, AI hoặc sổ điểm học tập. Các EX01–EX03 vẫn OFF.

Đừng viết lại giao diện, đổi màu/route/sidebar hoặc thay toàn bộ app bằng template admin khác. Backend phải phục vụ workflow có sẵn, không ép UI quay về dashboard CRUD nghèo chức năng.

## 2. Thứ tự đọc

1. `inputs/BUSINESS-V2.md` và `inputs/screens.json`.
2. `docs/01-ARCHITECTURE.md`, `docs/02-DATABASE.md`, sơ đồ `diagrams/`.
3. `docs/03-AUTH-AND-PERMISSIONS.md`, `docs/04-PARENT-ACCESS.md`.
4. `docs/05-DOMAIN-WORKFLOWS.md`, `docs/06-API-CONVENTIONS.md`.
5. `api/openapi.yaml`, `api/ROUTES.md`, `api/frontend-api-map.json`.
6. `docs/07-FRONTEND-INTEGRATION.md`, `docs/08-FILES-JOBS-REPORTS.md`.
7. `examples/SEED-AND-E2E-FLOWS.md`, `docs/09-TEST-AND-ACCEPTANCE.md`, `docs/10-DOCKER-LOCAL.md`, `docs/11-AAPANEL-PRODUCTION.md`, `docs/12-PERFORMANCE-AND-OPERATIONS.md`.

`inputs/AGENT-FRONTEND.md` là chứng cứ phạm vi giai đoạn trước, không được dùng nó để từ chối làm backend trong giai đoạn này. Thứ tự ưu tiên: yêu cầu mới của chủ dự án → nghiệp vụ v2 → đặc tả backend → frontend contract thực tế. Nếu có xung đột, ghi ADR cụ thể; không âm thầm bỏ bảo vệ dữ liệu.

## 3. Kiểm kê bắt buộc trước code

- Đọc repo thực tế: stack, lockfile, cấu trúc route, repository interfaces, mock store, `docs/frontend-data-contract.md`, trạng thái frontend QA. ZIP đặc tả không chứng minh frontend đã hoàn thành.
- Ghi commit baseline, working-tree changes; không xóa thay đổi của người dùng. Tạo nhánh feature theo workflow hiện có, không push vào remote chưa được chỉ định.
- Giữ package manager frontend. Template Docker giả định npm root; khi repo dùng pnpm/yarn phải điều chỉnh có kiểm tra, không ép đổi lockfile.
- Tạo `docs/backend-progress.md`: từng operationId + screenId → NOT_STARTED / IMPLEMENTED / TESTED / BLOCKED. Phần giao diện còn thiếu ghi riêng, không dùng mock để che.
- Ghi phiên bản thực tế Node/dependencies/images trong `docs/backend-implementation-report.md`; dùng bản vá còn hỗ trợ, pin lockfile. Không dùng `latest` không kiểm soát.

## 4. Cấu trúc code đề xuất

```text
backend/
├── src/
│   ├── main.ts, worker.ts, cli.ts
│   ├── modules/   # identity, schools, academics, staff, students, classroom,
│   │             # attendance, conduct, publications, parents, schedule,
│   │             # activities, announcements, files, imports, reports, support
│   ├── common/    # problem errors, validation, auth, permission policies, logging
│   ├── database/  # pool, unit-of-work, SQL repositories, migration runner
│   └── workers/   # outbox handlers, exports, imports, mail, maintenance
├── migrations/    # versioned SQL; metadata checksum table do runner quản lý
├── assets/        # PDF assets/font Unicode có giấy phép, không tải ở runtime
├── tests/         # unit, integration PostgreSQL, contracts, E2E
└── package.json + lockfile
```

NestJS + Fastify adapter, TypeScript strict. `pg` cho SQL tham số hóa; controller → application service → domain policy → repository. Không query database trực tiếp trong UI/controller, không auto-sync schema, không `db push`, không ORM tự DROP cột. Tách module trong cùng process; worker cùng image; không triển khai microservice sớm.

## 5. Đầu ra theo giai đoạn

| Mốc | Phải làm | Cổng nghiệm thu |
|---|---|---|
| B0 | Kiểm kê repo, đọc contract, mapping, boot API/config/health | Không mất UI; builds reproducible; dữ liệu mock còn được ghi rõ |
| B1 | PostgreSQL migration, RLS, identity/session/CSRF, tenant/scoped RBAC | Integration âm: trường A/B, GVCN A + bộ môn B, thu hồi trong phiên |
| B2 | Trường/năm/lớp/giáo viên/phân công/học sinh/giám hộ/import | CRUD thật, version conflict, chuyển lớp/bàn giao có lịch sử |
| B3 | Điểm danh/nội quy/thi đua/rà soát/chốt/điều chỉnh/publication | Tính server, không trùng điểm; snapshot bất biến; source-version race test |
| B4 | Portal parent riêng, projection, link/session/revoke/download | Đúng một học sinh/năm, không có draft/cả lớp/secret; đa tab không đọc nhầm |
| B5 | Lịch/tổ/sơ đồ/trực nhật/hoạt động/minh chứng/thông báo/báo cáo/hỗ trợ | Mọi core UI action có API hoặc static mapping hợp lệ |
| B6 | Nối tất cả Repository UI, xóa fallback mock ở connected mode | Reload thiết bị khác thấy DB thật; UI giữ nguyên ngôn ngữ thiết kế |
| B7 | Docker local, test có tải, backup/restore drill, runbook aaPanel | Port loopback; services healthy; migrate exit0; log không secret |

Mỗi mốc commit nhỏ khi hợp lệ; cập nhật progress bằng bằng chứng. Không dừng ở login + 5 bảng rồi báo toàn hệ thống hoàn thành. Không đánh dấu mốc sau PASS khi test chưa chạy.

## 6. Cấm làm để “đạt kết quả nhanh”

- Không query trả cả tenant rồi lọc JS ở trình duyệt; không nhận `role`, `actorId`, `schoolId` trong body như quyền.
- Không cùng một DTO cho staff và parent; không trả `staff_snapshot`, phone gia đình khác hay ghi chú nội bộ.
- Không xóa lịch sử bằng cascade; không sửa bản công bố trực tiếp; không rollback dữ liệu bằng rollback image.
- Không public upload folder; không lưu token/password vào localStorage; không in secret trong README/test log.
- Không tắt RLS, đổi API DB user sang postgres hoặc cấp BYPASSRLS để chữa permission denied.
- Không silent mock fallback hoặc `catch → return []/success` khi DB/API lỗi.
- Không mở host 5432, 3000, 3001; không dùng port khác mà không cập nhật APP_URL/runbook.
- Không chạy `docker system prune`, `volume prune`, `down -v`, `git reset --hard` để sửa lỗi triển khai.

## 7. Hợp đồng CLI/backend mà Docker script cần

`npm run build` sinh `dist/main.js`, `dist/worker.js`, `dist/cli.js`; runtime chỉ production deps. `migrations/` và `assets/` có trong image.

| Lệnh backend | Hợp đồng |
|---|---|
| `node dist/cli.js migrate` | Kết nối edu_migrator; advisory lock; checksum; thực hiện migration còn thiếu; exit0 nếu đã đúng; exit khác0 khi lỗi |
| `node dist/cli.js seed-local --confirm-local --password-stdin` | Chỉ APP_ENV=local + DB hậu tố `_local`; password stdin; tạo fixture synthetic hai trường; không ghi đè user có sẵn ngoài namespace seed |
| `node dist/cli.js bootstrap-admin --email ... --password-stdin` | Qua CLI ủy quyền; chỉ tạo quản trị nền tảng đầu tiên khi chưa có; không endpoint công khai; không mật khẩu mặc định |
| `node dist/cli.js verify-installation` | Kiểm schema/current revision/RLS/runtime roles, thông số và storage; không tự sửa phá dữ liệu |

Worker cập nhật `/tmp/worker-heartbeat` sau mỗi vòng xử lý khỏe (không timer mù). Cấu hình đọc secret qua `*_FILE` đúng template. Log health minimal; startup từ chối production có mode demo/mail-file/insecure cookie.

## 8. File bàn giao khi Agent xong

Source frontend + backend; migration thực tế đã chạy; lockfiles; OpenAPI thực khớp handoff hoặc ADR diff; coverage frontend-api-map; seed local an toàn; .env examples không secret; compose/Dockerfile đúng repo; README local/aaPanel; ảnh UI sau nối API; kết quả test, log build, restore drill, performance report; danh sách thiếu rõ ràng.

```text
BACKEND_DELIVERY_RESULT
API_OPERATIONS_IMPLEMENTED=<thực tế>/<registry hiện tại>
CORE_UI_API_MAPPING=<thực tế>/118
POSTGRES_MIGRATIONS=<PASS|FAIL|NOT_RUN>
TENANT_SCOPE_TESTS=<PASS|FAIL|NOT_RUN>
PARENT_ISOLATION_REVOKE_TESTS=<PASS|FAIL|NOT_RUN>
PUBLISH_SNAPSHOT_TESTS=<PASS|FAIL|NOT_RUN>
FRONTEND_CONNECTED=<YES|PARTIAL|NO>
MOCK_FALLBACK_IN_CONNECTED_MODE=NO
DOCKER_LOCAL_URL=http://127.0.0.1:<port thực tế>
DOCKER_HEALTH=<thực tế>
BACKUP_RESTORE_DRILL=<PASS|FAIL|NOT_RUN>
PERFORMANCE=<MEASURED|NOT_RUN>
REAL_STUDENT_DATA_USED=NO
PRODUCTION_DEPLOYED=NO
BLOCKERS=<không bỏ trống; NONE nếu thực sự không còn>
```

Bộ handoff này có SQL/OpenAPI/Compose thiết kế để làm điểm xuất phát. Agent bắt buộc chạy validator/migration/integration/Docker trên môi trường thật rồi sửa lỗi bằng migration/ADR, không suy ra “đã chạy” từ file có sẵn.
