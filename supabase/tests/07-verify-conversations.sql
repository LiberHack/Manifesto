\set ON_ERROR_STOP on

-- Runs after 06 in the same session. From 06: team 'formers' (2027) is led by
-- r201 with members r202-r205 and r203 (six in total; r206 left), team
-- 'others' is led by r208, r207 is free. assert(), raises() and denied() exist.

create or replace function access_of(conv uuid, reg text) returns text
language sql as $$ select public.conversation_access(conv, reg::uuid) $$;

-- ── team conversations ──────────────────────────────────────────────────────
select assert(
  (select count(*) from public.conversations c join public.teams t on t.id = c.team_id
   where c.kind = 'team' and t.name in ('formers', 'others')) = 2,
  'every team has a team conversation, including teams created before this migration');

select assert(
  (select count(*) from public.conversations c join public.teams t on t.id = c.team_id
   where c.kind = 'team' and t.edition_slug = '2026') >= 1,
  'teams from archived editions were backfilled too');

create temporary table conv as
select
  (select c.id from public.conversations c join public.teams t on t.id = c.team_id
   where c.kind = 'team' and t.name = 'formers') as formers_team,
  (select c.id from public.conversations c join public.teams t on t.id = c.team_id
   where c.kind = 'team' and t.name = 'others') as others_team;

select assert(access_of((select formers_team from conv), '00000000-0000-0000-0000-000000000202') = 'write',
  'a member can write in the team conversation');
select assert(access_of((select formers_team from conv), '00000000-0000-0000-0000-000000000206') is null,
  'a former member loses access to the team conversation');
select assert(access_of((select formers_team from conv), '00000000-0000-0000-0000-000000000208') is null,
  'a non-member cannot see the team conversation');

-- ── request conversations ───────────────────────────────────────────────────
insert into public.join_requests (id, participant_id, team_id, edition_slug, message) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000107',
   (select id from public.teams where name = 'others'), '2027',
   'Hi! I can do data work and some frontend.');

create temporary table rconv as
select id from public.conversations where request_id = '00000000-0000-0000-0000-000000000401';

select assert(
  (select count(*) from public.conversation_messages
   where conversation_id = (select id from rconv)
     and author_id = '00000000-0000-0000-0000-000000000207'
     and body = 'Hi! I can do data work and some frontend.') = 1,
  'the required application message opens the request conversation');

select assert(access_of((select id from rconv), '00000000-0000-0000-0000-000000000207') = 'write'
  and access_of((select id from rconv), '00000000-0000-0000-0000-000000000208') = 'write',
  'applicant and leader can talk while the request is pending');
select assert(access_of((select id from rconv), '00000000-0000-0000-0000-000000000202') is null,
  'nobody else can read a request conversation');

-- A pre-migration request may have no message. A backfilled conversation still
-- needs to be visible and writable to its two parties.
insert into public.join_requests (id, participant_id, team_id, edition_slug) values
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000107',
   (select id from public.teams where name = 'formers'), '2027');
insert into public.conversations (edition_slug, kind, team_id, request_id)
values ('2027', 'request', (select id from public.teams where name = 'formers'),
        '00000000-0000-0000-0000-000000000403');
select assert(
  (select count(*) from public.conversation_messages m join public.conversations c
   on c.id = m.conversation_id where c.request_id = '00000000-0000-0000-0000-000000000403') = 0
  and (select public.conversation_access(c.id, '00000000-0000-0000-0000-000000000207') = 'write'
       from public.conversations c where c.request_id = '00000000-0000-0000-0000-000000000403')
  and (select public.conversation_access(c.id, '00000000-0000-0000-0000-000000000201') = 'write'
       from public.conversations c where c.request_id = '00000000-0000-0000-0000-000000000403'),
  'a pending request with no message still grants conversation access');

insert into public.join_requests (id, participant_id, team_id, edition_slug, kind, invited_by, message) values
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000105',
   (select id from public.teams where name = 'formers'), '2027', 'invitation',
   '00000000-0000-0000-0000-000000000201', 'Would you like to join our team?');
select assert(
  (select count(*) from public.conversation_messages m join public.conversations c
   on c.id = m.conversation_id where c.request_id = '00000000-0000-0000-0000-000000000404'
   and m.author_id = '00000000-0000-0000-0000-000000000201') = 1,
  'an invitation opens with a message authored by invited_by');

-- Blocking turns a pending request conversation read-only.
insert into public.participant_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000107');
select assert(access_of((select id from rconv), '00000000-0000-0000-0000-000000000207') = 'read',
  'a block stops further messages in a pending request conversation');
delete from public.participant_blocks;

-- Leadership moves: access follows the current leader only.
select public.create_team('00000000-0000-0000-0000-000000000206', 'handover', '{}', null);
insert into public.join_requests (id, participant_id, team_id, edition_slug, message) values
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000107',
   (select id from public.teams where name = 'handover'), '2027',
   'Would you take a data person as well?');
-- r207 joins 'handover' via an invite link, then becomes leader.
update public.join_requests set status = 'withdrawn', close_reason = 'withdrawn'
where id = '00000000-0000-0000-0000-000000000401';
select public.decide_join_request('00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000206', 'approve');
update public.teams set leader_id = '00000000-0000-0000-0000-000000000207'
where name = 'handover';

create temporary table hconv as
select id from public.conversations where request_id = '00000000-0000-0000-0000-000000000402';

select assert(access_of((select id from hconv), '00000000-0000-0000-0000-000000000206') is null,
  'a former leader loses access to the team''s request conversations');
select assert(access_of((select id from hconv), '00000000-0000-0000-0000-000000000207') = 'read',
  'a resolved request conversation is read-only history');

select assert(access_of((select id from rconv), '00000000-0000-0000-0000-000000000207') is null,
  'an applicant who joined elsewhere loses access to the old request conversation');

-- ── unread counts ───────────────────────────────────────────────────────────
insert into public.conversation_messages (conversation_id, author_id, body) values
  ((select formers_team from conv), '00000000-0000-0000-0000-000000000201', 'Welcome all'),
  ((select formers_team from conv), '00000000-0000-0000-0000-000000000201', 'Standup at 10');

select assert(
  (select unread from public.list_conversations('00000000-0000-0000-0000-000000000202')
   where conversation_id = (select formers_team from conv)) = 2,
  'unread counts messages from others');
select assert(
  (select unread from public.list_conversations('00000000-0000-0000-0000-000000000201')
   where conversation_id = (select formers_team from conv)) = 0,
  'your own messages are never unread');

insert into public.conversation_reads (conversation_id, registration_id, last_read_message_id)
values ((select formers_team from conv), '00000000-0000-0000-0000-000000000202',
        (select max(id) from public.conversation_messages where conversation_id = (select formers_team from conv)));

select assert(
  (select unread from public.list_conversations('00000000-0000-0000-0000-000000000202')
   where conversation_id = (select formers_team from conv)) = 0,
  'reading up to the last message clears the unread count');

select assert(
  not exists (select 1 from public.list_conversations('00000000-0000-0000-0000-000000000206')
              where conversation_id = (select formers_team from conv)),
  'a former member does not see the team conversation in their list');

-- ── archived editions are read-only ─────────────────────────────────────────
select assert(
  (select public.conversation_access(c.id, r.id)
   from public.conversations c
   join public.teams t on t.id = c.team_id
   join public.registrations r on r.team_id = t.id
   where c.kind = 'team' and t.edition_slug = '2026'
   limit 1) = 'read',
  'conversations of an archived edition are read-only');

-- ── organizer-assisted formation ────────────────────────────────────────────
do $$
declare
  i int;
  uid uuid;
begin
  for i in 1..3 loop
    uid := ('00000000-0000-0000-0000-00000000050' || i)::uuid;
    insert into auth.users (id, email, raw_user_meta_data)
    values (uid, format('prop%s@example.com', i), jsonb_build_object('name', format('Prop %s', i)));
    insert into public.registrations (id, participant_id, edition_slug)
    values (('00000000-0000-0000-0000-00000000060' || i)::uuid, uid, '2027');
  end loop;
end
$$;

insert into public.team_proposals (id, edition_slug, name, note) values
  ('00000000-0000-0000-0000-000000000701', '2027', 'assisted', repeat('x', 500)),
  ('00000000-0000-0000-0000-000000000702', '2027', 'declined', null);
insert into public.team_proposal_members (proposal_id, registration_id, position) values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000601', 1),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000602', 2),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000603', 1),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000602', 2);

select public.respond_to_proposal('00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000601', true);

select assert(
  (select status = 'open' from public.team_proposals where id = '00000000-0000-0000-0000-000000000701')
  and (select team_id is null from public.registrations where id = '00000000-0000-0000-0000-000000000601'),
  'nobody is placed in a proposed team until every member accepts');

select public.respond_to_proposal('00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000602', true);

select assert(
  (select status = 'formed' from public.team_proposals where id = '00000000-0000-0000-0000-000000000701')
  and (select role = 'leader' from public.registrations where id = '00000000-0000-0000-0000-000000000601')
  and (select team_id = (select team_id from public.team_proposals
                         where id = '00000000-0000-0000-0000-000000000701')
       from public.registrations where id = '00000000-0000-0000-0000-000000000602')
  and (select t.description is null from public.teams t join public.team_proposals p
       on p.team_id = t.id where p.id = '00000000-0000-0000-0000-000000000701'),
  'a proposal with a 500-character note forms a team without copying its note');

do $$
declare
  team_conversation uuid;
  i int;
begin
  select c.id into team_conversation from public.conversations c
  join public.team_proposals p on p.team_id = c.team_id
  where p.id = '00000000-0000-0000-0000-000000000701' and c.kind = 'team';
  for i in 1..10 loop
    perform public.send_message(team_conversation,
      '00000000-0000-0000-0000-000000000601', 'Rate limit check', 10, 200);
  end loop;
end
$$;
select assert(
  raises($$select public.send_message(
    (select c.id from public.conversations c join public.team_proposals p on p.team_id = c.team_id
     where p.id = '00000000-0000-0000-0000-000000000701' and c.kind = 'team'),
    '00000000-0000-0000-0000-000000000601', 'Eleventh message', 10, 200)$$,
    'send_rate_limited')
  and (select count(*) from public.conversation_messages
       where author_id = '00000000-0000-0000-0000-000000000601') = 10,
  'send_message refuses the eleventh message in a minute');

select assert(
  (select count(*) filter (where me.source = 'organizer') = count(*) and count(*) =
          (select count(*) from public.team_proposal_members
           where proposal_id = '00000000-0000-0000-0000-000000000701')
   from public.team_proposal_members m
   join public.team_proposals p on p.id = m.proposal_id
   join public.membership_events me
     on me.registration_id = m.registration_id and me.team_id = p.team_id and me.event = 'joined'
   where m.proposal_id = '00000000-0000-0000-0000-000000000701'),
  'every member joined through a proposal, its leader included, is attributed to the organizers');

select assert(
  (select r.role = 'leader' and r.team_id = t.id
   from public.team_proposals p
   join public.teams t on t.id = p.team_id
   join public.registrations r on r.id = t.leader_id
   where p.id = '00000000-0000-0000-0000-000000000701'),
  'the first proposed member leads the formed team and is in it');

select public.respond_to_proposal('00000000-0000-0000-0000-000000000702',
  '00000000-0000-0000-0000-000000000603', false);
select assert(
  (select status = 'cancelled' from public.team_proposals where id = '00000000-0000-0000-0000-000000000702'),
  'any decline cancels the proposal');
select assert(
  raises($$select public.respond_to_proposal('00000000-0000-0000-0000-000000000702',
           '00000000-0000-0000-0000-000000000602', true)$$, 'proposal_closed'),
  'a cancelled proposal cannot be accepted');

-- ── privacy ─────────────────────────────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000102';
set role authenticated;
select assert(denied($$select * from public.conversation_messages$$),
  'messages are not directly readable');
select assert(denied($$select * from public.participant_blocks$$),
  'blocks are not directly readable');
select assert(
  raises($$select public.list_conversations('00000000-0000-0000-0000-000000000202')$$,
         'permission denied for function list_conversations'),
  'list_conversations is server-only');
select assert(
  raises($$select public.send_message(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000202', 'No direct calls', 10, 200)$$,
    'permission denied for function send_message'),
  'send_message is not callable by authenticated');
reset role;
reset request.jwt.claim.sub;

select 'CONVERSATION VERIFICATION COMPLETE' as result;
