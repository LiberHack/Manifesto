# Edition Archiving + Dormant-Static Mode — Design

**Date:** 2026-06-08
**Status:** Approved design (build deferred to a later phase)
**Scope of this document:** Design/spec only. No implementation in this phase.

## Goal

LiberHack is a recurring hackathon. Each run is an **edition**. This design lets the
project:

1. **Preserve records** — a permanent, durable record of every edition's
   participants, teams, and results.
2. **Returning-user convenience** — past participants log in with the same account
   and re-register for a new edition with their profile pre-filled.
3. **Public alumni/showcase** — browsable past editions: teams, members, project /
   GitHub links, presentation order, and winners.
4. **Clean slate each edition** — a reliable reset for a new run without ever
   deleting underlying accounts or history.
5. **Cut costs between editions** — when no edition is live, serve a fully static
   site (no Node app, no Supabase) generated from a JSON export.

## Core concepts

- **Edition (season)** — one run of LiberHack. Exactly one is *current* at a time;
  the rest are *archived*. Nothing is ever deleted. "Reset" = pointing
  `is_current` at a new edition row; old rows remain, scoped by their own edition.
- **Site mode**
  - **LIVE** — SSR Nuxt against Supabase. Registration, teams, join requests, and
    live CMS are active.
  - **DORMANT** — fully static site produced by `bun generate` from `archive.json`,
    served by Caddy alone. Both the Node app *and* the Supabase/Postgres stack are
    shut down. Re-opening an edition = redeploy the SSR app + bring Supabase up.
- **Golden rule (keeps both modes simple):** *past editions are always read from
  the static `archive.json`; only the current/live edition is read from the DB.*
  Showcase code is then identical in both modes — **dormant mode is simply "there
  is no current edition."**

## Data model (Postgres = source of truth)

Naming: editions are identified by a **natural key `slug`** (e.g. `2026`,
`2027-spring`) — short, URL-safe, immutable by convention, and already used by
`/archive/[slug]`. Foreign keys reference it with `ON UPDATE CASCADE` as a safety
net. All other tables keep UUID surrogate keys (rationale in the sweep below).

**`ON DELETE` policy (explicit everywhere):** editions are never deleted in normal
operation, but the schema states intent regardless. Content-bearing references —
`teams.edition_slug`, `registrations.edition_slug`, `join_requests.edition_slug` —
use **`ON DELETE RESTRICT`** so an edition holding real data cannot be deleted by
accident. Owned-config references — `event_config`, `schedule_items`,
`announcements` — use **`ON DELETE CASCADE`** (meaningless without their edition;
they vanish only if an already-emptied edition is deliberately removed).

### New: `editions`

```
editions (
  slug        text primary key,              -- e.g. '2026'
  name        text not null,                 -- display, e.g. 'LiberHack 2026'
  starts_at   timestamptz null,
  ends_at     timestamptz null,
  status      edition_status not null default 'draft',  -- draft | live | archived
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
)
-- enum: create type edition_status as enum ('draft','live','archived');
-- only one current edition at a time:
create unique index editions_one_current on editions (is_current) where is_current;
```

### Changed: `participants` → durable identity mirror only

The durable identity **is** `auth.users.id`. Per the documented Supabase pattern
(a thin `public` mirror of `auth.users`; never hang app FKs/RLS/joins/exports off
the managed `auth` schema), `participants` is kept as that mirror, slimmed to
identity fields. Per-edition attributes move to `registrations`.

```
participants (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  created_at  timestamptz not null default now()
)
-- REMOVED from participants (moved to registrations): team_id, role, skills,
--   dietary, experience
```

The existing `handle_new_user()` trigger continues to create the `participants`
profile row on signup.

### New: `registrations` (per-edition participation)

This is the table the returning-user pre-fill reads from.

```
registrations (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  edition_slug    text not null references editions(slug) on update cascade on delete restrict,
  role            participant_role not null default 'participant',  -- participant | leader
  team_id         uuid null references teams(id) on delete set null,
  skills          text[] not null default '{}',
  dietary         text null,
  experience      experience_level null,                            -- beginner | intermediate | experienced
  public          boolean not null default true,                    -- member opt-out of public showcase
  registered_at   timestamptz not null default now(),
  unique (participant_id, edition_slug)
)
create index registrations_edition_idx on registrations (edition_slug);
create index registrations_team_idx on registrations (team_id);
```

### Changed: `teams`

```
teams (
  id                  uuid primary key default gen_random_uuid(),
  edition_slug        text not null references editions(slug) on update cascade on delete restrict,
  name                varchar(32) not null,
  leader_id           uuid not null references registrations(id) on delete cascade,
  skills_wanted       text[] not null,
  description         varchar(200) null,
  github_url          text null,
  placement           int null,        -- winners: 1/2/3...; null = no placement
  awards              text[] not null default '{}',  -- multiple, free-form: 'Best Design', 'Most Unhinged Codebase'
  presentation_order  int null,        -- replaces content/order.md, per edition
  created_at          timestamptz not null default now()
)
create index teams_edition_idx on teams (edition_slug);
-- No two teams with the same name within one edition:
create unique index teams_unique_name_per_edition on teams (edition_slug, lower(name));
```

`teams` keeps a UUID PK: team names recur across editions ("fsociety" yearly), are
not unique even within one edition (`varchar(32)`, no unique constraint), and get
renamed — a natural key would have to be both composite and mutable.

**`leader_id → registrations(id)`** (not `auth.users` or `participants`). This is
consistent with the "never hang app FKs off the `auth` schema" rule *and*
guarantees at the DB level that a team's leader is actually registered for the
**same edition the team belongs to**. The leader is simply the `registration` with
`role = 'leader'` whose `team_id` points back at this team.

**Creation ordering (resolves the teams↔registrations cycle):** `registrations.team_id`
is nullable, so there is no circular-insert problem. A team is created by:
(1) ensure the leader's `registration` exists for the edition (`team_id` null);
(2) `insert into teams (..., leader_id = that registration.id)`;
(3) `update registrations set team_id = new team.id` for the leader.
**Leader departure — auto-promote, else dissolve.** A leader leaving must not
strand teammates, and it must work even when the delete arrives via the
`auth.users → participants → registrations` cascade (which bypasses app code). A
**`BEFORE DELETE` trigger on `registrations`** (`handle_leader_departure`) handles
it: for any team the departing registration leads, it reassigns `leader_id` to the
**earliest-joined remaining member** (by `registered_at`) and promotes that
member's `role` to `'leader'`; because the team no longer references the departing
row, the cascade leaves it intact. If **no** members remain, the pointer stays and
the existing `ON DELETE CASCADE` dissolves the team as the fallback (its
now-teamless members, if any, are unaffected). This keeps `leader_id` `NOT NULL`
and avoids an `ON DELETE RESTRICT` that would otherwise make a leader's account
undeletable (a GDPR problem). Account deletion always succeeds.

**`awards text[]`** (not a single `text` or a normalized table): a team often wins
several awards ("1st Place Overall" *and* "Best Use of Supabase"). An array keeps
the schema structure-free while natively supporting multiples.

**Unique team name *within* an edition** — `unique (edition_slug, lower(name))`.
Names still recur freely *across* editions, but two "fsociety" teams in the same
edition (confusing for judges/voting) are rejected case-insensitively.

**`slug` rename caveat** — `ON UPDATE CASCADE` propagates an edited `edition_slug`
through all FK rows, but Postgres cannot cascade to anything outside the DB. If
team logos/assets in a storage bucket are ever keyed by slug (none today), a rename
must also move those paths manually.

### Changed: `join_requests`

```
join_requests (
  ... existing columns ...,
  edition_slug  text not null references editions(slug) on update cascade on delete restrict
)
```

Ephemeral, per-edition, cleared/archived on close. Keeps UUID PK.

### Changed: live CMS — de-singletoned, per edition

`event_config` was a hard singleton (`id int default 1`, `check (id = 1)`). It
becomes **one row per edition**, keyed by `edition_slug`:

```
event_config (
  edition_slug  text primary key references editions(slug) on update cascade on delete cascade,
  event_name    text not null,
  event_start   timestamptz not null,
  event_end     timestamptz not null
)

schedule_items ( ... existing ..., edition_slug text not null references editions(slug) on update cascade on delete cascade )
announcements  ( ... existing ..., edition_slug text not null references editions(slug) on update cascade on delete cascade )
```

Each edition owns its own programme; nothing is a global singleton.

### Unchanged: `skills`

Stays a **global catalog** (reused across editions), UUID PK. It is referenced
denormalized as `text[]` on `registrations` (not as FKs), so its PK has no
downstream impact. `name` is a legitimate natural-key candidate but changing it is
not worth the churn — left as-is. (Optional, low priority.)

## Returning-user flow (opt-in, pre-filled)

On login, the app checks for a `registration` in the current edition:

- **None** → show a "Register for {edition.name}" step, pre-filled from the user's
  **most recent prior `registration`** (skills, dietary, experience). On submit,
  create a `registration` for the current edition. Team starts empty.
- **Exists** → normal dashboard.

New signups create the `participants` profile (existing trigger) **plus** a
`registration` for the current edition if one is live.

## Archive flow (admin: "Close & open next")

In `/ops/admin`:

1. **Record results** — during/after the event, set `placement` / `award` on teams
   and `presentation_order` (the `/order` tooling, now DB-backed).
2. **Close current** → `status = 'archived'`, `is_current = false`. Triggers the
   static export (below).
3. **Create next** → new edition row in **`status = 'draft'`** (admin sets
   slug/name/dates; can pre-build the schedule while draft, invisible to the
   public).
4. **Publish / Go live** → flip `draft → live` + `is_current = true`.

Because every per-edition table is `edition_slug`-scoped, the live scope
(teams / join_requests / registrations / CMS) is automatically empty for the new
edition. Old data is untouched.

**Mode transition:** between an *archived current* and a *draft next* there is no
`live` edition → the site is **DORMANT (static)**. "Go live" is the moment the SSR
app is redeployed and Supabase is brought back up — consistent with the
fully-static dormant decision.

## Static archive export (`archive.json`)

A generator (Nitro task / script) queries Postgres and writes one `archive.json` —
the showcase dataset and the dormant-mode read source. Per edition it contains:

- **Meta:** slug, name, starts_at, ends_at, total participant count, total team
  count, **`hidden_members` count** (registrations with `public = false`).
- **Teams:** name, description, github_url, placement, awards, presentation_order,
  and `members: [{ name, skills }]` — **only registrations with `public = true`**.

Runs on close and on demand. The committed `archive.json` is what dormant builds
consume.

**Privacy:**
- Per-member opt-out via `registrations.public` (default visible). Non-public
  members are excluded from the export body entirely, but **counted** in
  `hidden_members` so the archive page can show e.g. *"+ N participants who opted
  out of the public archive."* (Counts only — no identifying data.)
- **LIVE registration UI copy (transparency / GDPR):** the registration form must
  state visibility explicitly, e.g. *"Your profile and team will be shown in the
  public showcase."* with a clearly-labelled opt-out:
  *"[ ] Hide my profile from the public archive."* Default = visible (unchecked).
- In DORMANT/static mode, a persistent banner on archive pages:
  > *This is an archived edition. To request removal of your data, email
  > **privacy@liberhack.org**.*

### Dormant-mode privacy-drift mechanism (DB ↔ static sync)

During DORMANT the Postgres stack is **off**, so a removal request cannot be
applied to the DB immediately. Hand-editing `archive.json` alone causes **drift**:
when Supabase is next booted and a fresh export runs, the deleted person reappears.
To prevent this, removals are **never** applied by editing `archive.json` directly.
Instead:

1. **Redaction tooling** — `archive.json` deliberately stores only
   `{ name, skills }` per member (no email), so the JSON edit and the DB action key
   off **different identifiers**. The admin runs
   `redact <edition_slug> --team "<team name>" --member "<member name>" --who <email|auth-id> <mode: hide|delete>`:
   - the **`--team`/`--member`** pair locates and rewrites the entry in
     `archive.json` (drop the member, increment `hidden_members`); and
   - the DB-resolvable **`--who`** identifier (email or `auth.users.id`) is recorded
     in a git-tracked **`redactions.pending.json`** log (edition, who, mode,
     requested_at) for later reconciliation.
   Both changes are committed together, so the queued DB action survives the entire
   dormant period in version control.
2. **Reconciliation on boot** — a predeploy/startup step `apply-redactions` runs
   when Supabase comes back up for the next edition: it reads
   `redactions.pending.json`, applies each to Postgres (`mode=hide` →
   `registrations.public = false`; `mode=delete` → delete the registration / the
   participant + auth user per the request), then moves applied entries to
   `redactions.applied.json`. It **must be idempotent** — a re-run after a crash or
   timeout must safely no-op on already-hidden/already-deleted records (treat
   "record not found" / "already false" as success) and only drain entries that
   fully succeeded.
3. **Export guard** — the exporter **refuses to write a fresh `archive.json` while
   `redactions.pending.json` is non-empty**, forcing reconciliation before any new
   export can reintroduce removed data. This closes the drift loop.

## Site modes & build

- **Mode resolution:** derived from whether a `live` edition exists, with a
  `NUXT_PUBLIC_SITE_MODE` env override.
- **DORMANT:** `bun generate` renders landing + `/archive` + legal / reglament /
  programme from `archive.json` (+ `@nuxt/content`). `/ops/*` and `/api/*` are
  excluded and replaced by a static "next edition coming soon" page. No Node, no
  Supabase — Caddy serves static files.
  - **Client auth short-circuit (avoid token churn):** returning visitors may carry
    stale Supabase tokens in `localStorage`/cookies from the previous live season.
    The Nuxt Supabase plugin **must skip initialization entirely when
    `NUXT_PUBLIC_SITE_MODE === 'dormant'`** (no client construction, no session
    refresh, no API ping) — otherwise it floods the console with connection errors
    against the shut-down backend and can hang the UI. Because the static build
    excludes `/ops/*` and `/api/*`, nothing legitimately needs the client; the
    guard simply makes that explicit and discards/ignores stale sessions.
    State (`useState`/store) must **default the session to `null`** in dormant mode,
    and any component that reads user data (e.g. a navbar profile icon) must check
    site mode before touching reactive session state.
  - **Hydration safety:** archive pages are statically baked, so any rendered dates
    must use a fixed UTC/standardized formatter (or a `<ClientOnly>` wrapper) to
    avoid SSR/client hydration mismatches across time zones.
- **LIVE:** SSR as today. **Current** edition reads from the DB; **past** editions
  still read from `archive.json` (golden rule).

## Showcase pages

- **`/archive`** — index of all editions (cards: name, year, dates, #teams,
  #participants, winners highlight).
- **`/archive/[slug]`** — one edition: teams + members + GitHub links +
  presentation order + placements/awards.
- Reuses the existing punk/brutalist styling.

## Migration (wrap current live data as Edition 1)

1. Create `edition_status` enum and `editions`; insert the current run as
   `slug = '2026'`, `name = 'LiberHack 2026'`, `status = 'live'`,
   `is_current = true` (dates from current `event_config`).
2. Create `registrations`; backfill one row per existing participant from their
   current `team_id / role / skills / dietary / experience`, `edition_slug = '2026'`,
   `public = true`.
3. Add `edition_slug` to `teams` and `join_requests`; backfill `= '2026'`.
4. Convert `event_config` to per-edition (key by `edition_slug = '2026'`); add
   `edition_slug` to `schedule_items` and `announcements`, backfill `= '2026'`.
5. Backfill `teams.presentation_order` from the current `content/order.md`, then
   retire `order.md` (the `/order` page reads `presentation_order` from the DB).
6. Drop the moved columns from `participants` **after** backfill is verified — done
   in a **follow-up migration** for safety, not in the same step.

All steps are additive-then-cleanup so the running edition is never disrupted.

## Existing code affected (LIVE-mode refactor, later phase)

The current `server/api` routes assume one global participant↔team world. They
become **edition-aware** (scope reads/writes to the current edition, read profile
from `participants` + per-edition fields from `registrations`):

- Registration / dashboard endpoints (profile now split across
  `participants` + `registrations`).
- Team create / join-request / manage-requests endpoints (`edition_slug` scoping).
- Team CSV export (leader name/email from `participants`; per-edition fields from
  `registrations`).
- `/order` page + admin (reads/writes `teams.presentation_order` instead of
  `content/order.md`).
- Live CMS admin (`event_config` now per-edition).
- **Nuxt Supabase client plugin** — short-circuit when `NUXT_PUBLIC_SITE_MODE` is
  `dormant` (see Site modes).
- **New tooling** — `archive-export` (DB → `archive.json`, with export guard),
  `redact` (queue removal + rewrite static), `apply-redactions` (reconcile on boot).

## Testing

- **Unit:** export serializer (DB rows → `archive.json` shape; `public = false`
  excluded from body but counted in `hidden_members`; `awards` array passthrough);
  mode resolver (live edition present/absent + env override); returning-user
  pre-fill (reads most recent prior registration); export guard refuses to run
  while `redactions.pending.json` is non-empty.
- **Integration:** close → create-draft → go-live empties the live scope while all
  prior-edition data persists; `registrations` uniqueness per
  `(participant_id, edition_slug)`; partial-unique enforces a single current
  edition; `apply-redactions` applies `hide`/`delete`, is idempotent on re-run, and
  drains the pending log; `ON DELETE RESTRICT` blocks deleting an edition that still
  has teams; **leader departure** auto-promotes the earliest-joined member and
  dissolves a sole-leader team (verified through the `auth.users` cascade path too);
  duplicate team name within an edition is rejected case-insensitively while the
  same name is allowed across editions.
- **Build:** dormant `bun generate` produces `/archive` + `/archive/[slug]` from a
  fixture `archive.json` **with no Supabase env present**; `/ops/*` and `/api/*`
  excluded; privacy banner present; Supabase plugin does not initialize in dormant
  mode.

## Decisions (resolved)

1. **Per-member public opt-out** — included; `registrations.public`, default
   visible. Non-public members excluded from export body, counted in
   `hidden_members`; LIVE registration UI states visibility + offers opt-out.
2. **`/order.md`** — migrated into `teams.presentation_order`; markdown retired.
3. **Mode flag** — derived from live-edition existence, with
   `NUXT_PUBLIC_SITE_MODE` override; Supabase client plugin short-circuits in
   dormant mode.
4. **`editions` PK** — natural key `slug` (not `name`).
5. **Durable identity** — `auth.users.id`, surfaced via the thin `participants`
   mirror (not built directly on the `auth` schema).
6. **`event_config`** — per-edition (keyed by `edition_slug`), no longer a
   singleton.
7. **Archive flow** — "create next" produces a `draft`; a separate "go live"
   promotes it.
8. **Static-mode privacy banner** — present; directs removal requests to
   `privacy@liberhack.org`.
9. **`teams.awards`** — `text[]` (multiple free-form awards per team).
10. **`teams.leader_id`** — references `registrations(id)` (edition-integrity +
    consistent with the no-`auth`-FK rule); creation ordering documented. Leader
    departure = **auto-promote earliest-joined member, else dissolve**, via a
    `BEFORE DELETE` trigger; `leader_id` stays `NOT NULL ON DELETE CASCADE` (no
    `RESTRICT`, so account deletion always succeeds).
11. **`ON DELETE`** — explicit everywhere: `RESTRICT` on content-bearing edition
    FKs, `CASCADE` on owned-config FKs.
12. **Dormant privacy-drift** — git-tracked `redactions.pending.json` queue +
    `apply-redactions` reconciliation on DB boot + export guard.
13. **Deployment trigger for static rebuild** — **manual runbook** for the first
    iterations (see Deployment & runbook); automate later once proven.
14. **Unique team name per edition** — `unique (edition_slug, lower(name))`.
15. **Redaction identifier split** — JSON edit keys off `--team`/`--member` name;
    `redactions.pending.json` stores a DB-resolvable `--who` (email/auth id).
    `apply-redactions` is idempotent.

## Deployment & runbook (transitions between modes)

The archive→static rebuild is a **manual developer runbook** for the first
iterations (rare, high-consequence; a human reviews the `archive.json` diff before
it ships). Automation (GitHub Action) is a deliberate fast-follow once the flow has
run cleanly.

**LIVE → DORMANT (closing an edition):**
1. Admin records results (placements/awards/order) and runs **Close current** in
   `/ops/admin` (`status='archived'`, `is_current=false`).
2. Developer runs `archive-export` against the DB → updated `archive.json`
   (export guard blocks if `redactions.pending.json` is non-empty).
3. Review the `archive.json` diff, commit.
4. Build with `NUXT_PUBLIC_SITE_MODE=dormant` → `bun generate`; deploy the static
   output (Caddy-only). Shut down the Node app and the Supabase/Postgres stack.

**DORMANT → LIVE (opening the next edition):**
1. Bring the Supabase stack up; run `apply-redactions` to drain any
   `redactions.pending.json` accumulated during dormancy (reconciles DB ↔ static).
2. In `/ops/admin`: the next edition already exists as a `draft` (created before
   going dormant) or is created now; finalize slug/name/dates and **Publish / Go
   live** (`draft→live`, `is_current=true`).
3. Redeploy the SSR app (`NUXT_PUBLIC_SITE_MODE=live`) with Supabase env present.

This runbook lives in the repo (e.g. `docs/runbooks/edition-transition.md`) as part
of the implementation phase.

## Out of scope (this design)

- Implementation (deferred). This document is the spec only.
- Project descriptions/screenshots beyond a GitHub link (could extend `teams`
  later).
- Cross-edition analytics dashboards (the relational model supports them; no UI
  designed here).
