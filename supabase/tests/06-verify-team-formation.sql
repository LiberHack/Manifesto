\set ON_ERROR_STOP on

-- Runs after 02-05 in the same session: '2027' is current, `assert()` exists.
-- Registrations r1..r8 are fresh 2027 participants; r1 founds a team.

create or replace function raises(stmt text, expected text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return sqlerrm = expected;
end;
$$;

do $$
declare
  i int;
  uid uuid;
begin
  for i in 1..8 loop
    uid := ('00000000-0000-0000-0000-00000000010' || i)::uuid;
    insert into auth.users (id, email, raw_user_meta_data)
    values (uid, format('tf%s@example.com', i), jsonb_build_object('name', format('TF %s', i)));
    insert into public.registrations (id, participant_id, edition_slug)
    values (('00000000-0000-0000-0000-00000000020' || i)::uuid, uid, '2027');
  end loop;
end
$$;

-- ── create_team ─────────────────────────────────────────────────────────────
select public.create_team('00000000-0000-0000-0000-000000000201', 'formers', '{Rust}', null);

select assert(
  (select role = 'leader' and team_id = (select id from public.teams where name = 'formers')
   from public.registrations where id = '00000000-0000-0000-0000-000000000201'),
  'create_team makes the founder a leading member');

select assert(
  (select source = 'founded' from public.membership_events
   where registration_id = '00000000-0000-0000-0000-000000000201' and event = 'joined'),
  'founding is recorded as a membership event');

select assert(
  raises($$select public.create_team('00000000-0000-0000-0000-000000000201', 'second', '{}', null)$$,
         'already_in_team'),
  'a member cannot found a second team');

-- A second team for the joined_other_team check.
select public.create_team('00000000-0000-0000-0000-000000000208', 'others', '{}', null);

-- ── applications ────────────────────────────────────────────────────────────
select assert(
  raises($$insert into public.join_requests (participant_id, team_id, edition_slug, message)
           values ('00000000-0000-0000-0000-000000000102',
                   (select id from public.teams where name = 'formers'), '2027', 'too short')$$,
         'new row for relation "join_requests" violates check constraint "join_requests_message_length"'),
  'an application message must be at least 20 characters');

insert into public.join_requests (id, participant_id, team_id, edition_slug, message) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000102',
   (select id from public.teams where name = 'formers'), '2027', 'I would love to build the backend with you.'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000102',
   (select id from public.teams where name = 'others'), '2027', 'Also keen on this one, happy to help anywhere.');

select assert(
  raises($$select public.decide_join_request('00000000-0000-0000-0000-000000000301',
           '00000000-0000-0000-0000-000000000203', 'approve')$$, 'not_team_leader'),
  'only the team leader can approve an application');

select public.decide_join_request('00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201', 'approve');

select assert(
  (select team_id = (select id from public.teams where name = 'formers')
   from public.registrations where id = '00000000-0000-0000-0000-000000000202'),
  'approving an application adds the applicant to the team');

select assert(
  (select status = 'approved' and decided_at is not null
   from public.join_requests where id = '00000000-0000-0000-0000-000000000301'),
  'the approved request records its decision time');

select assert(
  (select source = 'application' and request_id = '00000000-0000-0000-0000-000000000301'
   from public.membership_events
   where registration_id = '00000000-0000-0000-0000-000000000202' and event = 'joined'),
  'the join is attributed to the application');

select assert(
  (select status = 'rejected' and close_reason = 'joined_other_team'
   from public.join_requests where id = '00000000-0000-0000-0000-000000000302'),
  'joining one team closes other requests as joined_other_team, not as a rejection');

-- ── withdrawal and leader rejection ─────────────────────────────────────────
insert into public.join_requests (id, participant_id, team_id, edition_slug, message) values
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000103',
   (select id from public.teams where name = 'formers'), '2027', 'Designer here, would like to join you.');

select assert(
  raises($$select public.decide_join_request('00000000-0000-0000-0000-000000000303',
           '00000000-0000-0000-0000-000000000201', 'withdraw')$$, 'not_sender'),
  'a leader cannot withdraw someone else''s application');

select public.decide_join_request('00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000203', 'withdraw');

select assert(
  (select status = 'withdrawn' and close_reason = 'withdrawn'
   from public.join_requests where id = '00000000-0000-0000-0000-000000000303'),
  'an applicant can withdraw their application');

-- ── invitations ─────────────────────────────────────────────────────────────
insert into public.join_requests (id, participant_id, team_id, edition_slug, kind, invited_by, source, message) values
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000104',
   (select id from public.teams where name = 'formers'), '2027', 'invitation',
   '00000000-0000-0000-0000-000000000201', 'direct_invite', 'We need a frontend person, interested?');

select assert(
  raises($$select public.decide_join_request('00000000-0000-0000-0000-000000000304',
           '00000000-0000-0000-0000-000000000201', 'approve')$$, 'wrong_kind'),
  'a leader cannot approve their own invitation on the invitee''s behalf');

select assert(
  raises($$select public.decide_join_request('00000000-0000-0000-0000-000000000304',
           null, 'accept')$$, 'not_invitee'),
  'nobody but the invitee can accept an invitation');

select public.decide_join_request('00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000204', 'accept');

select assert(
  (select source = 'direct_invite' from public.membership_events
   where registration_id = '00000000-0000-0000-0000-000000000204' and event = 'joined'),
  'an accepted invitation is attributed to a direct invite');

insert into public.join_requests (id, participant_id, team_id, edition_slug, kind, invited_by, message) values
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000105',
   (select id from public.teams where name = 'formers'), '2027', 'invitation',
   '00000000-0000-0000-0000-000000000201', 'We need a frontend person, interested?');

select public.decide_join_request('00000000-0000-0000-0000-000000000305',
  '00000000-0000-0000-0000-000000000205', 'decline');

select assert(
  (select status = 'rejected' and close_reason = 'invitee_declined'
   from public.join_requests where id = '00000000-0000-0000-0000-000000000305'),
  'a declined invitation is distinguishable from a leader rejection');

-- ── expiry ──────────────────────────────────────────────────────────────────
insert into public.join_requests (id, participant_id, team_id, edition_slug, message, expires_at) values
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000105',
   (select id from public.teams where name = 'formers'), '2027',
   'Changed my mind, would like to join after all.', now() - interval '1 minute');

select assert(
  (select (public.decide_join_request('00000000-0000-0000-0000-000000000306',
     '00000000-0000-0000-0000-000000000201', 'approve')).status = 'expired'),
  'an expired request cannot be approved and is closed as expired');

select assert(
  (select team_id is null from public.registrations where id = '00000000-0000-0000-0000-000000000205'),
  'approving an expired request adds nobody');

select assert(
  (select expires_at is not null from public.join_requests where id = '00000000-0000-0000-0000-000000000301')
  and (select count(*) from public.join_requests where expires_at is null) > 0,
  'new requests expire by default; requests that predate expiry do not');

-- ── capacity ────────────────────────────────────────────────────────────────
select public.join_team('00000000-0000-0000-0000-000000000205',
  (select id from public.teams where name = 'formers'), 'organizer');
select public.join_team('00000000-0000-0000-0000-000000000206',
  (select id from public.teams where name = 'formers'), 'organizer');

insert into public.join_requests (id, participant_id, team_id, edition_slug, message) values
  ('00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000107',
   (select id from public.teams where name = 'formers'), '2027', 'Is there still space for a data person?');

select assert(
  (select count(*) from public.registrations
   where team_id = (select id from public.teams where name = 'formers')) = 5,
  'the team has five members before the last seat');

-- r3 withdrew earlier and is free; they take the sixth seat.
select public.join_team('00000000-0000-0000-0000-000000000203',
  (select id from public.teams where name = 'formers'), 'invite_link');

select assert(
  (select status = 'rejected' and close_reason = 'team_full'
   from public.join_requests where id = '00000000-0000-0000-0000-000000000307'),
  'filling the last seat closes the team''s other open requests as team_full');

select assert(
  raises($$select public.join_team('00000000-0000-0000-0000-000000000207',
           (select id from public.teams where name = 'formers'), 'invite_link')$$, 'team_full'),
  'a seventh member is refused');

-- ── history and privacy ─────────────────────────────────────────────────────
update public.registrations set team_id = null, role = 'participant'
where id = '00000000-0000-0000-0000-000000000206';

select assert(
  (select count(*) from public.membership_events
   where registration_id = '00000000-0000-0000-0000-000000000206' and event = 'left') = 1,
  'leaving a team is recorded');

insert into public.registration_contacts (registration_id, method, handle)
values ('00000000-0000-0000-0000-000000000201', 'telegram', '@former');

select assert(
  raises($$insert into public.registration_contacts (registration_id, method)
           values ('00000000-0000-0000-0000-000000000202', 'signal')$$,
         'new row for relation "registration_contacts" violates check constraint "registration_contacts_handle_required"'),
  'a contact method other than email-only needs a handle');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';
set role authenticated;

select assert(denied($$select * from public.registration_contacts$$),
  'contacts are not directly readable, even one''s own');
select assert(denied($$select * from public.membership_events$$),
  'membership history is not directly readable');
select assert(
  denied($$select public.join_team('00000000-0000-0000-0000-000000000201',
           (select id from public.teams limit 1), 'organizer')$$)
  or raises($$select public.join_team('00000000-0000-0000-0000-000000000201',
           '00000000-0000-0000-0000-000000000000', 'organizer')$$,
           'permission denied for function join_team'),
  'join_team is not callable by clients');
select assert(
  raises($$select public.decide_join_request('00000000-0000-0000-0000-000000000301', null, 'approve')$$,
         'permission denied for function decide_join_request'),
  'decide_join_request is not callable by clients');

reset role;
reset request.jwt.claim.sub;

select 'TEAM FORMATION VERIFICATION COMPLETE' as result;
