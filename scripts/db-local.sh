#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies the Supabase shim + all migrations.
# Usage: scripts/db-local.sh [port]   -> prints a connection string
set -euo pipefail
PORT="${1:-54329}"
PGBIN="${PGBIN:-$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)}"
[ -x "$PGBIN/initdb" ] || PGBIN=/usr/lib/postgresql/16/bin
DIR="${PGDATA_DIR:-/tmp/pbsaas-pg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  RUNAS="sudo -u postgres"
  command -v sudo >/dev/null || RUNAS="su postgres -c"
fi
run() { if [ -n "$RUNAS" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
if [ -f "$DIR/postmaster.pid" ]; then run "$PGBIN/pg_ctl -D $DIR stop -m immediate" >/dev/null 2>&1 || true; fi
rm -rf "$DIR"; mkdir -p "$DIR"; [ -n "$RUNAS" ] && chown postgres "$DIR"
run "$PGBIN/initdb -D $DIR -U postgres --auth=trust" >/dev/null
run "$PGBIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -l $DIR/log.txt start" >/dev/null
for i in $(seq 1 30); do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.3; done
PSQL="psql -v ON_ERROR_STOP=1 -q -h /tmp -p $PORT -U postgres -d postgres"
$PSQL -f "$ROOT/tests/db/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done
echo "postgres://postgres@localhost:$PORT/postgres?host=/tmp"
