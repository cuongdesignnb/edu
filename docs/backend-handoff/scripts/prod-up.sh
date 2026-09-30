#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == '--confirm-production' ]] || { echo 'Yêu cầu --confirm-production sau khi đã backup và duyệt release'; exit 1; }
export MODE=production
source "$(dirname "$0")/common.sh"
python3 "$ROOT/scripts/preflight.py" --production --allow-running
# Đối với upgrade: backup + maintenance phải hoàn tất trước khi thực thi script.
dc pull
dc up -d --wait --wait-timeout 180 postgres
dc run --rm --no-deps migrate
dc up -d --wait --wait-timeout 180
dc ps -a
echo 'IMAGE_UPDATE_EXECUTED; kiểm HTTPS/seed cấm/restore/E2E theo runbook trước khi nhận production-ready'
