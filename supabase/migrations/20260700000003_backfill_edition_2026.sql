-- supabase/migrations/20260700000003_backfill_edition_2026.sql

-- 1. Update the 2026 edition row with real dates from event_config
--    (row was pre-seeded as 'draft' by migration 02 to satisfy FK)
update public.editions
set
  name       = ec.event_name,
  starts_at  = ec.event_start,
  ends_at    = ec.event_end,
  status     = 'live',
  is_current = true
from public.event_config ec
where editions.slug = '2026'
  and ec.edition_slug = '2026';

-- 2. event_config: drop the temporary default now that backfill is done
alter table public.event_config alter column edition_slug drop default;

-- 3. Backfill schedule_items + announcements
update public.schedule_items set edition_slug = '2026' where edition_slug is null;
update public.announcements  set edition_slug = '2026' where edition_slug is null;

-- 4. Backfill teams
update public.teams set edition_slug = '2026' where edition_slug is null;

-- 5. Backfill join_requests
update public.join_requests set edition_slug = '2026' where edition_slug is null;

-- 6. Create registrations from existing participants
--    participant_role enum has values: participant, admin
--    leadership is tracked via teams.leader_id (not via role)
insert into public.registrations (
  participant_id, edition_slug, role, team_id, skills, dietary, experience, public
)
select
  p.id,
  '2026',
  coalesce(p.role, 'participant')::public.participant_role,
  p.team_id,
  p.skills,
  p.dietary,
  p.experience,
  true
from public.participants p
on conflict (participant_id, edition_slug) do nothing;

-- 7. Tighten NOT NULL now backfill is complete
alter table public.teams        alter column edition_slug set not null;
alter table public.join_requests alter column edition_slug set not null;
alter table public.schedule_items alter column edition_slug set not null;
alter table public.announcements  alter column edition_slug set not null;

-- 8. Unique team name per edition (case-insensitive)
create unique index teams_unique_name_per_edition
  on public.teams (edition_slug, lower(name));
