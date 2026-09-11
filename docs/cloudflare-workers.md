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

## Environments

| | Worker | Branch | URL | D1 |
| --- | --- | --- | --- | --- |
| Production | `manifesto` | `main` | https://liberhack.org | `manifesto-content` |
| Staging | `manifesto-staging` (wrangler env `staging`) | `dev` | https://staging.liberhack.org | `manifesto-content-staging` |
| PR preview | version of `manifesto-staging` | any other branch | `<version>-manifesto-staging.<subdomain>.workers.dev` | staging's |

Everything below the top level of `wrangler.jsonc` is duplicated under
`env.staging` because bindings, routes and vars are not inherited. Both
environments talk to the same Supabase project today; point the staging `vars`
(and its secrets) at a second project if that ever changes.

Previews are versions of the *staging* Worker, never of production
(`preview_urls: false` at the top level): a preview shares the Worker's D1 and
Nuxt Content re-imports its own content on first request, which would overwrite
production's. On staging that thrash is acceptable.

Staging and previews send `X-Robots-Tag: noindex` (`server/middleware/00.noindex.ts`,
keyed on `NUXT_PUBLIC_APP_ENV`). Sign-up confirmation links use the origin the
page was served from, so every host is in `additional_redirect_urls` in
`supabase/config.toml` (push with `npx supabase config push`).

## One-time setup

```bash
npx wrangler login

# 1. D1 for Nuxt Content — ids are already in wrangler.jsonc; recreate with:
npx wrangler d1 create manifesto-content
npx wrangler d1 create manifesto-content-staging

# 2. Secrets, once per environment (prompted for the value; never in wrangler.jsonc)
npx wrangler secret put NUXT_SUPABASE_SECRET_KEY
npx wrangler secret put NUXT_RESEND_API_KEY
npx wrangler secret put NUXT_SUPABASE_SECRET_KEY --env staging
npx wrangler secret put NUXT_RESEND_API_KEY --env staging

# 3. Public vars live in wrangler.jsonc `vars` (top level and env.staging.vars)

# 4. First deploys — also provision the custom domains + certificates
npm run build
npx wrangler deploy
npx wrangler deploy --env staging
```

The zone `liberhack.org` must already be on the Cloudflare account. Any existing
`A`/`AAAA` record for the apex pointing at the old server has to be removed
first; `custom_domain: true` creates the records itself (apex and `staging`).

## Continuous deploys (Workers Builds)

No GitHub Actions. Connect the `LiberHack/Manifesto` repo to **both** Workers
(Workers & Pages > `<worker>` > Settings > Build); each gets its own settings:

| Setting | `manifesto` | `manifesto-staging` |
| --- | --- | --- |
| Production branch | `main` | `dev` |
| Build command | `npm ci --legacy-peer-deps && npm run build` | same |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy --env staging` |
| Builds for non-production branches | **off** | **on** |
| Non-production branch deploy command | — | `npx wrangler versions upload --env staging` |
| Build variables | `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same |

Result: push to `main` → liberhack.org; push to `dev` → staging.liberhack.org;
any other branch → a preview version of `manifesto-staging`, and the GitHub
integration comments the preview URL on the PR. The build variables only feed
`@nuxtjs/supabase` at build time; runtime `vars` override them anyway, so
missing values only produce warnings.

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
