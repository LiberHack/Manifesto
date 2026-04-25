# Manifesto

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
supabase/         # Supabase CLI config & migrations
supabase-docker/  # Self-hosted Supabase via Docker Compose
```

## Environment Variables

Required in `.env`:

```bash
NUXT_SUPABASE_SERVICE_KEY=          # Supabase service role key (bypasses RLS)
NUXT_PUBLIC_SUPABASE_URL=           # e.g. http://localhost:8000
NUXT_PUBLIC_SUPABASE_ANON_KEY=      # Supabase anon key
NUXT_POSTMARK_TOKEN=                # Postmark server token (transactional email)
NUXT_POSTMARK_FROM_EMAIL=           # Sender address verified in Postmark
NUXT_SITE_URL=                      # Full app URL, used in email links (e.g. http://localhost:3000)
# Optional:
NUXT_PUBLIC_EMAIL_VERIFIED_REDIRECT_URL=  # defaults to /ops/confirm — must be allowed in ADDITIONAL_REDIRECT_URLS in supabase-docker/.env
```

## Auth & Routes

- `/ops/*` pages are protected by the `auth` client middleware — redirects to `/ops/login` if no session, `/ops/verify-email` if email not confirmed
- Server-side: `01.auth.ts` attaches the Supabase user to `event.context.user`
- Rate limiting: 60 req/min per IP on all `/api/*` routes (`02.rateLimit.ts`)
- Admin role: set `role = 'admin'` in the `participants` table to expose `/ops/admin`
- `emailRedirectTo` in `signUp` requires the URL to be in `ADDITIONAL_REDIRECT_URLS` in `supabase-docker/.env` (e.g. `http://localhost:3000/**`)

## Emails

Templates are MJML compiled to HTML, then inlined as TypeScript constants (so they bundle into the Nitro output with no file-system reads at runtime).

```bash
# After editing any server/emails/*.mjml file:
bunx mjml server/emails/<name>.mjml -o server/emails/dist/<name>.html
node server/emails/generate-ts.mjs   # regenerates server/utils/email-templates.ts
```

Auth emails (signup, magic link, password reset) are served as static files by a Caddy container (`templates-server`) inside the Docker network. GoTrue fetches the template HTML via HTTP, renders Go template variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`), and sends via SMTP.

- Template files are served directly from `server/emails/dist/` — no duplication needed.
- After editing MJML: recompile to `dist/`, then restart `templates-server` (or it auto-serves the new file).
- `MAILER_SUBJECTS_*` vars in `supabase-docker/.env` control email subjects.

Templates: `verify-email.html` (signup), `magic-link.html` (magic link), `reset-password.html` (recovery).

## Supabase (Self-Hosted)

The project runs Supabase locally via Docker, not via Supabase CLI's `supabase start`.

```bash
# Start Supabase
cd supabase-docker && docker compose up -d

# Stop Supabase
cd supabase-docker && docker compose down

# View logs
cd supabase-docker && docker compose logs -f

# Dashboard: http://localhost:8000
# Username: supabase  Password: see supabase-docker/.env DASHBOARD_PASSWORD
```

- Kong (API gateway) on port 8000, Postgres on port 5432
- The app `.env` points to `SUPABASE_URL=http://localhost:8000`
- Secrets live in `supabase-docker/.env` (git-ignored)
- Migrations managed via Supabase CLI: `supabase db push --local`

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
