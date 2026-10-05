#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
compose=(docker compose --project-directory . -p edumanage_migration_rls_test -f tests/compose.yml -f tests/migration-rls-compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
"${compose[@]}" run --rm -T --no-deps runner node --test --test-concurrency=1 tests/integration/migration-rls.test.mjs
