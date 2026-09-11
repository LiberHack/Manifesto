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
server/middleware/ # 00.noindex.ts (X-Robots-Tag off production), 01.auth.ts (attaches user to context), 02.rateLimit.ts (60 req/min/IP)
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
```

`NUXT_PUBLIC_APP_ENV` (`production` | `staging` | `development`, default `development`) is set per
environment in `wrangler.jsonc`; anything but `production` sends `X-Robots-Tag: noindex`. Leave it
unset locally.

## Auth & Routes

- `/ops/*` pages are protected by the `auth` client middleware — redirects to `/ops/login` if no session, `/ops/verify-email` if email not confirmed
- Server-side: `01.auth.ts` attaches the Supabase user to `event.context.user`
- Rate limiting: 60 req/min per IP on all `/api/*` routes (`02.rateLimit.ts`) via Workers Rate Limiting bindings (`RL_*` in `wrangler.jsonc`); falls back to an in-memory map in `nuxt dev`
- `/api/live/stream` is SSE: each connection polls Supabase every 5s and only emits on change (Workers isolates share no memory, so there is no server-side broadcast)
- Admin role: set `role = 'admin'` in the `participants` table to expose `/ops/admin`
- `emailRedirectTo` in `signUp` is `<current origin>/ops/confirm`, so every host the app is served from (production, staging, PR previews) must be in `additional_redirect_urls` in `supabase/config.toml`

## Testing

`bun run test` runs vitest. Tests live in `tests/server/` and are e2e: a vitest `globalSetup`
(`tests/global-setup.ts` → `tests/build-fixture.mjs`) builds the app **once** into
`.nuxt/test-fixture`, and each file calls `useFixture()` from `tests/fixture.ts` to boot a server
from that output (~2 s) instead of `setup({ server: true })` (a ~45 s build per file). Requests go
through `fetch` / `$fetch` / `url()` from `@nuxt/test-utils/e2e` — the server listens on a random
port, so a hard-coded `http://localhost:3000` only "works" when a dev server happens to be running
there and fails in CI. No credentials are needed: `$test` in `nuxt.config.ts` gives the fixture a
dummy Supabase URL/key and unauthenticated paths never hit the network; anything that needs a
session should mock `serverSupabaseUser`, not talk to the real project.

Two pieces of config exist only for the test run — do not remove them:

- `$test` in `nuxt.config.ts`: `node-server` preset (a `cloudflare_module` bundle cannot be started
  by Node), SQLite content, dummy Supabase config.
- The build runs in a child process (`build-fixture.mjs`) because Nuxt's `close` hook makes the
  vitest main process exit before any test runs when the build happens in-process.

The same suite gates every Workers Builds deploy (production, staging and PR previews), so a red
test blocks the deploy.

## Emails

Templates are MJML compiled to HTML, then inlined as TypeScript constants (so they bundle into the Nitro output with no file-system reads at runtime).

```bash
# After editing any server/emails/*.mjml file:
bunx mjml server/emails/<name>.mjml -o server/emails/dist/<name>.html
node server/emails/generate-ts.mjs   # regenerates server/utils/email-templates.ts
```

Auth emails (signup, magic link, password reset) are Supabase Auth templates declared in `supabase/config.toml` (`[auth.email.template.*]`), pointing at the compiled HTML in `server/emails/dist/`. Supabase renders Go template variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`) and sends via the Postmark SMTP configured in `[auth.email.smtp]`.

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
