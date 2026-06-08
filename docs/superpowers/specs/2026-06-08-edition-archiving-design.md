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
  edition_slug    text not null references editions(slug) on update cascade on delete cascade,
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
  edition_slug        text not null references editions(slug) on update cascade,
  name                varchar(32) not null,
  leader_id           uuid not null references auth.users(id) on delete cascade,
  skills_wanted       text[] not null,
  description         varchar(200) null,
  github_url          text null,
  placement           int null,        -- winners: 1/2/3...; null = no placement
  award               text null,       -- e.g. 'Best Design'; free-form
  presentation_order  int null,        -- replaces content/order.md, per edition
  created_at          timestamptz not null default now()
)
create index teams_edition_idx on teams (edition_slug);
```

`teams` keeps a UUID PK: team names recur across editions ("fsociety" yearly), are
not unique even within one edition (`varchar(32)`, no unique constraint), and get
renamed — a natural key would have to be both composite and mutable.

### Changed: `join_requests`

```
join_requests (
  ... existing columns ...,
  edition_slug  text not null references editions(slug) on update cascade
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

schedule_items ( ... existing ..., edition_slug text not null references editions(slug) on update cascade )
announcements  ( ... existing ..., edition_slug text not null references editions(slug) on update cascade )
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

- **Meta:** slug, name, starts_at, ends_at, participant count, team count.
- **Teams:** name, description, github_url, placement, award, presentation_order,
  and `members: [{ name, skills }]` — **only registrations with `public = true`**.

Runs on close and on demand. The committed `archive.json` is what dormant builds
consume.

**Privacy:**
- Per-member opt-out via `registrations.public` (default visible). Non-public
  members are excluded from the export entirely.
- In DORMANT/static mode, a persistent banner on archive pages:
  > *This is an archived edition. To request removal of your data, email
  > **privacy@liberhack.org**.*

## Site modes & build

- **Mode resolution:** derived from whether a `live` edition exists, with a
  `NUXT_PUBLIC_SITE_MODE` env override.
- **DORMANT:** `bun generate` renders landing + `/archive` + legal / reglament /
  programme from `archive.json` (+ `@nuxt/content`). `/ops/*` and `/api/*` are
  excluded and replaced by a static "next edition coming soon" page. No Node, no
  Supabase — Caddy serves static files.
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

## Testing

- **Unit:** export serializer (DB rows → `archive.json` shape, including
  `public = false` exclusion); mode resolver (live edition present/absent + env
  override); returning-user pre-fill (reads most recent prior registration).
- **Integration:** close → create-draft → go-live empties the live scope while all
  prior-edition data persists; `registrations` uniqueness per
  `(participant_id, edition_slug)`; partial-unique enforces a single current
  edition.
- **Build:** dormant `bun generate` produces `/archive` + `/archive/[slug]` from a
  fixture `archive.json` **with no Supabase env present**; `/ops/*` and `/api/*`
  excluded; privacy banner present.

## Decisions (resolved)

1. **Per-member public opt-out** — included; `registrations.public`, default
   visible. Non-public members excluded from export.
2. **`/order.md`** — migrated into `teams.presentation_order`; markdown retired.
3. **Mode flag** — derived from live-edition existence, with
   `NUXT_PUBLIC_SITE_MODE` override.
4. **`editions` PK** — natural key `slug` (not `name`).
5. **Durable identity** — `auth.users.id`, surfaced via the thin `participants`
   mirror (not built directly on the `auth` schema).
6. **`event_config`** — per-edition (keyed by `edition_slug`), no longer a
   singleton.
7. **Archive flow** — "create next" produces a `draft`; a separate "go live"
   promotes it.
8. **Static-mode privacy banner** — present; directs removal requests to
   `privacy@liberhack.org`.

## Out of scope (this design)

- Implementation (deferred). This document is the spec only.
- Project descriptions/screenshots beyond a GitHub link (could extend `teams`
  later).
- Cross-edition analytics dashboards (the relational model supports them; no UI
  designed here).
