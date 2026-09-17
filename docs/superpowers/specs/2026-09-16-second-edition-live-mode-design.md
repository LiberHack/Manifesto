# Second Edition — LIVE-mode Rollout (addendum to edition archiving)

**Date:** 2026-09-16
**Status:** Approved design
**Extends:** [2026-06-08-edition-archiving-design.md](./2026-06-08-edition-archiving-design.md)

## Goal

Open LiberHack edition 2 on the existing site while keeping every 2026 account.
This addendum scopes the **first build phase** of the archiving design: the parts
needed for a second live edition, and nothing that only matters once an edition is
closed (static/dormant mode, export tooling, showcase pages, redaction runbook).

Everything in the parent spec's data model stays as designed. This document only
(1) draws the phase boundary and (2) resolves four behaviours the parent spec left
implicit.

## In scope (phase 1)

From the parent spec, verbatim:

- `editions` table + `edition_status` enum, one-current partial index, CHECK.
- `registrations` table; `participants` slimmed to identity mirror.
- `edition_slug` on `teams`, `join_requests`, `event_config`, `schedule_items`,
  `announcements`; `teams.leader_id → registrations(id)`; `handle_leader_departure`.
- `teams_unique_name_per_edition`.
- Migration "wrap current live data as Edition 1" (steps 1–5, 7, 8). Step 6
  (`presentation_order` / retiring `content/order.md`) is deferred with the showcase.
- Returning-user flow (opt-in, pre-filled from the most recent prior registration).
- Edition-aware API routes listed under "Existing code affected".
- Admin: create next edition as `draft`, promote to `live` (which flips `is_current`).

## Out of scope (later phases)

Static export, dormant mode, `NUXT_PUBLIC_SITE_MODE`, archive pages, awards /
placement UI, redaction tooling, `presentation_order`.

## Resolved behaviours

### 1. Registration is a hard gate, not a nudge

A logged-in, email-verified account with **no `registration` in the current
edition** is a spectator: it can sign in, edit identity (name), and delete itself,
but cannot touch anything edition-scoped.

- **Client:** the `auth` middleware gains a third check — no current-edition
  registration → `navigateTo('/ops/register-edition')`. `/ops/register-edition`
  itself, `/ops/verify-email`, `/ops/login` and account-deletion are exempt.
  `/api/me` returns `registration: null` in that state so the check is one field.
- **Server:** every route that creates or mutates `teams`, `join_requests`, or
  per-edition profile fields resolves the caller's **current-edition registration
  first** and throws `403 not_registered` if absent. This is the real gate; the
  redirect is UX. A shared `requireRegistration(event)` helper in `server/utils`
  returns `{ user, registration, edition }` and replaces the scattered
  `serverSupabaseUser` + `participants` lookups.
- Team, invite-code and join-request reads for the current edition stay open to
  registered users only (unregistered users have nothing to browse yet).

### 2. Participant cap moves to registration

Today `handle_new_user()` raises `registration_closed` when
`count(participants) >= 120`. With carried-over accounts that counts people who
have not opted into this edition, so the cap must move:

- Drop the count from `handle_new_user()`; it only mirrors identity now.
- New `BEFORE INSERT` trigger on `registrations` (`enforce_edition_cap`): raise
  `registration_closed` when `count(registrations where edition_slug = new.edition_slug)
  >= editions.participant_cap`. `editions` gains
  `participant_cap int not null default 120` so the cap is per edition and
  editable from the admin panel instead of a migration.
- Sign-up while an edition is live inserts `participants` **then** `registrations`;
  a cap failure on the second insert must surface as `registration_closed` to the
  form exactly as today (the register page already handles that message). The
  auth user is still created — that is acceptable: the person has an account and
  sees the "registration is full" state on `/ops/register-edition`.

### 3. Consent is re-accepted per edition

CoC and privacy text change between editions. `registrations` gains
`accepted_terms_at timestamptz not null`. The re-register form (and the first-time
sign-up form) requires the checkbox; the timestamp is set server-side on insert.
No versioning of the documents themselves — the timestamp against the git history
of `app/pages/legal/*` is enough.

### 4. What carries over, what is re-asked

| field | lives on | on re-register |
|---|---|---|
| name, email | `participants` | kept, editable |
| skills | `registrations` (denormalised from prior) | **pre-filled**, editable |
| dietary | `registrations` | **pre-filled**, editable |
| experience | `registrations` | **pre-filled but must be confirmed** — shown as a required select with the prior value selected, so the user consciously re-answers |
| role, team_id | `registrations` | start empty |
| public | `registrations` | pre-filled from prior |
| accepted_terms_at | `registrations` | required checkbox |

## Admin panel changes (phase 1)

- **Editions** section: list, "create next" (draft; slug, name, dates, cap),
  "go live" (single transaction: previous `status = 'archived', is_current = false`,
  new `status = 'live', is_current = true`). No "close without successor" in this
  phase — dormant mode is a later phase.
- Participants / teams / requests / print-teams views read the **current edition
  by default** and get an edition selector (read-only for archived editions).
- Live CMS (`event_config`, schedule, announcements) is scoped to the edition
  selected in the same selector; defaults to current.

## Migration order

Follows the parent spec's numbered list exactly, plus:

- In step 1, add `participant_cap` (120) to the 2026 row.
- In step 2, backfill `accepted_terms_at = participants.created_at` for 2026
  registrations (they accepted the CoC at sign-up).
- A new step between 2 and 3: replace `handle_new_user()` (drop the cap check) and
  install `enforce_edition_cap`.
- Step 8 (drop moved columns from `participants`) stays a separate follow-up
  migration, merged only after the edition-aware API has been deployed and
  verified against production data.

Every step is additive-then-cleanup; edition 2026 stays live throughout.

## Testing

Unit (vitest, mocked Supabase):

- `requireRegistration` — 401 no user, 403 no registration, ok path returns
  edition + registration.
- Cap trigger semantics are DB-side; covered by an integration test against
  `supabase start` that inserts `cap + 1` registrations and expects
  `registration_closed` on the last.
- `auth` middleware — redirects to `/ops/register-edition` when
  `me.registration === null`, not on exempt routes.

E2E (existing fixture):

- 2026 account logs in after 2027 goes live → lands on `/ops/register-edition`
  with skills/dietary pre-filled → submits → dashboard, no team.
- Unregistered account `POST /api/teams` → 403.
- Admin "go live" flips exactly one `is_current`.

## Decisions (resolved)

1. Gate is server-enforced (`403 not_registered`); redirect is UX only.
2. Cap is per edition (`editions.participant_cap`), enforced on `registrations`
   insert; removed from `handle_new_user()`.
3. Consent re-accepted per edition via `registrations.accepted_terms_at`.
4. `experience` is re-confirmed; `skills`, `dietary`, `public` pre-filled.
5. Past editions are admin-visible only in this phase; participants see nothing
   from prior editions (showcase is a later phase).
6. Announcements/banners rework is a separate spec:
   [2026-09-16-announcements-banners-design.md](./2026-09-16-announcements-banners-design.md).
