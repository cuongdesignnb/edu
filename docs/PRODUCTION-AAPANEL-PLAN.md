# EduManage — production package và kế hoạch aaPanel

Ngày chuẩn bị: 2026-10-04. Repository `https://github.com/cuongdesignnb/edu`, branch `codex/new-machine-audit-20261002`. Khi bắt đầu: local HEAD = remote HEAD = `8669871e610b751ab4388b0fc165ee47937e7263`, unpushed commits 0, application source chưa commit NONE. Remote được fetch bằng refspec branch cụ thể vì cấu hình clone cũ chỉ fetch branch backend. Các ảnh/log/báo cáo QA riêng còn trong worktree được giữ lại, không stage cùng package.

## Package tại root

`deploy/compose.production.yml`, `.env.production.example`, `nginx.production.conf`, `aapanel-location.conf`, Dockerfile API/Web; scripts tạo secrets, preflight, release, update, rollback, status, logs và backup; `.github/workflows/publish-production-images.yml`. `scripts/production.py` là implementation dùng chung cho các Bash wrapper, không phải một quy trình deploy khác. `prod-up.sh` gọi cùng release gate. Backup/preflight local vẫn giữ cách gọi cũ. `docs/backend-handoff/` chỉ là tham khảo.

Git source → tag `vX.Y.Z` → Actions build với npm lockfiles → GHCR API/Web → Docker Compose → gateway loopback → aaPanel Nginx HTTPS. Default project/database `edumanage_production`; volumes `edumanage_production_pgdata`, `edumanage_production_private_files`. Chỉ gateway publish `127.0.0.1:APP_PORT:8080`. PostgreSQL/API/Web không có host port. Các container có healthcheck, rotation logs, restart policies, RAM/CPU limits và private storage; app non-root, read-only filesystem + tmpfs. Migrator có role riêng; không seed production. API/worker/migrate dùng cùng API digest.

API/Web dùng version tag để pull, kiểm OCI source SHA/version/repository rồi khóa runtime bằng digest. Infrastructure cũng pin digest. API build SHA lấy từ tag source đã xác minh. Workflow chỉ phát version và `sha-<12>` tags, không `latest`; Actions được pin theo commit. Production secrets không nằm trong build context. Mỗi image build một lần trong workflow, chỉ publish sau khi cả hai build đạt. Workflow dùng GITHUB_TOKEN `packages:write`; server private-package login dùng token `read:packages` qua stdin. Các package có thể private dù source repo public.

## Các gate vận hành

- Linux amd64 server, Docker local Unix socket, đúng repository/project/database, worktree sạch, env thật, secrets production riêng; port bị chiếm bởi dịch vụ khác thì dừng.
- Release phải checkout đúng tag và SHA tag remote. Refuse moving tag/digest mismatch, placeholder hoặc `latest`.
- Pull/verify images trước maintenance. Không tự upgrade PostgreSQL digest của một release đang có; việc đó cần DBA plan.
- Database/volumes có sẵn: backup nhất quán, kiểm dump/archive trước migration; failure dừng update. Backup không đọc trực tiếp pgdata live.
- Migration đúng một lần + verify-installation; `up --no-deps` không chạy lại migration. Migration failure giữ maintenance, ghi FAILED journal; không tự start app cũ với schema mới một phần.
- Health tất cả service, HTTP loopback live/ready/home/login, HTTPS domain live/ready/home/login và Secure __Host CSRF cookie. Chỉ ghi current release SUCCESS sau smoke PASS. Staff login/tenant/private-file business flows vẫn cần acceptance bằng tài khoản production thật.
- `.production/current.json`, release history và last-operation journal chứa source SHA, image digests, migration revision/checksums, backup path, deployed_at; chúng được gitignore. Không gán image build-check chưa commit cho commit release mới.
- Rollback image dùng receipt cũ và chỉ khi schema/checksums bằng target. Schema khác trả `ROLLBACK_BLOCKED_NEEDS_RESTORE`, không down SQL/restore âm thầm.

## Kiểm tra package trước bàn giao

Static Compose với input tổng hợp: PASS; không phải domain/SMTP thật. Nginx Docker gateway và fragment aaPanel: `nginx -t` PASS; vhost SSL thực tế vẫn phải test trên server. Workflow: YAML + actionlint PASS, GHCR publication chưa chạy. API Docker build/typecheck và 30 backend unit tests trên dist build mới: PASS. Frontend build/typecheck, ESLint file đổi, 24 core adapter/seating + 18 authentication unit tests: PASS. Frontend được build lại sau yêu cầu dọn demo, không dùng build cũ để chứng minh source mới. Browser Edge thực với Docker local: 2/2 PASS cho login/help không thông tin demo, URL demo/preview/preview-assets 404, login staff và workspace theo quyền, logout xóa trường đăng nhập. Script failure gates: 12/12 PASS trên Linux, bao gồm giữ lock qua update/exec.

Stack Docker riêng `edumanage_package_check_20261004`: health PASS, migration tới `056-personal-onboarding-progress.sql` và replay không thêm migration PASS, verify-installation PASS, API ready + login PASS, private storage giữ sau restart PASS. Backup thật trong stack cô lập: pg_dump/pg_restore-list, private files tar, release/schema metadata và checksum PASS; writer stop/resume PASS. Thử backup bắt được lỗi Compose start phụ thuộc one-shot container đã bị --rm; đã sửa để khởi động đúng container IDs ban đầu và kiểm health, thử lại PASS. Stack test không publish host port; sau kiểm tra đã dừng, giữ volumes. Đây là thử package, không phải production deployment hoặc restore rehearsal. Docker local đã bị dừng từ 2026-10-02 trước job này; khởi động lại PostgreSQL/API/worker nguyên image/config để kiểm browser. Database và secrets được giữ; cập nhật Web và chặn đường dẫn demo theo yêu cầu bổ sung.

Không chạy lại audit CMS hoặc thêm tính năng. Theo yêu cầu bổ sung, frontend bỏ email mẫu ở login, banner demo trong auth frame, nhánh chuyển trang demo và nội dung trợ giúp demo; gateway chặn cả preview assets. Login thật và chọn workspace theo quyền được giữ lại, kiểm tra bằng browser riêng. Các luồng Guided Tour, notification dropdown, classroom seating đã test ở các commit trước; backend/migrations không đổi. Production acceptance của chúng không được gán PASS chỉ từ build/static check.

## Input và trạng thái chưa có

| Input | Trạng thái |
| --- | --- |
| DOMAIN + DNS A/AAAA + certificate | Chưa cung cấp |
| APP_PORT | Đề xuất 18763; host preflight phải xác nhận trống |
| ADMIN_EMAIL | Chưa cung cấp; không dùng Git author email làm admin mặc định |
| SMTP_HOST/PORT/TLS/USER/MAIL_FROM | Chưa cung cấp; password nhập file/prompt trên host |
| Linux server/SSH hoặc phiên vận hành được phép | Chưa cung cấp |
| GHCR visibility và server read access | Chưa xác minh, image chưa được publish |
| Release tag | Đề xuất v1.0.0, chưa được cho phép push |

Package được hoàn thiện để có thể triển khai sau khi input/release sẵn sàng. Quyết định hiện tại: **BLOCKED_MISSING_INPUT**; không deploy production, không push tag. Không yêu cầu credential để hoàn thiện phần package có thể kiểm tra ở máy hiện tại.

## Acceptance trên server sau first deploy

Operator ghi PASS/FAIL và evidence riêng tư; không public cookie/token/password/parent URL hoặc dữ liệu học sinh. Trạng thái hiện tại của các mục sau là **NOT_RUN_ON_PRODUCTION**:

| Mục | Cách xác minh |
| --- | --- |
| HTTPS homepage/login, API live/ready | release.sh + prod-status.sh; source SHA đúng receipt |
| Secure staff cookie và login staff | Bootstrap admin thật; login qua HTTPS, kiểm __Host-edu_staff Secure/HttpOnly/Path=/ |
| Role/tenant guards | Tài khoản được cấp scope thật; kiểm deny cross-tenant bằng dữ liệu tổng hợp được cho phép |
| Parent link flow | Link tổng hợp do trường test tạo, không log URL/token |
| Guided Tour staff/parent | Quyền/scope đúng, tiến độ cá nhân giữ lại |
| Classroom seating | GVCN hoặc role có quyền đổi/lưu phiên bản bằng lớp test |
| Private upload/download | File test riêng tư; deny tải khi thiếu quyền |
| Migration/verify-installation | CLI + schema/checksum receipt |
| Restart persistence | Maintenance được duyệt; verify database/private file test sau restart |
| No DB/API/Web public host ports | docker compose config + docker inspect; gateway loopback |
| aaPanel SSL renew | /.well-known route còn nguyên, Nginx config test, certificate renew settings |
| Backup/restore | Checksum + encrypted off-host copy; rehearsal restore vào project/volumes cô lập |

Không dùng dữ liệu học sinh thật cho destructive test. Không xóa volume, seed demo hoặc mở thêm port để debug.

Lệnh copy/paste đầy đủ: [PRODUCTION-FIRST-DEPLOY.md](PRODUCTION-FIRST-DEPLOY.md). Tài liệu dựa trên [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) và [GitHub publish container images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).
