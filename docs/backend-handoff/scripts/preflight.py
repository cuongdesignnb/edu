#!/usr/bin/env python3
"""Đọc cấu hình, kiểm tra port/CLI/source; không cài package, không kill process."""
import argparse,subprocess,socket,re,json,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--production',action='store_true');p.add_argument('--allow-running',action='store_true');a=p.parse_args()
r=Path(__file__).resolve().parents[1];fn=r/('.env.production' if a.production else '.env.local-docker')
if not fn.is_file():raise SystemExit('Thiếu '+str(fn))
e={}
for line in fn.read_text().splitlines():
 line=line.strip()
 if line and not line.startswith('#') and '=' in line:
  k,v=line.split('=',1);e[k]=v.strip().strip('"').strip("'")
port=int(e.get('APP_PORT','18763'))
if not 1024<=port<=65535:raise SystemExit('APP_PORT không hợp lệ')
if a.production:
 if not e.get('APP_URL','').startswith('https://') or 'REPLACE' in e.get('APP_URL',''):raise SystemExit('Production phải có APP_URL https chính xác')
 for k in ['API_IMAGE_REF','WEB_IMAGE_REF','POSTGRES_IMAGE','NGINX_IMAGE']:
  if not re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}',e.get(k,'')):raise SystemExit(k+' cần image digest đầy đủ, không placeholder/latest')
 if e.get('COOKIE_SECURE')!='true' or e.get('MAIL_MODE')!='smtp':raise SystemExit('Production cần COOKIE_SECURE=true, MAIL_MODE=smtp')
 if not e.get('SMTP_HOST') or 'REPLACE' in e.get('SMTP_HOST',''):raise SystemExit('SMTP_HOST chưa cấu hình')
else:
 if e.get('APP_ENV')!='local' or e.get('APP_URL')!=f'http://127.0.0.1:{port}':raise SystemExit('Local APP_ENV/APP_URL/port không khớp')
 for f in ['package.json','backend/package.json','backend/package-lock.json','deploy/Dockerfile.api','deploy/Dockerfile.web']:
  if not (r/f).is_file():raise SystemExit('Chưa có source/hợp đồng build: '+f+'; Agent phải lập trình trước khi deploy')
 # Template npm. Người dùng pnpm/yarn cần Agent sửa Dockerfile phù hợp rồi cập nhật preflight.
 if not (r/'package-lock.json').is_file():raise SystemExit('Frontend không dùng npm lockfile: kiểm tra Dockerfile.web, không ép đổi package manager')
 for f in ['package.json','backend/package.json']:
  if not json.loads((r/f).read_text()).get('scripts',{}).get('build'):raise SystemExit('Thiếu build script trong '+f)
sec=Path(e.get('SECRET_DIR','.secrets/local'));sec=sec if sec.is_absolute() else r/sec
for name in ['db_admin_password','db_migrator_password','db_app_password','db_parent_password','db_worker_password','app_key','mail_key','smtp_password']:
 f=sec/name
 if not f.is_file() or f.is_symlink():raise SystemExit('Thiếu/không hợp lệ secret: '+name)
 # SMTP password có thể là chuỗi đặc thù; các khóa khác yêu cầu sinh ngẫu nhiên đủ dài.
 if name!='smtp_password' and len(f.read_text().strip())<32:raise SystemExit('Secret quá ngắn: '+name)
cf=r/'deploy'/('compose.production.yml' if a.production else 'compose.local.yml')
cmd=['docker','compose','--project-directory',str(r),'--env-file',str(fn),'-f',str(cf)]
try:
 subprocess.run(['docker','info'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 subprocess.run(cmd+['config','--quiet'],check=True)
except (OSError,subprocess.CalledProcessError):raise SystemExit('Docker/Compose chưa sẵn sàng hoặc config lỗi; không tự sửa Docker của dự án khác')
try:
 with socket.socket() as so:so.bind(('127.0.0.1',port))
except OSError:
 existing=subprocess.run(cmd+['port','gateway','8080'],capture_output=True,text=True).stdout.strip()
 if not (a.allow_running and existing==f'127.0.0.1:{port}'):
  raise SystemExit(f'Port {port} đang bị chiếm; kiểm tra và chọn port khác, không kill dịch vụ')
print('PREFLIGHT=PASS; chưa chứng minh app đã build/chạy đúng')
