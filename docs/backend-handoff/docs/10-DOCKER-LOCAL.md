# 10 — Docker local: 127.0.0.1:18763

## Mục tiêu

Agent lập trình xong mới build và chạy stack. Môi trường Windows dùng Docker Desktop Linux containers + WSL2 Bash/Python3; Linux dùng Docker Engine + Compose plugin. Không yêu cầu PostgreSQL/Node host để chạy image; Node host chỉ cần nếu dev/test ngoài container. Không cài Docker bằng curl script không kiểm soát.

Stack năm service dài hạn: gateway, web, api, worker, postgres; migrate và storage-init chạy một lần. `postgres` không publish port, DBvolume riêng; `private_files` giữ tệp riêng. Image runtime non-root cho app/gateway; init quyềnfiles dùng root giới hạn, không Docker socket mount.

## Đặt file

Trong root **source frontend** đã có package.json/lockfile, merge `deploy/` và `scripts/`. Đặt toàn tài liệu vào `backend-handoff/`, không overwrite docs frontend. Agent tạo backend/ với scripts/assets/migrations đúng hợp đồng. Merge gitignore/dockerignore fragments, không đưa .secrets/.env/backups vào git hoặc buildcontext.

## Chạy lần đầu sau khi backend hoàn tất

```bash
# Chạy tại root source, KHÔNG tại thư mục tài liệu standalone
python3 scripts/prepare-local.py
python3 scripts/preflight.py
bash scripts/dev-up.sh
bash scripts/seed-local.sh
```

prepare tạo secret chỉ khi thiếu; giữ lại các secret cũ. Thư mụcsecret0700, leaf0444 để UIDnode đọc Docker file mount; không phải secret manager hay mã hóa. Docker Desktop/hostACL khác cần kiểm UIDmount bằng container trước; không chữa bằng chmod777 toàn project.

seed hỏi passwordẩn, CLI tự chặn APP_ENV khác local/db không hậu tố_local. Seed namespace stable tạo hai trường, giáo viên theo scope, student synthetic và hoạt động test; không seed fixed default adminpassword. Địa chỉ login local do CLI liệt kê, không in password/linktoken. Parent link phát hành từ tài khoản được quyền trong UI.

```text
UI:        http://127.0.0.1:18763/login
API live:  http://127.0.0.1:18763/api/v1/health/live
API ready: http://127.0.0.1:18763/api/v1/health/ready
```

## Kiểm tra và dừng

```bash
source scripts/common.sh
dc ps -a
dc logs --tail=100 api worker migrate
python3 scripts/smoke-local.py
bash scripts/dev-down.sh
```

Không paste logtoken ra chat. `down` giữvolumes. Không dùng `down -v`/prune để sửa lỗi. Port18763 trùng thì chọn port khác bằng chuẩn bịenv ban đầu `--port`; khi env đã có, sửa **cả APP_PORT và APP_URL**, restart riêngproject. Script không kill process chiếmport. Loopback không phục vụ điện thoại khác trong LAN; testphone qua tunnel an toàn hoặc cấu hìnhLAN được duyệt riêng, không tự bind0.0.0.0.

## Mail local

MAIL_MODE=file: worker ghi localmail trong volume, delivery labelLOCAL_FILE, không gửi raInternet. Inspect qua CLI chủ động, không expose dashboardmailpublic. Invitation/reset được xử lý thật bằng token, chỉ transport làfile. SMTP thật chỉ khi môi trường đã cấu hình, không hứa mail đã gửi dựa vào202.

## Lưu ý image/health

Tagmajor trong template local là lựa chọn ban đầu; ghi digest đã pull. Production cần digest immutable. `depends_on: service_healthy` đợidependency; migrate success one-off. Healthcheck live không thay ready; không endpointready200 khi migrationsmissing/storageunwritable. Composekhông phải zero-downtime orchestrator.

Build Next dùng output standalone; nếu workspace khác, chỉnh COPY outputpath cho đúng. NEXT_PUBLIC được đóng vào build; runtime ENV không sửa được JS đã build. Không build API-base trỏ localhost3001: browser luôn gọi relative /api/v1.

## Lỗi thường gặp

| Dấu hiệu | Điều tra đúng |
|---|---|
| Thiếu backend/package.json | Chưa có app, Agent cần lập trình trước, không tạo stub để pass Docker |
| pg password mismatch sau đổi .secret | Volume còn credential cũ; rotate ALTER ROLE có kiểm soát, không xóavolume |
| permission denied /data hoặc /run/secrets | Kiểm UID1000/leafmode/mount; không chạy mọi container root |
| 502 gateway | API/web health/log/DNScontainer; không đổi sang exposeallports |
| RLS dữ liệu trống | Kiểm school context/membership/SETLOCAL; không cấp BYPASSRLS |
| /login200 nhưng dashboardmock | DATA_MODE/buildflag/repository adapter chưa nối; không nghiệm thu |
| Tệp mất khi recreate | Sai mountvolume, đang lưu containerlayer; sửa STORAGE_ROOT vàtest |

Ảnh/diagram và templates không là deployment. Chỉ Agent chạy xong lệnh thực tế, smoke + authenticatedE2E và lưu log mới được báo LOCAL_DEPLOYED=YES.
