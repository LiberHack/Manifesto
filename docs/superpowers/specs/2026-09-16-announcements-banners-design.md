# Announcements & App Banners — Design

**Date:** 2026-09-16
**Status:** Approved design
**Depends on:** [2026-09-16-second-edition-live-mode-design.md](./2026-09-16-second-edition-live-mode-design.md)
(`announcements.edition_slug`, `/api/me` returning the current registration).

## Problem

`app/components/AppBanners.vue` hardcodes two banners (missing profile info, "you
can now edit your team") with `localStorage` dismissal. Adding or retiring a
notice is a code change and a deploy, and stale "New:" banners linger in source.
Meanwhile the live CMS already has an `announcements` table with admin CRUD,
reorder and an SSE stream — used only by the `/live` ticker.

## Design

**One table, three channels.** `announcements` becomes the single source for
every notice the site shows; the channel decides where it renders. No banner is
code-driven: the current hardcoded ones become seeded rows.

### Schema

```sql
create type announcement_channel  as enum ('live', 'ops', 'site');
create type announcement_audience as enum ('all', 'leaders', 'no_team', 'missing_profile');
create type announcement_variant  as enum ('info', 'warning');

alter table announcements
  add column channel     announcement_channel  not null default 'live',
  add column audience    announcement_audience not null default 'all',
  add column variant     announcement_variant  not null default 'info',
  add column href        text null,
  add column dismissible boolean not null default true,
  add column active      boolean not null default true,
  add column starts_at   timestamptz null,
  add column ends_at     timestamptz null;
-- edition_slug comes from the edition addendum.

create index announcements_channel_active_idx
  on announcements (edition_slug, channel) where active;
```

| column | meaning |
|---|---|
| `channel` | `live` — `/live` ticker (unchanged behaviour). `ops` — logged-in participants, rendered by `AppBanners` on `/ops/*`. `site` — every visitor on every page. |
| `audience` | Only meaningful for `ops`; the client evaluates it against `/api/me` (table below). `live`/`site` ignore it. |
| `variant` | `info` → `border-primary`, `warning` → `border-warning` (the two existing styles). |
| `href` | Optional link target. When set, the body is rendered followed by a "→" link; no inline markdown. |
| `dismissible` | `false` pins the banner (no ✕). |
| `active` | Admin kill switch, independent of the time window. |
| `starts_at` / `ends_at` | Optional window; `null` = unbounded on that side. |

Existing rows are backfilled `channel = 'live'` by the default. `sort_order` keeps
its meaning **within a channel**; the admin reorder endpoint scopes to the
channel it was called for.

### Audience predicates (the only code-owned part)

| `audience` | shown when |
|---|---|
| `all` | always |
| `leaders` | `me.registration.role === 'leader'` |
| `no_team` | `me.registration.team_id === null` |
| `missing_profile` | `me.registration.dietary == null \|\| me.registration.experience == null` |

Adding an audience = one enum value + one predicate in `useAnnouncementAudience()`.

### Seed rows (in the migration, edition = current)

| channel | audience | variant | body | dismissible |
|---|---|---|---|---|
| `ops` | `missing_profile` | `warning` | "Missing profile info — help us plan catering and workshops by filling in your dietary requirements and experience level." `href=/ops/dashboard` | true |

The "you can now edit your team" banner is **not** re-seeded — it was a one-off
release note and is stale. Admins add that kind of notice from the panel now.

### Public read endpoint

`GET /api/announcements` (new, no auth, rate-limited like everything else):

```ts
// channel in ('ops','site'), active, within window, current edition
// ordered by channel, sort_order
select id, channel, audience, variant, body, href, dismissible, sort_order
```

`ops` rows are returned to anonymous callers too (they contain no personal data)
but `AppBanners` only *renders* them when a registration exists. This keeps the
endpoint cacheable (`Cache-Control: public, max-age=30`) and avoids a second
authenticated fetch.

`/live` keeps using `fetchLiveData()`, which now filters `channel = 'live'` and
`active` + window so a scheduled ticker item behaves the same as a banner.

### `AppBanners.vue`

```
fetch /api/announcements        (useFetch, key 'announcements')
fetch /api/me                   (only on /ops, only when logged in — as today)

visible = rows
  .filter(r => r.channel === 'site' || (onOps && me.registration && audienceMatch(r, me)))
  .filter(r => !dismissed.has(r.id))
```

- **Stacking:** all visible rows render, one thin bar each, `site` rows first,
  then `ops`, each group by `sort_order`. No hard cap; admins keep the stack short
  with `active` and the window.
- **Dismissal:** `localStorage['dismissed_announcements']` = JSON array of ids,
  read on mount (SSR renders nothing dismissible-dependent, as today). Editing a
  banner's body in admin does not un-dismiss it; deleting and recreating does.
  Non-dismissible rows ignore the list.
- **Reactivity:** `audience` is re-evaluated whenever `/api/me` refreshes, so the
  `missing_profile` banner disappears as soon as the dashboard form saves.

### Admin panel

The existing announcements section of `/ops/admin` gains the new fields:
channel select, audience select (visible when channel = `ops`), variant, href,
dismissible, active toggle, start/end datetime inputs. The list is grouped by
channel; reorder works within a group. `POST` computes `sort_order` within the
chosen channel (current code computes it globally — change to
`.eq('channel', body.channel)`). The SSE stream fingerprint is unaffected: it
already serialises the full row.

### Files

- `supabase/migrations/20260916000000_announcement_channels.sql` — enums, columns,
  index, seed.
- `server/api/announcements.get.ts` — new public endpoint.
- `server/utils/liveStream.ts` — filter `channel = 'live'`, active, window.
- `server/api/admin/live/announcements/{index.post,reorder.post}.ts` — channel scoping.
- `app/composables/useAnnouncementAudience.ts` — predicates.
- `app/components/AppBanners.vue` — rewritten as above.
- `app/pages/ops/admin/index.vue` — form fields.

## Testing

Unit (vitest):

- `useAnnouncementAudience` — one case per audience value, plus `site` rows
  shown without a registration and `ops` rows hidden without one.
- `AppBanners` — dismissal persists by id; non-dismissible has no ✕; ordering
  `site` before `ops`, then `sort_order`.
- `/api/announcements` handler — excludes inactive, future `starts_at`, past
  `ends_at`, `live` channel, other editions.

E2E (existing fixture):

- Admin creates an `ops`/`leaders` banner → visible to a leader, hidden from a
  member; dismiss → gone after reload; admin sets `active = false` → gone for all.

## Decisions (resolved)

1. Extend `announcements`; no separate `banners` table.
2. Every banner is a DB row; audience logic is a fixed enum + client predicates.
3. Three channels: `live`, `ops`, `site`.
4. Banners stack, no cap; ordered `site` → `ops` → `sort_order`.
5. Dismissal is per-id in `localStorage`; no server-side dismissal table.
6. Public endpoint returns `ops` rows to anonymous callers (no PII); rendering,
   not fetching, is gated.
7. Stale "team edit" banner is dropped, not migrated.
