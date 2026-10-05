#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
project="edumanage_all_remaining_test_$(date +%s)"
compose=(docker compose --project-directory . -p "$project" -f tests/compose.yml -f tests/migration-rls-compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
extra=()
if [[ -n "${ALL_REMAINING_EVIDENCE_PATH:-}" ]]; then
  mkdir -p "$ALL_REMAINING_EVIDENCE_PATH"
  extra=(-e ALL_REMAINING_EVIDENCE_DIR=/evidence -v "$ALL_REMAINING_EVIDENCE_PATH:/evidence")
fi
MSYS_NO_PATHCONV=1 "${compose[@]}" run --rm -T --no-deps "${extra[@]}" runner node --test --test-concurrency=1 tests/integration/all-remaining.test.mjs
