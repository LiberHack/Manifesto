# Registration & Team Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a registration and team-formation system where hackathon participants register, browse open teams, send join requests, and team leaders approve or reject them.

**Architecture:** Nuxt 4 handles frontend and backend (Nitro server routes). Self-hosted Supabase (via the official Docker Compose stack) provides Postgres and Auth (GoTrue). `@nuxtjs/supabase` wires session management; a Postgres trigger mirrors new auth users into the `participants` table; server routes enforce all business rules.

**Tech Stack:** Nuxt 4, @nuxtjs/supabase, @supabase/supabase-js, Supabase CLI, PostgreSQL 15, Docker Compose, Vitest, @nuxt/test-utils

---

## File Map

**Created:**
- `supabase/migrations/20260421000001_schema.sql` — enums + tables + indexes
- `supabase/migrations/20260421000002_triggers.sql` — auth user + request approval triggers
- `docker-compose.yml` — Nuxt app service (Supabase runs via its own stack)
- `.env.example` — all required env vars
- `server/utils/supabase.ts` — service-role client factory
- `server/utils/adminAuth.ts` — shared admin guard helper
- `server/middleware/01.auth.ts` — attach session user to event context
- `server/api/me.get.ts`
- `server/api/teams/index.get.ts`
- `server/api/teams/index.post.ts`
- `server/api/teams/[id].get.ts`
- `server/api/teams/[id]/requests.get.ts`
- `server/api/teams/[id]/requests.post.ts`
- `server/api/requests/[id].patch.ts`
- `server/api/admin/participants/index.get.ts`
- `server/api/admin/participants/[id].delete.ts`
- `server/api/admin/teams/index.get.ts`
- `server/api/admin/teams/[id].delete.ts`
- `server/api/admin/requests/[id].patch.ts`
- `app/middleware/auth.ts`
- `app/middleware/admin.ts`
- `app/pages/login.vue`
- `app/pages/register.vue`
- `app/pages/teams/index.vue`
- `app/pages/teams/[id].vue`
- `app/pages/team/create.vue`
- `app/pages/dashboard.vue`
- `app/pages/team/manage.vue`
- `app/pages/admin/index.vue`
- `tests/server/me.test.ts`
- `tests/server/teams.test.ts`
- `tests/server/requests.test.ts`
- `tests/server/admin.test.ts`
- `vitest.config.ts`

**Modified:**
- `nuxt.config.ts` — add @nuxtjs/supabase module + runtimeConfig
- `package.json` — add @nuxtjs/supabase, @nuxt/test-utils, vitest

---

## Task 1: Supabase local dev setup

**Files:**
- Create: `supabase/` directory (via CLI)
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Install Supabase CLI as a dev dependency**

```bash
bun add -D supabase
```

- [ ] **Step 2: Initialize Supabase project**

```bash
bunx supabase init
```

Expected: `supabase/config.toml` and `supabase/.gitignore` created.

- [ ] **Step 3: Start local Supabase stack**

```bash
bunx supabase start
```

This pulls and starts Docker containers. First run takes a few minutes. Expected output:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
```

Save the `anon key` and `service_role key` — you need them for `.env`.

- [ ] **Step 4: Create `.env.example`**

```
# Supabase (self-hosted)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

- [ ] **Step 5: Copy `.env.example` to `.env` and fill in actual keys**

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder values with the keys from Step 3.

- [ ] **Step 6: Create `docker-compose.yml` for the Nuxt app (production)**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      NODE_ENV: production
```

Note: in production, point `SUPABASE_URL` at your self-hosted Supabase instance (from the official [Supabase self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker)).

- [ ] **Step 7: Verify `.env` is gitignored**

Check `.gitignore` contains `.env`. If not, add it:

```
.env
.env.local
```

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/.gitignore .env.example docker-compose.yml .gitignore
git commit -m "chore: add Supabase local dev setup and Docker config"
```

---

## Task 2: Database schema migrations

**Files:**
- Create: `supabase/migrations/20260421000001_schema.sql`
- Create: `supabase/migrations/20260421000002_triggers.sql`

- [ ] **Step 1: Create the schema migration**

```bash
bunx supabase migration new schema
```

Rename the generated file to `20260421000001_schema.sql` and write:

```sql
-- enums
create type public.participant_role as enum ('participant', 'admin');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- teams (leader_id references auth.users directly to avoid circular FK)
create table public.teams (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  leader_id   uuid        not null references auth.users(id) on delete cascade,
  skills_wanted text[]    not null default '{}',
  description text,
  created_at  timestamptz not null default now()
);

-- participants (id mirrors auth.users.id)
create table public.participants (
  id         uuid                   primary key references auth.users(id) on delete cascade,
  name       text                   not null,
  email      text                   not null unique,
  skills     text[]                 not null default '{}',
  role       public.participant_role not null default 'participant',
  team_id    uuid                   references public.teams(id) on delete set null,
  created_at timestamptz            not null default now()
);

-- join_requests
create table public.join_requests (
  id             uuid                  primary key default gen_random_uuid(),
  participant_id uuid                  not null references public.participants(id) on delete cascade,
  team_id        uuid                  not null references public.teams(id) on delete cascade,
  status         public.request_status not null default 'pending',
  created_at     timestamptz           not null default now(),
  constraint unique_participant_team unique (participant_id, team_id)
);

-- indexes
create index on public.participants(team_id);
create index on public.join_requests(team_id, status);
create index on public.join_requests(participant_id, status);
```

- [ ] **Step 2: Create the triggers migration**

```bash
bunx supabase migration new triggers
```

Rename to `20260421000002_triggers.sql` and write:

```sql
-- Trigger 1: auto-create participant row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.participants (id, name, email, skills)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(
      array(select jsonb_array_elements_text(new.raw_user_meta_data->'skills')),
      '{}'::text[]
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger 2: when a join request is approved, set participant team and reject other requests
create or replace function public.handle_request_approved()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    -- Set participant's team_id
    update public.participants
    set team_id = new.team_id
    where id = new.participant_id;

    -- Reject all other pending requests from this participant
    update public.join_requests
    set status = 'rejected'
    where participant_id = new.participant_id
      and id != new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger on_request_approved
  after update on public.join_requests
  for each row execute function public.handle_request_approved();
```

- [ ] **Step 3: Apply migrations**

```bash
bunx supabase db push
```

Expected: both files applied with no errors.

- [ ] **Step 4: Verify in Supabase Studio**

Open http://127.0.0.1:54323 → Table Editor. Confirm `participants`, `teams`, and `join_requests` tables exist with the columns from Step 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add database schema and triggers"
```

---

## Task 3: Install dependencies and configure Nuxt

**Files:**
- Modify: `package.json`
- Modify: `nuxt.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install @nuxtjs/supabase and test utilities**

```bash
bun add @nuxtjs/supabase
bun add -D @nuxt/test-utils vitest @vue/test-utils happy-dom
```

- [ ] **Step 2: Rewrite `nuxt.config.ts`**

```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  vite: {
    plugins: [tailwindcss() as any],
  },
  css: ["./public/tailwind.css"],

  modules: [
    "@nuxt/fonts",
    "@nuxt/hints",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/content",
    "@nuxtjs/supabase",
  ],

  supabase: {
    // Disable auto-redirect — we handle it via manual middleware
    redirectOptions: {
      login: "/ops/login",
      callback: "/confirm",
      exclude: ["/*"],
    },
  },

  runtimeConfig: {
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    },
  },
});
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    environment: "nuxt",
  },
});
```

- [ ] **Step 4: Start dev server and verify no errors**

```bash
bun dev
```

Expected: dev server starts on http://localhost:3000 with no module import errors in the terminal.

- [ ] **Step 5: Commit**

```bash
git add nuxt.config.ts package.json package-lock.json vitest.config.ts
git commit -m "chore: add @nuxtjs/supabase, vitest, update nuxt config"
```

---

## Task 4: Server utilities and middleware

**Files:**
- Create: `server/utils/supabase.ts`
- Create: `server/utils/adminAuth.ts`
- Create: `server/middleware/01.auth.ts`

- [ ] **Step 1: Create `server/utils/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function useSupabaseAdmin() {
  const config = useRuntimeConfig();
  return createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  );
}
```

- [ ] **Step 2: Create `server/utils/adminAuth.ts`**

```typescript
import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export async function requireAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const { data: participant } = await supabase
    .from("participants")
    .select("role")
    .eq("id", user.id)
    .single();

  if (participant?.role !== "admin") {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  return { user, supabase };
}
```

- [ ] **Step 3: Create `server/middleware/01.auth.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";

export default defineEventHandler(async (event) => {
  // Attach user to context so route handlers can read it without a second round-trip
  const user = await serverSupabaseUser(event).catch(() => null);
  event.context.user = user ?? null;
});
```

- [ ] **Step 4: Commit**

```bash
git add server/utils/ server/middleware/
git commit -m "feat: add server supabase utilities and auth middleware"
```

---

## Task 5: GET /api/me

**Files:**
- Create: `server/api/me.get.ts`
- Create: `tests/server/me.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/me.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setup, $fetch } from "@nuxt/test-utils/e2e";

describe("GET /api/me", async () => {
  await setup({ server: true });

  it("returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/me");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/server/me.test.ts
```

Expected: FAIL — route does not exist, response is 404 not 401.

- [ ] **Step 3: Implement `server/api/me.get.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, name, email, skills, role, created_at, team:teams(id, name, skills_wanted, description)")
    .eq("id", user.id)
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return participant;
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/server/me.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/api/me.get.ts tests/server/me.test.ts
git commit -m "feat: add GET /api/me endpoint"
```

---

## Task 6: Teams API — list and create

**Files:**
- Create: `server/api/teams/index.get.ts`
- Create: `server/api/teams/index.post.ts`
- Create: `tests/server/teams.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/teams.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("Teams API", async () => {
  await setup({ server: true });

  it("GET /api/teams returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams");
    expect(res.status).toBe(401);
  });

  it("POST /api/teams returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Team Punk", skills_wanted: ["TypeScript"] }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
bunx vitest run tests/server/teams.test.ts
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Implement `server/api/teams/index.get.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const { skills } = getQuery(event) as { skills?: string };
  const supabase = useSupabaseAdmin();

  let query = supabase
    .from("teams")
    .select("id, name, leader_id, skills_wanted, description, created_at, members:participants(id)")
    .order("created_at", { ascending: false });

  if (skills) {
    const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    query = query.overlaps("skills_wanted", skillList);
  }

  const { data, error } = await query;
  if (error) throw createError({ statusCode: 500, message: error.message });

  // Only return teams with fewer than 6 members
  return (data ?? []).filter((team) => team.members.length < 6);
});
```

- [ ] **Step 4: Implement `server/api/teams/index.post.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();

  const { data: participant } = await supabase
    .from("participants")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (participant?.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  const body = await readBody<{ name: string; skills_wanted?: string[]; description?: string }>(event);

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, message: "Team name is required" });
  }

  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      name: body.name.trim(),
      leader_id: user.id,
      skills_wanted: body.skills_wanted ?? [],
      description: body.description ?? null,
    })
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });

  // Set creator as first team member
  await supabase
    .from("participants")
    .update({ team_id: team.id })
    .eq("id", user.id);

  return team;
});
```

- [ ] **Step 5: Run tests**

```bash
bunx vitest run tests/server/teams.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/teams/index.get.ts server/api/teams/index.post.ts tests/server/teams.test.ts
git commit -m "feat: add GET and POST /api/teams"
```

---

## Task 7: Teams API — detail and list requests

**Files:**
- Create: `server/api/teams/[id].get.ts`
- Create: `server/api/teams/[id]/requests.get.ts`

- [ ] **Step 1: Add test for unauthenticated team detail**

Append to `tests/server/teams.test.ts`:

```typescript
  it("GET /api/teams/:id returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 2: Run to verify the new test fails**

```bash
bunx vitest run tests/server/teams.test.ts
```

Expected: the new test FAILS — route doesn't exist.

- [ ] **Step 3: Implement `server/api/teams/[id].get.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const { data: team, error } = await supabase
    .from("teams")
    .select("id, name, leader_id, skills_wanted, description, created_at, members:participants(id, name, skills)")
    .eq("id", id!)
    .single();

  if (error || !team) throw createError({ statusCode: 404, message: "Team not found" });
  return team;
});
```

- [ ] **Step 4: Implement `server/api/teams/[id]/requests.get.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const teamId = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const { data: team } = await supabase
    .from("teams")
    .select("leader_id")
    .eq("id", teamId!)
    .single();

  if (!team) throw createError({ statusCode: 404, message: "Team not found" });
  if (team.leader_id !== user.id) {
    throw createError({ statusCode: 403, message: "Only the team leader can view requests" });
  }

  const { data, error } = await supabase
    .from("join_requests")
    .select("id, status, created_at, participant:participants(id, name, skills)")
    .eq("team_id", teamId!)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
```

- [ ] **Step 5: Run tests**

```bash
bunx vitest run tests/server/teams.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/teams/[id].get.ts server/api/teams/[id]/requests.get.ts tests/server/teams.test.ts
git commit -m "feat: add GET /api/teams/:id and GET /api/teams/:id/requests"
```

---

## Task 8: Join requests API — send and respond

**Files:**
- Create: `server/api/teams/[id]/requests.post.ts`
- Create: `server/api/requests/[id].patch.ts`
- Create: `tests/server/requests.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/requests.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("Join Requests API", async () => {
  await setup({ server: true });

  it("POST /api/teams/:id/requests returns 401 unauthenticated", async () => {
    const res = await fetch(
      "http://localhost:3000/api/teams/00000000-0000-0000-0000-000000000000/requests",
      { method: "POST" }
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /api/requests/:id returns 401 unauthenticated", async () => {
    const res = await fetch(
      "http://localhost:3000/api/requests/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
bunx vitest run tests/server/requests.test.ts
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement `server/api/teams/[id]/requests.post.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const teamId = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  // Block if already in a team
  const { data: participant } = await supabase
    .from("participants")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (participant?.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  // Block if team is full
  const { data: members } = await supabase
    .from("participants")
    .select("id")
    .eq("team_id", teamId!);

  if ((members?.length ?? 0) >= 6) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  // Block if request already pending
  const { data: existing } = await supabase
    .from("join_requests")
    .select("id")
    .eq("participant_id", user.id)
    .eq("team_id", teamId!)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    throw createError({ statusCode: 409, message: "Request already pending" });
  }

  const { data: request, error } = await supabase
    .from("join_requests")
    .insert({ participant_id: user.id, team_id: teamId! })
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return request;
});
```

- [ ] **Step 4: Implement `server/api/requests/[id].patch.ts`**

```typescript
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "~/server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const requestId = getRouterParam(event, "id");
  const body = await readBody<{ status: "approved" | "rejected" }>(event);

  if (!["approved", "rejected"].includes(body.status)) {
    throw createError({ statusCode: 400, message: "status must be approved or rejected" });
  }

  const supabase = useSupabaseAdmin();

  const { data: joinRequest } = await supabase
    .from("join_requests")
    .select("id, status, team_id, team:teams(leader_id)")
    .eq("id", requestId!)
    .single();

  if (!joinRequest) throw createError({ statusCode: 404, message: "Request not found" });
  if (joinRequest.status !== "pending") {
    throw createError({ statusCode: 409, message: "Request is not pending" });
  }

  const leaderId = (joinRequest.team as { leader_id: string } | null)?.leader_id;
  if (leaderId !== user.id) {
    throw createError({ statusCode: 403, message: "Only the team leader can respond to requests" });
  }

  // DB trigger handles setting team_id and rejecting other requests on approval
  const { data: updated, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", requestId!)
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return updated;
});
```

- [ ] **Step 5: Run tests**

```bash
bunx vitest run tests/server/requests.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/teams/[id]/requests.post.ts server/api/requests/[id].patch.ts tests/server/requests.test.ts
git commit -m "feat: add join requests send and respond endpoints"
```

---

## Task 9: Admin API routes

**Files:**
- Create: `server/api/admin/participants/index.get.ts`
- Create: `server/api/admin/participants/[id].delete.ts`
- Create: `server/api/admin/teams/index.get.ts`
- Create: `server/api/admin/teams/[id].delete.ts`
- Create: `server/api/admin/requests/[id].patch.ts`
- Create: `tests/server/admin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/admin.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("Admin API", async () => {
  await setup({ server: true });

  it("GET /api/admin/participants returns 401 unauthenticated", async () => {
    const res = await fetch("http://localhost:3000/api/admin/participants");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/teams returns 401 unauthenticated", async () => {
    const res = await fetch("http://localhost:3000/api/admin/teams");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
bunx vitest run tests/server/admin.test.ts
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement `server/api/admin/participants/index.get.ts`**

```typescript
import { requireAdmin } from "~/server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("participants")
    .select("id, name, email, skills, role, team_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
```

- [ ] **Step 4: Implement `server/api/admin/participants/[id].delete.ts`**

```typescript
import { requireAdmin } from "~/server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Deleting from auth.users cascades to participants
  const { error } = await supabase.auth.admin.deleteUser(id!);
  if (error) throw createError({ statusCode: 500, message: error.message });

  return { success: true };
});
```

- [ ] **Step 5: Implement `server/api/admin/teams/index.get.ts`**

```typescript
import { requireAdmin } from "~/server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, leader_id, skills_wanted, description, created_at, members:participants(id, name, email)")
    .order("created_at", { ascending: false });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
```

- [ ] **Step 6: Implement `server/api/admin/teams/[id].delete.ts`**

```typescript
import { requireAdmin } from "~/server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Null out team_id for all members
  await supabase.from("participants").update({ team_id: null }).eq("team_id", id!);

  // Cancel pending requests for this team
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("team_id", id!)
    .eq("status", "pending");

  const { error } = await supabase.from("teams").delete().eq("id", id!);
  if (error) throw createError({ statusCode: 500, message: error.message });

  return { success: true };
});
```

- [ ] **Step 7: Implement `server/api/admin/requests/[id].patch.ts`**

```typescript
import { requireAdmin } from "~/server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const requestId = getRouterParam(event, "id");
  const body = await readBody<{ status: "approved" | "rejected" }>(event);

  if (!["approved", "rejected"].includes(body.status)) {
    throw createError({ statusCode: 400, message: "status must be approved or rejected" });
  }

  const { data, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", requestId!)
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
```

- [ ] **Step 8: Run tests**

```bash
bunx vitest run tests/server/admin.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add server/api/admin/ tests/server/admin.test.ts
git commit -m "feat: add admin API routes"
```

---

## Task 10: Client-side route middleware

**Files:**
- Create: `app/middleware/auth.ts`
- Create: `app/middleware/admin.ts`

- [ ] **Step 1: Create `app/middleware/auth.ts`**

```typescript
export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/login");
});
```

- [ ] **Step 2: Create `app/middleware/admin.ts`**

```typescript
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/login");

  const { data } = await useFetch<{ role: string }>("/api/me");
  if (data.value?.role !== "admin") return navigateTo("/dashboard");
});
```

- [ ] **Step 3: Commit**

```bash
git add app/middleware/
git commit -m "feat: add auth and admin client route middleware"
```

---

## Task 11: Register and Login pages

**Files:**
- Create: `app/pages/register.vue`
- Create: `app/pages/login.vue`

- [ ] **Step 1: Create `app/pages/register.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const router = useRouter()

const form = reactive({ name: '', email: '', password: '', skills: '' })
const error = ref('')
const loading = ref(false)

async function register() {
  error.value = ''
  loading.value = true

  const skills = form.skills.split(',').map((s) => s.trim()).filter(Boolean)

  const { error: authError } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: { data: { name: form.name, skills } },
  })

  loading.value = false

  if (authError) { error.value = authError.message; return }
  router.push('/teams')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md space-y-4" @submit.prevent="register">
      <h1 class="text-4xl font-black uppercase tracking-tight">Register</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <label class="form-control">
        <span class="label-text font-bold">Name</span>
        <input v-model="form.name" type="text" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input v-model="form.email" type="email" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Password</span>
        <input v-model="form.password" type="password" required minlength="8" class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Skills <span class="opacity-60">(comma-separated)</span></span>
        <input v-model="form.skills" type="text" placeholder="TypeScript, Rust, UI/UX" class="input input-bordered w-full" />
      </label>

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? 'Registering…' : 'Register' }}
      </button>

      <p class="text-sm text-center">
        Already registered? <NuxtLink to="/login" class="link">Log in</NuxtLink>
      </p>
    </form>
  </main>
</template>
```

- [ ] **Step 2: Create `app/pages/login.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const router = useRouter()

const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function login() {
  error.value = ''
  loading.value = true

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
  })

  loading.value = false

  if (authError) { error.value = authError.message; return }
  router.push('/teams')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md space-y-4" @submit.prevent="login">
      <h1 class="text-4xl font-black uppercase tracking-tight">Login</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input v-model="form.email" type="email" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Password</span>
        <input v-model="form.password" type="password" required class="input input-bordered w-full" />
      </label>

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? 'Logging in…' : 'Log in' }}
      </button>

      <p class="text-sm text-center">
        No account? <NuxtLink to="/register" class="link">Register</NuxtLink>
      </p>
    </form>
  </main>
</template>
```

- [ ] **Step 3: Manually test registration flow**

```bash
bun dev
```

Open http://localhost:3000/register. Fill in the form and submit. Expected: redirected to `/teams`. Open Supabase Studio at http://127.0.0.1:54323 → Table Editor → `participants`. Confirm a new row was created with the correct name and skills.

- [ ] **Step 4: Commit**

```bash
git add app/pages/register.vue app/pages/login.vue
git commit -m "feat: add register and login pages"
```

---

## Task 12: Teams browse, create, and detail pages

**Files:**
- Create: `app/pages/teams/index.vue`
- Create: `app/pages/team/create.vue`
- Create: `app/pages/teams/[id].vue`

- [ ] **Step 1: Create `app/pages/teams/index.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const skillsFilter = ref('')
const { data: teams, refresh } = await useFetch('/api/teams', {
  query: computed(() => skillsFilter.value ? { skills: skillsFilter.value } : {}),
})
</script>

<template>
  <main class="max-w-4xl mx-auto p-6 space-y-8">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-4xl font-black uppercase">Teams</h1>
      <NuxtLink to="/team/create" class="btn btn-primary font-black uppercase">+ Form Team</NuxtLink>
    </div>

    <div class="flex gap-2">
      <input
        v-model="skillsFilter"
        type="text"
        placeholder="Filter by skill (e.g. TypeScript)"
        class="input input-bordered flex-1"
        @keyup.enter="refresh()"
      />
      <button class="btn btn-outline" @click="refresh()">Filter</button>
    </div>

    <div v-if="!teams?.length" class="text-center opacity-50 py-12 text-xl font-bold uppercase">
      No open teams yet.
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <NuxtLink
        v-for="team in (teams as any[])"
        :key="team.id"
        :to="`/teams/${team.id}`"
        class="card bg-base-200 border border-base-content/20 hover:border-primary transition-colors"
      >
        <div class="card-body">
          <h2 class="card-title font-black">{{ team.name }}</h2>
          <p v-if="team.description" class="text-sm opacity-70">{{ team.description }}</p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span v-for="skill in team.skills_wanted" :key="skill" class="badge badge-outline text-xs">{{ skill }}</span>
          </div>
          <p class="text-xs opacity-50 mt-2">{{ team.members.length }}/6 members</p>
        </div>
      </NuxtLink>
    </div>
  </main>
</template>
```

- [ ] **Step 2: Create `app/pages/team/create.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const router = useRouter()

const form = reactive({ name: '', skills_wanted: '', description: '' })
const error = ref('')
const loading = ref(false)

async function createTeam() {
  error.value = ''
  loading.value = true

  const skills_wanted = form.skills_wanted.split(',').map((s) => s.trim()).filter(Boolean)

  const res = await $fetch('/api/teams', {
    method: 'POST',
    body: { name: form.name, skills_wanted, description: form.description || null },
  }).catch((e) => e.data)

  loading.value = false

  if (res?.statusCode >= 400) { error.value = res.message ?? 'Something went wrong'; return }
  router.push('/dashboard')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md space-y-4" @submit.prevent="createTeam">
      <h1 class="text-4xl font-black uppercase tracking-tight">Form a Team</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <label class="form-control">
        <span class="label-text font-bold">Team Name</span>
        <input v-model="form.name" type="text" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Skills Wanted <span class="opacity-60">(comma-separated)</span></span>
        <input v-model="form.skills_wanted" type="text" placeholder="Vue, Design, DevOps" class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Description <span class="opacity-60">(optional)</span></span>
        <textarea v-model="form.description" class="textarea textarea-bordered w-full" rows="3" />
      </label>

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? 'Creating…' : 'Create Team' }}
      </button>
    </form>
  </main>
</template>
```

- [ ] **Step 3: Create `app/pages/teams/[id].vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const route = useRoute()
const { data: team } = await useFetch<any>(`/api/teams/${route.params.id}`)
const { data: me } = await useFetch<any>('/api/me')

const sending = ref(false)
const message = ref('')

const isMember = computed(() =>
  team.value?.members?.some((m: { id: string }) => m.id === me.value?.id)
)
const alreadyInTeam = computed(() => !!me.value?.team_id)

async function sendRequest() {
  sending.value = true
  message.value = ''
  try {
    await $fetch(`/api/teams/${route.params.id}/requests`, { method: 'POST' })
    message.value = 'Request sent!'
  } catch (e: any) {
    message.value = e.data?.message ?? 'Something went wrong'
  }
  sending.value = false
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-6">
    <NuxtLink to="/teams" class="btn btn-ghost btn-sm">← Back</NuxtLink>

    <template v-if="team">
      <h1 class="text-4xl font-black uppercase">{{ team.name }}</h1>
      <p v-if="team.description" class="opacity-70">{{ team.description }}</p>

      <div class="flex flex-wrap gap-2">
        <span v-for="skill in team.skills_wanted" :key="skill" class="badge badge-primary badge-outline">{{ skill }}</span>
      </div>

      <h2 class="text-xl font-bold mt-6 mb-3">Members ({{ team.members?.length ?? 0 }}/6)</h2>
      <ul class="space-y-2">
        <li v-for="member in team.members" :key="member.id" class="flex items-center gap-3">
          <span class="font-medium">{{ member.name }}</span>
          <div class="flex gap-1 flex-wrap">
            <span v-for="skill in member.skills" :key="skill" class="badge badge-outline text-xs">{{ skill }}</span>
          </div>
        </li>
      </ul>

      <div class="mt-8">
        <div
          v-if="message"
          class="alert mb-4"
          :class="message === 'Request sent!' ? 'alert-success' : 'alert-error'"
        >{{ message }}</div>

        <button
          v-if="!isMember && !alreadyInTeam"
          :disabled="sending"
          class="btn btn-primary font-black uppercase"
          @click="sendRequest"
        >{{ sending ? 'Sending…' : 'Request to Join' }}</button>

        <p v-else-if="isMember" class="font-bold text-success">You're a member of this team.</p>
        <p v-else class="opacity-60">You're already in a team.</p>
      </div>
    </template>
  </main>
</template>
```

- [ ] **Step 4: Manually verify in browser**

Navigate to http://localhost:3000/teams. Confirm the teams list renders. Click a team — confirm detail page shows members and skills. Click "+ Form Team" — confirm creation form works and redirects to dashboard.

- [ ] **Step 5: Commit**

```bash
git add app/pages/teams/ app/pages/team/create.vue
git commit -m "feat: add teams browse, create, and detail pages"
```

---

## Task 13: Dashboard page

**Files:**
- Create: `app/pages/dashboard.vue`

- [ ] **Step 1: Create `app/pages/dashboard.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const router = useRouter()
const { data: me } = await useFetch<any>('/api/me')

async function logout() {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-8">
    <div class="flex items-center justify-between">
      <h1 class="text-4xl font-black uppercase">Dashboard</h1>
      <button class="btn btn-ghost btn-sm" @click="logout">Logout</button>
    </div>

    <section v-if="me">
      <h2 class="text-xl font-bold mb-2">Profile</h2>
      <p><strong>Name:</strong> {{ me.name }}</p>
      <p><strong>Email:</strong> {{ me.email }}</p>
      <div class="flex flex-wrap gap-1 mt-2">
        <span v-for="skill in me.skills" :key="skill" class="badge badge-outline">{{ skill }}</span>
      </div>
    </section>

    <section v-if="me?.team">
      <h2 class="text-xl font-bold mb-2">Your Team</h2>
      <NuxtLink :to="`/teams/${me.team.id}`" class="link font-bold text-lg">{{ me.team.name }}</NuxtLink>
      <div class="mt-3">
        <NuxtLink to="/team/manage" class="btn btn-sm btn-outline">Manage Join Requests</NuxtLink>
      </div>
    </section>

    <section v-else-if="me">
      <h2 class="text-xl font-bold mb-2">No Team Yet</h2>
      <div class="flex gap-3">
        <NuxtLink to="/teams" class="btn btn-primary btn-sm font-black uppercase">Browse Teams</NuxtLink>
        <NuxtLink to="/team/create" class="btn btn-outline btn-sm font-black uppercase">Form a Team</NuxtLink>
      </div>
    </section>

    <section v-if="me?.role === 'admin'">
      <NuxtLink to="/admin" class="btn btn-warning btn-sm font-black uppercase">Admin Panel</NuxtLink>
    </section>
  </main>
</template>
```

- [ ] **Step 2: Manually verify in browser**

Log in and navigate to http://localhost:3000/dashboard. Confirm profile shows, team section shows if in a team, logout redirects to login.

- [ ] **Step 3: Commit**

```bash
git add app/pages/dashboard.vue
git commit -m "feat: add dashboard page"
```

---

## Task 14: Team manage page (leader)

**Files:**
- Create: `app/pages/team/manage.vue`

- [ ] **Step 1: Create `app/pages/team/manage.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const { data: me } = await useFetch<any>('/api/me')
const teamId = computed(() => me.value?.team?.id)

const { data: requests, refresh } = await useFetch<any[]>(
  computed(() => teamId.value ? `/api/teams/${teamId.value}/requests` : null)
)

async function respond(requestId: string, status: 'approved' | 'rejected') {
  await $fetch(`/api/requests/${requestId}`, { method: 'PATCH', body: { status } })
  await refresh()
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-8">
    <div class="flex items-center gap-4">
      <NuxtLink to="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
      <h1 class="text-4xl font-black uppercase">Manage Team</h1>
    </div>

    <div v-if="!teamId" class="text-center opacity-50 py-12">
      <p class="font-bold">You're not in a team.</p>
      <NuxtLink to="/teams" class="btn btn-primary mt-4">Browse Teams</NuxtLink>
    </div>

    <template v-else>
      <h2 class="text-xl font-bold">Pending Requests</h2>

      <div v-if="!requests?.length" class="opacity-50">No pending requests.</div>

      <ul class="space-y-3">
        <li
          v-for="req in requests"
          :key="req.id"
          class="flex items-center justify-between gap-4 p-4 border border-base-content/20 rounded"
        >
          <div>
            <p class="font-bold">{{ req.participant.name }}</p>
            <div class="flex gap-1 flex-wrap mt-1">
              <span
                v-for="skill in req.participant.skills"
                :key="skill"
                class="badge badge-xs badge-outline"
              >{{ skill }}</span>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="btn btn-success btn-sm font-black" @click="respond(req.id, 'approved')">Accept</button>
            <button class="btn btn-error btn-sm font-black" @click="respond(req.id, 'rejected')">Reject</button>
          </div>
        </li>
      </ul>
    </template>
  </main>
</template>
```

- [ ] **Step 2: Manually verify the manage flow**

Log in as a team leader. Navigate to http://localhost:3000/team/manage. From another account, send a join request to the team. Refresh the manage page — confirm the request appears. Click Accept — confirm the requester now has a team in Supabase Studio.

- [ ] **Step 3: Commit**

```bash
git add app/pages/team/manage.vue
git commit -m "feat: add team manage page for leaders"
```

---

## Task 15: Admin page

**Files:**
- Create: `app/pages/admin/index.vue`

- [ ] **Step 1: Promote a user to admin in Supabase Studio**

Open http://127.0.0.1:54323 → SQL Editor and run:

```sql
update public.participants set role = 'admin' where email = 'your@email.com';
```

Replace `your@email.com` with the email you registered with.

- [ ] **Step 2: Create `app/pages/admin/index.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const { data: participants, refresh: refreshParticipants } = await useFetch<any[]>('/api/admin/participants')
const { data: teams, refresh: refreshTeams } = await useFetch<any[]>('/api/admin/teams')

async function deleteParticipant(id: string) {
  if (!confirm('Delete this participant? This cannot be undone.')) return
  await $fetch(`/api/admin/participants/${id}`, { method: 'DELETE' })
  await refreshParticipants()
}

async function deleteTeam(id: string) {
  if (!confirm('Delete this team? All members will be freed.')) return
  await $fetch(`/api/admin/teams/${id}`, { method: 'DELETE' })
  await refreshTeams()
  await refreshParticipants()
}
</script>

<template>
  <main class="max-w-5xl mx-auto p-6 space-y-12">
    <div class="flex items-center justify-between">
      <h1 class="text-4xl font-black uppercase">Admin</h1>
      <NuxtLink to="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
    </div>

    <section>
      <h2 class="text-2xl font-bold mb-4">Participants ({{ participants?.length ?? 0 }})</h2>
      <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in participants" :key="p.id">
              <td class="font-medium">{{ p.name }}</td>
              <td>{{ p.email }}</td>
              <td>
                <span class="badge" :class="p.role === 'admin' ? 'badge-warning' : 'badge-ghost'">
                  {{ p.role }}
                </span>
              </td>
              <td>{{ p.team_id ? '✓' : '—' }}</td>
              <td>
                <button class="btn btn-error btn-xs" @click="deleteParticipant(p.id)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 class="text-2xl font-bold mb-4">Teams ({{ teams?.length ?? 0 }})</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="team in teams"
          :key="team.id"
          class="card bg-base-200 border border-base-content/20"
        >
          <div class="card-body">
            <div class="flex items-start justify-between">
              <h3 class="card-title font-black text-base">{{ team.name }}</h3>
              <button class="btn btn-error btn-xs shrink-0" @click="deleteTeam(team.id)">Delete</button>
            </div>
            <p class="text-sm opacity-60">{{ team.members?.length ?? 0 }} member(s)</p>
            <ul class="text-xs opacity-50 space-y-0.5 mt-1">
              <li v-for="m in team.members" :key="m.id">{{ m.name }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
```

- [ ] **Step 3: Manually verify admin panel**

Log in as the admin user. Navigate to http://localhost:3000/admin. Confirm participants table and teams grid render. Try deleting a team — confirm members lose their `team_id` in Studio.

- [ ] **Step 4: Verify a non-admin is redirected**

Log in as a regular participant and navigate to http://localhost:3000/admin. Expected: redirected to `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add app/pages/admin/index.vue
git commit -m "feat: add admin panel page"
```
