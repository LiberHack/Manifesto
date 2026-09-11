# Running Manifesto on Cloudflare Workers

The Nuxt app is built with Nitro's `cloudflare_module` preset and deployed as a
single Worker: server code from `.output/server/index.mjs`, static files from
`.output/public` (Workers Static Assets). Supabase Cloud stays the database and
auth provider; Resend sends transactional email over plain HTTPS.

## What changed vs. the Docker/Caddy setup

| Concern | Before | Now |
| --- | --- | --- |
| Runtime | Node 22 in Docker behind Caddy | Cloudflare Workers (workerd, `nodejs_compat`) |
| TLS / domain | Caddy + Let's Encrypt | Cloudflare custom domain (`routes[].custom_domain` in `wrangler.jsonc`) |
| Markdown content | better-sqlite3 file in the container | D1 database, binding `DB` (loaded from the build dump on first request) |
| Image optimisation | ipx + sharp | none (`<NuxtImg>` emits plain `<img>`); opt into Cloudflare Image Transformations later |
| Rate limiting | in-memory map keyed by `x-real-ip` | Workers Rate Limiting bindings `RL_API` / `RL_INVITE` / `RL_SKILLS`, keyed by `cf-connecting-ip` |
| Live screen SSE | module-level set of controllers, admin writes broadcast | each SSE connection polls Supabase every 5 s and emits on change |
| Email | `resend` SDK | `fetch` to `https://api.resend.com/emails` (SDK needs `@react-email/render`, not bundleable) |
| Secrets | `.env` on the server | `wrangler secret put` |

## One-time setup

```bash
npx wrangler login

# 1. D1 for Nuxt Content — paste the printed id into wrangler.jsonc d1_databases[0].database_id
npx wrangler d1 create manifesto-content

# 2. Secrets (prompted for the value; never put these in wrangler.jsonc)
npx wrangler secret put NUXT_SUPABASE_SECRET_KEY
npx wrangler secret put NUXT_RESEND_API_KEY

# 3. Public vars: fill in the real values in wrangler.jsonc `vars`
#    NUXT_PUBLIC_SUPABASE_URL, NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NUXT_PUBLIC_SUPABASE_KEY,
#    NUXT_RESEND_FROM_EMAIL

# 4. First deploy — also provisions the liberhack.org custom domain + certificate
npm run deploy
```

The zone `liberhack.org` must already be on the Cloudflare account. Any existing
`A`/`AAAA` record for the apex pointing at the old server has to be removed
first; `custom_domain: true` creates the record itself.

## Continuous deploys (Workers Builds)

No GitHub Actions needed. In the dashboard: Workers & Pages > manifesto >
Settings > Build > connect the `LiberHack/Manifesto` repo.

- Production branch: `main`
- Build command: `npm ci --legacy-peer-deps && npm run build`
- Deploy command: `npx wrangler deploy`
- Build variables: the same `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  the old workflow passed (the `@nuxtjs/supabase` module reads them at build time;
  the runtime `vars` override them anyway, so missing values only produce warnings)

Preview deployments for PRs come for free (`<branch>-manifesto.<subdomain>.workers.dev`;
enable `workers_dev` or preview URLs in the dashboard if you want them).

`.github/workflows/deploy.yml` still rsyncs to the old host and should be deleted
once Workers Builds is confirmed working — that file is protected by `AGENTS.md`
and needs a human commit.

## Local development

```bash
bun dev             # unchanged: Nuxt dev server, local SQLite for content,
                    # in-memory rate limiter, .env for config
npm run build && npm run preview:cf
                    # real worker in miniflare: local D1, rate-limit bindings,
                    # reads .dev.vars (git-ignored) for env
```

`.dev.vars` uses the same `NUXT_*` names as `.env`. Copy the values over when you
want to exercise Supabase through the worker locally.

## Operations

```bash
npx wrangler tail                 # streaming logs (observability is enabled in wrangler.jsonc)
npx wrangler deployments list     # history
npx wrangler rollback             # previous version
npx wrangler d1 execute manifesto-content --remote --command 'select count(*) from _content_info'
```

- Content is re-imported into D1 on the first request after each deploy (the
  build embeds a SQL dump; Nuxt Content diffs it against `_content_info`).
- `serverTime` in the live payload is the worker's clock; countdowns on `/live`
  are offset from it, so no NTP concerns beyond Cloudflare's.
- Rate-limit counters are per Cloudflare location. Tighten or loosen limits in
  `wrangler.jsonc` `ratelimits[]`; period must be 10 or 60 seconds.

## Optional next steps

- **Images**: enable Images > Transformations on the zone, then set
  `image: { provider: "cloudflare", cloudflare: { baseURL: "https://liberhack.org" } }`
  in `nuxt.config.ts` to get resized/WebP variants via `/cdn-cgi/image/`.
- **WAF**: Security > WAF > custom rules — e.g. block non-Bulgarian/EU traffic to
  `/ops/admin/*`, challenge suspicious `/api/invite/*` hits, managed ruleset on.
- **Cache**: `routeRules` in `nuxt.config.ts` with `swr`/`isr` for `/`, `/programme`,
  `/order`, `/legal/*` (all static content) to skip SSR entirely at the edge.
