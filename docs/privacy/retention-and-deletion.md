# Retention, deletion and deployment

Lifetimes below are **product defaults**, not statutory requirements. Change
them only together with the Privacy Notice.

| Data | Lifetime | Enforced by |
|---|---|---|
| Analytics id + journey (`analytics_browsers`) | fixed 30 days from consent, never extended; row removed 30 days after expiry | check constraint + cookie `Max-Age` + `analytics_purge()` |
| Individual analytics events | ≤ 60 days from collection | `analytics_purge()` |
| Attribution and funnel aggregates | kept; no browser or account ids | — |
| `maintenance_runs` | **not yet set** | — |
| Consent records, export log | **not yet set** — needs a documented policy | — |
| Per-edition registration data, catering | **not yet set** — not automated | — |

## Deploying (in this order)

Nothing here is run automatically, and nothing turns analytics on.

1. Merge to `dev` → staging. The code tolerates the migrations being absent:
   with no readable edition, analytics stays off.
2. `bunx supabase db push` applies
   `20261001000100_consent_records.sql` and
   `20261001000200_source_links_and_analytics.sql` (staging first). Both are
   additive. Migration 1 **copies** free-text dietary answers of non-archived
   editions into `registration_catering` as `legacy`. It deletes nothing.
3. Schedule the retention job (below).
4. Optional, after review: run the dietary cleanup (below).
5. Only after the launch blockers in [README.md](README.md) are resolved: add
   sponsor recipients, then turn on Analytics for the edition in Admin →
   Editions.

## Scheduling the retention job

The migration schedules `analytics_purge()` only if `pg_cron` is **already**
enabled. Enabling an extension is an operator decision. In the Supabase
dashboard: Database → Extensions → enable `pg_cron`. Then, in the SQL editor:

```sql
select cron.schedule('analytics-purge', '17 3 * * *', 'select public.analytics_purge()');
select * from cron.job where jobname = 'analytics-purge';   -- verify
```

**Monitoring:** every run inserts into `maintenance_runs` (counts of cohorts
rolled up, events and ids deleted). Admin → Sources shows a warning when the
last run is older than two days. For alerting outside the panel, poll:

```sql
select max(ran_at) from public.maintenance_runs where job = 'analytics_purge';
```

**Manual run** (safe to repeat): `select public.analytics_purge();`

## Withdrawal

- Analytics: `DELETE /api/analytics/consent` (Privacy settings dialog, no
  account needed) → `analytics_withdraw()` deletes the browser row and, by
  cascade, all its events, before the response clears the cookie. Aggregates
  already incremented stay; they hold no identifiers.
- Dietary note: `/ops/privacy` → `withdraw_dietary_note()` deletes the note in
  the same transaction that records the withdrawal.
- Marketing: `/ops/privacy` appends `withdrawn`.
- Sponsor sharing: admin records `objected` (see rights-requests.md).

## Reviewed cleanup of old dietary copies

`supabase/manual/20261001_cleanup_dietary_copies.sql` removes the old free-text
copies from `auth.users` metadata, `participants.dietary` and
`registrations.dietary`. It is **not** a migration and is never applied by
`db push`. It is a dry run (`ROLLBACK`) unless confirmed:

```bash
psql "$DATABASE_URL" -f supabase/manual/20261001_cleanup_dietary_copies.sql              # dry run, prints counts
psql "$DATABASE_URL" -v confirm=yes -f supabase/manual/20261001_cleanup_dietary_copies.sql
```

Run it only after migration 1 and the new code are deployed, and after a human
review. It is tested against a throwaway database in `bun run test:db`.

`legacy` rows in `registration_catering` were entered under the old notice
without the new explicit consent. Decide whether to ask those participants to
re-confirm, or to delete the notes:

```sql
update public.registration_catering set note = null where legacy;  -- if deleting
```

## Exports, caches and backups

- **Exports** are generated on request, sent with `Cache-Control: no-store,
  private`, and never stored by the app. The only server-side trace is
  `export_audit` (ids and counts, not the file contents). Downloaded files are
  the downloader's responsibility: store them only where needed, delete them
  when the purpose is served, and never forward them outside the named
  recipient.
- **Caches:** personal data responses are not cacheable. Public cacheable
  endpoints (`/api/editions/current`, `/api/announcements`) carry no personal
  data.
- **Backups:** Supabase keeps database backups for the plan's retention window
  (daily backups, or point-in-time recovery if enabled). Deleted rows survive in
  backups until those expire. The provider does not support deleting individual
  rows from a backup, so **we do not promise immediate backup erasure**.
  If a backup is ever restored:
  1. Restore into a non-public environment first.
  2. Re-run `select public.analytics_purge();`, which re-applies analytics
     retention.
  3. Re-apply erasures and withdrawals handled since the backup was taken.
     Keep a list of erasure-request participant ids (not their data) for this,
     separate from the database, for as long as backups can be restored.
  4. Re-run the dietary cleanup script if the backup predates it.
  5. Only then switch traffic.
- **Logs:** Cloudflare and Supabase keep request and error logs (which can
  include IP addresses) under their own retention. See
  operations-checklist.md.
