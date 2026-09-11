# Manifesto

> **Read [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) first.** They define hard rules (no direct pushes to `main`/`dev`, no touching redaction/erasure code without review, no committing secrets) that apply to every AI agent working in this repo.

Website for **LiberHack** — a hackathon with a punk-ish vibe. Think raw, rebellious, anti-corporate aesthetic: zine culture, glitch/noise textures, brutalist layouts, bold type, high contrast. Not polished SaaS — deliberately rough around the edges.

Nuxt 4 app with Vue 3, Tailwind CSS v4, DaisyUI, and @nuxt/content.

## Stack

- **Framework**: Nuxt 4 (`nuxt ^4.4.2`)
- **UI**: Tailwind CSS v4 via `@tailwindcss/vite`, DaisyUI v5
- **Content**: `@nuxt/content` with better-sqlite3
- **Email**: Postmark (transactional), MJML templates
- **Language**: TypeScript
- **Modules**: `@nuxt/fonts`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/hints`

## Commands

```bash
bun dev        # start dev server
bun build      # production build
bun generate   # static generation
bun preview    # preview production build
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
supabase/         # Supabase CLI config (config.toml) & migrations
```

## Environment Variables

Required in `.env`:

```bash
NUXT_SUPABASE_SERVICE_KEY=          # Supabase service role key (bypasses RLS)
NUXT_PUBLIC_SUPABASE_URL=           # https://<project-ref>.supabase.co (or http://127.0.0.1:54321 with `supabase start`)
NUXT_PUBLIC_SUPABASE_ANON_KEY=      # Supabase anon key
NUXT_POSTMARK_TOKEN=                # Postmark server token (transactional email)
NUXT_POSTMARK_FROM_EMAIL=           # Sender address verified in Postmark
NUXT_SITE_URL=                      # Full app URL, used in email links (e.g. http://localhost:3000)
# Optional:
NUXT_PUBLIC_EMAIL_VERIFIED_REDIRECT_URL=  # defaults to /ops/confirm — must match additional_redirect_urls in supabase/config.toml
```

## Auth & Routes

- `/ops/*` pages are protected by the `auth` client middleware — redirects to `/ops/login` if no session, `/ops/verify-email` if email not confirmed
- Server-side: `01.auth.ts` attaches the Supabase user to `event.context.user`
- Rate limiting: 60 req/min per IP on all `/api/*` routes (`02.rateLimit.ts`)
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

Production runs via Docker Compose with Caddy for automatic SSL (Let's Encrypt):
- `Dockerfile` — copies pre-built `.output/` into `node:22-alpine`, runs `node .output/server/index.mjs`
- `docker-compose.yml` — `app` + `caddy` services; Caddy proxies to `app:3000`
- `Caddyfile` — reads domain from `$DOMAIN` env var
- Set `DOMAIN=yourdomain.com` in `.env` before `docker compose up -d`
- Ports 80/443 must be open; DNS must point to server before first start

### Deploying to server

```bash
rsync -avz \
  --include='.output/***' \
  --include='Dockerfile' \
  --include='docker-compose.yml' \
  --include='Caddyfile' \
  --include='.env' \
  --exclude='*' \
  /home/hexchap/Projects/LiberHack/Manifesto/ \
  user@your-server:/opt/librehack/
```
