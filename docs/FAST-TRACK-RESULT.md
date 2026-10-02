# EDUMANAGE_FAST_TRACK_RESULT

STARTED_AT=2026-10-02T06:26:16+07:00
FINISHED_AT=2026-10-02T07:09:27+07:00
BRANCH=codex/backend-postgresql
START_SHA=6fb227b
FINAL_SHA=9173e978e66132781e2706af1b8f7f159e37b80f
WORKTREE=DIRTY; source chạy đã commit, còn ZIP người dùng và log/chẩn đoán cũ được giữ nguyên, không reset
RUNNING_BUILD=edumanage-api và edumanage-web tag 9173e978e66132781e2706af1b8f7f159e37b80f; không chứa source runtime chưa commit
DELIVERY=PARTIAL
LOCAL_DEPLOYED=YES
LOCAL_URL=http://127.0.0.1:18763
CURRENT_ITERATION_COMPLETE=NO; còn các điều khiển nghiệp vụ ghi rõ bên dưới
FULL_PLATFORM_ACCEPTANCE=NOT_ASSESSED_IN_THIS_RUN
PRODUCTION_READINESS=NOT_ASSESSED_IN_THIS_RUN
GOAL_STOP=PAUSE_AFTER_HANDOFF; không tiếp tục goal toàn nền tảng

`FINAL_SHA` là commit source của bản đang chạy. Commit bàn giao sau đó chỉ thêm báo cáo và bằng chứng QA; HEAD mới nhất xem bằng `git log -1`. Thời điểm FINISHED_AT là lúc kết thúc triển khai và kiểm thử, trước thao tác lưu báo cáo/đóng goal. Checkpoint đã gửi trước mốc 60 phút; kết thúc sớm, không gia hạn.

COMPLETED=15 operation native cho thi đua/điều chỉnh; PostgreSQL thật; nguồn và phiên bản đang hiển thị được gửi vào lệnh; quyền trường/lớp/môn/ngày được kiểm lại trước cả idempotency replay; snapshot và bản chiếu phụ huynh bất biến; link phụ huynh không có tài khoản; Docker local đặt tại root. Luồng trình duyệt đã chạy: đăng nhập → lớp được phép → ghi nhận +2 → rà soát → chốt riêng → công bố 102 → phụ huynh xem → đề nghị bỏ ghi nhận → duyệt, phụ huynh còn thấy 102 → công bố lại 100 → lịch sử giữ bản 102.

File chính: `backend/src/modules/conduct/{conduct-workspace,adjustments-workspace}.ts`, các service thi đua hiện có, `backend/migrations/051-conduct-workspace-snapshots.sql`, contract/generator, `src/lib/repositories/connected/{conduct-workspace,conduct-adjustments}.ts`, màn thi đua hiện có, `deploy/`, `scripts/`, test có phạm vi. Không làm lại kiến trúc hay thiết kế. So sánh contract bằng máy: 379 operation/539 schema cũ đều giữ nguyên; chỉ thêm 15 operation/32 schema (`qa/backend/fast-track-contract-preservation.json`).

| TESTS_T1_T8 | Kết quả thực tế và giới hạn | Bằng chứng |
|---|---|---|
| T1 ghi nhận → rà soát → chốt → công bố | PASS với fixture tổng hợp: pending chưa tính chính thức; điểm decimal đúng; reload DB còn ghi nhận; phụ huynh thấy 102 sau công bố | `qa/backend/fast-track-postgres-scoped-final.log`; `qa/backend/fast-track-browser-final.log` |
| T2 phạm vi trường/nhiệm vụ | PASS: trường khác bị từ chối; quyền CLASS ở lớp khác không nâng SUBJECT thành quyền rà soát lớp này; subject chỉ thấy ghi nhận của mình/tiết thuộc nhiệm vụ; giới hạn ngày được kiểm bằng các unit quyền | PostgreSQL scoped final; `qa/backend/fast-track-scoring-permissions.log` |
| T3 thu hồi trong phiên | PASS: thu hồi grant chặn replay; thu hồi phân công chặn lớp; thu hồi membership/session/link/quan hệ chặn yêu cầu tiếp theo | PostgreSQL scoped final; `qa/backend/fast-track-postgres-history-parent-safety.log` (2 case quyền PASS, case mở rộng snapshot lỗi fixture rồi sửa ở log sau) |
| T4 dữ liệu riêng phụ huynh | PASS: không đọc em khác/nháp/nội bộ; studentId thêm vào query không đổi em được phép; chi tiết rule riêng không xuất hiện; browser chỉ thấy kết quả con | PostgreSQL scoped final; parent safety; browser final và restart browser final |
| T5 trùng/nguồn thay đổi | PASS: replay không nhân đôi, sự việc khác phải xác nhận/lý do; nguồn/record-version cũ bị 409; batch review sai một phiên bản không ghi dở | PostgreSQL scoped final; browser ghi trùng bị 409 và không lưu |
| T6 bất biến/điều chỉnh | PASS cho bỏ ghi nhận và thay điểm MANUAL trong giới hạn; trước công bố lại vẫn thấy bản cũ; thay nội quy có hiệu lực tuần sau không sửa snapshot cũ; không mở lại bản đã công bố | PostgreSQL scoped final; `qa/backend/fast-track-postgres-rule-change-final.log`; browser final |
| T7 lỗi ghi dữ liệu | PASS: lỗi 409 thật giữ hộp xử lý trùng và không tăng số ghi nhận; lỗi 409/503 unit truyền lỗi, không trả kết quả lưu thành công; không refetch nguồn để ghi đè hoặc fallback mock | Browser final; `qa/backend/fast-track-frontend-native-tests-final.log` |
| T8 đúng bản local/restart | PASS: API health xác nhận SHA chạy; PostgreSQL restart + API/worker/web recreate; fingerprint ghi nhận/snapshot/parent projection giống trước; staff và parent đọc lại 100 và lịch sử 102 → 100 | `qa/backend/fast-track-persistence-result.json`; `qa/backend/fast-track-restart-browser-final.log`; services final |

Các chữ PASS chỉ áp dụng cho case đã nêu, không chứng nhận mọi màn/nhánh hay toàn nền tảng.

TYPECHECK=PASS; frontend strict exit0 (`fast-track-frontend-types-final.log`); backend strict build exit0 trong Docker checkpoint và log backend types
BUILD=PASS; API + Next standalone đúng source SHA (`qa/backend/fast-track-local-build-checkpoint.log`)
LINT=PASS; chỉ các file nguồn/test liên quan (`fast-track-frontend-scoped-lint.log`, `fast-track-backend-scoped-lint.log`)
CONTRACT=PASS; 1 case native thực chạy (`fast-track-contract-scoring-permissions.log`); hai unit file trong lệnh có name-pattern không tính là đã chạy case; chạy riêng scoring/permissions đạt 7/7 (`fast-track-scoring-permissions.log`)
POSTGRES_INTEGRATION=PASS; batch chọn lọc 10/10, thêm 2 case parent/membership đạt và 1 case snapshot sau đổi nội quy đạt ở log follow-up; không chạy full suite
FRONTEND_UNIT=PASS; 9/9 test adapter thi đua/nội quy; đây là unit có stub fetch, không dùng làm bằng chứng PostgreSQL E2E
UI_E2E=PASS; walkthrough Edge 1/1 qua HTTP thật/PostgreSQL, không intercept API; đọc lại staff/parent sau restart cũng exit0
MIGRATION=PASS; 51 migration, replay applied=[], checksum và metadata giữ nguyên; installation xác nhận rolesSafe=true, forceRls=true
RESTART_PERSISTENCE=PASS; 1 ghi nhận, 2 publication và 2 parent item; SHA256 trước/sau đều 40ee4f8ccc97d5f53c6bd3a08c1b5643ac0c9ef7ea444a694a57cf39d7f8b39c

DOCKER_SERVICES=postgres/api/worker/web/gateway đều running healthy; migrate/storage-init exited0. Chỉ gateway bind 127.0.0.1:18763; DB không publish host port. Project `edumanage_local`; không xóa volume hay thao tác project khác.

- API/worker/migrate image: `sha256:5b695a93801b215947af9c6d4e845984dc0db509280427ab98a6a1e8a96ec716`.
- Web image: `sha256:6a54ef5fc574e63f5ada5703c576a4ab6f8fdf19bfb78c6e023597b2a271b3a1`.
- Cấu hình/secret local tồn tại và được ignore; khóa/mật khẩu cũ không rotate. Source bản chạy không DIRTY; log và ZIP còn lại không được đóng vào image.
- Lớp walkthrough cuối: `http://127.0.0.1:18763/classroom/263ee6c7-d3c2-5356-af6f-d4a7b4124e74/71287cf6-c093-540a-a350-33d267ef09d6/8a91d832-2a46-4cde-a95c-9f14cc5dc13f/conduct`.

AUTHENTICATION_FOR_TEST=admin-a@example.invalid. Mật khẩu ngẫu nhiên chỉ ở `D:\Edu\.secrets\local\local_test_password`; người dùng đọc file trên máy mình, không ghi mật khẩu/token trong báo cáo/chat. Link phụ huynh tổng hợp cuối ở `D:\Edu\.secrets\local\fast-track-parent-link`, hạn khoảng 24 giờ sau khi cấp. Phụ huynh mở link đó, không đăng nhập tài khoản.

BACKUP=CREATED trước migration051 trên DB kiểm thử cần giữ: `D:\Edu\.secrets\edumanage-fast-track-pre051.dump`, custom pg_dump, 1,841,999,195 bytes. RESTORE=NOT_RUN. Không nghiệm thu backup/restore từ việc chỉ tạo dump. Root `backup.sh` chưa thực thi trong lượt này.
PERFORMANCE=MEASURED_ONLY; 10 GET summary liên tiếp có đăng nhập, lớp tổng hợp 1 học sinh: p50 31.11ms, p95 42.91ms, min 28.14ms, max 42.91ms. Không phải load test hay benchmark production (`qa/backend/fast-track-restart-browser-result.json`).

BLOCKERS=NONE cho lát cắt đã test. Các lỗi đã gặp, giữ nguyên log lỗi:

- GET records 500: truy vấn `app.timetables` không tồn tại; chẩn đoán 42P01, sửa sang `app.timetable_versions`, test core đạt. Một lượt sửa nguyên nhân này.
- Đề nghị điều chỉnh 500: contract khai báo 200 trong khi tạo trả 201; sửa status contract, integration đạt. Một lượt sửa.
- Công bố lại từ UI 422: adapter gửi thừa cả row; sửa thành source + version, unit hồi quy và browser đạt. Một lượt sửa.
- Test browser: sửa bộ chọn nhãn bắt buộc, CSRF helper dùng receipt đăng nhập, chờ exchange link và đúng định dạng số/nhãn lịch sử. Không tắt bảo vệ CSRF hay sửa UI để chiều test. Test kỳ vọng deny403/404 được sửa theo tầng từ chối thực tế và vẫn kiểm không có data/cached success.
- Seed CLI lần đầu gọi lặp entrypoint; sửa lệnh theo entrypoint service, seed thành công, không reset tài khoản/DB.

DEFERRED=

- Thêm ghi nhận sau chốt chưa nối: server trả422, không giả thành công. Điều chỉnh điểm chỉ cho rule MANUAL có giới hạn; rule FIXED không cho ghi đè điểm.
- Đổi rule của ghi nhận đã lưu chưa hỗ trợ trong native command: server từ chối, dropdown khi sửa được khóa; sửa lý do/điểm MANUAL trong giới hạn đã test. Không sửa sự kiện hay snapshot bất biến.
- Snapshot tạo trước migration051 chỉ có tổng điểm được lưu: báo thiếu chi tiết, không tính lại từ dữ liệu hiện tại; giải trình/số ghi nhận chưa lưu được vô hiệu hóa/hiển thị “—”. Không backfill lịch sử giả.
- Class-rules/policy và publication center còn các facade chưa nối, ngoài đường đi đã kiểm trong lượt này. Inventory toàn frontend hiện170/231 phương thức legacy active,61 còn lại; không tuyên bố nối xong toàn frontend.
- Full integration/contract/frontend/E2E suite, toàn bộ B0–B7, restore, benchmark lớn và production: NOT_RUN/NOT_ASSESSED_IN_THIS_RUN. Không quay lại audit module khác.

Lệnh kiểm chứng đã chạy: Compose runner project `edumanage_backend_test`, `node --test --test-concurrency=1 --test-name-pattern='^(FAST |BE01|B2 staff delegation|B6 password/session commands|B4 section/download rights)' tests/integration/foundation.test.mjs`; hai follow-up đúng case parent/member và snapshot. Browser: `node node_modules/@playwright/test/cli.js test --config playwright.fast-track.config.ts`. Restart read: `node qa/backend/fast-track-restart-browser.mjs`. Local build/start dùng `docker compose --env-file .env.local-docker --project-name edumanage_local --project-directory D:\Edu -f deploy/compose.local.yml`; migration/health/service/image/restart log có trong QA. Không push hay deploy production.
