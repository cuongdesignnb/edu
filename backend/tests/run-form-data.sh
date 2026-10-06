#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
project="edumanage_form_data_test_$(date +%s)"
export FORM_DATA_TEST_SUBNET="${FORM_DATA_TEST_SUBNET:-10.248.$((RANDOM % 250 + 1)).0/24}"
compose=(docker compose --project-directory . -p "$project" -f tests/compose.yml -f tests/migration-rls-compose.yml -f tests/form-data-compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
extra=()
if [[ -n "${FORM_DATA_EVIDENCE_PATH:-}" ]]; then
 mkdir -p "$FORM_DATA_EVIDENCE_PATH"
 printf '%s\n' "$project" > "$FORM_DATA_EVIDENCE_PATH/project.txt"
 printf '%s\n' "$FORM_DATA_TEST_SUBNET" > "$FORM_DATA_EVIDENCE_PATH/subnet.txt"
 extra=(-e FORM_DATA_EVIDENCE_DIR=/evidence -v "$FORM_DATA_EVIDENCE_PATH:/evidence")
fi
MSYS_NO_PATHCONV=1 "${compose[@]}" run --rm -T --no-deps -e MAIL_MODE=disabled "${extra[@]}" runner node --test --test-concurrency=1 tests/integration/form-data.test.mjs
