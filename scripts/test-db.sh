#!/usr/bin/env bash
# Runs the database test-suite (RLS, rental engine, webhooks) against a throwaway local Postgres
# with the exact production migrations. Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${TEST_DATABASE_URL:-}"
if [ -z "$URL" ]; then
  bash scripts/db-local.sh 54329 >/dev/null
  URL="postgres://postgres@localhost:54329/postgres?host=/tmp"
fi
TEST_DATABASE_URL="$URL" npx vitest run tests/db
