#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == '--confirm-maintenance' ]] || { echo 'Backup nhất quán cần --confirm-maintenance; sẽ dừng gateway/web/api/worker tạm thời'; exit 1; }
source "$(dirname "$0")/common.sh"
# Không backup stack đã bị lỗi/dừng rồi tự khởi động lại ngoài ý muốn.
for svc in postgres api worker web gateway; do
 id="$(dc ps -q "$svc")"; [[ -n "$id" ]] || { echo "$svc chưa chạy; dùng quy trình DBA thủ công"; exit 1; }
 [[ "$(docker inspect -f '{{.State.Running}}' "$id")" == true ]] || exit 1
done
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$ROOT/backups/${MODE}-${stamp}"
mkdir -p "$out"
# Không sao chép/tar pgdata live. pg_dump do postgres backup role đọc đủ dữ liệu, không bị RLS cắt.
stopped=false
resume(){ if [[ "$stopped" == true ]]; then dc start api worker web gateway >/dev/null || true; fi; }
trap resume EXIT
stopped=true
dc stop -t 60 gateway web api worker
# Các CLI/ad-hoc writer khác phải được operator dừng theo runbook trước khi gọi.
dc exec -T postgres sh -ec 'export PGPASSWORD="$(cat /run/secrets/db_admin_password)"; exec pg_dump -h 127.0.0.1 -U postgres -d "$POSTGRES_DB" -Fc' > "$out/database.dump.tmp"
# API image có quyền read upload; không gọi entrypoint app và không restart app.
# Git Bash must preserve the container path while still converting host paths.
MSYS2_ARG_CONV_EXCL=/data/uploads dc run --rm --no-deps --entrypoint tar api -C /data/uploads -czf - . > "$out/uploads.tar.gz.tmp"
[[ -s "$out/database.dump.tmp" && -s "$out/uploads.tar.gz.tmp" ]] || { echo 'Backup không đầy đủ'; exit 1; }
mv "$out/database.dump.tmp" "$out/database.dump"
mv "$out/uploads.tar.gz.tmp" "$out/uploads.tar.gz"
dc images > "$out/images.txt"
cp "$ENVFILE" "$out/deployment-env.private"
(cd "$out" && sha256sum database.dump uploads.tar.gz > SHA256SUMS.txt)
printf '%s\n' 'DB+UPLOADS backup; keys/SMTP secret phải backup mã hóa riêng; chưa test restore; local mail không nằm trong uploads.' > "$out/README.txt"
echo "BACKUP_CREATED=$out"
echo 'RESTORE_TEST=NOT_RUN; phải mã hóa và copy off-host; không commit backups'
