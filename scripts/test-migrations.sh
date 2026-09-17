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

# Migrations from here on are the edition system under test; everything before
# it is the schema the seed data was written against.
UNDER_TEST_FROM=20260916000100

# Everything already deployed, then realistic 2026 data, then the new migrations.
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "$UNDER_TEST_FROM" ]]; then run "$f"; fi
done
run "$ROOT/supabase/tests/01-seed-2026.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "$UNDER_TEST_FROM" ]] && continue
  printf '%-58s' "$(basename "$f")"
  run "$f"
  echo "applied"
done

echo
# 02 leaves the database in a known post-go-live state that 03 builds on, so the
# verification files share one session.
psql -d liberhack -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/tests/02-verify-editions.sql" \
  -f "$ROOT/supabase/tests/03-verify-announcements.sql" \
  -f "$ROOT/supabase/tests/04-verify-ops-toggle.sql" 2>&1 \
  | grep -E 'PASS|FAIL|VERIFICATION' \
  | sed 's/^psql:.*NOTICE:  //'
