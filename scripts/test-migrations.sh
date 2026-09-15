#!/usr/bin/env bash
#
# Applies supabase/migrations/ to a throwaway Postgres cluster and asserts the
# edition migration's behaviour against realistic pre-migration data.
#
# Needs only a local PostgreSQL install (initdb/pg_ctl/psql) — no Docker, no
# `supabase start`. Run with: bun run test:db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Short path: Unix socket paths are capped at ~107 bytes, so connect over TCP.
WORK="$(mktemp -d)"
PORT="${PGTESTPORT:-55432}"

cleanup() {
  pg_ctl -D "$WORK/pgdata" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$WORK/pgdata" -U postgres --auth=trust >/dev/null
pg_ctl -D "$WORK/pgdata" -o "-p $PORT -h 127.0.0.1 -k ''" -l "$WORK/pg.log" -w start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
createdb liberhack

run() { psql -q -d liberhack -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }

run "$ROOT/supabase/tests/00-bootstrap.sql"

# Everything already deployed, then realistic 2026 data, then the new migrations.
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$(basename "$f")" in 20260916*) continue ;; esac
  run "$f"
done
run "$ROOT/supabase/tests/01-seed-2026.sql"

for f in "$ROOT"/supabase/migrations/20260916*.sql; do
  printf '%-58s' "$(basename "$f")"
  run "$f"
  echo "applied"
done

echo
psql -d liberhack -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/02-verify-editions.sql" 2>&1 \
  | grep -E 'PASS|FAIL|VERIFICATION' \
  | sed 's/^psql:.*NOTICE:  //'
