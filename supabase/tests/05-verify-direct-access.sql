\set ON_ERROR_STOP on

-- Runs after 02-04 in the same session; `assert()` is already defined.
-- Ada (1111…) leads fsociety in the archived 2026 edition; Linus (2222…) is a
-- plain participant. Each check impersonates a signed-in PostgREST caller.

create or replace function denied(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

select assert(
  denied($$update public.participants set role = 'admin'
           where id = '22222222-2222-2222-2222-222222222222'$$),
  'a user cannot set role = admin on their own participants row');

select assert(
  (select count(*) from public.participants) = 1,
  'a user reads only their own participants row');

select assert(
  denied($$select invite_code from public.teams$$),
  'teams, and their invite codes, are not directly readable');

select assert(
  denied($$insert into public.registrations (participant_id, edition_slug)
           values ('22222222-2222-2222-2222-222222222222', '2027')$$),
  'registrations cannot be written directly');

select assert(
  denied($$insert into public.join_requests (participant_id, team_id, status)
           values ('22222222-2222-2222-2222-222222222222',
                   'aaaaaaaa-0000-0000-0000-000000000001', 'pending')$$),
  'join requests cannot be written directly');

select assert(
  not denied($$select count(*) from public.join_requests$$),
  'a user can still read their own join requests');

select assert(
  denied($$select public.rotate_team_invite_code('aaaaaaaa-0000-0000-0000-000000000001')$$),
  'rotate_team_invite_code is not callable by clients');

select assert(
  (select count(*) from public.join_requests
   where participant_id <> '22222222-2222-2222-2222-222222222222') = 0,
  'a user cannot read other people''s join requests');

select assert(
  (select count(*) from public.registrations
   where participant_id <> '22222222-2222-2222-2222-222222222222') = 0,
  'a user cannot read other people''s registrations');

select assert(
  denied($$insert into public.skills (name) values ('Bypass Skill')$$),
  'skills cannot be written directly (cap and attribution are server-side)');

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select assert(
  denied($$delete from public.teams where name = 'fsociety'$$),
  'a former leader cannot delete their archived team directly');

reset role;
reset request.jwt.claim.sub;

-- New-skill allowance: enforced where the rows are written, so concurrent
-- profile saves cannot each pass the server's count and add 5 apiece.
select public.add_skills_to_catalogue(
  array['E2e One', 'E2e Two', 'E2e Three', 'E2e Four', 'E2e Five', 'E2e Six', 'E2e Seven'],
  '22222222-2222-2222-2222-222222222222');
select public.add_skills_to_catalogue(array['E2e Eight'], '22222222-2222-2222-2222-222222222222');
select assert(
  (select count(*) from public.skills where created_by = '22222222-2222-2222-2222-222222222222') = 5,
  'one account adds at most 5 skills to the catalogue, however many calls');
select assert(
  public.add_skills_to_catalogue(array['e2e one'], '11111111-1111-1111-1111-111111111111') = 0
  and (select count(*) from public.skills where lower(name) = 'e2e one') = 1,
  'a skill already in the catalogue (any case) is neither duplicated nor charged');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select assert(
  denied($$select public.add_skills_to_catalogue(array['Bypass'], '22222222-2222-2222-2222-222222222222')$$),
  'add_skills_to_catalogue is not callable by clients');
reset role;
reset request.jwt.claim.sub;

select 'DIRECT ACCESS VERIFICATION COMPLETE' as result;
