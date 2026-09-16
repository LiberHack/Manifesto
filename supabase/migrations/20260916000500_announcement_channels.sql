-- ============================================================
-- Announcements as the single source for every notice the site shows
-- Spec: docs/superpowers/specs/2026-09-16-announcements-banners-design.md
--
-- One table, three channels. `live` keeps the /live ticker's behaviour; `ops`
-- renders as a banner for logged-in participants; `site` renders for everyone.
-- No banner is code-driven any more — the hardcoded ones become rows.
--
-- Ordered after the edition migrations because it builds on
-- announcements.edition_slug (the spec's filename predates that dependency).
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'announcement_channel') then
    create type public.announcement_channel as enum ('live', 'ops', 'site');
  end if;
  if not exists (select 1 from pg_type where typname = 'announcement_audience') then
    create type public.announcement_audience as enum ('all', 'leaders', 'no_team', 'missing_profile');
  end if;
  if not exists (select 1 from pg_type where typname = 'announcement_variant') then
    create type public.announcement_variant as enum ('info', 'warning');
  end if;
end
$$;

alter table public.announcements
  add column if not exists channel     public.announcement_channel  not null default 'live',
  add column if not exists audience    public.announcement_audience not null default 'all',
  add column if not exists variant     public.announcement_variant  not null default 'info',
  add column if not exists href        text null,
  add column if not exists dismissible boolean not null default true,
  add column if not exists active      boolean not null default true,
  add column if not exists starts_at   timestamptz null,
  add column if not exists ends_at     timestamptz null;

-- Existing rows keep their meaning via the 'live' default.

alter table public.announcements
  drop constraint if exists announcements_window_ordered;
alter table public.announcements
  add constraint announcements_window_ordered
  check (starts_at is null or ends_at is null or ends_at > starts_at);

create index if not exists announcements_channel_active_idx
  on public.announcements (edition_slug, channel) where active;

-- sort_order is meaningful within a channel, but deliberately not unique: the
-- reorder endpoint renumbers rows one statement at a time, which would trip a
-- unique index halfway through.
create index if not exists announcements_order_idx
  on public.announcements (edition_slug, channel, sort_order);

-- ------------------------------------------------------------
-- Seed: the hardcoded "missing profile info" banner becomes a row.
-- The "you can now edit your team" banner is deliberately not migrated — it was
-- a one-off release note and is stale; that kind of notice is added from the
-- admin panel now.
-- ------------------------------------------------------------

insert into public.announcements (
  edition_slug, channel, audience, variant, body, href, dismissible, active, sort_order
)
select
  e.slug,
  'ops',
  'missing_profile',
  'warning',
  'Missing profile info — help us plan catering and workshops by filling in your dietary requirements and experience level.',
  '/ops/dashboard',
  true,
  true,
  coalesce(
    (select max(a.sort_order) + 1 from public.announcements a
     where a.edition_slug = e.slug and a.channel = 'ops'),
    1)
from public.editions e
where e.is_current
  and not exists (
    select 1 from public.announcements a
    where a.edition_slug = e.slug
      and a.channel = 'ops'
      and a.audience = 'missing_profile'
  );
