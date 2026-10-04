# EduManage — chủ hệ thống tự SSH first deploy

Ngày chuẩn bị: 04/10/2026. Repository: `https://github.com/cuongdesignnb/edu`. Release: **v1.0.0**.

Agent chỉ chuẩn bị Git/tag/GHCR và tài liệu này. Chủ hệ thống tự thực hiện các bước SSH, aaPanel, DNS và deploy bên dưới. Chỉ chạy khi báo cáo bàn giao xác nhận **READY_FOR_OWNER_SSH**, có source SHA, Actions PASS và đủ digest API/Web. Đây không phải xác nhận production đã chạy.

Release đã xác minh ngày 04/10/2026:

| Mục | Giá trị |
| --- | --- |
| Tag | `v1.0.0` |
| Source SHA của tag và cả hai image | `90103a33e83c2802090236ba8a92a2fe9cc7ce78` |
| API | `ghcr.io/cuongdesignnb/edu-api@sha256:3e1ab754c86b6b64e080135ecec31b271807547a60b767698c2e20ea7c0dc285` |
| Web | `ghcr.io/cuongdesignnb/edu-web@sha256:1c0f427b2ba6811d1e71ab6f5ad393b93c7d5728193f4f78956498e096b966bc` |
| Actions | [Publish production images — PASS](https://github.com/cuongdesignnb/edu/actions/runs/37194038009) |
| GHCR | Cả hai manifest/config đọc công khai được; revision/version/source/platform đã đối chiếu |
| Static config | PASS với input tổng hợp; kiểm host thật do chủ hệ thống thực hiện |

Tài liệu này được cập nhật sau khi publish để bổ sung digest và sửa URL clone. Các commit tài liệu sau tag không thay source ứng dụng, production scripts hoặc image của release. Khi SSH, checkout đúng `v1.0.0` và dùng các block trong **bản hướng dẫn cập nhật này**; không checkout branch tài liệu làm source chạy.

## 1. Chuẩn bị một lần

Server cần Linux amd64, Docker Engine + Compose V2, Git, Bash, Python 3.10+ và aaPanel Nginx. Chuẩn bị domain/DNS, email admin thật, SMTP host/port/TLS/user/MAIL_FROM và mật khẩu SMTP. Nếu GHCR private, cần tài khoản có quyền đọc cả hai package và token `read:packages`. Không đưa mật khẩu/token vào chat hoặc Git.

Port đề xuất **18763**, chỉ bind `127.0.0.1`. Không mở 18763, 5432, 3000, 3001 ra Internet. Public ứng dụng dùng 80/443 qua aaPanel; SSH theo chính sách của chủ server.

Trên máy của chủ hệ thống, tự mở phiên SSH:

```bash
read -r -p 'SSH user: ' SSH_USER
read -r -p 'SSH hostname hoặc IP: ' SSH_HOST
ssh "$SSH_USER@$SSH_HOST"
```

Các block tiếp theo chạy **trên server**, bằng tài khoản có quyền Docker và thư mục triển khai. Chưa đáp ứng yêu cầu thì dừng; không dùng Node/PM2 hay PostgreSQL host thay Compose.

## 2. Checkout đúng source release

`/www/wwwroot/edu` phải chưa tồn tại. Nếu đã có ứng dụng ở đó, dừng và xác định quy trình cập nhật; không ghi đè hoặc xóa thư mục.

```bash
set -euo pipefail
EXPECTED_SHA=90103a33e83c2802090236ba8a92a2fe9cc7ce78
test ! -e /www/wwwroot/edu
git clone --branch v1.0.0 --single-branch https://github.com/cuongdesignnb/edu /www/wwwroot/edu
cd /www/wwwroot/edu
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]
[[ "$(git rev-parse 'refs/tags/v1.0.0^{commit}')" == "$EXPECTED_SHA" ]]
[[ "$(git ls-remote origin 'refs/tags/v1.0.0^{}' | cut -f1)" == "$EXPECTED_SHA" ]]
[[ -z "$(git status --porcelain)" ]]
docker compose version
python3 --version
```

## 3. Điền config thật và tạo secrets riêng

Block này tạo file mới; không ghi đè cấu hình đã có. Nó điền release/source tự động, còn domain và SMTP phải do chủ hệ thống nhập.

```bash
set -euo pipefail
cd /www/wwwroot/edu
umask 077
test ! -e .env.production
cp deploy/.env.production.example .env.production
python3 - <<'PY'
from pathlib import Path
import subprocess
p=Path('.env.production')
sha=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip()
p.write_text(p.read_text().replace('REPLACE_RELEASE','v1.0.0').replace('REPLACE_SOURCE_SHA',sha))
p.chmod(0o600)
PY
nano .env.production
```

Trong editor, thay **REPLACE_DOMAIN, REPLACE_SMTP_HOST, REPLACE_SMTP_USER, REPLACE_MAIL_FROM** bằng giá trị thật; chọn port còn trống nếu 18763 đang được dùng. Giữ `COMPOSE_PROJECT_NAME=edumanage_production`, database production riêng, `SECRET_DIR=./.secrets/production`, `COOKIE_SECURE=true`, `MAIL_MODE=smtp` và các image digest hạ tầng. SMTP 465 dùng `SMTP_SECURE=true`; 587 thường dùng `false` cho STARTTLS, theo nhà cung cấp. Không đặt password/token vào `.env.production`.

```bash
set -euo pipefail
cd /www/wwwroot/edu
python3 scripts/prepare-production-secrets.py \
  --directory .secrets/production --confirm-new --smtp-password
```

Mật khẩu SMTP nhập trong prompt ẩn. Không copy secrets, database, account hoặc link phụ huynh từ local. Generator từ chối ghi đè secrets cũ; không đổi secrets để sửa lỗi deploy.

Chỉ chạy block sau nếu package GHCR private. Token nhập ẩn, truyền qua stdin:

```bash
set -euo pipefail
read -r -p 'GitHub username có quyền đọc cả hai package: ' GHCR_USER
read -r -s -p 'Token read:packages: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
unset GHCR_TOKEN
```

Repo public không tự chứng minh container package public. Dùng credential helper của Docker nếu server có cấu hình.

Hai image `v1.0.0` đã được xác minh pull công khai, nên release hiện tại không cần token GHCR. Trước deploy có thể đối chiếu digest trực tiếp (lệnh này không khởi động container):

```bash
docker buildx imagetools inspect ghcr.io/cuongdesignnb/edu-api:v1.0.0
docker buildx imagetools inspect ghcr.io/cuongdesignnb/edu-web:v1.0.0
```

Digest phải khớp bảng release ở đầu tài liệu. `release.sh` kiểm labels/source và khóa runtime bằng digest khi triển khai.

## 4. Chủ hệ thống cấu hình aaPanel/DNS/SSL

Tự trỏ DNS đúng server, tạo website Nginx đúng domain, cấp SSL hợp lệ và bật Force HTTPS trong aaPanel. Giữ route ACME `/.well-known/` và certificate directives để gia hạn SSL.

In fragment proxy theo APP_PORT đã chọn:

```bash
set -euo pipefail
cd /www/wwwroot/edu
python3 - <<'PY'
from pathlib import Path
env=dict(line.split('=',1) for line in Path('.env.production').read_text().splitlines() if line and not line.startswith('#'))
print(Path('deploy/aapanel-location.conf').read_text().replace('REPLACE_APP_PORT',env['APP_PORT']))
PY
```

Ghép fragment **location /** vào server HTTPS hiện có, thay location `/` cũ; không thay cả vhost. Gỡ PHP/static-cache/proxy includes và regex locations cạnh tranh với proxy; giữ riêng ACME. Không cache ứng dụng/API/parent. Hướng dẫn chi tiết: [PRODUCTION-FIRST-DEPLOY.md](PRODUCTION-FIRST-DEPLOY.md), mục 4.

Nếu aaPanel dùng đường dẫn Nginx chuẩn, kiểm config trước reload:

```bash
set -euo pipefail
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
```

Nếu binary khác, dùng đúng binary trong panel. Đây là cấu hình Nginx, không dùng cho Apache/OpenLiteSpeed. Proxy có thể trả 502 trước khi Docker chạy; certificate vẫn phải hợp lệ.

## 5. Preflight và first deploy

```bash
set -euo pipefail
cd /www/wwwroot/edu
python3 scripts/production.py preflight
bash scripts/release.sh v1.0.0
bash scripts/prod-status.sh
```

Không bỏ qua lỗi preflight. Script kiểm source/tag/image labels/digests, cấu hình và port; tạo volumes riêng, migrate một lần, verify-installation, health và HTTP/HTTPS. Chỉ ghi SUCCESS sau khi đạt các gate. API/worker dùng cùng API digest; Web dùng Web digest. Không seed demo, không mở public database/API/Web ports.

Nếu release lỗi, xem `.production/last-operation.json` và status; xử lý nguyên nhân rồi chạy lại release theo tài liệu. Không tự xóa volume, chạy `down -v`, đổi secret hoặc restore. Migration lỗi giữ bảo trì để tránh app cũ ghi vào schema thay đổi một phần.

## 6. Bootstrap admin thật và nghiệm thu

Chỉ chạy khi first deploy đã SUCCESS và chưa có platform admin. Lấy API digest từ release receipt, nhập email/mật khẩu thật; không dùng email Git author làm mặc định:

```bash
set -euo pipefail
cd /www/wwwroot/edu
read -r -p 'Email admin production thật: ' ADMIN_EMAIL
read -r -s -p 'Mật khẩu admin mới (12–256 ký tự): ' ADMIN_PASSWORD
printf '\n'
read -r API_IMAGE_REF SOURCE_SHA < <(python3 -c "import json; d=json.load(open('.production/current.json')); print(d['api_image'],d['source_sha'])")
printf '%s\n' "$ADMIN_PASSWORD" | API_IMAGE_REF="$API_IMAGE_REF" SOURCE_SHA="$SOURCE_SHA" docker compose \
  --project-directory /www/wwwroot/edu --env-file .env.production \
  --project-name edumanage_production -f deploy/compose.production.yml \
  run --rm -T --no-deps migrate bootstrap-admin --email "$ADMIN_EMAIL" --password-stdin
unset ADMIN_PASSWORD
```

Lưu mật khẩu trong password manager. Đăng nhập qua HTTPS và hoàn tất checklist trong [PRODUCTION-AAPANEL-PLAN.md](PRODUCTION-AAPANEL-PLAN.md): quyền/tenant, thông báo, tour, sơ đồ lớp, private files, parent link, SMTP, persistence và SSL renewal. Dùng dữ liệu kiểm thử được phép trước khi đưa dữ liệu thật vào. Backup archive/checksum PASS chưa thay thế diễn tập restore.

## 7. Cập nhật, kiểm trạng thái và backup

Mỗi lần cập nhật cần source/tag mới được duyệt và cả hai image publish thành công. `v1.0.4` là **ví dụ**, chỉ dùng khi tag đó thật sự tồn tại:

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.4
bash scripts/prod-status.sh
```

Update có khoảng bảo trì cho backup/migration/health; giữ config và secrets host. Lệnh kiểm tra/backup:

```bash
cd /www/wwwroot/edu
bash scripts/prod-status.sh
bash scripts/prod-logs.sh --tail 200
MODE=production bash scripts/backup.sh --confirm-maintenance
```

Backup phải mã hóa và copy ngoài host. Rollback dùng `bash scripts/rollback.sh <tag-đã-deploy-thành-công>` và chỉ được chấp nhận khi schema/checksum tương ứng; schema khác cần kế hoạch DBA/restore riêng. Không checkout script tag cũ để ép rollback, không tự chạy SQL down.
