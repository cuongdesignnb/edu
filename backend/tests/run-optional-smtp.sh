#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-test.mjs
# Synthetic loopback TLS fixture, not an SMTP provider for production deployment.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
  -keyout .runtime/smtp-test.key -out .runtime/smtp-test.crt >/dev/null 2>&1
compose=(docker compose --project-directory . -p edumanage_smtp_release_test -f tests/compose.yml -f tests/smtp-compose.yml)
trap '"${compose[@]}" stop postgres >/dev/null 2>&1 || true' EXIT
"${compose[@]}" up -d --wait postgres
"${compose[@]}" build runner
"${compose[@]}" run --rm -T --no-deps runner node --test --test-concurrency=1 tests/integration/optional-smtp.test.mjs
