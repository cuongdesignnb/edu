#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
project="edumanage_usability_test_$(date +%s)"
export USABILITY_TEST_SUBNET="${USABILITY_TEST_SUBNET:-10.247.108.0/24}"
compose=(docker compose --project-directory . -p "$project" -f tests/compose.yml -f tests/migration-rls-compose.yml -f tests/usability-compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
"${compose[@]}" run --rm -T --no-deps runner node --test --test-concurrency=1 tests/integration/usability.test.mjs
