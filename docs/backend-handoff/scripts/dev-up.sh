#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "$MODE" == local ]] || { echo 'Chỉ local'; exit 1; }
python3 "$ROOT/scripts/preflight.py" --allow-running
dc build api worker migrate storage-init web
dc up -d --wait --wait-timeout 180
# Lệnh trên phải chạy migration một lần và kiểm tra dependency healthy.
dc ps -a
python3 "$ROOT/scripts/smoke-local.py"
echo 'LOCAL_STACK_STARTED; seed + E2E + QA quyền vẫn phải chạy trước nghiệm thu'
