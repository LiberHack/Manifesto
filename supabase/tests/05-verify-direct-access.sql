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
  denied($$select public.rotate_team_invite_code('aaaaaaaa-0000-0000-0000-000000000001')$$),
  'rotate_team_invite_code is not callable by clients');

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select assert(
  denied($$delete from public.teams where name = 'fsociety'$$),
  'a former leader cannot delete their archived team directly');

reset role;
reset request.jwt.claim.sub;

select 'DIRECT ACCESS VERIFICATION COMPLETE' as result;
