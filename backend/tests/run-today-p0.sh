#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
compose=(docker compose --project-directory . -p edumanage_today_p0_test -f tests/compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
"${compose[@]}" run --rm -T --no-deps runner node --test --test-concurrency=1 tests/integration/today-p0.test.mjs
