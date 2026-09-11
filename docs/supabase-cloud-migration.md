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

On the old server, dump auth users (with password hashes) and public data.
Schema is NOT dumped — it already exists from step 2.

```bash
cd /opt/liberhack/supabase-docker
docker compose exec -T db pg_dump -U postgres --data-only --inserts --column-inserts \
  -t auth.users -t auth.identities > /tmp/auth.sql
docker compose exec -T db pg_dump -U postgres --data-only --inserts --column-inserts \
  -n public > /tmp/public.sql
```

Copy both files to the dev machine, then restore into the cloud project. The
direct (non-pooled) connection string is in Dashboard > Connect > Direct.

```bash
DB_URL='postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres'

# 1. auth first — the on_auth_user_created trigger inserts placeholder
#    participants rows, which are replaced in the next step
psql "$DB_URL" -v ON_ERROR_STOP=1 -f auth.sql

# 2. wipe trigger-generated rows and load real public data
psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  'truncate public.join_requests, public.participants, public.teams, public.skills,
   public.announcements, public.schedule_items, public.event_config cascade'
psql "$DB_URL" -v ON_ERROR_STOP=1 -f public.sql
```

Sanity check: row counts of `auth.users` and `public.participants` match the
old instance, and an existing account can log in with its old password.

## 6. Cut over and decommission

1. Put the old instance into read-only mode for the cutover window
   (`docker compose stop auth rest` in `supabase-docker/`), redo step 5 for any
   rows written since the first dump.
2. Deploy the app with the new `.env` (`docker compose up -d --build` in
   `/opt/liberhack`).
3. Smoke-test signup, email verification, password reset, team invite.
4. `cd /opt/liberhack/supabase-docker && docker compose down -v` and delete the
   directory (`volumes/db/data` is root-owned; use `sudo rm -rf`).
