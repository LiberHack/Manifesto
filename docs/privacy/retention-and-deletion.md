# Retention, deletion, scheduling and rollout

Lifetimes are **product defaults** where stated and **organisational
decisions** everywhere else. Nothing here invents a legally approved period:
a category without a decided period is never deleted automatically, and
features that depend on one stay off.

## What is deleted, when, and by what

| Data | Lifetime | Enforced by |
|---|---|---|
| Analytics ID (`analytics_browsers`) | fixed 30 days from consent (cookie `Max-Age` + check constraint); row deleted 30 days after expiry | `analytics_purge()` |
| Individual analytics events, incl. completion attribution | ≤ 60 days from collection | `analytics_purge()` |
| Completion dedupe keys | 60 days, or with the registration | `analytics_purge()`, FK cascade |
| Analytics aggregates | kept; finalised only once no browser in the day/cohort can still withdraw | — |
| Catering (diet + note) | **decided policy** `catering_after_edition_end` after the edition's `ends_at`. Food notes are not offered until this policy exists | `run_retention()` |
| Export log | **decided policy** `export_audit` | `run_retention()` |
| Superseded consent records (not the decision in force) | **decided policy** `superseded_consent_evidence` | `run_retention()` |
| Deletion ledger | **decided policy** `deletion_ledger`; it must be ≥ the backup restore window | `run_retention()` |
| Maintenance log | **decided policy** `maintenance_runs` | `run_retention()` |
| Per-edition registration data (skills, experience, team) | not automated (see README → remaining technical work) | — |
| Account and all its records | until erased | `auth.users` delete → cascades → ledger |
| Generated exports | never stored server-side: generated per request, `no-store`, no reusable links | — |

### Recording a decided period

An operator does this once there is a written decision. It is not an app
setting.

```sql
insert into public.retention_policies (category, keep_for, decided_by, reference)
values ('catering_after_edition_end', interval '30 days', '<name/role>', '<decision doc or minutes>')
on conflict (category) do update
  set keep_for = excluded.keep_for, decided_by = excluded.decided_by,
      reference = excluded.reference, decided_at = now();
```

The table is server-only, and each row records who decided and where that
decision is documented.

## Scheduling

Migration `20261002000300_sponsor_consent_and_retention.sql` enables
`pg_cron` where the database offers it (Supabase does). It then (re)creates
exactly one job, `liberhack-retention`, which runs `select public.run_retention()`
daily at 03:17 UTC, and removes the older `analytics-purge` job. Re-running the
migration is safe: it always ends with a single job.

```sql
select jobname, schedule, command, active from cron.job;                       -- verify
select status, start_time, return_message
from cron.job_run_details order by start_time desc limit 5;                    -- last runs
select public.run_retention();                                                 -- run by hand (idempotent)
```

The reproducible check is `bun run test:schedule`. It needs Docker. It starts
a throwaway Postgres 16 with pg_cron, applies every migration, then checks
that:

- exactly one job is scheduled;
- re-applying the migration keeps one job;
- pg_cron executes `run_retention()` with status `succeeded`;
- the run is logged.

## Monitoring missed runs

Every run writes `maintenance_runs` rows (`retention`, `analytics_purge`) with
counts, and lists skipped categories.

- **Actionable alert:** the Worker cron trigger (`wrangler.jsonc` `triggers`,
  daily 07:00 UTC) runs the Nitro task `privacy:retention-monitor`. If no
  `retention` run happened in the last 26 hours, it emails
  `NUXT_OPS_ALERT_EMAIL`, or every admin when that is unset. It also logs an
  error to Workers logs. Only production sends, because staging uses the same
  database.
- **In the panel:** Admin → Sources also shows a warning when the last run is
  older than 2 days.
- **By hand:** test the monitor with
  `bunx wrangler dev --test-scheduled` and then
  `curl "http://localhost:8787/__scheduled?cron=0+7+*+*+*"`.

## Withdrawal and erasure

- **Analytics:** `DELETE /api/analytics/consent` (no account needed) calls
  `analytics_withdraw()`.
  - It deletes the browser row, and by cascade every event and its
    attribution, then writes the ID to `deletion_ledger` and clears the
    cookies.
  - Live totals drop the browser at once. Finalised totals never contained a
    browser that could still withdraw.
  - An in-flight event waits on the row lock and is removed by the cascade,
    or finds no row and writes nothing.
- **Sponsor sharing:** a No in `/ops/privacy` records `withdrawn`. An admin
  can record `objected` for a rights request. Both exclude the person from the
  next export.
- **Dietary note:** `withdraw_dietary_note()` deletes the note in the same
  transaction.
- **Marketing:** a No in `/ops/privacy` records `withdrawn`.
- **Erasure of an account:** deleting `auth.users` cascades to participants,
  registrations, catering and consent records, and a trigger writes the
  participant ID to `deletion_ledger`. Append-only means records cannot be
  *edited*; deleting them for erasure or a decided retention period still
  works, and is tested.

## Dietary data: staged cleanup

1. **Stop old writes and reads:** this branch. Signup no longer writes dietary
   data to auth metadata, and no code reads `registrations.dietary` or
   `participants.dietary`.
2. **Clean and verify:** `supabase/manual/20261001_cleanup_dietary_copies.sql`.
   It empties `auth.users.raw_user_meta_data->'dietary'`,
   `participants.dietary` and `registrations.dietary`. It is a dry run that
   prints counts unless you pass `-v confirm=yes`.
3. **Drop the columns:**
   `supabase/manual/20261002_stage3_drop_legacy_dietary_columns.sql`. It
   refuses to run unless stage 2 left nothing behind, and is also a dry run
   unless confirmed. After it runs in production, copy its DDL into a numbered
   migration so fresh environments match.

Both scripts are tested on throwaway data in `bun run test:db`. Neither is run
by `db push`.

`legacy` catering notes were copied without the explicit consent a note now
needs. They are withheld from the catering export. Decide whether to ask those
people to re-confirm, or delete them:
`update public.registration_catering set note = null where legacy;`.

## Backups

Supabase keeps database backups for the plan's window. Deleted rows survive in
backups until those expire, and backups cannot be edited row by row, so **we
do not promise immediate erasure from backups**.

To stop a restore from resurrecting deleted records indefinitely:

1. Restore into a non-public environment first.
2. Run `select public.reapply_deletion_ledger();`. It deletes every
   participant (`auth.users`, which cascades) and every analytics browser
   recorded in the ledger since the backup was taken.
3. Run `select public.run_retention();` to re-apply time-based deletion.
4. Re-run the dietary cleanup (stage 2) if the backup predates it.
5. Then switch traffic.

The ledger holds IDs only. Its retention (`deletion_ledger` policy) must be
at least as long as the oldest backup that could be restored.

## Rollout order

**Staging and production use the same Supabase project**: the same
`NUXT_PUBLIC_SUPABASE_URL` is set in both `wrangler.jsonc` environments. A
`db push` for "staging" changes production data. Plan accordingly.

1. Review this branch, including the migrations, which touch `registrations`
   and RLS (CONTRIBUTING requires human review).
2. **Migrations first, code second.** The currently deployed code keeps
   working on the migrated database: every change is additive, and the old
   `dietary` columns stay until stage 3. The new code needs the new database
   functions. So apply the migrations before any environment runs the new
   code, ideally while `ops_enabled` is off.
   `bunx supabase db push` applies three migrations, all additive:
   `20261002000100`, `20261002000200`, `20261002000300`. The last one enables
   pg_cron and schedules the job. Check it with the queries above.

   **Order against the team-formation stack (#12–#15).** These versions were
   renumbered to sort after the team-formation migrations
   (`20260929000000` … `20261002000000`). Push those first. If the privacy
   migrations go first, `db push` refuses the lower-numbered team-formation
   ones later as out of order, and `--include-all` would then apply them
   after privacy, an order nothing was tested in. Before pushing:
   - Run `bunx supabase migration list` against the target project. Every
     team-formation version must show as applied remotely, and none of
     `20261001000100`, `20261001000200` or `20261002000100` may be recorded
     under the **old** privacy file names (`consent_records`,
     `source_links_and_analytics`, `sponsor_consent_and_retention`).
   - If an old privacy version is recorded remotely, stop. Renaming the file
     does not rename the recorded version. Reconcile it by hand with
     `supabase migration repair` after review; do not push over it.

   The combined sequence (phase 2 tip plus these three, then the stage 2
   cleanup and stage 3) was verified on a throwaway database: every
   migration applies in filename order and all verification suites pass.
3. `bunx supabase config push` enables TOTP MFA (`[auth.mfa.totp]`). Admins
   enrol at `/ops/admin/mfa`.
4. Set Worker variables per environment as needed (nothing new is a secret):
   `NUXT_OPS_ALERT_EMAIL` (optional). **Leave** `NUXT_SPONSOR_EXPORTS_ENABLED`
   and `NUXT_ANALYTICS_ACTIVATION_ALLOWED` **unset**.
5. Merge to `dev` (staging) and then `main` (production). Confirm the cron trigger appears in the
   Cloudflare dashboard and the next day's `maintenance_runs` row.
6. Run dietary cleanup stage 2 (dry run, then confirm), then stage 3.
7. Record decided retention periods as they are made.
8. Only after the matching organisational facts in README.md are resolved:
   - set `PRIVACY_NOTICE_FINAL = true`;
   - add sponsor recipients, then set `NUXT_SPONSOR_EXPORTS_ENABLED=true`;
   - set `NUXT_ANALYTICS_ACTIVATION_ALLOWED=true` and switch analytics on per
     edition.
