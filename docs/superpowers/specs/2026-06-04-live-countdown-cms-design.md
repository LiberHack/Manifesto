# Live Countdown Page & CMS Design

**Date:** 2026-06-04
**Status:** Approved

---

## Overview

Add a public `/live` route that displays a full-screen event countdown display (for TV/projector use), and extend the admin panel with a CMS section to manage event config, schedule items, and announcements in real time via Server-Sent Events.

---

## 1. Database (Supabase)

One migration adds three tables.

### `event_config` — singleton (always one row, id = 1)

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | default 1, check constraint `id = 1` |
| `event_name` | text | "LiberHack 2026" |
| `event_start` | timestamptz | 2026-06-05 16:00 Europe/Sofia |
| `event_end` | timestamptz | 2026-06-07 19:00 Europe/Sofia |

### `schedule_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `label` | text | e.g. "Регистрация" |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | nullable (point-in-time events) |
| `sort_order` | int | drives display order |
| `created_at` | timestamptz | default now() |

### `announcements`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `body` | text | |
| `sort_order` | int | |
| `created_at` | timestamptz | default now() |

**RLS:** All three tables are public-read (no auth required). Writes require `role = 'admin'` in the `participants` table (same pattern as existing admin endpoints).

**Seed data:** Migration preseeds `event_config` and all schedule items from the provided programme (Bulgarian labels, June 5–7 2026 datetimes).

---

## 2. API

### Public endpoints (no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/api/live/data` | Returns `{ config, schedule, announcements }` snapshot — used for initial SSR/hydration |
| GET | `/api/live/stream` | SSE stream — sends full payload on connect, re-sends on any admin mutation |

### Admin endpoints (admin role required)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/live/config` | Read event config |
| PATCH | `/api/admin/live/config` | Update event config |
| GET | `/api/admin/live/schedule` | List schedule items ordered by sort_order |
| POST | `/api/admin/live/schedule` | Create item |
| PATCH | `/api/admin/live/schedule/[id]` | Update item |
| DELETE | `/api/admin/live/schedule/[id]` | Delete item |
| POST | `/api/admin/live/schedule/reorder` | Bulk update sort_order: `{ items: [{id, sort_order}] }` |
| GET | `/api/admin/live/announcements` | List announcements ordered by sort_order |
| POST | `/api/admin/live/announcements` | Create announcement |
| PATCH | `/api/admin/live/announcements/[id]` | Update announcement |
| DELETE | `/api/admin/live/announcements/[id]` | Delete announcement |
| POST | `/api/admin/live/announcements/reorder` | Bulk update sort_order |

### SSE broadcast mechanism

`server/utils/liveStream.ts` holds a module-level `Set<ReadableStreamDefaultController>`. Every admin mutation endpoint calls `broadcastLive()` after a successful DB write, which pushes the fresh full payload to all connected controllers. Works within a single Node process (single container deploy). The `/live` page's `EventSource` receives the update and replaces reactive state without a page reload.

---

## 3. `/live` Page

**Route:** `app/pages/live.vue`
**Auth:** None — fully public
**Layout:** `definePageMeta({ layout: false })` — full-screen, no nav

### Visual

- **Background:** `/index.webp` (existing public asset)
- **Font:** `font-cygrotesk` (Tailwind utility, already declared in `tailwind.css`)
- **Accent color:** `var(--color-primary)` (oklch pink, already in theme)
- **Dark boxes:** `background: var(--color-base-100)`, `border: 2px solid var(--color-primary)`

### Layout (top→bottom, full viewport height)

1. **Header bar** — "LIBER**H4CK**" left (accent on H4CK), event date range right. Both from `event_config`.
2. **Main area** — flex-1, two modes:
   - **During event (next item exists):** Large "NEXT UP" box with event label + countdown; secondary "EVENT ENDS IN" strip below.
   - **No next item / post-event:** Full-screen countdown to `event_end`; "THAT'S A WRAP" when `event_end` is past.
3. **Announcement ticker** — bottom bar, cycles through `announcements` by `sort_order` at 6s intervals. Shows `ANNOUNCEMENTS` label badge + text + `n/total` counter.

### Data flow

- `useFetch('/api/live/data')` provides initial state (SSR-compatible).
- On client mount: `new EventSource('/api/live/stream')` opened. Each `message` event replaces `config`, `schedule`, `announcements` refs. On `beforeUnmount`, `eventSource.close()`.
- Countdown ticker runs via `setInterval` at 1s, purely client-side.
- `getNextEvent()` picks the first `schedule_item` where `starts_at > now`.

---

## 4. Admin Panel CMS

**Location:** `app/pages/ops/admin/index.vue` — new section inserted **above** Participants.

Three subsections, each collapsible (DaisyUI `collapse` or simple `v-show` toggle):

### Event Config
Single form: event name (text input), start datetime, end datetime. "Save" button → PATCH `/api/admin/live/config`.

### Schedule
- Table: Label, Starts at, Ends at, drag handle.
- Drag-and-drop reordering via `vue-draggable-plus` (`VueDraggable` component, `v-model` on items array).
- On drag end: POST `/api/admin/live/schedule/reorder` with updated `sort_order` values.
- Inline add-row form at the bottom (label, starts_at, ends_at optional) → POST `/api/admin/live/schedule`.
- Each row: inline edit toggle + Delete button.

### Announcements
- Same drag-and-drop pattern as Schedule.
- Simpler: body text + drag handle.
- Add form at bottom. Edit inline. Delete per row.

All mutations broadcast via SSE → `/live` screen reflects changes within ~1s.

---

## 5. Dependencies

- `vue-draggable-plus` — add to project (`bun add vue-draggable-plus`)
- No other new dependencies; SSE uses native Nitro `ReadableStream`.

---

## 6. Files to Create / Modify

**New files:**
- `supabase/migrations/YYYYMMDD_live_cms.sql`
- `server/utils/liveStream.ts`
- `server/api/live/data.get.ts`
- `server/api/live/stream.get.ts`
- `server/api/admin/live/config.get.ts`
- `server/api/admin/live/config.patch.ts`
- `server/api/admin/live/schedule/index.get.ts`
- `server/api/admin/live/schedule/index.post.ts`
- `server/api/admin/live/schedule/[id].patch.ts`
- `server/api/admin/live/schedule/[id].delete.ts`
- `server/api/admin/live/schedule/reorder.post.ts`
- `server/api/admin/live/announcements/index.get.ts`
- `server/api/admin/live/announcements/index.post.ts`
- `server/api/admin/live/announcements/[id].patch.ts`
- `server/api/admin/live/announcements/[id].delete.ts`
- `server/api/admin/live/announcements/reorder.post.ts`
- `app/pages/live.vue`

**Modified files:**
- `app/pages/ops/admin/index.vue` — add CMS section at top
