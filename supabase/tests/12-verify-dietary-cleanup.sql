\set ON_ERROR_STOP on

-- Runs after scripts/test-migrations.sh has applied
-- supabase/manual/20261001_cleanup_dietary_copies.sql with -v confirm=yes.

select assert(
  not exists (select 1 from auth.users where raw_user_meta_data ? 'dietary'),
  'no dietary data is left in auth metadata');

select assert(
  not exists (select 1 from public.participants where dietary is not null)
  and not exists (select 1 from public.registrations where dietary is not null),
  'the old dietary columns are empty');

select assert(
  (select raw_user_meta_data = '{"name":"Legacy","skills":["Go"]}'::jsonb
   from auth.users where id = 'a0000000-0000-0000-0000-000000000009'),
  'the cleanup removes only the dietary key from metadata');

select assert(
  (select count(*) from public.registration_catering c
   join public.registrations r on r.id = c.registration_id
   where r.participant_id in ('a0000000-0000-0000-0000-000000000001',
                              'a0000000-0000-0000-0000-000000000005')) = 2
  and exists (select 1 from public.registration_catering where note = 'halal'),
  'the restricted catering records are untouched');

select 'DIETARY CLEANUP VERIFICATION COMPLETE' as result;
