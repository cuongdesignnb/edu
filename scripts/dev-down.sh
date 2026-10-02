#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "$MODE" == local ]] || exit 1
dc down
echo 'STOPPED; volumes được giữ nguyên; không dùng down -v'
