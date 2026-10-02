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
# 02 leaves the database in a known post-go-live state that later assertions
# build on, so the verification files share one session.
psql -d liberhack -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/tests/02-verify-editions.sql" \
  -f "$ROOT/supabase/tests/03-verify-announcements.sql" \
  -f "$ROOT/supabase/tests/04-verify-ops-toggle.sql" \
  -f "$ROOT/supabase/tests/05-verify-direct-access.sql" \
  -f "$ROOT/supabase/tests/06-verify-team-formation.sql" \
  -f "$ROOT/supabase/tests/07-verify-conversations.sql" \
  -f "$ROOT/supabase/tests/08-verify-attendance.sql" \
  -f "$ROOT/supabase/tests/10-verify-privacy.sql" \
  -f "$ROOT/supabase/tests/11-verify-analytics.sql" 2>&1 \
  | grep -E 'PASS|FAIL|VERIFICATION|ERROR' \
  | sed 's/^psql:.*NOTICE:  //'

# ── Withdrawal racing an in-flight event (two real sessions) ─────────────────
# Session A records an event and holds its transaction open; session B
# withdraws meanwhile. B must wait for A, then its cascade removes A's event.
q() { psql -d liberhack -v ON_ERROR_STOP=1 -tAc "$1"; }
failed=0
race_browser="$(q "select public.analytics_grant('race')")"
psql -d liberhack -v ON_ERROR_STOP=1 -q -c "begin;
  select public.analytics_record('$race_browser', 'registration_cta_clicked', '2027', null, null);
  select pg_sleep(1.5);
  commit;" >/dev/null &
session_a=$!
sleep 0.5
q "select public.analytics_withdraw('$race_browser')" >/dev/null
wait "$session_a"
if [[ "$(q "select count(*) from public.analytics_events where browser_id = '$race_browser'")" == 0 \
   && "$(q "select count(*) from public.analytics_browsers where id = '$race_browser'")" == 0 ]]; then
  echo "PASS  withdrawal during an in-flight event leaves no event and no id"
else
  echo "FAIL  an in-flight event survived withdrawal"
  failed=1
fi
if [[ "$(q "select public.analytics_record('$race_browser', 'landing_viewed', '2027', null, 'direct')")" == f ]]; then
  echo "PASS  a late event after withdrawal records nothing"
else
  echo "FAIL  a late event recreated history"
  failed=1
fi

# ── Reviewed dietary cleanup: dry run changes nothing, confirm applies ─────────
psql -d liberhack -q -f "$ROOT/supabase/manual/20261001_cleanup_dietary_copies.sql" >/dev/null
if [[ "$(q "select count(*) from public.participants where dietary is not null")" != 0 ]]; then
  echo "PASS  the cleanup script is a dry run unless confirmed"
else
  echo "FAIL  the cleanup script changed data without confirm=yes"
  failed=1
fi
psql -d liberhack -q -v confirm=yes -f "$ROOT/supabase/manual/20261001_cleanup_dietary_copies.sql" >/dev/null
psql -d liberhack -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/12-verify-dietary-cleanup.sql" 2>&1 \
  | grep -E 'PASS|FAIL|VERIFICATION|ERROR' \
  | sed 's/^psql:.*NOTICE:  //'

# ── Stage 3: drop the emptied columns, only after stage 2 ───────────────────────
psql -d liberhack -q -v confirm=yes -f "$ROOT/supabase/manual/20261002_stage3_drop_legacy_dietary_columns.sql" >/dev/null
if [[ "$(q "select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'dietary'")" == 0 ]]; then
  echo "PASS  stage 3 drops the legacy dietary columns after the cleanup"
else
  echo "FAIL  legacy dietary columns are still present"
  failed=1
fi

# Two-session lock-order checks; run last because they switch the current edition.
bash "$ROOT/supabase/tests/race-formation-locks.sh"

exit "$failed"
