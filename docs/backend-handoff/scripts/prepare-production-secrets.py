#!/usr/bin/env python3
"""Khởi tạo thư mục secret mới. Không rotate hoặc copy key local."""
import argparse,os,secrets
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--confirm-new',action='store_true');a=p.parse_args()
if not a.confirm_new:raise SystemExit('Cần --confirm-new; không dùng cho xoay credential trên DB đang chạy')
d=Path(a.directory).resolve()
if d.exists():raise SystemExit('Thư mục đã tồn tại; dừng để không ghi đè secret')
d.mkdir(parents=True,mode=0o700);os.chmod(d,0o700)
for name in ['db_admin_password','db_migrator_password','db_app_password','db_parent_password','db_worker_password','app_key','mail_key']:
 f=d/name;fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
 with os.fdopen(fd,'w') as out:out.write(secrets.token_hex(32)+'\n')
 os.chmod(f,0o444)
print('SECRETS_CREATED='+str(d))
print('SMTP_PASSWORD chưa tạo: nhập secret của nhà cung cấp bằng thao tác bảo mật, không dùng random password thay SMTP credential')
