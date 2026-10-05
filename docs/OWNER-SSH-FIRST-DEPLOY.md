# EduManage — chủ hệ thống tự SSH first deploy

Ngày chuẩn bị: 04/10/2026. Repository: `https://github.com/cuongdesignnb/edu`. Release mới: **v1.0.1**.

Agent chỉ chuẩn bị source, tag, GHCR và lệnh; không SSH/deploy production. Chỉ chạy sau báo cáo **READY_FOR_OWNER_FAST_DEPLOY** xác nhận Actions PASS, tag đúng source và đủ API/Web image digest. Script kiểm trực tiếp source tag remote và OCI revision/version trước khi chạy, khóa runtime bằng digest.

## FIRST DEPLOY WITHOUT SMTP — v1.0.1

Trạng thái do chủ server cung cấp: `/www/wwwroot/edu` checkout v1.0.0; `.env.production` và `.secrets/production` đã có; `APP_URL=https://chunhiemso.com`, `APP_PORT=18763`; SMTP blank; DNS/SSL/aaPanel proxy xong; chưa có containers/volumes production. Đây là giả định đầu vào, chưa được agent kiểm tra trên server.

Trong phiên SSH do chủ hệ thống tự mở, chạy block này:

```bash
set -euo pipefail
cd /www/wwwroot/edu
test -z "$(git status --porcelain)"
git fetch origin refs/tags/v1.0.1:refs/tags/v1.0.1
git checkout --detach v1.0.1
python3 scripts/production.py preflight
bash scripts/release.sh v1.0.1
bash scripts/prod-status.sh
```

Không cần migrate env legacy. SMTP_HOST/PORT/USER/SECURE/MAIL_FROM blank được chấp nhận; SMTP_PASSWORD nếu có chỉ được phép rỗng. Các giá trị SMTP env không còn điều khiển worker. Không tạo lại secrets, không rotate app_key/mail_key, không dùng SMTP giả. Giữ file smtp_password cũ nếu host đã có: Compose không mount/dùng file đó.

SMTP mặc định chưa cấu hình/tắt. API/worker/Web vẫn healthy; mail chờ, không claim/tăng attempts/FAILED. Sau deploy và bootstrap admin thật ở mục 6, vào `/platform/settings`, bật SMTP với thông tin nhà cung cấp thật, lưu và gửi email kiểm tra. Mật khẩu không trả lại; để input rỗng giữ mật khẩu cũ; xóa cần hành động explicit khi đã tắt SMTP. Worker đọc cấu hình DB mỗi lượt, không cần rebuild/redeploy. Chỉ thư còn hiệu lực được gửi.

## Bản v1.0.0 bất biến

Tag/source cũ vẫn giữ `90103a33e83c2802090236ba8a92a2fe9cc7ce78`, workflow [37194038009](https://github.com/cuongdesignnb/edu/actions/runs/37194038009). API digest `sha256:3e1ab754c86b6b64e080135ecec31b271807547a60b767698c2e20ea7c0dc285`; Web digest `sha256:1c0f427b2ba6811d1e71ab6f5ad393b93c7d5728193f4f78956498e096b966bc`. Các lệnh bên dưới dành cho v1.0.1; server đã chuẩn bị chỉ cần block cấp tốc trên rồi bootstrap admin.

## 1. Chuẩn bị một lần

Server cần Linux amd64, Docker Engine + Compose V2, Git, Bash, Python 3.10+ và aaPanel Nginx. Chuẩn bị domain/DNS và email admin thật. SMTP là tùy chọn; cấu hình sau khi đăng nhập quản trị nền tảng. Nếu GHCR private, cần tài khoản có quyền đọc cả hai package và token `read:packages`. Không đưa mật khẩu/token vào chat hoặc Git.

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
EXPECTED_SHA="$(git ls-remote https://github.com/cuongdesignnb/edu 'refs/tags/v1.0.1^{}' | cut -f1)"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]
test ! -e /www/wwwroot/edu
git clone --branch v1.0.1 --single-branch https://github.com/cuongdesignnb/edu /www/wwwroot/edu
cd /www/wwwroot/edu
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]
[[ "$(git rev-parse 'refs/tags/v1.0.1^{commit}')" == "$EXPECTED_SHA" ]]
[[ "$(git ls-remote origin 'refs/tags/v1.0.1^{}' | cut -f1)" == "$EXPECTED_SHA" ]]
[[ -z "$(git status --porcelain)" ]]
docker compose version
python3 --version
```

## 3. Điền config thật và tạo secrets riêng

Block này tạo file mới; không ghi đè cấu hình đã có. Nó điền release/source tự động, còn domain phải do chủ hệ thống nhập.

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
p.write_text(p.read_text().replace('REPLACE_RELEASE','v1.0.1').replace('REPLACE_SOURCE_SHA',sha))
p.chmod(0o600)
PY
nano .env.production
```

Trong editor, thay **REPLACE_DOMAIN** bằng domain thật; chọn port trống nếu 18763 đang dùng. Giữ project/database `edumanage_production`, `COOKIE_SECURE=true`, `SECRET_DIR=./.secrets/production`, image digest hạ tầng. SMTP lưu trong database, không yêu cầu env SMTP hoặc smtp_password.

```bash
set -euo pipefail
cd /www/wwwroot/edu
python3 scripts/prepare-production-secrets.py \
  --directory .secrets/production --confirm-new
```

Generator tạo đúng 7 base secrets. Chỉ chạy cho server mới chưa có secrets. Không copy secrets, database, account hoặc link phụ huynh từ local. Generator từ chối ghi đè secrets cũ; không đổi secrets để sửa lỗi deploy.

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

Khi báo cáo bàn giao xác nhận cả hai image `v1.0.1` public và PASS, release không cần token GHCR. Trước deploy có thể đối chiếu digest trực tiếp (lệnh này không khởi động container):

```bash
docker buildx imagetools inspect ghcr.io/cuongdesignnb/edu-api:v1.0.1
docker buildx imagetools inspect ghcr.io/cuongdesignnb/edu-web:v1.0.1
```

Đối chiếu digest với báo cáo bàn giao release v1.0.1. `release.sh` kiểm labels/source và khóa runtime bằng digest khi triển khai.

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
bash scripts/release.sh v1.0.1
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

Mỗi lần cập nhật cần source/tag mới được duyệt và cả hai image publish thành công. Với hotfix `v1.0.4`, chỉ chạy sau khi nhận báo cáo xác nhận đủ các gate ở mục 10:

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

## 8. Cập nhật v1.0.2 — tạo trực tiếp quản trị trường

Sau khi nhận xác nhận `READY_FOR_OWNER_UPDATE` cho v1.0.2, chạy block sau trên server đã có source, `.env.production` và `.secrets/production`. Không cần bật SMTP. Script kiểm tag/source/digest và tự áp dụng migration 058; giữ cấu hình, secrets và volumes.

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.2
bash scripts/prod-status.sh
```

Nếu server chưa có containers, update/release xử lý first deployment theo gate của package hiện có. Nếu đã chạy, script tạo backup và bảo trì trước migration. Không sửa tag v1.0.0/v1.0.1. Không dùng `latest`, không seed demo hoặc xóa volume.

Sau khi status healthy, đăng nhập Platform Operator → Trường học → chọn trường → Quản trị trường. Hai lựa chọn: **Tạo tài khoản quản trị** (không email) và **Gửi lời mời qua email** (chờ khi SMTP tắt). Bật đổi mật khẩu lần đầu cho tài khoản mới; chuyển mật khẩu qua kênh riêng. Identity đã tồn tại phải gán explicit, giữ mật khẩu cũ. Xem [DIRECT-SCHOOL-ADMIN-RESULT.md](DIRECT-SCHOOL-ADMIN-RESULT.md).

## 9. Cập nhật v1.0.3 — P0 tài khoản giáo viên, tour, cổng lớp, PDF và nhập TKB

**Đã thay thế bằng hotfix v1.0.4 ở mục 10.** Production xác nhận v1.0.3 lỗi RLS tại migration 059 khi database đã có trường; active release vẫn v1.0.2 và schema 058. Giữ nguyên tag/image v1.0.3 để truy vết; không chạy lại bản này.

Các tính năng P0 vẫn được giữ trong v1.0.4. Sau khi healthy, quản trị trường tạo giáo viên ở Nhân sự; GVCN/quản trị vào Báo cáo lớp bật cổng công khai/QR nếu muốn, hoặc tải phiếu PDF phụ huynh. Nhập TKB ở Lịch lớp, ánh xạ tên và nhập giờ thật trước khi lưu nháp/validate/công bố. Không tự bật các mục công khai khi cập nhật. Chi tiết: [TODAY-P0-RESULT.md](TODAY-P0-RESULT.md).

## 10. Hotfix v1.0.4 — nâng schema 058 qua migration 059 có RLS

Chỉ chạy sau báo cáo `EDUMANAGE_V103_MIGRATION_HOTFIX_RESULT` xác nhận source/tag đúng SHA, Actions PASS, đủ API/Web image và production config static check PASS. Theo owner, server đang healthy ở v1.0.2/schema 058; agent không SSH hoặc xác minh trực tiếp host này.

Chạy block sau bằng SSH của owner. Script tự fetch tag chính xác, kiểm source/image digest/config, backup theo quy trình hiện có, chạy migration 059 theo từng trường trong một transaction, rồi 060 và verify-installation/health/HTTPS. Giữ `.env.production`, `.secrets/production`, database, uploads và volumes hiện tại; SMTP blank vẫn được hỗ trợ.

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.4
bash scripts/prod-status.sh
```

Kết quả mong đợi: `RELEASE=v1.0.4`, `MIGRATION=060-public-class-portals.sql`, `SCHEMA_MATCHES_RELEASE=YES`, các service healthy và `HTTPS=PASS`. Nếu script dừng, gửi output đã loại secret cùng `prod-status`; giữ dữ liệu và dùng hotfix theo lỗi được báo, không sửa checksum/ledger hoặc chạy SQL tay. Không restore DB, không xóa volume, không move tag. Chi tiết kiểm thử: [V103-MIGRATION-RLS-HOTFIX.md](V103-MIGRATION-RLS-HOTFIX.md).

## 11. Toàn bộ phần còn lại — v1.0.5

Owner đã xác nhận production v1.0.4/schema 060 healthy. Chỉ chạy sau `EDUMANAGE_ALL_REMAINING_RESULT` có `DECISION=READY_FOR_OWNER_UPDATE`, tag/source đúng SHA, Actions PASS và đủ digest API/Web. Agent không SSH hoặc xác minh trực tiếp production.

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.5
bash scripts/prod-status.sh
```

Kỳ vọng: `RELEASE=v1.0.5`, `MIGRATION=065-position-bonus-settings.sql`, `SCHEMA_MATCHES_RELEASE=YES`, service healthy và HTTPS PASS. Updater tự xác minh tag/OCI revision/digest, backup, chạy 061–065 và verify-installation. Giữ env, secrets, database, uploads và volume, domain/SSL/aaPanel proxy; SMTP blank vẫn hợp lệ. Không seed demo, SQL tay, xóa volume hoặc move tag. Rollback về image schema cũ bị chặn sau migration; cần hotfix tương thích nếu có lỗi. Phạm vi và bằng chứng: [ALL-REMAINING-RESULT.md](ALL-REMAINING-RESULT.md).
