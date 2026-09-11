# Migrating from self-hosted Supabase to Supabase Cloud

One-time runbook. Steps 1-4 are done from a dev machine; steps 5-6 need SSH
access to the old server where `supabase-docker/` is still running.

## 1. Create and link the cloud project

```bash
npx supabase login
npx supabase projects create liberhack --org-id <org-id> --region eu-central-1 --db-password '<strong password>'
npx supabase link --project-ref <project-ref>
```

Pick the region closest to the participants; `eu-central-1` (Frankfurt) is the
nearest to Bulgaria.

## 2. Apply schema and auth config

```bash
cp supabase/.env.example supabase/.env   # fill in real values
npx supabase db push                     # runs every file in supabase/migrations/
npx supabase config push                 # site URL, redirect allow-list, SMTP, email templates
```

`config push` prints a diff and asks for confirmation. Verify in the dashboard
that Authentication > Emails shows the LiberHack templates and Authentication >
URL Configuration lists the production redirect URL.

## 3. Rotate application secrets

Dashboard > Project Settings > API. Update:

- `.env` on the server: `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NUXT_SUPABASE_SERVICE_KEY`
- GitHub repository secrets `NUXT_PUBLIC_SUPABASE_URL` and
  `NUXT_PUBLIC_SUPABASE_ANON_KEY` (baked into the client bundle at build time by
  `.github/workflows/deploy.yml`; the workflow itself does not change)

## 4. DNS

`api.<domain>` no longer needs to resolve to the server; the Caddy block for it
was removed. Delete the record once the cutover is verified.

## 5. Copy data from the old instance

Done on 2026-09-11 from `dumps/liberhack_backup_20260602_091409.dump`
(pg_dump custom format, taken the morning of the event). The old host was no
longer reachable, so the data was loaded through the Management API with
`supabase db query --linked` rather than `psql` — that path runs as the
`postgres` role, which cannot disable triggers on `auth.users`.

Order matters:

1. `auth.users` — the `on_auth_user_created` trigger inserts placeholder
   `participants` rows from metadata; `delete from public.participants`
   right after.
2. `public.skills` (`ON CONFLICT (lower(name)) DO NOTHING` — the catalogue
   is pre-seeded by a migration). Must come after users: `created_by`
   references `auth.users`.
3. `auth.identities`, `public.teams`, `public.participants`,
   `public.join_requests` — all as single-row `INSERT`s in one transaction.
4. Re-run the `dietary`/`experience` backfill from migration
   `20260602000000` — it ran against an empty database during `db push`.

Result: 68 users, 68 identities, 16 teams, 66 participants, 28 join requests,
123 skills — matching the CSV exports in `dumps/` from the same day. Sessions
and refresh tokens were not migrated, so everyone logs in again; password
hashes carried over unchanged.

`announcements`, `schedule_items` and `event_config` post-date the backup and
start empty.

## 6. Cut over and decommission

1. Update `/opt/liberhack/.env` with the three `NUXT_*SUPABASE*` values and
   run `docker compose up -d --build` in `/opt/liberhack`.
2. Smoke-test login with a migrated account, signup, email verification,
   password reset, team invite.
3. Remove the `api.liberhack.org` DNS record.
4. If the old host is ever reachable again:
   `cd /opt/liberhack/supabase-docker && docker compose down -v` and delete the
   directory (`volumes/db/data` is root-owned; use `sudo rm -rf`).
