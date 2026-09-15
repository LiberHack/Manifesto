-- ============================================================
-- Edition archiving, phase 1 — step 1 & 2
-- Spec: docs/superpowers/specs/2026-09-16-second-edition-live-mode-design.md
--
-- 1. editions table + edition_status enum; wrap the current run as '2026'.
-- 2. registrations table; backfill one row per existing participant.
--
-- Additive only: edition 2026 stays live throughout.
-- ============================================================

-- ------------------------------------------------------------
-- 1. editions
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'edition_status') then
    create type public.edition_status as enum ('draft', 'live', 'archived');
  end if;
end
$$;

create table if not exists public.editions (
  slug            text primary key,
  name            text not null,
  starts_at       timestamptz null,
  ends_at         timestamptz null,
  status          public.edition_status not null default 'draft',
  is_current      boolean not null default false,
  participant_cap int not null default 120,
  created_at      timestamptz not null default now(),
  -- is_current and status are not independent: only a live edition may be current.
  constraint current_implies_live check (not is_current or status = 'live'),
  constraint participant_cap_positive check (participant_cap > 0)
);

-- Exactly one current edition at a time.
create unique index if not exists editions_one_current
  on public.editions (is_current) where is_current;

-- Wrap the running event as edition 2026, dates taken from the live event_config.
insert into public.editions (slug, name, starts_at, ends_at, status, is_current, participant_cap)
select
  '2026',
  coalesce(c.event_name, 'LiberHack 2026'),
  c.event_start,
  c.event_end,
  'live',
  true,
  120
from (select * from public.event_config where id = 1) c
on conflict (slug) do nothing;

-- Fallback when event_config has no row yet (fresh database).
insert into public.editions (slug, name, status, is_current, participant_cap)
values ('2026', 'LiberHack 2026', 'live', true, 120)
on conflict (slug) do nothing;

alter table public.editions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'editions' and policyname = 'editions_select'
  ) then
    create policy "editions_select" on public.editions for select to anon using (true);
  end if;
end
$$;

-- ------------------------------------------------------------
-- 2. registrations
-- ------------------------------------------------------------

-- Team role is distinct from public.participant_role, which is the
-- identity-level privilege flag ('participant' | 'admin') used by requireAdmin
-- and therefore stays on participants.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_role') then
    create type public.team_role as enum ('participant', 'leader');
  end if;
end
$$;

create table if not exists public.registrations (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references public.participants(id) on delete cascade,
  edition_slug      text not null references public.editions(slug) on update cascade on delete restrict,
  role              public.team_role not null default 'participant',
  team_id           uuid null references public.teams(id) on delete set null,
  skills            text[] not null default '{}',
  dietary           text null,
  experience        public.experience_level null,
  public            boolean not null default true,
  accepted_terms_at timestamptz not null default now(),
  registered_at     timestamptz not null default now(),
  unique (participant_id, edition_slug)
);

create index if not exists registrations_edition_idx on public.registrations (edition_slug);
create index if not exists registrations_team_idx on public.registrations (team_id);

-- Backfill: every existing participant is a 2026 registration.
-- accepted_terms_at = participants.created_at (they accepted the CoC at signup).
-- role is derived from team leadership, which today lives on teams.leader_id
-- (still referencing auth.users at this point).
insert into public.registrations (
  participant_id, edition_slug, role, team_id, skills, dietary, experience,
  public, accepted_terms_at, registered_at
)
select
  p.id,
  '2026',
  case when exists (select 1 from public.teams t where t.leader_id = p.id)
       then 'leader'::public.team_role
       else 'participant'::public.team_role
  end,
  p.team_id,
  p.skills,
  p.dietary,
  p.experience,
  true,
  p.created_at,
  p.created_at
from public.participants p
on conflict (participant_id, edition_slug) do nothing;

alter table public.registrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'registrations' and policyname = 'registrations_select_own'
  ) then
    create policy "registrations_select_own" on public.registrations
      for select to authenticated using (auth.uid() = participant_id);
  end if;
end
$$;
