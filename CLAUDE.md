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
bun dev        # start dev server
bun build      # production build
bun generate   # static generation
bun preview    # preview production build (node)
bun preview:cf # run the built worker locally with wrangler dev (D1 + rate limits via miniflare)
bun deploy     # nuxt build && wrangler deploy
bun test       # run vitest unit tests
```

## Package Manager

We use **bun** locally for speed, but infra/CI relies on **npm** for reproducibility.

- Never commit `bun.lock`, `bun.lockb`, or any bun-specific lockfiles
- `package-lock.json` is the source of truth for dependencies
- When adding packages: `bun add <pkg>` is fine locally, but verify `package-lock.json` is updated before committing
- `.gitignore` must always exclude bun lockfiles

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
server/middleware/ # 01.auth.ts (attaches user to context), 02.rateLimit.ts (60 req/min/IP)
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
# Optional:
NUXT_PUBLIC_EMAIL_VERIFIED_REDIRECT_URL=  # defaults to /ops/confirm — must match additional_redirect_urls in supabase/config.toml
```

## Auth & Routes

- `/ops/*` pages are protected by the `auth` client middleware — redirects to `/ops/login` if no session, `/ops/verify-email` if email not confirmed
- Server-side: `01.auth.ts` attaches the Supabase user to `event.context.user`
- Rate limiting: 60 req/min per IP on all `/api/*` routes (`02.rateLimit.ts`) via Workers Rate Limiting bindings (`RL_*` in `wrangler.jsonc`); falls back to an in-memory map in `nuxt dev`
- `/api/live/stream` is SSE: each connection polls Supabase every 5s and only emits on change (Workers isolates share no memory, so there is no server-side broadcast)
- Admin role: set `role = 'admin'` in the `participants` table to expose `/ops/admin`
- `emailRedirectTo` in `signUp` requires the URL to match `additional_redirect_urls` in `supabase/config.toml` (e.g. `https://liberhack.org/**`)

## Emails

Templates are MJML compiled to HTML, then inlined as TypeScript constants (so they bundle into the Nitro output with no file-system reads at runtime).

```bash
# After editing any server/emails/*.mjml file:
bunx mjml server/emails/<name>.mjml -o server/emails/dist/<name>.html
node server/emails/generate-ts.mjs   # regenerates server/utils/email-templates.ts
```

Auth emails (signup, magic link, password reset) are Supabase Auth templates declared in `supabase/config.toml` (`[auth.email.template.*]`), pointing at the compiled HTML in `server/emails/dist/`. Supabase renders Go template variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`) and sends via the Postmark SMTP configured in `[auth.email.smtp]`.

- After editing MJML: recompile to `dist/`, then `npx supabase config push` to upload the new template to the cloud project.
- Subjects are set in `supabase/config.toml`.

Templates: `verify-email.html` (signup), `magic-link.html` (magic link), `reset-password.html` (recovery).

## Supabase (Cloud)

Production and staging run on Supabase cloud; the repo holds migrations and auth config only.

```bash
npx supabase login                       # once per machine
npx supabase link --project-ref <ref>    # once per checkout
npx supabase db push                     # apply supabase/migrations/ to the linked project
npx supabase config push                 # apply supabase/config.toml (auth, SMTP, email templates)

# Optional local stack for development (Postgres + Auth + Studio on http://127.0.0.1:54323)
npx supabase start
npx supabase db reset                    # rebuild local DB from migrations
```

- `supabase/config.toml` `env(...)` values come from `supabase/.env` (git-ignored, see `supabase/.env.example`)
- API keys and the project URL are in Dashboard > Project Settings > API
- Auth users, hashed passwords and app data were migrated from the old self-hosted instance via `pg_dump`/`psql` (see `docs/supabase-cloud-migration.md`)

## Deployment

Production runs on Cloudflare Workers with static assets served from `.output/public`. See
`docs/cloudflare-workers.md` for the one-time setup (D1, secrets, custom domain, Workers Builds).

```bash
npx wrangler login                        # once per machine
npm run build                             # Nitro cloudflare_module preset -> .output/
npx wrangler dev                          # local worker + miniflare D1 / rate limits
npx wrangler deploy                       # ship it
npx wrangler secret put NUXT_SUPABASE_SECRET_KEY   # secrets live in Cloudflare, not in vars
npx wrangler tail                         # live logs
```

- `wrangler.jsonc` holds bindings and **non-secret** vars only; secrets go through `wrangler secret put`
- `<NuxtImg>` uses `provider: "none"` (no sharp on Workers); switch to `cloudflare` after enabling Images > Transformations on the zone
- The markdown collections are loaded into D1 on first request after each deploy
