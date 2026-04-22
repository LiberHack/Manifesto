# Registration & Team Search — Design Spec

**Date:** 2026-04-21
**Project:** LibreHack / Manifesto
**Branch:** reg-form
**Status:** Approved

---

## Overview

A registration and team-formation system for the LibreHack hackathon website. Participants register, then browse and request to join open teams. Team leaders approve or reject requests. Admins have full oversight.

---

## Stack

- **Framework:** Nuxt 4 (Nitro server routes for backend)
- **Client:** `@nuxtjs/supabase` + `@supabase/supabase-js`
- **Database:** Supabase Postgres (self-hosted)
- **Auth:** Supabase Auth (GoTrue — built-in email/password, session management)
- **Infrastructure:** Docker Compose — self-hosted Supabase stack + Nuxt app service

---

## Data Model

### `participants`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | mirrors `auth.users.id` (Supabase Auth) |
| `name` | text | |
| `email` | text unique | |
| `skills` | text[] | self-reported skills |
| `role` | enum | `participant` \| `admin` |
| `team_id` | uuid FK → teams | nullable; null = no team |
| `created_at` | timestamptz | |

> `id` is a FK to Supabase's `auth.users` table. On registration, GoTrue creates the auth user; a database trigger creates the `participants` row automatically.

### `teams`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | |
| `leader_id` | uuid FK → participants | |
| `skills_wanted` | text[] | skills the team is looking for |
| `description` | text | nullable |
| `created_at` | timestamptz | |

Team size is derived: `COUNT(participants WHERE team_id = team.id)`. A team is "open" when size < 6. Min team size at submission: 2.

### `join_requests`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `participant_id` | uuid FK → participants | |
| `team_id` | uuid FK → teams | |
| `status` | enum | `pending` \| `approved` \| `rejected` |
| `created_at` | timestamptz | |

---

## Auth

- **Provider:** Supabase Auth (GoTrue) — self-hosted
- **Method:** Email/password via `supabase.auth.signUp` / `signInWithPassword`
- **Session:** Managed by Supabase Auth; `@nuxtjs/supabase` handles cookie persistence and server-side session validation automatically
- On sign-up, a database trigger inserts a row into `participants` mirroring `auth.users.id`
- `role` is stored in `participants.role`; server routes read it from the DB (not JWT claims) to authorize admin actions

Server middleware uses `useSupabaseUser()` (client) and the service-role client (server routes) to validate sessions. Protected routes return 401 if session is missing or invalid.

---

## API Routes

All under `server/api/`. Protected routes require a valid session.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/me` | participant | Current participant + team info |
| `GET` | `/api/teams` | participant | List open teams, filterable by `skills` query param |
| `POST` | `/api/teams` | participant | Create a team (only if not already in one) |
| `GET` | `/api/teams/[id]` | participant | Team detail + member list |
| `POST` | `/api/teams/[id]/requests` | participant | Send join request (blocked if already in a team) |
| `PATCH` | `/api/requests/[id]` | leader | Approve or reject a join request |
| `GET` | `/api/admin/participants` | admin | List all participants |
| `DELETE` | `/api/admin/participants/[id]` | admin | Remove participant |
| `GET` | `/api/admin/teams` | admin | List all teams |
| `DELETE` | `/api/admin/teams/[id]` | admin | Delete a team |
| `PATCH` | `/api/admin/requests/[id]` | admin | Override any join request |

---

## Pages & UI

| Route | Access | Description |
|-------|--------|-------------|
| `/register` | public | Registration form |
| `/login` | public | Login form |
| `/teams` | authenticated | Browse open teams, filter by skills |
| `/teams/[id]` | authenticated | Team detail, send join request |
| `/dashboard` | authenticated | Own profile, team membership, pending requests |
| `/team/manage` | team leader | Approve / reject incoming join requests |
| `/admin` | admin | Manage all participants, teams, requests |

**Route middleware:**
- `auth` — redirects to `/login` if no session
- `admin` — redirects to `/dashboard` if not admin role

Post-registration redirect: `/teams`.

UI follows the punk/brutalist aesthetic of the site — bold type, high contrast, DaisyUI v5 components as base layer.

---

## Infrastructure

### Docker Compose

Two compose files (or one combined with profiles):

**`supabase/docker-compose.yml`** — official Supabase self-hosted stack (pulled from `github.com/supabase/supabase/docker`):
- `db` — Postgres 15
- `auth` — GoTrue (email/password auth)
- `rest` — PostgREST
- `realtime` — Realtime server
- `storage` — Storage API
- `kong` — API gateway (exposes all services on a single port)
- `studio` — Supabase Studio (admin UI)

**`docker-compose.yml`** (project root) — Nuxt app:
- **`app`** — Nuxt 4, depends on Supabase stack being up
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Dev: source mounted for hot reload
- Prod: runs built output

### Migrations

SQL migrations live in `supabase/migrations/`. Applied via `supabase db push` (local dev) or automatically on container start in production using the Supabase migration runner.

### Environment
- `.env.example` committed with all required vars documented: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase internal secrets (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`)
- `.env` gitignored

---

## Business Rules

- A participant can be a member of only one team at a time
- A participant cannot send a join request if they already have a `team_id`
- Team size is capped at 6; requests to full teams are rejected
- Only the team leader can approve/reject join requests for their team
- Admins can override any join request and delete any team or participant
- When a join request is approved, the participant's `team_id` is set and all other pending requests for that participant are automatically rejected
- When a team is deleted, all its members have their `team_id` set to null and all pending join requests for that team are cancelled
- A team leader cannot leave their own team; they must either delete the team or transfer leadership (out of scope for v1 — deletion is the only exit)
- On database level, `join_requests` rows are cascade-deleted when the referenced team or participant is deleted
