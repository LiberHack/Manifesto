\set ON_ERROR_STOP on

-- Runs after 02-05 in the same session; `assert()` and `denied()` are already
-- defined and 2027 is the current edition.

insert into auth.users (id, email) values
  ('66666666-0000-0000-0000-000000000001', 'founder@example.com'),
  ('66666666-0000-0000-0000-000000000002', 'copycat@example.com');

insert into public.registrations (id, participant_id, edition_slug) values
  ('66666666-1111-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '2027'),
  ('66666666-1111-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', '2027');

select public.create_team(
  '66666666-1111-0000-0000-000000000001', 'Atomic', '{Rust}', null);

select assert(
  (select r.team_id = t.id and r.role = 'leader' and t.edition_slug = '2027'
   from public.registrations r
   join public.teams t on t.leader_id = r.id
   where r.id = '66666666-1111-0000-0000-000000000001'),
  'create_team creates the team and makes the caller its leading member');

do $$
begin
  perform public.create_team(
    '66666666-1111-0000-0000-000000000001', 'Second', '{}', null);
  raise exception 'FAIL  create_team accepted a caller already in a team';
exception when others then
  if sqlerrm not like '%already_in_team%' then raise; end if;
end;
$$;

select assert(
  not exists (select 1 from public.teams where name = 'Second'),
  'create_team refuses a caller already in a team and leaves no team behind');

do $$
begin
  perform public.create_team(
    '66666666-1111-0000-0000-000000000002', 'Atomic', '{}', null);
  raise exception 'FAIL  create_team accepted a duplicate team name';
exception when unique_violation then
  null;
end;
$$;

select assert(
  (select team_id is null and role = 'participant'
   from public.registrations where id = '66666666-1111-0000-0000-000000000002'),
  'a failed create_team leaves the caller''s registration untouched');

set request.jwt.claim.sub = '66666666-0000-0000-0000-000000000002';
set role authenticated;

select assert(
  denied($$select public.create_team(
           '66666666-1111-0000-0000-000000000002', 'Direct', '{}', null)$$),
  'create_team is not callable by clients');

reset role;
reset request.jwt.claim.sub;

select 'CREATE TEAM VERIFICATION COMPLETE' as result;
