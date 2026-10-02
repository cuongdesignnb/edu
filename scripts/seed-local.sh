#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "$MODE" == local ]] || { echo 'Cấm seed demo production'; exit 1; }
# backend CLI tự kiểm APP_ENV=local, DB *_local; transaction và upsert định danh seed.
read -r -s -p 'Mật khẩu mới cho tài khoản local (ít nhất 12 ký tự): ' PW
printf '\n'
[[ ${#PW} -ge 12 ]] || { unset PW; echo 'Mật khẩu quá ngắn'; exit 1; }
printf '%s\n' "$PW" | dc run --rm --no-deps -T migrate seed-local --confirm-local --password-stdin
unset PW
echo 'Kiểm tra kết quả CLI; không dùng user demo trên production'
