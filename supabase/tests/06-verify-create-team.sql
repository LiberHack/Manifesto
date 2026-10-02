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

-- Copycat asks to join Atomic, then founds their own team: the pending request
-- must not survive, or approving it would move a leader out of their team.
insert into public.join_requests (id, participant_id, team_id, edition_slug)
select '66666666-2222-0000-0000-000000000001',
       '66666666-0000-0000-0000-000000000002', id, '2027'
from public.teams where name = 'Atomic' and edition_slug = '2027';

select public.create_team(
  '66666666-1111-0000-0000-000000000002', 'Copycat', '{}', null);

select assert(
  (select status = 'rejected' from public.join_requests
   where id = '66666666-2222-0000-0000-000000000001'),
  'create_team rejects the new leader''s pending join requests');

-- A third account asks to join Atomic, then joins Copycat some other way
-- (an invite) before the request is approved.
insert into auth.users (id, email) values
  ('66666666-0000-0000-0000-000000000003', 'drifter@example.com');
insert into public.registrations (id, participant_id, edition_slug) values
  ('66666666-1111-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003', '2027');

insert into public.join_requests (id, participant_id, team_id, edition_slug)
select '66666666-2222-0000-0000-000000000002',
       '66666666-0000-0000-0000-000000000003', id, '2027'
from public.teams where name = 'Atomic' and edition_slug = '2027';

update public.registrations
set team_id = (select id from public.teams where name = 'Copycat' and edition_slug = '2027')
where id = '66666666-1111-0000-0000-000000000003';

do $$
begin
  update public.join_requests set status = 'approved'
  where id = '66666666-2222-0000-0000-000000000002';
  raise exception 'FAIL  approval overwrote an existing membership';
exception when others then
  if sqlerrm not like '%already_in_team%' then raise; end if;
end;
$$;

select assert(
  (select t.name = 'Copycat'
   from public.registrations r join public.teams t on t.id = r.team_id
   where r.id = '66666666-1111-0000-0000-000000000003')
  and (select status = 'pending' from public.join_requests
       where id = '66666666-2222-0000-0000-000000000002'),
  'approving a request never overwrites a membership set since it was made');

set request.jwt.claim.sub = '66666666-0000-0000-0000-000000000002';
set role authenticated;

select assert(
  denied($$select public.create_team(
           '66666666-1111-0000-0000-000000000002', 'Direct', '{}', null)$$),
  'create_team is not callable by clients');

reset role;
reset request.jwt.claim.sub;

select 'CREATE TEAM VERIFICATION COMPLETE' as result;
