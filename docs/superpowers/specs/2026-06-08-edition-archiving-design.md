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
  - **DORMANT** — fully static site produced by `bun generate` from the per-edition
    archive files, served by Caddy alone. Both the Node app *and* the
    Supabase/Postgres stack are shut down. Re-opening an edition = redeploy the SSR
    app + bring Supabase up.
- **Golden rule (keeps both modes simple):** *past editions are always read from
  the static archive files; only the current/live edition is read from the DB.*
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
  created_at  timestamptz not null default now(),
  -- is_current and status are not independent: only a live edition may be current.
  constraint current_implies_live check (not is_current or status = 'live')
)
-- enum: create type edition_status as enum ('draft','live','archived');
-- only one current edition at a time:
create unique index editions_one_current on editions (is_current) where is_current;
```

**`is_current` vs `status` — one fact, guarded.** `is_current = true` always
coincides with `status = 'live'`; both flip together on close/go-live. The `CHECK`
constraint above forbids the inconsistent states (e.g. `is_current=true,
status='archived'`) that would silently break mode resolution. `is_current` is kept
as a separate column (rather than derived) only so the partial unique index can
enforce "exactly one current."

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
profile row on signup. **Caveat (deferred):** `participants.email` is a mirror set
at signup and will *not* track later changes to the auth email unless a companion
`AFTER UPDATE ON auth.users` trigger is added to sync it. Acceptable to defer (email
changes are rare and the auth email remains canonical), but noted so the mirror
isn't assumed authoritative.

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
**earliest-registered remaining member** and promotes that member's `role` to
`'leader'`; because the team no longer references the departing row, the cascade
leaves it intact. If **no** members remain, the pointer stays and the existing
`ON DELETE CASCADE` dissolves the team as the fallback (its now-teamless members, if
any, are unaffected). This keeps `leader_id` `NOT NULL` and avoids an
`ON DELETE RESTRICT` that would otherwise make a leader's account undeletable (a
GDPR problem). Account deletion always succeeds.

Successor selection is `ORDER BY registered_at, id` (deterministic tiebreaker on
equal timestamps). Note "earliest-registered" is edition-*registration* time, not
team-*join* time — there is no join timestamp; if join order ever matters, add one.
The trigger assumes single-row deletes; a bulk `DELETE FROM registrations` could
promote a member who is also being deleted in the same statement, so account/erasure
deletions must be issued per registration (which the cascade path naturally does).

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

## Static archive export (per-edition files)

The archive dataset is **split per edition**, not one monolithic blob:

- **`archive/<slug>.json`** — one file per **closed** edition (e.g.
  `archive/2026.json`, `archive/2026-spring.json`): the full showcase data for that
  edition.
- **`archive/index.json`** — a lightweight catalog for the `/archive` index page:
  one entry per edition with `slug`, `name`, `starts_at`, `ends_at`, team count,
  participant count, `opted_out` count, and a winners highlight. No per-member
  detail.

*(Throughout this doc, "the archive files" means this set: `archive/index.json` +
the per-edition `archive/<slug>.json`.)*

**Why per-edition:** closing an edition rewrites **only that edition's file + the
index** — the corpus is **not** monotonically rewritten, git diffs are focused (one
new file + an index line) for easy human review, `/archive/[slug]` prerenders 1:1
from its own file, and a visitor loads only the edition they're viewing.

A generator (Nitro task / script) queries Postgres and writes these files. Each
per-edition file contains:

- **Meta:** slug, name, starts_at, ends_at, total participant count, total team
  count, **`opted_out` count** (registrations with `public = false`).
- **Teams:** name, description, github_url, placement, awards, presentation_order,
  and `members: [{ token, name, skills }]` — **only registrations with
  `public = true`**.

**Per-member opaque token.** Each public member entry carries a `token`: a random,
non-PII value generated **per export** (not the registration UUID — preserving the
identifier split). Display names aren't unique (two "Alex Ivanov" on one team), so
the token is what makes a redaction target unambiguous. Because it's regenerated
each export, it leaks nothing about identity or row ids.

**Private keyring (not deployed).** Alongside the archive files, the export also
writes **`redaction-keyring.json`** mapping `auth.users.id`/email →
`[{ edition_slug, token }]` for **every** occurrence across **all** editions. This
file is the bridge that lets an erasure request be resolved to all of a person's
tokens — and therefore exactly which per-edition files to edit — **without the DB**
during dormancy. It contains PII, so it is **kept out of the deployed static
bundle** (git-ignored or stored in the admin's secure location), and regenerated on
each export.

Runs on close and on demand. The committed archive files are what dormant builds
consume; `redaction-keyring.json` stays admin-side.

**Privacy:**
- Per-member opt-out via `registrations.public` (default visible). Opt-out members
  are excluded from the export body but **counted** in `opted_out` so the archive
  page can show e.g. *"+ N participants opted out of the public archive."* (Counts
  only — no identifying data.) **Erasures are not counted** in `opted_out` — an
  erased person did not "opt out"; they are removed entirely and leave no trace,
  including no count (so the public wording and the number agree).
- **LIVE registration UI copy (transparency / GDPR):** the registration form must
  state visibility explicitly, e.g. *"Your profile and team will be shown in the
  public showcase."* with a clearly-labelled opt-out:
  *"[ ] Hide my profile from the public archive."* Default = visible (unchecked).
- In DORMANT/static mode, a persistent banner on archive pages:
  > *This is an archived edition. To request removal of your data, email
  > **privacy@liberhack.org**.*

### Dormant-mode privacy-drift mechanism (DB ↔ static sync)

During DORMANT the Postgres stack is **off**, so a removal request cannot be
applied to the DB immediately. Hand-editing the archive files alone causes
**drift**: when Supabase is next booted and a fresh export runs, the deleted person
reappears. To prevent this, removals are **never** applied by editing the archive
files directly.

**Two distinct modes — different scopes:**
- **`hide` is per-edition** — a cosmetic opt-out of *one* edition's public entry
  (`registrations.public = false` for that edition). The person stays in the DB and
  in other editions.
- **`delete` is whole-account (GDPR erasure)** — removes the person from **every**
  edition: globally in the DB (delete the participant + auth user, which cascades to
  all their registrations across all editions; the leader trigger handles any teams
  they led) **and** from **every** per-edition archive file they appear in (the
  keyring lists exactly which). A naive single-file redaction would leave the person
  publicly listed in their other editions — a real privacy gap — so `delete` always
  fans out across all editions.

Flow:

1. **Redaction tooling** —
   - **`redact-hide <edition_slug> --token <member-token>`** removes that one
     member entry from `archive/<slug>.json` and **increments that edition's
     `opted_out` count by one** in both that file and `archive/index.json` (they are
     now opted out, so the count reflects them), and queues
     `{edition_slug, who, mode:'hide'}` in `redactions.pending.json`. The `--token`
     (from the export) disambiguates members with identical display names; the
     operator resolves token→person via the private `redaction-keyring.json`.
   - **`redact-delete --who <email|auth-id>`** looks the person up in
     `redaction-keyring.json`, opens **each** `archive/<slug>.json` the keyring lists
     for them, removes their tokened entry from each (uncounted — see "Erasures are
     not counted"), and queues a single `{who, mode:'delete'}` (account-scoped, no
     `edition_slug`) in `redactions.pending.json`.
   In both cases the file edits and the log entry are committed together so the queued
   DB action survives the dormant period in version control.
2. **Reconciliation (manual runbook step, in a dev checkout with repo + DB)** —
   `apply-redactions` runs as part of the DORMANT→LIVE runbook on a machine that has
   the git repo *and* DB access (not in the deployed app — see "Where the logs live"
   below). It reads `redactions.pending.json` and applies each to Postgres
   (`mode=hide` → `registrations.public = false` for that edition; `mode=delete` →
   delete the participant + auth user, cascading globally), then moves applied
   entries to `redactions.applied.json` and **commits both files back to the repo**.
   It **must be idempotent** — a re-run after a crash/timeout safely no-ops on
   already-hidden/already-deleted records (treat "record not found" / "already false"
   as success) and only drains entries that fully succeeded.

**Where the logs live (source of truth).** `redactions.pending.json` /
`redactions.applied.json` and `redaction-keyring.json` are **git the source of
truth**, mutated only on a developer/admin machine — never by the deployed runtime.
This is consistent with the manual-runbook-first decision and avoids a deployed
process making git commits. (If/when reconciliation is later automated, the logs
move to durable storage or the CI job commits back with a dedicated token — called
out as a prerequisite of that automation, not assumed.)
3. **Export guard** — the exporter **refuses to write any archive file while
   `redactions.pending.json` is non-empty**, forcing reconciliation before any new
   export can reintroduce removed data. This closes the drift loop.

## Site modes & build

- **Mode resolution:** in **LIVE**, mode is confirmed by the DB (a `live` edition
  exists). In **DORMANT** there is no DB to query, so the mode is **set at build
  time by `NUXT_PUBLIC_SITE_MODE=dormant`** — the env var is *load-bearing* there,
  not a mere override of a DB-derived value. The runbook always builds dormant with
  this flag set.
- **DORMANT:** `bun generate` renders landing + `/archive` + legal / reglament /
  programme from the archive files (+ `@nuxt/content`). `/ops/*` and `/api/*` are
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
  still read from their `archive/<slug>.json` (golden rule).

## Showcase pages

- **`/archive`** — index of all editions (cards: name, year, dates, #teams,
  #participants, winners highlight).
- **`/archive/[slug]`** — one edition: teams + members + GitHub links +
  presentation order + placements/awards.
- Reuses the existing punk/brutalist styling.

**The current/live edition is intentionally absent from `/archive`.** It has no
`archive/<slug>.json` and no `index.json` entry until it is closed (the export runs
on close); mid-season it lives on the main site (teams, `/order`, live CMS), not the
archive. So `/archive/[current-slug]` having no static source mid-season is by
design, not a gap. `/archive` only ever lists *closed* editions.

## Migration (wrap current live data as Edition 1)

1. Create `edition_status` enum and `editions`; insert the current run as
   `slug = '2026'`, `name = 'LiberHack 2026'`, `status = 'live'`,
   `is_current = true` (dates from current `event_config`).
2. Create `registrations`; backfill one row per existing participant from their
   current `team_id / role / skills / dietary / experience`, `edition_slug = '2026'`,
   `public = true`.
3. Add `edition_slug` to `teams` and `join_requests`; backfill `= '2026'`.
4. **Repoint `teams.leader_id` → `registrations(id)`.** Today `leader_id` references
   the old identity (participant/auth id). For each team, resolve its current leader
   to **that participant's new 2026 `registration.id`** and update `leader_id` to it.
   This must run **after** step 2 (registrations exist) and **before** the FK is
   changed to `references registrations(id)` and `NOT NULL` is (re)asserted —
   otherwise the new constraint cannot hold. Then install the
   `handle_leader_departure` `BEFORE DELETE` trigger.
5. Convert `event_config` to per-edition (key by `edition_slug = '2026'`); add
   `edition_slug` to `schedule_items` and `announcements`, backfill `= '2026'`.
6. Backfill `teams.presentation_order` from the current `content/order.md`, then
   retire `order.md` (the `/order` page reads `presentation_order` from the DB).
7. Add the `teams_unique_name_per_edition` index (verify no existing intra-edition
   duplicate names first; resolve any before the unique index can be created).
8. Drop the moved columns from `participants` **after** backfill is verified — done
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
- **New tooling** — `archive-export` (DB → per-edition `archive/<slug>.json` +
  `archive/index.json` + `redaction-keyring.json`, with export guard), `redact-hide`
  / `redact-delete` (rewrite the affected per-edition file(s) + index + queue DB
  action), `apply-redactions` (idempotent reconcile, commits drained logs).

## Testing

The **redaction/erasure flow is the part that warrants the most coverage** — it is
the novel, fiddly subsystem.

- **Unit:** export serializer (DB rows → per-edition `archive/<slug>.json` +
  `index.json` shape; opt-out excluded from body but counted in `opted_out`; erasure
  excluded *and uncounted*; per-member `token` emitted; `awards` array passthrough;
  closing one edition writes only that file + index, leaving other files byte-stable);
  `redaction-keyring.json` maps a person to every `(edition_slug, token)` across all
  editions; mode resolver
  (live = DB-confirmed; dormant = env-set); returning-user pre-fill (reads most
  recent prior registration); export guard refuses to run while
  `redactions.pending.json` is non-empty.
- **Integration:** close → create-draft → go-live empties the live scope while all
  prior-edition data persists; `registrations` uniqueness per
  `(participant_id, edition_slug)`; partial-unique + `current_implies_live` CHECK
  enforce a single, consistent current edition; `apply-redactions` applies
  `hide`/`delete`, is **idempotent** on re-run, and drains→`applied`;
  `ON DELETE RESTRICT` blocks deleting an edition that still has teams; **leader
  departure** auto-promotes by `(registered_at, id)` and dissolves a sole-leader
  team (verified through the `auth.users` cascade path too); duplicate team name
  within an edition rejected case-insensitively while the same name is allowed
  across editions; migration `leader_id` repoint resolves every existing leader to
  their 2026 registration before the FK/NOT NULL is asserted.
- **Worst-case erasure scenario (written-out, must pass):** a person in **three**
  editions, **sole leader** of a team in one of them, requests **full deletion
  mid-dormancy**. Assert: removed from all three `archive/<slug>.json` files the
  keyring lists (uncounted); the sole-leader team is dissolved (no successor) while their other
  teams in other editions either survive with a promoted successor or dissolve
  correctly; one account-scoped `delete` entry queued; static rebuild removes them
  from the served site; `apply-redactions` on next boot deletes participant + auth
  user, cascades to all three registrations, and is safe to re-run.
- **Build:** dormant `bun generate` produces `/archive` (from `index.json`) +
  `/archive/[slug]` (each from its own `archive/<slug>.json`) **with no Supabase env
  present**; `/ops/*` and `/api/*` excluded; privacy banner present; Supabase plugin
  does not initialize in dormant mode; archive dates render without hydration
  mismatch.

## Decisions (resolved)

1. **Per-member public opt-out** — included; `registrations.public`, default
   visible. Opt-out members excluded from export body, counted in `opted_out`; LIVE
   registration UI states visibility + offers opt-out.
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
    departure = **auto-promote earliest-registered member, else dissolve**, via a
    `BEFORE DELETE` trigger; `leader_id` stays `NOT NULL ON DELETE CASCADE` (no
    `RESTRICT`, so account deletion always succeeds).
11. **`ON DELETE`** — explicit everywhere: `RESTRICT` on content-bearing edition
    FKs, `CASCADE` on owned-config FKs.
12. **Dormant privacy-drift** — git-tracked `redactions.pending.json` queue +
    idempotent `apply-redactions` (manual runbook step, commits drained logs back) +
    export guard. Git is the source of truth for the logs/keyring; the deployed
    runtime never mutates them.
13. **Deployment trigger for static rebuild** — **manual runbook** for the first
    iterations (see Deployment & runbook); automate later once proven.
14. **Unique team name per edition** — `unique (edition_slug, lower(name))`.
15. **Redaction identifier split + token** — each per-edition `archive/<slug>.json`
    carries a per-export opaque per-member `token` (disambiguates duplicate names);
    the private, non-deployed `redaction-keyring.json` maps `who` (email/auth id) →
    all `(edition, token)` occurrences (i.e. exactly which files to edit).
16. **`hide` vs `delete` scope** — `hide` is **per-edition** (cosmetic opt-out);
    `delete` is **whole-account GDPR erasure**, fanned out across **all** editions in
    both the DB (global cascade) and every per-edition archive file.
17. **`is_current`/`status` consistency** — `CHECK (not is_current or status='live')`.
18. **Migration `leader_id` repoint** — explicit step; resolve each leader to their
    2026 registration before changing the FK to `registrations(id)`.
19. **Mid-dormancy removal** — triggers an immediate static rebuild + redeploy; DB
    action stays queued for next boot.
20. **`opted_out` count** — counts opt-outs only; erasures are uncounted.
21. **Per-edition archive files** — `archive/<slug>.json` per closed edition +
    lightweight `archive/index.json` catalog (not a single monolithic blob). Closing
    rewrites only the changed edition's file + index; corpus is non-monotonic.

## Deployment & runbook (transitions between modes)

The archive→static rebuild is a **manual developer runbook** for the first
iterations (rare, high-consequence; a human reviews the archive-file diff before
it ships). Automation (GitHub Action) is a deliberate fast-follow once the flow has
run cleanly.

**LIVE → DORMANT (closing an edition):**
1. Admin records results (placements/awards/order) and runs **Close current** in
   `/ops/admin` (`status='archived'`, `is_current=false`).
2. Developer runs `archive-export` against the DB → writes the just-closed
   edition's `archive/<slug>.json` + updates `archive/index.json` (and the
   admin-side keyring); export guard blocks if `redactions.pending.json` is
   non-empty.
3. Review the focused diff (one new edition file + an index line), commit.
4. Build with `NUXT_PUBLIC_SITE_MODE=dormant` → `bun generate`; deploy the static
   output (Caddy-only). Shut down the Node app and the Supabase/Postgres stack.

**DORMANT → LIVE (opening the next edition):**
1. Bring the Supabase stack up; run `apply-redactions` (dev checkout with repo + DB)
   to drain any `redactions.pending.json` accumulated during dormancy, then commit
   the drained logs back. This reconciles DB ↔ static *before* any fresh export.
2. In `/ops/admin`: the next edition already exists as a `draft` (created before
   going dormant) or is created now; finalize slug/name/dates and **Publish / Go
   live** (`draft→live`, `is_current=true`).
3. Redeploy the SSR app (`NUXT_PUBLIC_SITE_MODE=live`) with Supabase env present.

**Removal request *during* dormancy (timeliness path):** the served site is the
last static build, so a redaction is not public-visible until rebuilt. On receiving
a request while dormant:
1. Run `redact-hide`/`redact-delete` (edits the affected per-edition file(s) + index
   + the keyring, queues the DB action in `redactions.pending.json`), commit.
2. **Rebuild + redeploy the static site** (`bun generate` → push to Caddy) so the
   person is removed from the live public site promptly — do **not** wait for the
   next DORMANT→LIVE cycle. The DB action stays queued and is applied at the next
   boot via `apply-redactions`. (Supabase stays off throughout; only the static
   bundle is rebuilt.)

This runbook lives in the repo (e.g. `docs/runbooks/edition-transition.md`) as part
of the implementation phase.

## Dual-source reads (JSON vs live DB) — what actually needs both

Holding the golden rule strictly keeps the dual-source surface **tiny**: `/archive`
reads *only* the archive files (it only ever shows closed editions), and the
live/main pages read *only* the DB. They don't overlap, so most code is
single-source. A **read abstraction** is worth it only at the showcase boundary, and
only if you ever want the *current* edition rendered in the archive's showcase shape
while live.

- **`useArchive()` composable / `server/utils/archive.ts`** — the single accessor
  for showcase data, exposing `listEditions()` (reads `archive/index.json`) and
  `getEdition(slug)` (reads `archive/<slug>.json`). This file backend is used in
  **both** modes for **past** editions; an optional second backend reads the DB and
  maps a *live* edition into the same showcase shape. Everything downstream (pages,
  components) consumes the unified shape and never knows the source.
- **`app/pages/archive/index.vue` and `app/pages/archive/[slug].vue`** — consume the
  composable only; no direct DB or JSON access. The slug page loads just its own
  edition file, not the whole corpus.
- **`nuxt.config` route rules** — `/archive` prerendered from `index.json` and each
  `/archive/<slug>` from its own file in dormant; in live it can stay prerendered
  (past editions only) or SSR if you opt to surface the current edition there.
- **The shared showcase serializer** — the DB→showcase mapper and the
  `archive/<slug>.json` shape must be **the same type**, so the JSON exporter and the
  live DB backend produce identical structures. This single shared type is the only
  thing that genuinely "supports both sources"; keep it in one module imported by
  both the exporter and `useArchive()`.

If you never render the current edition inside `/archive` (the current default), the
DB backend above is unnecessary and the whole showcase layer is JSON-only — the DB
is touched solely by the existing live pages and the exporter.

## Out of scope (this design)

- Implementation (deferred). This document is the spec only.
- Project descriptions/screenshots beyond a GitHub link (could extend `teams`
  later).
- Cross-edition analytics dashboards (the relational model supports them; no UI
  designed here).
- Archive corpus growth — per-edition files mean each export rewrites only the
  changed edition's file + the index, so growth is incremental (one new file per
  edition), not a monolithic rewrite. `index.json` grows by one entry per edition;
  negligible at hackathon scale.
