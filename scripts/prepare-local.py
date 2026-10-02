#!/usr/bin/env python3
"""Tạo cấu hình local và secret chưa tồn tại. Không rotate secret hiện có."""
import argparse,os,secrets
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=18763);a=p.parse_args()
if not 1024 <= a.port <= 65535: p.error('Port phải thuộc 1024..65535')
root=Path(__file__).resolve().parents[1]
secret_dir=root/'.secrets/local';secret_dir.mkdir(parents=True,exist_ok=True)
os.chmod(secret_dir.parent,0o700);os.chmod(secret_dir,0o700)
names=['db_admin_password','db_migrator_password','db_app_password','db_parent_password','db_worker_password','app_key','mail_key','smtp_password']
for name in names:
 target=secret_dir/name
 if target.exists():
  if target.is_symlink() or not target.is_file():raise SystemExit('Invalid secret path: '+name)
  continue
 # Leaf readable by non-root Docker UID; host parent is 0700. Not a vault/encryption.
 fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
 with os.fdopen(fd,'w',newline='\n') as f:f.write(secrets.token_hex(32)+'\n')
 os.chmod(target,0o444)
env=root/'.env.local-docker'
if not env.exists():
 s=(root/'deploy/.env.local-docker.example').read_text()
 s=s.replace('APP_PORT=18763',f'APP_PORT={a.port}').replace('APP_URL=http://127.0.0.1:18763',f'APP_URL=http://127.0.0.1:{a.port}')
 env.write_text(s);os.chmod(env,0o600)
 print('LOCAL_ENV=CREATED')
else:print('LOCAL_ENV=KEPT; không tự đổi port/credential của stack đã có')
print('SECRETS=READY (không in giá trị); chưa chạy Docker; cần Linux/WSL2 hoặc Docker Desktop phù hợp')
