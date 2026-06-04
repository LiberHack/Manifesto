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

**Seed data:** Migration preseeds `event_config` and all schedule items from the provided programme (Bulgarian labels, June 5–7 2026 datetimes stored as UTC — e.g. 16:00 Sofia = 13:00 UTC in summer/EEST).

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

**Connection cleanup:** `stream.get.ts` must listen for client disconnect via the request's `close` event (Nitro: `event.node.req.on('close', cleanup)`). The cleanup function removes the controller from the Set and calls `controller.close()` if not already closed. In `broadcastLive()`, any `enqueue()` that throws (e.g. controller already closed) must catch the error and remove that controller from the Set to prevent unbounded growth.

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
2. **Main area** — flex-1, three modes in priority order:
   - **NOW PLAYING** (current item): `starts_at <= now AND ends_at > now`. Large box shows "NOW PLAYING" label + event name + countdown to `ends_at`. Secondary strip shows "NEXT UP" preview (next item label only, no countdown).
   - **NEXT UP** (between items, no current): first item where `starts_at > now`. Large box shows "NEXT UP" + label + countdown to `starts_at`. Secondary "EVENT ENDS IN" strip below.
   - **No items remaining / post-event:** Full-screen countdown to `event_end`; "THAT'S A WRAP" when `event_end` is past.
3. **Announcement ticker** — bottom bar, cycles through `announcements` by `sort_order` at 6s intervals. Shows `ANNOUNCEMENTS` label badge + text + `n/total` counter.

**Note:** Schedule items without `ends_at` are treated as point-in-time — they are never "NOW PLAYING" and become past once `starts_at <= now`.

### Timezone display

All timestamps are stored as UTC in Supabase. Display formatting must use `Europe/Sofia` (EEST, UTC+3 in summer) everywhere — header date range, schedule item times, event config datetimes in the admin panel. Use `Intl.DateTimeFormat` with `{ timeZone: 'Europe/Sofia' }` rather than relying on the host system's locale.

### Clock drift correction

`/api/live/data` includes `serverTime: new Date().toISOString()` in its response. On mount, the client computes `serverTimeOffset = Date.parse(serverTime) - Date.now()` and adds this offset to all `new Date()` calls in `getNextEvent()` and countdown calculations. This corrects for TV/display devices that have drifted clocks.

### Data flow

- `useFetch('/api/live/data')` provides initial state (SSR-compatible), including `serverTime` for drift correction.
- On client mount: `new EventSource('/api/live/stream')` opened. Each `message` event replaces `config`, `schedule`, `announcements` refs atomically. State replacement must guard against empty payloads — only replace if the incoming data is non-null/non-empty, preventing a flash of empty UI during reconnect.
- On server restart, SSE reconnects automatically (browser native retry). Until it reconnects, the last-known state remains visible — no blank screen.
- Countdown ticker runs via `setInterval` at 1s, purely client-side, using the drift-corrected clock.
- On `beforeUnmount`: `eventSource.close()`.

---

## 4. Admin Panel CMS

**Location:** `app/pages/ops/admin/index.vue` — new section inserted **above** Participants.

Three subsections, each collapsible (DaisyUI `collapse` or simple `v-show` toggle):

### Event Config
Single form: event name (text input), start datetime, end datetime. "Save" button → PATCH `/api/admin/live/config`.

### Schedule
- Table: Label, Starts at, Ends at, drag handle.
- Drag-and-drop reordering via `vue-draggable-plus` (`VueDraggable` component, `v-model` on items array).
- On drag end: POST `/api/admin/live/schedule/reorder`. While the request is in flight, the list is disabled (pointer-events: none + opacity) to prevent a second drag triggering a race condition. Re-enable on response.
- Inline add-row form at the bottom (label, starts_at, ends_at optional) → POST `/api/admin/live/schedule`.
- Each row: inline edit toggle + Delete button.

### Announcements
- Same drag-and-drop pattern as Schedule, same reorder lock behaviour.
- Simpler: body text + drag handle.
- Add form at bottom. Edit inline. Delete per row.

### SSE loopback isolation

The admin panel does **not** open an `EventSource` connection. It fetches its own data via the existing REST endpoints and refreshes on mutation. This prevents SSE broadcasts (triggered by its own writes) from clobbering in-progress form state or causing cursor jumps mid-edit.

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
