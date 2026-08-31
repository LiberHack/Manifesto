# Edition Archiving: Part 1 — Database Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Postgres from a single-edition model to a multi-edition model: add `editions` + `registrations` tables, scope every per-edition table with `edition_slug`, install the leader-departure trigger, and backfill all existing data as edition `'2026'`.

**Architecture:** Strictly additive-then-cleanup. Each migration step adds structure first, then backfills, then tightens constraints. The column-drop cleanup is a separate final migration so the running edition is never disrupted. All new FKs use explicit `ON DELETE` policy matching the spec.

**Tech Stack:** PostgreSQL (self-hosted Supabase Docker), Supabase CLI (`supabase db push --local`), vitest + `@supabase/supabase-js` service-role client for integration tests.

**Pre-requisite:** Supabase stack is running (`cd supabase-docker && docker compose up -d`). Set env vars `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` for tests (copy from `supabase-docker/.env`).

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260700000000_editions_registrations.sql` | Create | `editions` table, `edition_status` enum, `registrations` table |
| `supabase/migrations/20260700000001_edition_scope_tables.sql` | Create | Add `edition_slug` + new columns to `teams`, `join_requests`; add `team_id` FK to `registrations` |
| `supabase/migrations/20260700000002_per_edition_cms.sql` | Create | De-singleton `event_config`; add `edition_slug` to `schedule_items`, `announcements` |
| `supabase/migrations/20260700000003_backfill_edition_2026.sql` | Create | Insert `editions` row, backfill all `edition_slug` columns, create `registrations` from `participants` |
| `supabase/migrations/20260700000004_leader_fk_and_trigger.sql` | Create | Repoint `teams.leader_id → registrations(id)`, install `handle_leader_departure` trigger, update `handle_request_approved` trigger |
| `supabase/migrations/20260700000005_update_handle_new_user.sql` | Create | Slim `handle_new_user` to identity-only; auto-create `registration` for current edition on signup |
| `supabase/migrations/20260700000006_drop_participants_per_edition_cols.sql` | Create | Drop `team_id, role, skills, dietary, experience` from `participants` |
| `supabase/migrations/20260700000007_edition_lifecycle_rpcs.sql` | Create | `close_edition()` and `go_live_edition()` stored procedures |
| `tests/db/editions.test.ts` | Create | editions table constraints, registrations uniqueness |
| `tests/db/backfill.test.ts` | Create | backfill correctness, participant column removal |
| `tests/db/leader-departure.test.ts` | Create | trigger: auto-promote, dissolve sole-leader team |
| `tests/db/edition-lifecycle.test.ts` | Create | close→draft→go-live cycle, ON DELETE RESTRICT |

---

### Task 1: editions table + edition_status enum

**Files:**
- Create: `supabase/migrations/20260700000000_editions_registrations.sql`
- Create: `tests/db/editions.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260700000000_editions_registrations.sql

create type public.edition_status as enum ('draft', 'live', 'archived');

create table public.editions (
  slug       text primary key,
  name       text not null,
  starts_at  timestamptz null,
  ends_at    timestamptz null,
  status     public.edition_status not null default 'draft',
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint current_implies_live check (not is_current or status = 'live')
);

-- Only one current edition at a time
create unique index editions_one_current on public.editions (is_current) where is_current;

alter table public.editions enable row level security;
create policy "editions_select" on public.editions for select to anon using (true);
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push --local
```
Expected: `Applying migration 20260700000000_editions_registrations.sql... OK`

- [ ] **Step 3: Write failing test**

Create `tests/db/editions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

describe('editions table constraints', () => {
  it('rejects a second is_current=true row (unique partial index)', async () => {
    await db.from('editions').insert({ slug: 'ci-test-1', name: 'CI 1', status: 'live', is_current: true })
    const { error } = await db.from('editions').insert({ slug: 'ci-test-2', name: 'CI 2', status: 'live', is_current: true })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505') // unique_violation
    await db.from('editions').delete().in('slug', ['ci-test-1', 'ci-test-2'])
  })

  it('rejects is_current=true with status != live (CHECK constraint)', async () => {
    const { error } = await db.from('editions').insert({ slug: 'ci-test-3', name: 'CI 3', status: 'draft', is_current: true })
    expect(error).not.toBeNull()
    await db.from('editions').delete().eq('slug', 'ci-test-3')
  })
})
```

- [ ] **Step 4: Run test — should pass**

```bash
bun test tests/db/editions.test.ts
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260700000000_editions_registrations.sql tests/db/editions.test.ts
git commit -m "feat(db): add editions table with edition_status enum and is_current constraint"
```

---

### Task 2: registrations table

**Files:**
- Modify: `supabase/migrations/20260700000000_editions_registrations.sql` (append — only before the first `db push`)

Note: `participant_role` already exists in the DB (from `reset_schema` migration). Do **not** `CREATE TYPE` it again. The `experience_level` enum was added in `20260602000000_add_dietary_experience.sql`.

- [ ] **Step 1: Append to the same migration file (before first push)**

```sql
-- append to 20260700000000_editions_registrations.sql

create table public.registrations (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  edition_slug    text not null references public.editions(slug) on update cascade on delete restrict,
  role            public.participant_role not null default 'participant',
  team_id         uuid null,   -- FK to teams added in Task 3 after teams.edition_slug exists
  skills          text[] not null default '{}',
  dietary         text null,
  experience      public.experience_level null,
  public          boolean not null default true,
  registered_at   timestamptz not null default now(),
  unique (participant_id, edition_slug)
);

create index registrations_edition_idx on public.registrations (edition_slug);
create index registrations_team_idx    on public.registrations (team_id);

alter table public.registrations enable row level security;
-- Authenticated users see their own registrations
create policy "registrations_select_own"
  on public.registrations for select to authenticated
  using (participant_id = auth.uid());
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push --local
```

- [ ] **Step 3: Write failing test**

Append to `tests/db/editions.test.ts`:

```typescript
it('registrations unique (participant_id, edition_slug)', async () => {
  const tag = Date.now()
  const { data: auth } = await db.auth.admin.createUser({
    email: `reg-test-${tag}@ci.test`, password: 'test1234', email_confirm: true
  })
  const uid = auth.user!.id
  await db.from('editions').insert({ slug: `reg-ed-${tag}`, name: 'Reg Ed', status: 'live' })
  await db.from('registrations').insert({ participant_id: uid, edition_slug: `reg-ed-${tag}`, skills: [] })
  const { error } = await db.from('registrations').insert({ participant_id: uid, edition_slug: `reg-ed-${tag}`, skills: [] })
  expect(error).not.toBeNull()
  expect(error!.code).toBe('23505')
  await db.auth.admin.deleteUser(uid)
  await db.from('editions').delete().eq('slug', `reg-ed-${tag}`)
})
```

- [ ] **Step 4: Run test**

```bash
bun test tests/db/editions.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260700000000_editions_registrations.sql tests/db/editions.test.ts
git commit -m "feat(db): add registrations table (per-edition participation record)"
```

---

### Task 3: Extend teams + join_requests; add registrations.team_id FK

**Files:**
- Create: `supabase/migrations/20260700000001_edition_scope_tables.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260700000001_edition_scope_tables.sql

-- teams: add edition_slug (nullable for backfill), plus new result columns
alter table public.teams
  add column edition_slug        text null references public.editions(slug) on update cascade on delete restrict,
  add column placement           int null,
  add column awards              text[] not null default '{}',
  add column presentation_order  int null;

create index teams_edition_idx on public.teams (edition_slug);

-- join_requests: add edition_slug
alter table public.join_requests
  add column edition_slug text null
    references public.editions(slug) on update cascade on delete restrict;

-- registrations: now that teams exists, add the FK for team_id
alter table public.registrations
  add constraint registrations_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete set null;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push --local
```

- [ ] **Step 3: Write failing test**

Append to `tests/db/editions.test.ts`:

```typescript
it('teams has edition_slug, placement, awards, presentation_order columns', async () => {
  const { error } = await db
    .from('teams')
    .select('edition_slug, placement, awards, presentation_order')
    .limit(1)
  expect(error).toBeNull()
})
```

- [ ] **Step 4: Run test**

```bash
bun test tests/db/editions.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260700000001_edition_scope_tables.sql tests/db/editions.test.ts
git commit -m "feat(db): add edition_slug to teams/join_requests, extend teams with result columns"
```

---

### Task 4: De-singleton event_config; add edition_slug to CMS tables

**Files:**
- Create: `supabase/migrations/20260700000002_per_edition_cms.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260700000002_per_edition_cms.sql

-- Drop singleton constraint and id column; replace with edition_slug PK
alter table public.event_config drop constraint only_one_row;
alter table public.event_config drop constraint event_config_pkey;
alter table public.event_config drop column id;
alter table public.event_config
  add column edition_slug text not null default '2026'
    references public.editions(slug) on update cascade on delete cascade;
alter table public.event_config add primary key (edition_slug);

-- schedule_items and announcements: add edition_slug (nullable for backfill)
alter table public.schedule_items
  add column edition_slug text null
    references public.editions(slug) on update cascade on delete cascade;

alter table public.announcements
  add column edition_slug text null
    references public.editions(slug) on update cascade on delete cascade;
```

Note: `event_config.edition_slug` defaults to `'2026'` temporarily so the existing row gets the right value during migration. The default is dropped after backfill (Task 5).

- [ ] **Step 2: Apply migration**

```bash
supabase db push --local
```
Expected: migration applies; the existing `event_config` row now has `edition_slug = '2026'`.

- [ ] **Step 3: Verify in psql**

```bash
psql "$DATABASE_URL" -c "SELECT edition_slug FROM event_config;"
```
Expected: one row with `edition_slug = 2026`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260700000002_per_edition_cms.sql
git commit -m "feat(db): de-singleton event_config, add edition_slug to CMS tables"
```

---

### Task 5: Backfill — editions row, all edition_slug columns, registrations

**Files:**
- Create: `supabase/migrations/20260700000003_backfill_edition_2026.sql`
- Create: `tests/db/backfill.test.ts`

- [ ] **Step 1: Check for duplicate team names before writing migration**

```bash
psql "$DATABASE_URL" -c "
  SELECT lower(name), count(*)
  FROM teams
  GROUP BY lower(name)
  HAVING count(*) > 1;
"
```
Expected: zero rows. If any exist, rename them manually before proceeding.

- [ ] **Step 2: Write migration**

```sql
-- supabase/migrations/20260700000003_backfill_edition_2026.sql

-- 1. Insert the 2026 edition row (dates from current event_config)
insert into public.editions (slug, name, starts_at, ends_at, status, is_current)
select '2026', event_name, event_start, event_end, 'live', true
from public.event_config
where edition_slug = '2026'
limit 1;

-- 2. event_config: drop the temporary default now that the editions row exists and backfill is done
alter table public.event_config alter column edition_slug drop default;

-- 3. Backfill schedule_items + announcements
update public.schedule_items set edition_slug = '2026' where edition_slug is null;
update public.announcements  set edition_slug = '2026' where edition_slug is null;

-- 4. Backfill teams
update public.teams set edition_slug = '2026' where edition_slug is null;

-- 5. Backfill join_requests
update public.join_requests set edition_slug = '2026' where edition_slug is null;

-- 6. Create registrations from existing participants
--    leader_id on teams still references auth.users at this point; use it to determine role
insert into public.registrations (
  participant_id, edition_slug, role, team_id, skills, dietary, experience, public
)
select
  p.id,
  '2026',
  case when t.leader_id = p.id then 'leader'::public.participant_role else 'participant'::public.participant_role end,
  p.team_id,
  p.skills,
  p.dietary,
  p.experience,
  true
from public.participants p
left join public.teams t on t.id = p.team_id
on conflict (participant_id, edition_slug) do nothing;

-- 7. Tighten NOT NULL now backfill is complete
alter table public.teams        alter column edition_slug set not null;
alter table public.join_requests alter column edition_slug set not null;
alter table public.schedule_items alter column edition_slug set not null;
alter table public.announcements  alter column edition_slug set not null;

-- 8. Unique team name per edition (case-insensitive)
create unique index teams_unique_name_per_edition
  on public.teams (edition_slug, lower(name));
```

- [ ] **Step 3: Apply migration**

```bash
supabase db push --local
```

- [ ] **Step 4: Write failing tests**

Create `tests/db/backfill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

describe('backfill: 2026 edition', () => {
  it('editions row exists, is live and current', async () => {
    const { data } = await db.from('editions').select('*').eq('slug', '2026').single()
    expect(data).not.toBeNull()
    expect(data!.is_current).toBe(true)
    expect(data!.status).toBe('live')
  })

  it('every participant has a registration for 2026', async () => {
    const { count: pCount } = await db.from('participants').select('*', { count: 'exact', head: true })
    const { count: rCount } = await db.from('registrations').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(rCount).toBe(pCount)
  })

  it('no team has a null edition_slug', async () => {
    const { data } = await db.from('teams').select('id').is('edition_slug', null)
    expect(data).toHaveLength(0)
  })

  it('duplicate team names within an edition are rejected case-insensitively', async () => {
    const { data: team } = await db.from('teams').select('edition_slug, name, leader_id, skills_wanted').limit(1).single()
    if (!team) return
    const { error } = await db.from('teams').insert({
      edition_slug: team.edition_slug,
      name: team.name.toUpperCase(),
      leader_id: team.leader_id,
      skills_wanted: team.skills_wanted,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('same team name is allowed across different editions', async () => {
    const tag = Date.now()
    const slug = `other-ed-${tag}`
    await db.from('editions').insert({ slug, name: 'Other', status: 'draft' })
    const { data: team } = await db.from('teams').select('name, skills_wanted').limit(1).single()
    if (!team) { await db.from('editions').delete().eq('slug', slug); return }
    // Get any valid leader (a participant with a reg in new edition)
    const { data: someReg } = await db.from('registrations').select('id').eq('edition_slug', '2026').limit(1).single()
    if (!someReg) { await db.from('editions').delete().eq('slug', slug); return }
    const { error } = await db.from('teams').insert({
      edition_slug: slug, name: team.name, leader_id: someReg.id, skills_wanted: team.skills_wanted
    })
    // leader_id references a 2026 registration, not a registration in `slug` edition
    // This will fail on a different constraint; we're just checking the name isn't blocked across editions
    // The cross-edition name uniqueness check passes (no 23505 with the edition name constraint)
    if (error) expect(error.code).not.toBe('23505')
    await db.from('teams').delete().eq('edition_slug', slug)
    await db.from('editions').delete().eq('slug', slug)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/db/backfill.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260700000003_backfill_edition_2026.sql tests/db/backfill.test.ts
git commit -m "feat(db): backfill 2026 edition, create registrations, enforce NOT NULL + unique team name"
```

---

### Task 6: Repoint teams.leader_id → registrations(id) + handle_leader_departure trigger

**Files:**
- Create: `supabase/migrations/20260700000004_leader_fk_and_trigger.sql`
- Create: `tests/db/leader-departure.test.ts`

The current schema has `teams.leader_id references auth.users(id)`. We move it to `references registrations(id) ON DELETE CASCADE` so a leader deletion auto-promotes a member (via trigger) or dissolves the team. The `handle_request_approved` trigger also currently sets `participants.team_id` — update it to set `registrations.team_id` in the current edition.

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260700000004_leader_fk_and_trigger.sql

-- 1. Temp column to hold the resolved registration id for each team's leader
alter table public.teams add column leader_reg_id uuid null;

-- 2. Populate: find the 2026 registration whose participant_id = current leader_id
update public.teams t
set leader_reg_id = r.id
from public.registrations r
where r.participant_id = t.leader_id
  and r.edition_slug = t.edition_slug;

-- 3. Safety check (must be 0 before proceeding):
-- select count(*) from teams where leader_reg_id is null;

-- 4. Drop old FK (references auth.users)
alter table public.teams drop constraint teams_leader_id_fkey;

-- 5. Update leader_id to the resolved registration UUID
update public.teams set leader_id = leader_reg_id;

-- 6. Add NOT NULL + new FK → registrations ON DELETE CASCADE
alter table public.teams alter column leader_id set not null;
alter table public.teams
  add constraint teams_leader_id_fkey
    foreign key (leader_id) references public.registrations(id) on delete cascade;

-- 7. Drop temp column
alter table public.teams drop column leader_reg_id;

-- 8. Ensure registrations.role='leader' matches teams.leader_id
update public.registrations r
set role = 'leader'
from public.teams t
where t.leader_id = r.id
  and r.role != 'leader';

-- 9. handle_leader_departure BEFORE DELETE trigger
create or replace function public.handle_leader_departure()
returns trigger language plpgsql as $$
declare
  v_team_id       uuid;
  v_successor_id  uuid;
begin
  -- Find if this registration is a team leader
  select id into v_team_id from public.teams where leader_id = old.id;
  if v_team_id is null then return old; end if;

  -- Find earliest-registered remaining member (not the departing row)
  select r.id into v_successor_id
  from public.registrations r
  where r.team_id = v_team_id
    and r.id != old.id
  order by r.registered_at, r.id
  limit 1;

  if v_successor_id is not null then
    -- Promote successor
    update public.teams       set leader_id = v_successor_id where id = v_team_id;
    update public.registrations set role = 'leader'           where id = v_successor_id;
  end if;
  -- If no successor: leader_id still points to old.id; ON DELETE CASCADE dissolves the team

  return old;
end;
$$;

create trigger handle_leader_departure
  before delete on public.registrations
  for each row execute function public.handle_leader_departure();

-- 10. Update handle_request_approved: set registrations.team_id (not participants.team_id)
create or replace function public.handle_request_approved()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    -- Update the joiner's registration for this edition
    update public.registrations
    set team_id = new.team_id
    where participant_id = new.participant_id
      and edition_slug = (
        select edition_slug from public.teams where id = new.team_id
      );

    -- Cancel other pending requests for this participant
    update public.join_requests
    set status = 'rejected'
    where participant_id = new.participant_id
      and id != new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;
```

- [ ] **Step 2: Verify temp column resolved (run before pushing)**

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM teams WHERE leader_reg_id IS NULL;"
```
Expected: `count = 0`. If non-zero, debug before proceeding.

- [ ] **Step 3: Apply migration**

```bash
supabase db push --local
```

- [ ] **Step 4: Write failing tests**

Create `tests/db/leader-departure.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function makeUser(email: string) {
  const { data } = await db.auth.admin.createUser({ email, password: 'test1234', email_confirm: true })
  return data.user!.id
}

describe('handle_leader_departure trigger', () => {
  it('promotes earliest-registered member when leader is deleted', async () => {
    const tag = Date.now()
    const edSlug = `dep-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Dep Test', status: 'live' })

    const leaderId = await makeUser(`leader-${tag}@ci.test`)
    const memberId = await makeUser(`member-${tag}@ci.test`)

    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()

    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `Team${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()

    const { data: memberReg } = await db.from('registrations')
      .insert({ participant_id: memberId, edition_slug: edSlug, team_id: team!.id, skills: [] })
      .select().single()

    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    // Delete the leader registration (what happens during auth.users cascade)
    await db.from('registrations').delete().eq('id', leaderReg!.id)

    const { data: updatedTeam } = await db.from('teams').select('leader_id').eq('id', team!.id).single()
    expect(updatedTeam!.leader_id).toBe(memberReg!.id)

    const { data: updatedMember } = await db.from('registrations').select('role').eq('id', memberReg!.id).single()
    expect(updatedMember!.role).toBe('leader')

    await db.auth.admin.deleteUser(leaderId)
    await db.auth.admin.deleteUser(memberId)
    await db.from('editions').delete().eq('slug', edSlug)
  })

  it('dissolves team when sole leader has no other members', async () => {
    const tag = Date.now()
    const edSlug = `sole-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Sole Test', status: 'live' })

    const leaderId = await makeUser(`sole-${tag}@ci.test`)
    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()

    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `SoleTeam${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()

    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    await db.from('registrations').delete().eq('id', leaderReg!.id)

    const { data: dissolved } = await db.from('teams').select('id').eq('id', team!.id).maybeSingle()
    expect(dissolved).toBeNull()

    await db.auth.admin.deleteUser(leaderId)
    await db.from('editions').delete().eq('slug', edSlug)
  })

  it('deletion via auth.users cascade also triggers handle_leader_departure', async () => {
    const tag = Date.now()
    const edSlug = `cascade-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Cascade Test', status: 'live' })

    const leaderId = await makeUser(`cas-lead-${tag}@ci.test`)
    const memberId = await makeUser(`cas-mem-${tag}@ci.test`)

    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()
    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `CasTeam${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()
    const { data: memberReg } = await db.from('registrations')
      .insert({ participant_id: memberId, edition_slug: edSlug, team_id: team!.id, skills: [] })
      .select().single()
    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    // Delete auth user (cascades: auth.users → participants → registrations → trigger fires)
    await db.auth.admin.deleteUser(leaderId)

    const { data: promoted } = await db.from('registrations').select('role').eq('id', memberReg!.id).single()
    expect(promoted!.role).toBe('leader')

    await db.auth.admin.deleteUser(memberId)
    await db.from('editions').delete().eq('slug', edSlug)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/db/leader-departure.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260700000004_leader_fk_and_trigger.sql tests/db/leader-departure.test.ts
git commit -m "feat(db): repoint teams.leader_id to registrations(id), install handle_leader_departure trigger"
```

---

### Task 7: Slim handle_new_user + drop per-edition columns from participants

**Files:**
- Create: `supabase/migrations/20260700000005_update_handle_new_user.sql`
- Create: `supabase/migrations/20260700000006_drop_participants_per_edition_cols.sql`

- [ ] **Step 1: Write handle_new_user update migration**

```sql
-- supabase/migrations/20260700000005_update_handle_new_user.sql

-- Participants is now identity-only. The trigger writes id/name/email only.
-- If a live edition exists, it also creates a registration.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_edition text;
begin
  insert into public.participants (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );

  select slug into v_edition from public.editions where is_current = true limit 1;

  if v_edition is not null then
    insert into public.registrations (participant_id, edition_slug, skills, dietary, experience)
    values (
      new.id,
      v_edition,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills', '[]'::jsonb))),
        '{}'::text[]
      ),
      nullif(trim(coalesce(new.raw_user_meta_data->>'dietary', '')), ''),
      case
        when new.raw_user_meta_data->>'experience' in ('beginner','intermediate','experienced')
        then (new.raw_user_meta_data->>'experience')::public.experience_level
        else null
      end
    );
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Write the column-drop migration**

```sql
-- supabase/migrations/20260700000006_drop_participants_per_edition_cols.sql
-- Run only after all backfill tests (backfill.test.ts) pass on the real DB.

alter table public.participants
  drop column if exists team_id,
  drop column if exists role,
  drop column if exists skills,
  drop column if exists dietary,
  drop column if exists experience;
```

- [ ] **Step 3: Apply migrations**

```bash
supabase db push --local
```

- [ ] **Step 4: Write failing tests**

Append to `tests/db/backfill.test.ts`:

```typescript
it('participants no longer has per-edition columns', async () => {
  // skills column should not exist
  const { error } = await db.from('participants').select('skills').limit(1)
  expect(error).not.toBeNull()
})

it('new user signup creates participant + registration for current edition', async () => {
  const tag = Date.now()
  const { data: auth } = await db.auth.admin.createUser({
    email: `trigger-test-${tag}@ci.test`,
    password: 'test1234',
    email_confirm: true,
    user_metadata: { name: 'Trigger Test', skills: ['TypeScript'], dietary: '', experience: 'beginner' },
  })
  const uid = auth.user!.id

  const { data: p } = await db.from('participants').select('id, name, email').eq('id', uid).single()
  expect(p!.name).toBe('Trigger Test')
  expect(p!.email).toBe(`trigger-test-${tag}@ci.test`)

  const { data: reg } = await db.from('registrations').select('*').eq('participant_id', uid).maybeSingle()
  // Only expect a registration if an edition is currently live
  const { data: current } = await db.from('editions').select('slug').eq('is_current', true).maybeSingle()
  if (current) {
    expect(reg).not.toBeNull()
    expect(reg!.edition_slug).toBe(current.slug)
    expect(reg!.skills).toContain('TypeScript')
    expect(reg!.experience).toBe('beginner')
  }

  await db.auth.admin.deleteUser(uid)
})
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/db/backfill.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260700000005_update_handle_new_user.sql supabase/migrations/20260700000006_drop_participants_per_edition_cols.sql tests/db/backfill.test.ts
git commit -m "feat(db): slim participants to identity-only, drop per-edition cols, update handle_new_user"
```

---

### Task 8: Edition lifecycle RPCs + integration test

**Files:**
- Create: `supabase/migrations/20260700000007_edition_lifecycle_rpcs.sql`
- Create: `tests/db/edition-lifecycle.test.ts`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260700000007_edition_lifecycle_rpcs.sql

-- close_edition: mark edition as archived, unset is_current
create or replace function public.close_edition(p_slug text)
returns void language plpgsql security definer as $$
begin
  update public.editions
  set status = 'archived', is_current = false
  where slug = p_slug and status = 'live';

  if not found then
    raise exception 'Edition % is not live or does not exist', p_slug;
  end if;
end;
$$;

-- go_live_edition: promote draft to live+current (requires no other edition is current)
create or replace function public.go_live_edition(p_slug text)
returns void language plpgsql security definer as $$
begin
  if exists (select 1 from public.editions where is_current = true) then
    raise exception 'Close the current edition before going live with a new one';
  end if;

  update public.editions
  set status = 'live', is_current = true
  where slug = p_slug and status = 'draft';

  if not found then
    raise exception 'Edition % is not a draft or does not exist', p_slug;
  end if;
end;
$$;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push --local
```

- [ ] **Step 3: Write failing test**

Create `tests/db/edition-lifecycle.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const nextSlug = `lifecycle-${Date.now()}`

afterAll(async () => {
  // Restore 2026 as current if needed
  await db.from('editions').update({ status: 'live', is_current: true }).eq('slug', '2026').eq('is_current', false)
  await db.from('editions').delete().eq('slug', nextSlug)
})

describe('edition lifecycle', () => {
  it('close_edition archives current edition', async () => {
    await db.rpc('close_edition', { p_slug: '2026' })
    const { data } = await db.from('editions').select('status, is_current').eq('slug', '2026').single()
    expect(data!.status).toBe('archived')
    expect(data!.is_current).toBe(false)
  })

  it('ON DELETE RESTRICT blocks deleting an edition that has teams', async () => {
    const { data: teams } = await db.from('teams').select('id').eq('edition_slug', '2026').limit(1)
    if (!teams?.length) return
    const { error } = await db.from('editions').delete().eq('slug', '2026')
    expect(error).not.toBeNull()
  })

  it('close→draft→go_live leaves all prior data intact', async () => {
    await db.from('editions').insert({ slug: nextSlug, name: 'Next Edition', status: 'draft' })
    await db.rpc('go_live_edition', { p_slug: nextSlug })

    const { data: edition } = await db.from('editions').select('status, is_current').eq('slug', nextSlug).single()
    expect(edition!.status).toBe('live')
    expect(edition!.is_current).toBe(true)

    // Prior 2026 data is untouched
    const { count: teamCount } = await db.from('teams').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(teamCount).toBeGreaterThan(0)

    const { count: regCount } = await db.from('registrations').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(regCount).toBeGreaterThan(0)

    // New edition is empty
    const { count: newTeams } = await db.from('teams').select('*', { count: 'exact', head: true }).eq('edition_slug', nextSlug)
    expect(newTeams).toBe(0)
  })

  it('go_live_edition rejects if another edition is already current', async () => {
    // nextSlug is now current; try to go-live another draft
    const draftSlug = `double-${Date.now()}`
    await db.from('editions').insert({ slug: draftSlug, name: 'Double', status: 'draft' })
    const { error } = await db.rpc('go_live_edition', { p_slug: draftSlug })
    expect(error).not.toBeNull()
    await db.from('editions').delete().eq('slug', draftSlug)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/db/edition-lifecycle.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260700000007_edition_lifecycle_rpcs.sql tests/db/edition-lifecycle.test.ts
git commit -m "feat(db): add close_edition/go_live_edition RPCs, integration test for lifecycle + RESTRICT"
```
