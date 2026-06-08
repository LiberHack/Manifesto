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

create table public.registrations (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  edition_slug    text not null references public.editions(slug) on update cascade on delete restrict,
  role            public.participant_role not null default 'participant',
  team_id         uuid null,   -- FK to teams added in a later migration after teams.edition_slug exists
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
