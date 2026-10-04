# EduManage — first deploy và cập nhật aaPanel

Package dành cho Linux amd64, Docker Engine + Compose V2, Python 3.10+, Bash, Git và aaPanel Nginx. Khuyến nghị VPS tối thiểu 2 vCPU/4 GB RAM, đủ dung lượng cho database, private files và backup. Chạy bằng tài khoản vận hành có quyền Docker và thư mục repo; aaPanel chỉ quản lý domain/SSL/proxy.

Chưa có domain, SMTP, email admin, server credential hoặc GHCR access được xác nhận. `v1.0.0` là release **đề xuất**, chưa được push. Các lệnh dưới đây có bước nhập đúng thông tin; không chứa secret thật. Không chạy deploy trước khi tag được duyệt, Actions publish thành công và aaPanel HTTPS sẵn sàng.

## 1. Chủ repo tạo release sau khi duyệt candidate

Thực hiện trong một checkout sạch, dùng CANDIDATE_SHA chính xác từ báo cáo bàn giao. Checkout làm việc hiện tại có ảnh/báo cáo QA riêng: không xóa chúng hoặc tạo tag từ worktree bẩn. Nếu đã có thư mục `edu-release`, chọn một thư mục mới.

```bash
set -euo pipefail
git clone --branch codex/new-machine-audit-20261002 https://github.com/cuongdesignnb/edu.git edu-release
cd edu-release
git config --local user.name cuongdesign
git config --local user.email dinhcuongdesign@gmail.com
read -r -p 'Candidate SHA đã duyệt (40 ký tự): ' CANDIDATE_SHA
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
git fetch origin codex/new-machine-audit-20261002 --tags
[[ "$(git ls-remote origin refs/heads/codex/new-machine-audit-20261002 | cut -f1)" == "$CANDIDATE_SHA" ]] || exit 1
git checkout --detach "$CANDIDATE_SHA"
[[ -z "$(git status --porcelain)" ]] || exit 1
git tag -a v1.0.0 "$CANDIDATE_SHA" -m 'EduManage production v1.0.0'
# Chỉ chạy dòng push sau khi chủ repo đã duyệt việc xuất bản release này.
git push origin v1.0.0
```

Theo dõi workflow **Publish production images** ở GitHub Actions. Cả API và Web phải thành công; xem source SHA và hai digest trong job summary. Workflow không xuất `latest`, từ chối ghi đè release đã tồn tại, và build cả hai image trước khi push. Nếu registry lỗi giữa hai lần push, review partial publication; không đưa bản thiếu một image lên server hoặc di chuyển tag đã xuất bản.

## 2. Trên server: checkout release

`/www/wwwroot/edu` phải là thư mục mới. Repo private dùng deploy key/credential helper; không đặt PAT trong clone URL.

```bash
set -euo pipefail
cd /www/wwwroot
git clone https://github.com/cuongdesignnb/edu.git edu
cd /www/wwwroot/edu
git fetch --tags origin
git checkout --detach v1.0.0
[[ -z "$(git status --porcelain)" ]] || exit 1
docker compose version
python3 --version
```

## 3. Tạo cấu hình bằng input thật

Port mặc định đề xuất 18763. Nếu bị chiếm, chọn port khác; script không kill dịch vụ đang dùng port. SMTP port 465 cần `SMTP_SECURE=true`; 587 thường dùng `false` để STARTTLS. MAIL_FROM phải là địa chỉ gửi đã được nhà cung cấp SMTP xác nhận.

```bash
set -euo pipefail
umask 077
read -r -p 'Domain (chỉ hostname, không https://): ' DOMAIN
read -r -p 'Gateway port [18763]: ' APP_PORT
APP_PORT="${APP_PORT:-18763}"
read -r -p 'SMTP host: ' SMTP_HOST
read -r -p 'SMTP port [587]: ' SMTP_PORT
SMTP_PORT="${SMTP_PORT:-587}"
read -r -p 'SMTP implicit TLS true/false [false]: ' SMTP_SECURE
SMTP_SECURE="${SMTP_SECURE:-false}"
read -r -p 'SMTP user: ' SMTP_USER
read -r -p 'MAIL_FROM (email): ' MAIL_FROM
export DOMAIN APP_PORT SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER MAIL_FROM
python3 - <<'PY'
import os, re, subprocess
from pathlib import Path
f = Path('.env.production')
if f.exists(): raise SystemExit('Không ghi đè .env.production đang có')
tag = 'v1.0.0'
sha = subprocess.check_output(['git','rev-parse','HEAD']).decode().strip()
domain = os.environ['DOMAIN']
if not re.fullmatch(r'[A-Za-z0-9.-]+',domain) or '.' not in domain:
    raise SystemExit('Domain không hợp lệ')
values = dict(COMPOSE_PROJECT_NAME='edumanage_production', APP_ENV='production',
    APP_PORT=os.environ['APP_PORT'], APP_URL='https://'+domain,
    POSTGRES_DB='edumanage_production', SECRET_DIR='./.secrets/production',
    API_IMAGE_REF='ghcr.io/cuongdesignnb/edu-api:'+tag,
    WEB_IMAGE_REF='ghcr.io/cuongdesignnb/edu-web:'+tag, SOURCE_SHA=sha,
    COOKIE_SECURE='true', MAIL_MODE='smtp',
    **{k:os.environ[k] for k in ('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','MAIL_FROM')})
template = Path('deploy/.env.production.example').read_text()
for line in template.splitlines():
    if line.startswith(('POSTGRES_IMAGE=','NGINX_IMAGE=')):
        key,value=line.split('=',1); values[key]=value
if any(not v or any(c in v for c in '\r\n$`') or 'REPLACE' in v for v in values.values()):
    raise SystemExit('Input thiếu hoặc không hợp lệ')
with f.open('x') as out:
    out.write(''.join(k+'='+v+'\n' for k,v in values.items()))
os.chmod(f,0o600)
PY
python3 scripts/prepare-production-secrets.py \
  --directory .secrets/production --confirm-new --smtp-password
```

Mật khẩu SMTP nhập trong prompt ẩn, không nằm trên command line/history. Không copy `.secrets/local`, local database, account kiểm thử hoặc parent link. Generator không ghi đè secret cũ. Leaf secret là 0444 để cả UID API và PostgreSQL đọc được bind mount; thư mục host là 0700, `.env.production` là 0600. Backup keys/SMTP riêng bằng lưu trữ mã hóa; mất app/mail keys có thể làm dữ liệu mã hóa không đọc được.

GHCR public: không cần login. GHCR private: dùng PAT classic có `read:packages`, tài khoản được phép đọc **cả hai** package; nếu org có SSO, cấp quyền SSO cho token. Ưu tiên Docker credential helper trên server.

```bash
set -euo pipefail
# Chỉ chạy nếu hai GHCR package là private.
read -r -p 'GitHub username có quyền đọc package: ' GHCR_USER
read -r -s -p 'GHCR read:packages token (ẩn): ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin
unset GHCR_TOKEN
```

Repository public không tự chứng minh GHCR package public. Kiểm tra visibility/package access và pull thực tế sau workflow.

## 4. aaPanel một lần: domain + SSL + proxy

DNS A/AAAA phải trỏ về server đúng; không để AAAA trỏ sang máy khác. Tạo website Nginx cho DOMAIN, bật Let's Encrypt và Force HTTPS. Giữ nguyên certificate và location `/.well-known/` do aaPanel quản lý để renew SSL. TLS có thể cấp qua ACME trước khi backend chạy.

Render đoạn cần ghép:

```bash
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
env=dict(line.split('=',1) for line in Path('.env.production').read_text().splitlines() if line and not line.startswith('#'))
print(Path('deploy/aapanel-location.conf').read_text().replace('REPLACE_APP_PORT',env['APP_PORT']))
PY
```

Ghép đoạn `location /` vào **server HTTPS hiện có** trong aaPanel, thay location `/` cũ. Không thay cả vhost. Gỡ PHP/static-cache/proxy includes và regex location cạnh tranh với proxy, giữ riêng ACME `/.well-known/`. Không cache đường dẫn ứng dụng/API/parent. Không chạy Node/PM2 hoặc host PostgreSQL cho EduManage. Public firewall chỉ cần 80/443 và SSH được giới hạn; không mở gateway port, 5432, 3000 hoặc 3001.

Với aaPanel Nginx chuẩn, test trước reload:

```bash
set -euo pipefail
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
```

Nếu aaPanel dùng binary Nginx ở vị trí khác, dùng đúng binary trong panel. Không dùng lệnh này cho Apache/OpenLiteSpeed. Trước deploy, proxy trả 502 là bình thường khi Docker chưa chạy; certificate vẫn phải hợp lệ.

## 5. First deploy

```bash
set -euo pipefail
cd /www/wwwroot/edu
python3 scripts/production.py preflight
bash scripts/release.sh v1.0.0
bash scripts/prod-status.sh
```

Script kiểm tag/SHA remote, image labels/digests, cấu hình và port; tạo volumes production riêng; init role, storage; chạy migration đúng một lần, verify-installation, start/health/smoke gateway và HTTPS. Volume mới báo `BACKUP=SKIPPED_NEW_VOLUME`; volume đã tồn tại luôn cần backup thành công trước migration. Không có seed demo. HTTPS lỗi khiến release báo FAILED, không ghi metadata SUCCESS; không tự rollback schema hay xóa volume. Xem `.production/last-operation.json` và status, sửa nguyên nhân rồi chạy lại cùng release.

Bootstrap admin thật sau migration, chỉ khi chưa có platform admin:

```bash
set -euo pipefail
read -r -p 'Email admin production thật: ' ADMIN_EMAIL
read -r -s -p 'Mật khẩu admin mới (12–256 ký tự, ẩn): ' ADMIN_PASSWORD
printf '\n'
read -r API_IMAGE_REF SOURCE_SHA < <(python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path('.production/current.json').read_text())
print(d['api_image'],d['source_sha'])
PY
)
printf '%s\n' "$ADMIN_PASSWORD" | API_IMAGE_REF="$API_IMAGE_REF" SOURCE_SHA="$SOURCE_SHA" docker compose \
  --project-directory /www/wwwroot/edu --env-file .env.production \
  --project-name edumanage_production -f deploy/compose.production.yml \
  run --rm -T --no-deps migrate bootstrap-admin \
  --email "$ADMIN_EMAIL" --password-stdin
unset ADMIN_PASSWORD
```

Lưu mật khẩu trong password manager. CLI từ chối bootstrap nếu admin đã tồn tại. Đăng nhập HTTPS và hoàn tất acceptance checklist trong PRODUCTION-AAPANEL-PLAN.md trước khi đưa dữ liệu thật vào.

## 6. Cập nhật các lần sau

Mỗi release mới cần commit/push source sạch, duyệt và push tag mới, Actions publish đủ hai image. Ví dụ `v1.0.4` chỉ là phiên bản minh họa cho lần cập nhật sau; phải tồn tại và được duyệt.

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/update-production.sh v1.0.4
```

Wrapper fetch đúng tag, từ chối dirty worktree, xác minh SHA tag remote, checkout detached đúng source và chạy release script của tag đó. Nó giữ backup/migration/health/HTTPS gates. Cách tường minh tương đương:

```bash
set -euo pipefail
cd /www/wwwroot/edu
git fetch --tags origin
git checkout --detach v1.0.4
bash scripts/release.sh v1.0.4
```

Không sửa `.env.production` để đổi image mỗi lần update; script đọc version và ghi digest/source SHA đã xác minh vào `.production/current.json`. `.env.production` và secrets là cấu hình host được giữ lại. Update có khoảng bảo trì trong lúc dừng writer, backup, migration và khởi động; không phải zero downtime.

## 7. Rollback, status, logs, backup

```bash
set -euo pipefail
cd /www/wwwroot/edu
bash scripts/rollback.sh v1.0.3
bash scripts/prod-status.sh
bash scripts/prod-logs.sh --tail 200
bash scripts/prod-logs.sh --follow --tail 100
MODE=production bash scripts/backup.sh --confirm-maintenance
```

Rollback chỉ dùng version **đã deploy thành công trên host này** và digest cũ trong metadata. Chỉ rollback image khi toàn bộ migration/checksum hiện tại bằng target receipt. Nếu schema khác, script trả `ROLLBACK_BLOCKED_NEEDS_RESTORE`; DBA phải xác minh compatibility hoặc lập kế hoạch restore riêng. Script không chạy SQL down/restore tự động. Không checkout tag cũ trước rollback: giữ script vận hành hiện tại.

Backup dừng đúng những writer đang chạy, từ chối one-off/external writers còn hoạt động, tạo PostgreSQL custom dump + private files + release/schema metadata + env riêng tư + SHA256SUMS. Lệnh backup độc lập khởi động lại đúng các service đã dừng; backup trong release giữ bảo trì tới khi update thành công. Backup lỗi khôi phục trạng thái service cũ, dừng release. Migration lỗi giữ bảo trì để tránh app cũ ghi vào schema thay đổi một phần. Upload archive/pg_restore-list được kiểm tra, nhưng đó chưa phải restore rehearsal. Mã hóa và copy off-host; không commit hoặc công khai thư mục backup. Dừng các writer ngoài Compose theo quy trình vận hành trước backup.

Logs chỉ xuất các trường sự kiện vận hành và access log gateway không chứa URI. URL/token/body/error text tùy ý bị bỏ; không dùng chúng để xuất log thô cho người khác. Không chạy prune, `down -v`, xóa volumes hoặc đổi secret để sửa lỗi.

Nguồn đối chiếu: [Docker Compose file secrets](https://docs.docker.com/compose/how-tos/use-secrets/), [GitHub GHCR access và read:packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
