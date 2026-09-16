\set ON_ERROR_STOP on

-- Runs after 02-verify-editions.sql, which promoted '2027' to current and left
-- '2026' archived.

-- Existing ticker rows keep their meaning through the channel default.
select assert(
  (select bool_and(channel = 'live' and active and audience = 'all' and variant = 'info')
   from public.announcements where body = 'Lunch on floor 2'),
  'pre-existing announcements default to the live channel, active and info');

-- The seed targets whichever edition was current when the migration ran.
select assert(
  (select count(*) from public.announcements
   where channel = 'ops' and audience = 'missing_profile' and edition_slug = '2026') = 1,
  'the missing-profile banner was seeded for the then-current edition');

select assert(
  (select variant = 'warning' and dismissible and active and href = '/ops/dashboard'
   from public.announcements
   where channel = 'ops' and audience = 'missing_profile'),
  'the seeded banner is a dismissible warning linking to the dashboard');

select assert(
  not exists (
    select 1 from public.announcements where body ilike '%edit your team%'),
  'the stale team-edit banner was not migrated');

-- Re-running the migration must not duplicate the seed.
select assert(
  (select count(*) from public.announcements
   where channel = 'ops' and audience = 'missing_profile') = 1,
  'the seed is idempotent');

-- Window sanity is enforced by the database, not just the API.
do $$
begin
  begin
    insert into public.announcements (edition_slug, body, sort_order, starts_at, ends_at)
    values ('2027', 'backwards', 99, '2027-02-01T00:00:00Z', '2027-01-01T00:00:00Z');
    raise exception 'FAIL  a window ending before it starts was accepted';
  exception when check_violation then
    raise notice 'PASS  announcements_window_ordered rejects a backwards window';
  end;
end
$$;

-- An unbounded window is the normal case and must stay allowed.
insert into public.announcements (edition_slug, channel, body, sort_order)
values ('2027', 'site', 'Registration is open', 1);

select assert(
  (select starts_at is null and ends_at is null and active and dismissible
   from public.announcements where body = 'Registration is open'),
  'a new announcement defaults to active, dismissible and unbounded');

-- Announcements are owned config: deleting an emptied edition takes them with it.
select assert(
  (select confdeltype = 'c' from pg_constraint
   where conname = 'announcements_edition_slug_fkey'),
  'announcements cascade with their edition');

select 'ANNOUNCEMENT VERIFICATION COMPLETE' as result;
