#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${MODE:-local}"
if [[ "$MODE" == production ]]; then ENVFILE="$ROOT/.env.production"; COMPOSEFILE="$ROOT/deploy/compose.production.yml";
else ENVFILE="$ROOT/.env.local-docker"; COMPOSEFILE="$ROOT/deploy/compose.local.yml"; fi
[[ -f "$ENVFILE" ]] || { echo "Missing $ENVFILE" >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker chưa cài hoặc không nằm trong PATH' >&2; exit 1; }
dc(){ docker compose --project-directory "$ROOT" --env-file "$ENVFILE" -f "$COMPOSEFILE" "$@"; }
