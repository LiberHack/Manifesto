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
