#!/usr/bin/env bash
#
# Verifies the retention schedule against a disposable Postgres that has
# pg_cron, the way Supabase does: migrations enable the extension and create
# exactly one job (also when re-applied), and pg_cron actually runs it.
#
# Needs Docker and network access for the image/package. Run: bun run test:schedule
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="liberhack-schedule-test-$$"
PG_MAJOR=16

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=liberhack \
  "postgres:$PG_MAJOR" >/dev/null

wait_ready() {
  for _ in $(seq 1 60); do
    docker exec "$NAME" psql -U postgres -d liberhack -c 'select 1' >/dev/null 2>&1 && return
    sleep 1
  done
  echo "Postgres did not start" >&2
  exit 1
}
wait_ready

docker exec -e DEBIAN_FRONTEND=noninteractive "$NAME" bash -c "apt-get update -qq >/dev/null && apt-get install -y -qq postgresql-$PG_MAJOR-cron >/dev/null"
docker exec "$NAME" bash -c "printf \"shared_preload_libraries = 'pg_cron'\ncron.database_name = 'liberhack'\n\" >> /var/lib/postgresql/data/postgresql.conf"
docker restart "$NAME" >/dev/null
wait_ready

run() { docker exec -i "$NAME" psql -q -U postgres -d liberhack -v ON_ERROR_STOP=1 >/dev/null 2>&1; }
q() { docker exec -i "$NAME" psql -U postgres -d liberhack -v ON_ERROR_STOP=1 -tAc "$1"; }

run < "$ROOT/supabase/tests/00-bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do run < "$f"; done

failed=0
check() {
  if [[ "$2" == "$3" ]]; then echo "PASS  $1"; else echo "FAIL  $1 (got '$2', want '$3')"; failed=1; fi
}

check "the migration enables pg_cron" \
  "$(q "select count(*) from pg_extension where extname = 'pg_cron'")" "1"
check "exactly one retention job is scheduled daily" \
  "$(q "select count(*) || ' | ' || max(schedule) || ' | ' || max(command) from cron.job where jobname = 'liberhack-retention'")" \
  "1 | 17 3 * * * | select public.run_retention()"

# Re-applying the scheduling migration must not duplicate the job.
run < "$ROOT/supabase/migrations/20261002000100_sponsor_consent_and_retention.sql"
check "re-applying the migration keeps a single job" \
  "$(q "select count(*) from cron.job where jobname in ('liberhack-retention', 'analytics-purge')")" "1"

# Make pg_cron itself run the same command now and confirm it succeeded.
q "select cron.schedule('liberhack-retention-now', '2 seconds', 'select public.run_retention()')" >/dev/null
succeeded() {
  q "select count(*) from cron.job_run_details d join cron.job j using (jobid)
     where j.jobname = 'liberhack-retention-now' and d.status = 'succeeded'"
}
for _ in $(seq 1 30); do
  [[ "$(succeeded)" != 0 ]] && break
  sleep 1
done
check "pg_cron executes run_retention() successfully" "$([[ "$(succeeded)" != 0 ]] && echo yes || echo no)" "yes"
check "the run is logged for monitoring" \
  "$(q "select (count(*) > 0)::text from public.maintenance_runs where job = 'retention'")" "true"

exit "$failed"
