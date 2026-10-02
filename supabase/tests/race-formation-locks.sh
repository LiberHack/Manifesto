#!/usr/bin/env bash
#
# Concurrency checks for the formation lock order (registrations, then teams,
# then join_requests). Each case holds one row lock in session A, starts the
# competing call in session B, then lets A continue; a lock-order inversion
# shows up as "deadlock detected". Sourced by scripts/test-migrations.sh after
# the single-session checks; expects PG* to point at the test database.
set -uo pipefail

DB=liberhack
sql() { psql -d "$DB" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

setup() {
  psql -d "$DB" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
insert into public.editions (slug, name, status, is_current)
values ('race', 'Race', 'draft', false) on conflict do nothing;
select public.promote_edition('race');
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'race-leader@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'race-member@example.com'),
  ('e0000000-0000-0000-0000-000000000003', 'race-other@example.com'),
  ('e0000000-0000-0000-0000-000000000004', 'race-applicant@example.com'),
  ('e0000000-0000-0000-0000-000000000005', 'race-recruiter@example.com'),
  ('e0000000-0000-0000-0000-000000000006', 'race-host@example.com');
insert into public.registrations (id, participant_id, edition_slug) values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'race'),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'race'),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'race'),
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'race'),
  ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', 'race'),
  ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000006', 'race');
select public.create_team('f0000000-0000-0000-0000-000000000001', 'Race One', '{}', null);
select public.create_team('f0000000-0000-0000-0000-000000000003', 'Race Two', '{}', null);
select public.create_team('f0000000-0000-0000-0000-000000000005', 'Race Three', '{}', null);
select public.create_team('f0000000-0000-0000-0000-000000000006', 'Race Four', '{}', null);
select public.join_team('f0000000-0000-0000-0000-000000000002',
  (select id from public.teams where name = 'Race One'), 'direct_invite');
insert into public.join_requests (id, participant_id, team_id, edition_slug, message)
select 'f1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004',
       id, 'race', 'Keen to join and help with anything you need.'
from public.teams where name = 'Race Three';
SQL
}

# race <label> <session A: lock, sleep, act> <session B: competing call>
race() {
  local out_a out_b
  out_a="$(mktemp)"; out_b="$(mktemp)"
  psql -d "$DB" -c "$2" >"$out_a" 2>&1 &
  local pid_a=$!
  sleep 0.5
  psql -d "$DB" -c "$3" >"$out_b" 2>&1 &
  wait "$pid_a"; wait $!
  if grep -qi 'deadlock detected' "$out_a" "$out_b"; then
    echo "FAIL  $1 (deadlock detected)"
  else
    echo "PASS  $1"
  fi
  rm -f "$out_a" "$out_b"
}

setup

race 'a leader leaving does not deadlock with their successor switching teams' \
  "begin;
   select 1 from public.registrations where id = 'f0000000-0000-0000-0000-000000000002' for update;
   select pg_sleep(2);
   select public.join_team('f0000000-0000-0000-0000-000000000002',
     (select id from public.teams where name = 'Race Two'), 'direct_invite', null, true);
   commit;" \
  "select public.leave_team('f0000000-0000-0000-0000-000000000001');"

race 'deciding a request does not deadlock with its applicant joining elsewhere' \
  "begin;
   select 1 from public.registrations where id = 'f0000000-0000-0000-0000-000000000004' for update;
   select pg_sleep(2);
   select public.join_team('f0000000-0000-0000-0000-000000000004',
     (select id from public.teams where name = 'Race Four'), 'direct_invite');
   commit;" \
  "select public.decide_join_request('f1000000-0000-0000-0000-000000000001', null, 'approve');"

[[ "$(sql "select t.name from public.registrations r join public.teams t on t.id = r.team_id
           where r.id = 'f0000000-0000-0000-0000-000000000004'")" == 'Race Four' ]] \
  && [[ "$(sql "select status from public.join_requests
               where id = 'f1000000-0000-0000-0000-000000000001'")" == 'rejected' ]] \
  && echo "PASS  the applicant who joined elsewhere first is not moved by the late approval" \
  || echo "FAIL  the late approval moved an applicant who had already joined elsewhere"

echo " FORMATION RACE VERIFICATION COMPLETE"
