-- supabase/migrations/20260700000002_per_edition_cms.sql

-- Ensure the 2026 edition row exists before adding the FK from event_config.
-- event_config already has one row (id=1); we need editions('2026') to satisfy
-- the upcoming FK constraint.  Dates and status will be properly backfilled by
-- the next migration; we insert a minimal draft row here.
insert into public.editions (slug, name, status, is_current)
values ('2026', 'LiberHack 2026', 'draft', false)
on conflict (slug) do nothing;

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
