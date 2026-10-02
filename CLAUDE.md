# Manifesto

> **Read [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) first.** They define hard rules (no direct pushes to `main`/`dev`, no touching redaction/erasure code without review, no committing secrets) that apply to every AI agent working in this repo.

Website for **LiberHack** — a hackathon with a punk-ish vibe. Think raw, rebellious, anti-corporate aesthetic: zine culture, glitch/noise textures, brutalist layouts, bold type, high contrast. Not polished SaaS — deliberately rough around the edges.

Nuxt 4 app with Vue 3, Tailwind CSS v4, DaisyUI, and @nuxt/content.

## Stack

- **Framework**: Nuxt 4 (`nuxt ^4.4.2`)
- **UI**: Tailwind CSS v4 via `@tailwindcss/vite`, DaisyUI v5
- **Content**: `@nuxt/content` (SQLite locally, Cloudflare D1 in production)
- **Email**: Resend (transactional, plain HTTP call), MJML templates
- **Hosting**: Cloudflare Workers (`cloudflare_module` Nitro preset), Supabase Cloud for DB/auth
- **Language**: TypeScript
- **Modules**: `@nuxt/fonts`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/hints`

## Commands

```bash
bun run dev        # start dev server
bun run build      # production build
bun run generate   # static generation
bun run preview    # preview production build (node)
bun run preview:cf # run the built worker locally with wrangler dev (D1 + rate limits via miniflare)
bun run deploy     # nuxt build && wrangler deploy
bun run test       # vitest (unit + e2e; also gates every Workers Builds deploy)
bun run test:db    # apply supabase/migrations to a throwaway Postgres and assert schema behaviour
bun run test:schedule # Docker: verify the pg_cron retention schedule in a throwaway container
```

## Package Manager

**bun** is the only package manager (`packageManager` in `package.json`; Workers Builds
picks it up from `bun.lock`).

- `bun.lock` is the dependency source of truth — commit it with every dependency change
- Never add `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`
- `bun install --frozen-lockfile` is what CI runs; if it fails, run `bun install` and commit the lock
- Run package scripts with `bun run <script>` (`bun test` alone is bun's own test runner, not vitest)

## Project Structure

```
app/              # Nuxt app directory (pages, components, composables, etc.)
app/pages/ops/    # Authenticated participant area (login, dashboard, teams, invite)
app/pages/legal/  # Legal pages (CoC, Privacy)
app/components/   # Shared Vue components (SkillPicker, ManageRequests, etc.)
app/middleware/   # auth.ts — client-side route guard (checks session + email_verified)
server/           # Nitro API routes, middleware, email utils
server/api/       # REST API endpoints
server/emails/    # MJML email templates — edit .mjml, run generate-ts.mjs to rebuild
server/middleware/ # 00.noindex.ts (X-Robots-Tag off production), 01.auth.ts (attaches user to context), 02.rateLimit.ts (60 req/min per user / IP)
public/           # Static assets (tailwind.css lives here)
nuxt.config.ts    # Nuxt configuration
wrangler.jsonc    # Cloudflare Workers config (assets, D1, rate limits, public vars)
supabase/         # Supabase CLI config (config.toml) & migrations
```

## Environment Variables

Required in `.env`:

```bash
NUXT_SUPABASE_SECRET_KEY=          # Supabase secret key (sb_secret_..., bypasses RLS)
NUXT_PUBLIC_SUPABASE_URL=           # https://<project-ref>.supabase.co (or http://127.0.0.1:54321 with `supabase start`)
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=      # Supabase publishable key (sb_publishable_...)
NUXT_RESEND_API_KEY=                # Resend API key (transactional email)
NUXT_RESEND_FROM_EMAIL=             # Sender address on a domain verified in Resend
NUXT_SITE_URL=                      # Full app URL, used in email links (e.g. http://localhost:3000)
NUXT_MAILPIT_URL=                   # Local only: deliver mail to Mailpit instead of Resend (http://127.0.0.1:54324 with `supabase start`)
```

`NUXT_PUBLIC_APP_ENV` (`production` | `staging` | `development`, default `development`) is set per
environment in `wrangler.jsonc`; anything but `production` sends `X-Robots-Tag: noindex`. Leave it
unset locally.

## Auth & Routes

- `/ops/*` pages are protected by the `auth` client middleware — redirects to `/` if the current edition's participant area is closed (`ops_enabled`), `/ops/login` if no session, `/ops/verify-email` if email not confirmed, `/ops/register-edition` if the account has no `registration` in the current edition (see Editions below)
- Server-side: `01.auth.ts` attaches the Supabase user to `event.context.user`
- Email verification: the client middleware checks the JWT's `user_metadata.email_verified` (UX only). The real gate is `requireConfirmedEmail` in `POST /api/me/registration`, which reads `auth.users.email_confirmed_at`; every edition-scoped route requires a registration, so unconfirmed accounts reach none of them
- Rate limiting: 60 req/min on all `/api/*` routes (`02.rateLimit.ts`) via Workers Rate Limiting bindings (`RL_*` in `wrangler.jsonc`); keyed per signed-in user and per IP for anonymous requests, so many attendees behind one NAT do not share a bucket; falls back to an in-memory map in `nuxt dev`
- `/api/live/stream` is SSE: each connection polls Supabase every 5s and only emits on change (Workers isolates share no memory, so there is no server-side broadcast)
- Admin role: set `role = 'admin'` in the `participants` table to expose `/ops/admin`. This is identity-level and carries across editions; it is unrelated to `registrations.role` (`participant` | `leader`), which is team leadership within one edition.
- `emailRedirectTo` in `signUp` is `<current origin>/ops/confirm`, so every host the app is served from (production, staging, PR previews) must be in `additional_redirect_urls` in `supabase/config.toml`

## Editions

The site runs one **edition** at a time (`editions.is_current`). Everything a
participant does is scoped to it:

- `participants` is a durable identity mirror of `auth.users` (name, email, admin
  role). It is never edition-scoped.
- `registrations` is one row per person per edition, holding `skills`, `dietary`,
  `experience`, `team_id`, team `role`, archive `public` flag and
  `accepted_terms_at`. Accounts carry over between editions; registrations do not.
- `teams`, `join_requests`, `event_config`, `schedule_items` and `announcements`
  all carry `edition_slug`. `teams.leader_id` points at a **registration**, not an
  account — so a leader is provably registered for their team's edition.

Rules that follow:

- Every edition-scoped API route calls `requireRegistration(event)` from
  `server/utils/requireRegistration.ts`, which returns `{ user, registration,
  edition, supabase }` and throws `403 not_registered` when the caller has not
  opted into the current edition. The client redirect is UX only — this is the gate.
- The participant cap is per edition (`editions.participant_cap`), enforced by the
  `enforce_edition_cap` trigger on `registrations` insert. `handle_new_user()` no
  longer counts participants; creating an account always succeeds.
- `editions.ops_enabled` gates the whole participant area and **defaults to
  false**, so going live and opening registration are separate events. While it
  is false, `requireRegistration` throws `403 ops_closed`, the `auth` middleware
  sends `/ops/*` back to `/`, `/ops/register` says registration has not opened
  and the OPS nav item points there. `/ops/admin` is exempt — an admin has to be
  able to reach the panel to open it. Toggle it per edition in the admin panel's
  Editions section.
- Because "no readable current edition" also resolves to closed, a deploy that
  runs ahead of its migrations presents as "not open yet" rather than broken.
  That is the intended way to ship a breaking schema change: release the code,
  push the migrations, then open the edition.
- Consent is re-accepted per edition: every purpose is a row in `consent_records`
  (see Privacy below); `registrations.accepted_terms_at` is legacy.
- Admin views take `?edition=<slug>`, defaulting to the current edition. Archived
  editions are readable but not writable (`assertEditionWritable`).
- "Go live" runs through the `promote_edition(slug)` DB function so archiving the
  outgoing edition and promoting the incoming one happen in one transaction.

Later phases (static/dormant mode, archive export, showcase pages, redaction
tooling, `presentation_order`) are specified in
`docs/superpowers/specs/2026-06-08-edition-archiving-design.md` and not built yet.

## Team formation

Phase 1 of `docs/superpowers/plans/2026-09-29-team-formation-and-attendance.md`.

- `registrations.matching_status` is discovery consent (`looking` | `arranging` |
  `not_needed`, NULL = unanswered). Only `looking` + no team appears in
  `/api/participants/looking` (leaders only). It is never inferred from `public`
  and never prefilled from a prior edition.
- Profile fields (`intro`, `preferred_roles`, `interests`, `goals`, `languages`,
  code-host/portfolio links) live on the registration and are prefilled across
  editions. `skills` is normalised (`server/utils/skillNormalize.ts`);
  `skills_input` keeps what was typed. Vocabulary and form helpers are in
  `shared/teamFormation.ts`, mirroring the Postgres enums.
- Private contact is `registration_contacts`: organizer-only, no client grants.
  Teammates see it only when `share_with_team`. It must never be added to
  `PUBLIC_PROFILE_COLUMNS` (`server/utils/joinRequests.ts`) or the default
  participant export (`?include_contacts=1` is the organizer-only variant).
- `join_requests` holds applications and leader invitations (`kind`), each with a
  20–500 character `message`, `expires_at`, `decided_at` and `close_reason`.
- **All membership changes go through DB functions**: `join_team`,
  `create_team`, `decide_join_request` (approve/reject/accept/decline/withdraw).
  They lock the team row, so capacity and one-team-per-registration hold under
  concurrency. Do not write `registrations.team_id` for a join directly.
- `membership_events` records every join/leave with its `source` (founded,
  application, direct_invite, invite_link, recommendation, organizer) via a
  trigger on `registrations.team_id`; functions tag the source with the
  transaction-local `app.formation_source` setting.

### Recommendations and conversations (phase 2)

- Scoring is `shared/recommendations.ts` (contribution 45 / interests 25 /
  goals 20 / experience 10, normalised over signals both sides filled in;
  unknown is never a penalty; declared working languages with no overlap is
  the only hard exclusion). Ranking rotates near-equal matches by recent
  exposure. `/api/recommendations/teams` (3, solo participants) and
  `/candidates` (5, recruiting leaders) recompute on every call and log
  `recommendation_exposures`; a request made from a suggestion is attributed
  `source = 'recommendation'` only when such an exposure exists.
- `participant_blocks` is identity-level and two-way: no applications,
  invitations or request messages between blocked people, and no suggestions.
- Organizer-assisted teams are `team_proposals`; `respond_to_proposal` forms
  the team (source `organizer`) only after every proposed member accepts.
- **Conversation access** is defined once, in `conversation_access()`:
  - team chat: current members read and write; new members see the full
    history (disclosed in the UI); leaving removes access;
  - request chat (per application/invitation, opened by its required message):
    the applicant/invitee and the *current* leader while pending (read-only if
    either blocked the other); afterwards read-only history for the current
    leader, and for the applicant only if they joined that team. Former leaders
    and people who joined elsewhere keep nothing;
  - archived editions: everything read-only;
  - organizers read a conversation only through a report about it
    (`/api/admin/reports/:id`), and can hide a reported message.
- Unread-message email digests: `queue_chat_digests` (run by the operations
  run) queues at most one `chat_unread_digest` job per person per day for
  messages unread over an hour; the dispatcher re-counts at send time and
  skips it if everything was read.
- Delivery is polling (`/api/conversations/:id/messages`), not realtime, so
  every read re-checks access and no client ever holds a Supabase channel:
  every 3s in an open thread, 10s in the inbox, 15s for the dashboard badge,
  all paused while the tab is hidden (`useVisiblePolling`). An open thread is
  ~20 requests/minute, inside the 60/minute API limit, which is per user
  for signed-in requests (per IP only for anonymous ones).
  Sends are limited to 10/minute and 200/day per person, 2000 characters,
  rendered as text with only http(s) links (`shared/linkify.ts`).
- Retention and deletion: messages belong to the author's registration and are
  deleted with the account (cascade); reports keep no reporter once the account
  is gone. Conversations are never exported or shown in archives. Purging an
  archived edition's conversations is not automated yet; any change to the
  archival/erasure paths needs explicit human review (AGENTS.md).

## Attendance

Phase 3 stores each person's `intention`/`intention_at` separately from their
`seat_state` and `checked_in_at`. Private help requests are in
`attendance_barriers`; only organizer routes read them. Seats are `accepted`,
`offered`, `waitlisted`, or `cancelled`; `change_seat` and `offer_next_seat` lock
the edition row, and the revised `enforce_edition_cap` counts accepted seats
and offered seats. An organizer can expire due offers from the attendance desk.
Check-ins and corrections are recorded in `checkin_events`.

Admission is decided in the database: `admit_new_registration` places a new
registration on the waitlist (instead of failing) when the edition is full or
anyone is still waiting for a first offer, and `advance_waitlist` offers a
freed seat whenever a reserved registration is waitlisted-in or deleted.

`notification_jobs` stores edition-scoped delivery status, attempts, and a
unique dedup key. `server/utils/notifications.ts` delivers them:
`claim_notification_jobs` leases due jobs (SKIP LOCKED, 15-minute lease, at
most five attempts), each kind has a handler that re-checks relevance at send
time, and outcomes are logged by job id only — never addresses. Seat offers
and welcomes are dispatched immediately by the route that creates them; the
rest go out on an operations run (`POST /api/admin/notifications/dispatch`,
"Run operations now" on `/ops/admin/attendance`), which also expires lapsed
offers, captures due snapshots and queues due reminders. There is no schedule
yet: a Cloudflare cron trigger for that run is a deploy-config decision.
`scripts/send-event-reminder.ts --edition <slug>` only queues arrival jobs
(counts only in its output) and is never run as part of development.

The attendance denominator is accepted seats plus offered seats; waitlisted
and cancelled registrations are reported separately. `attendance_snapshots`
at the 14-day, 7-day and 1-day cutoffs can only be captured inside their
window (from the cutoff until the event starts) and are immutable.

## Announcements & banners


`announcements` is the single source for every notice the site shows. Nothing is
hardcoded — adding or retiring a banner is an admin-panel action, not a deploy.

- `channel` picks where a row renders: `live` is the `/live` ticker, `ops` is a
  banner for logged-in participants inside `/ops`, `site` is a banner for every
  visitor on every page.
- `audience` (`ops` only) is evaluated client-side against `/api/me`:
  `all` | `leaders` | `no_team` | `missing_profile`. Adding one is a new enum value
  in a migration plus one predicate in `app/composables/useAnnouncementAudience.ts`
  — that file is the only code-owned part of the system.
- `variant`, `href`, `dismissible`, `active` and the `starts_at`/`ends_at` window
  are per row. `sort_order` is meaningful **within a channel**; the create and
  reorder endpoints scope to the channel they were called for.
- `GET /api/announcements` is public and cacheable. It returns `ops` rows to
  anonymous callers too (they carry no personal data) — rendering is gated, not
  fetching, so `AppBanners` never needs a second authenticated request.
- Dismissal is per-id in `localStorage['dismissed_announcements']`. There is no
  server-side dismissal table, so editing a row's body does not un-dismiss it.

## Privacy, consent & analytics

Read `docs/privacy/README.md` before touching registration, exports or tracking.

- Registration writes one `consent_records` row per purpose via `register_with_consents()`;
  never infer one purpose from another, never backfill.
- Sponsor sharing is voluntary: an explicit Yes/No per named recipient (No never affects
  participation). Data leaves only through `/api/admin/sponsors/:id/export`, which requires
  admin + MFA (`aal2`) + `NUXT_SPONSOR_EXPORTS_ENABLED`, checks `sponsor_export_rows()` at
  download time and writes `export_audit` first. Legacy `acknowledged` rows never qualify.
- Every personal-data export uses `requireAdminWithMfa` and `server/utils/csv.ts`
  (formula escaping, `no-store`).
- Dietary data lives only in `registration_catering` (server-only). Never put it, or any consent,
  in auth `user_metadata`.
- Analytics is consent-gated per browser (`analytics_browsers`, HttpOnly `lh_aid`, fixed 30 days)
  and off twice by default: `NUXT_ANALYTICS_ACTIVATION_ALLOWED` (server) and
  `editions.analytics_enabled` (admin). No consent → no event, no storage, no substitute
  identifier. `registration_completed` is written only by `analytics_complete_registration()`,
  once per registration.
- Source tags (`source_links`) are immutable and never reused; archive instead of deleting.
- Retention: `run_retention()` scheduled by pg_cron (migration), missed runs alerted by the
  `privacy:retention-monitor` Worker cron task. Undecided categories live in `retention_policies`
  as absent rows — never invent periods. See `docs/privacy/retention-and-deletion.md`.
- **Staging and production share one Supabase project.** `db push` affects production data.

## Testing

`bun run test` runs vitest. Tests live in `tests/server/` and are e2e against one shared server:
`tests/global-setup.ts` builds the app once into `.nuxt/test-fixture` (via
`tests/build-fixture.mjs`), starts the built server once, and publishes its URL to the workers
through `NUXT_TEST_CONTEXT`. Test files therefore need no `setup()` call — just import `fetch`,
`$fetch` or `url` from `@nuxt/test-utils/e2e` and request relative paths. Never hard-code
`http://localhost:3000`: the server listens on a random port, so that only "works" when a dev
server happens to be running there and fails in CI. No credentials are needed: `$test` in
`nuxt.config.ts` gives the fixture a dummy Supabase URL/key and every query goes to a local
PostgREST stub that answers "no rows"; anything that needs a session should mock
`serverSupabaseUser`, not talk to the real project. Tests share the server, so keep them stateless
(no writes that another file could see).

Three pieces of config exist only for the test run — do not remove them:

- `$test` in `nuxt.config.ts`: `node-server` preset (a `cloudflare_module` bundle cannot be started
  by Node), SQLite content, dummy Supabase config for the module **and** for `runtimeConfig`, which
  is what `useSupabaseAdmin()` reads — `createClient()` throws on an empty key, which turns every
  401 into a 500 in CI, where there is no `.env`. It also lifts `rateLimitMax`: every test request
  comes from one IP, and the in-memory fallback limiter would otherwise answer 429 once the suite
  makes more than 60 API calls a minute.
- `tests/supabase-stub.ts`, started by `global-setup` and injected as `NUXT_PUBLIC_SUPABASE_URL`.
  Pointing the fixture at a closed port instead costs ~7s per query — supabase-js retries network
  failures — which blows vitest's 5s timeout on any route that reads the database.
- The build runs in a child process (`build-fixture.mjs`) because Nuxt's `close` hook makes the
  vitest main process exit before any test runs when the build happens in-process.

The same suite gates every Workers Builds deploy (production, staging and PR previews), so a red
test blocks the deploy.

**Migrations** are covered separately by `bun run test:db` (`scripts/test-migrations.sh`). It spins
up a throwaway PostgreSQL cluster with `initdb`/`pg_ctl` — no Docker and no `supabase start` —
stubs the parts of the Supabase `auth` schema the migrations touch
(`supabase/tests/00-bootstrap.sql`), applies the already-deployed migrations, seeds realistic
pre-migration 2026 data (`01-seed-2026.sql`), then applies the new migrations and asserts the
outcome (`02-verify-editions.sql`): the backfills, the `leader_id` repoint, the per-edition cap,
leader auto-promotion through the account-deletion cascade, `promote_edition`, and the FK
delete/update policies. Add an assertion here for any migration that changes behaviour rather than
just shape. It is not part of `bun run test` because it needs a local PostgreSQL install.

## Emails

Templates are MJML compiled to HTML, then inlined as TypeScript constants (so they bundle into the Nitro output with no file-system reads at runtime).

```bash
# After editing any server/emails/*.mjml file:
bunx mjml server/emails/<name>.mjml -o server/emails/dist/<name>.html
node server/emails/generate-ts.mjs   # regenerates server/utils/email-templates.ts
```

Auth emails (signup, magic link, password reset) are Supabase Auth templates declared in `supabase/config.toml` (`[auth.email.template.*]`), pointing at the compiled HTML in `server/emails/dist/`. Supabase renders Go template variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`) and sends via the Resend SMTP configured in `[auth.email.smtp]`.

- After editing MJML: recompile to `dist/`, then `bunx supabase config push` to upload the new template to the cloud project.
- Subjects are set in `supabase/config.toml`.

Templates: `verify-email.html` (signup), `magic-link.html` (magic link), `reset-password.html` (recovery).

## Supabase (Cloud)

Production and staging run on Supabase cloud; the repo holds migrations and auth config only.

```bash
bunx supabase login                       # once per machine
bunx supabase link --project-ref <ref>    # once per checkout
bunx supabase db push                     # apply supabase/migrations/ to the linked project
bunx supabase config push                 # apply supabase/config.toml (auth, SMTP, email templates)

# Optional local stack for development (Postgres + Auth + Studio on http://127.0.0.1:54323)
bunx supabase start
bunx supabase db reset                    # rebuild local DB from migrations
```

- `supabase/config.toml` `env(...)` values come from `supabase/.env` (git-ignored, see `supabase/.env.example`)
- API keys and the project URL are in Dashboard > Project Settings > API
- Auth users, hashed passwords and app data were migrated from the old self-hosted instance via `pg_dump`/`psql` (see `docs/supabase-cloud-migration.md`)

## Deployment

Everything runs on Cloudflare Workers via Workers Builds — no GitHub Actions. What you push
decides where it goes:

| Push to | Worker | URL |
| --- | --- | --- |
| `main` | `manifesto` | https://liberhack.org |
| `dev` | `manifesto-staging` (wrangler env `staging`) | https://staging.liberhack.org |
| any other branch | preview **version** of `manifesto-staging` | `<version>-manifesto-staging.hexchap.workers.dev`, commented on the PR |

Every build runs `bun install --frozen-lockfile && bun run test && bun run build` first. Previews
share staging's bindings and secrets, never production's. Full setup and the Workers Builds
settings are in `docs/cloudflare-workers.md`.

Rules that follow from this layout:

- `wrangler.jsonc` `env.staging` does **not** inherit the top level. A new binding or var must be
  added in both places or staging/previews will crash on it.
- Secrets are per environment: `bunx wrangler secret put NAME` and `... --env staging`.
- A new host that users can land on after email confirmation must be added to
  `additional_redirect_urls` in `supabase/config.toml` and pushed with `bunx supabase config push`.
- `bunx wrangler deploy` from a laptop is for emergencies; normal deploys are merges.

```bash
bunx wrangler login                        # once per machine
bun run build                             # Nitro cloudflare_module preset -> .output/
bunx wrangler dev                          # local worker + miniflare D1 / rate limits
bunx wrangler deploy                       # ship it
bunx wrangler secret put NUXT_SUPABASE_SECRET_KEY   # secrets live in Cloudflare, not in vars
bunx wrangler tail                         # live logs
```

- `wrangler.jsonc` holds bindings and **non-secret** vars only; secrets go through `wrangler secret put`
- `<NuxtImg>` uses `provider: "none"` (no sharp on Workers); switch to `cloudflare` after enabling Images > Transformations on the zone
- The markdown collections are loaded into D1 on first request after each deploy
