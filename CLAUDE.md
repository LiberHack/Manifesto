# Manifesto

Website for **LibreHack** — a hackathon with a punk-ish vibe. Think raw, rebellious, anti-corporate aesthetic: zine culture, glitch/noise textures, brutalist layouts, bold type, high contrast. Not polished SaaS — deliberately rough around the edges.

Nuxt 4 app with Vue 3, Tailwind CSS v4, DaisyUI, and @nuxt/content.

## Stack

- **Framework**: Nuxt 4 (`nuxt ^4.4.2`)
- **UI**: Tailwind CSS v4 via `@tailwindcss/vite`, DaisyUI v5
- **Content**: `@nuxt/content` with better-sqlite3
- **Language**: TypeScript
- **Modules**: `@nuxt/fonts`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/hints`

## Commands

```bash
bun dev        # start dev server
bun build      # production build
bun generate   # static generation
bun preview    # preview production build
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
public/           # Static assets (tailwind.css lives here)
nuxt.config.ts    # Nuxt configuration
supabase/         # Supabase CLI config & migrations (supabase CLI only)
supabase-docker/  # Self-hosted Supabase via Docker Compose
```

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
- Migrations still managed via Supabase CLI in `supabase/` directory
