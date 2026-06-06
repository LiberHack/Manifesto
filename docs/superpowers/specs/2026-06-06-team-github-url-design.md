# Team GitHub URL — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## Summary

Allow any team member to submit their team's GitHub project URL via the dashboard. Admins can flip a single global toggle to make all submitted URLs visible on team detail pages.

## Data Model

### Migration (new file: `supabase/migrations/20260606000000_team_github_url.sql`)

```sql
-- Per-team project URL
alter table public.teams
  add column github_url text null;

-- Global visibility toggle
alter table public.event_config
  add column github_urls_public boolean not null default false;
```

No per-team visibility flag. One global switch controls all teams.

## API

### New endpoint: `PATCH /api/teams/[id]/github-url`

- **Auth:** any authenticated participant who is a member of the team (verified via `participants.team_id = teamId`)
- **Body:** `{ github_url: string | null }`
- **Validation:** string max 500 chars; empty string coerced to null (clears the URL); no domain restriction
- **Response:** updated team row (or 401/403/404 as appropriate)

### Extended: `PATCH /api/admin/live/config`

- Accepts new optional field `github_urls_public: boolean`
- Persisted to `event_config` alongside existing fields

### Extended: `GET /api/admin/live/config`

- Returns `github_urls_public` in the response

### Extended: `GET /api/teams/[id]`

- `github_url` is conditionally included in the response to prevent scraping before the global toggle is flipped:
  - Include `github_url` if `req.user.team_id === teamId` (user is a member of this team), **OR**
  - Include `github_url` if `event_config.github_urls_public === true`
  - Otherwise omit the field entirely from the payload
- The handler must fetch `event_config.github_urls_public` alongside the team row to evaluate this condition

## UI

### Dashboard (`/ops/dashboard`)

- New **"Project Repo"** section, visible to all team members (not gated on `isLeader`)
- Position: below the Invite Link section
- A text input pre-populated with the current `github_url` (empty if not set)
- Save button with inline success/error feedback, matching the existing profile/team edit patterns
- Calls `PATCH /api/teams/[id]/github-url`

### Team detail page (`/ops/teams/[id]`)

- Render a **"Project Repo"** link (`<a href="..." target="_blank" rel="noopener noreferrer">`) if and only if the API response includes `github_url`
- No client-side visibility check needed — the server already enforces the conditional logic above

### Admin panel (`/ops/admin`)

- In the existing **Event Config** card, add one new row after the time fields:
  - Label: **"Show project repos"**
  - Control: DaisyUI `toggle` bound to `configForm.github_urls_public`
  - Saved via the existing Save button (no separate save action needed)

## Error Handling

| Scenario | Response |
|---|---|
| Not authenticated | 401 |
| User not a member of the team | 403 |
| Team not found | 404 |
| URL exceeds 500 chars | 400 with message |
| Empty string body field | Treated as null (clears URL) |

## Out of Scope

- URL validation against any specific domain
- Per-team visibility toggle
- Showing the URL on the teams listing card (detail page only)
- Multiple URLs per team
