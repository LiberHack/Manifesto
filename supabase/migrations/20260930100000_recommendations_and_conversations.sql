-- ============================================================
-- Team formation, phase 2: recommendations, organizer-assisted formation
-- and on-platform conversations.
-- See docs/superpowers/plans/2026-09-29-team-formation-and-attendance.md.
--
-- As in phase 1, every table is closed to anon/authenticated and every
-- function is server-only; Nitro enforces authorization and calls in with the
-- service role. conversation_access() is the single definition of who may
-- read or write a conversation.
-- ============================================================

-- ------------------------------------------------------------
-- Recommendations
-- ------------------------------------------------------------

-- A solo participant hiding a suggested team (candidate_id NULL), or a team
-- hiding a suggested candidate (candidate_id set). Team-side dismissals belong
-- to the team, so they survive a change of leader.
create table public.recommendation_dismissals (
  id bigint generated always as identity primary key,
  edition_slug text not null references public.editions (slug) on update cascade,
  dismissed_by uuid not null references public.registrations (id) on delete cascade,
  team_id uuid not null,
  candidate_id uuid references public.registrations (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (edition_slug, team_id) references public.teams (edition_slug, id) on delete cascade
);

create unique index recommendation_dismissals_team_side
  on public.recommendation_dismissals (team_id, candidate_id) where candidate_id is not null;
create unique index recommendation_dismissals_person_side
  on public.recommendation_dismissals (dismissed_by, team_id) where candidate_id is null;

-- Every suggestion shown, for measuring whether recommendations lead to
-- requests. Never holds message text or private fields.
create table public.recommendation_exposures (
  id bigint generated always as identity primary key,
  edition_slug text not null references public.editions (slug) on update cascade,
  viewer_id uuid not null references public.registrations (id) on delete cascade,
  team_id uuid not null,
  candidate_id uuid references public.registrations (id) on delete cascade,
  score numeric(4, 3),
  rank smallint not null,
  shown_at timestamptz not null default now()
);

create index recommendation_exposures_viewer_idx
  on public.recommendation_exposures (viewer_id, shown_at desc);
create index recommendation_exposures_candidate_idx
  on public.recommendation_exposures (candidate_id, shown_at desc);

-- Identity-level: a block carries across editions. Either direction stops
-- new applications, invitations and request messages between the two.
create table public.participant_blocks (
  blocker_id uuid not null references public.participants (id) on delete cascade,
  blocked_id uuid not null references public.participants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.participant_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- "Ask the organizers for help" from a participant without a team.
alter table public.registrations
  add column organizer_help_requested_at timestamptz;

-- ------------------------------------------------------------
-- Organizer-assisted formation: an organizer proposes a new team; it only
-- forms once every proposed member has accepted. No silent assignment.
-- ------------------------------------------------------------

create type public.proposal_status as enum ('open', 'formed', 'cancelled');
create type public.proposal_response as enum ('pending', 'accepted', 'declined');

create table public.team_proposals (
  id uuid primary key default gen_random_uuid(),
  edition_slug text not null references public.editions (slug) on update cascade,
  name varchar(32) not null,
  note varchar(500),
  status public.proposal_status not null default 'open',
  created_by uuid references public.participants (id) on delete set null,
  team_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.team_proposal_members (
  proposal_id uuid not null references public.team_proposals (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  -- Listing order; the first member leads the formed team.
  position smallint not null,
  response public.proposal_response not null default 'pending',
  responded_at timestamptz,
  primary key (proposal_id, registration_id)
);

-- Record a member's answer; when the last member accepts, form the team with
-- the first-listed member as leader and everyone else joined through
-- join_team (source 'organizer'). Any decline cancels the proposal.
create or replace function public.respond_to_proposal(
  p_proposal uuid,
  p_registration uuid,
  p_accept boolean
)
returns public.team_proposals
language plpgsql
as $$
declare
  prop public.team_proposals;
  member record;
  leader uuid;
  created public.teams;
begin
  select * into prop from public.team_proposals where id = p_proposal for update;
  if not found then
    raise exception 'proposal_not_found';
  end if;
  if prop.status <> 'open' then
    raise exception 'proposal_closed';
  end if;

  update public.team_proposal_members
  set response = case when p_accept then 'accepted'::public.proposal_response
                      else 'declined'::public.proposal_response end,
      responded_at = now()
  where proposal_id = p_proposal and registration_id = p_registration and response = 'pending';
  if not found then
    raise exception 'not_proposed_member';
  end if;

  if not p_accept then
    update public.team_proposals set status = 'cancelled', decided_at = now()
    where id = p_proposal returning * into prop;
    return prop;
  end if;

  if exists (
    select 1 from public.team_proposal_members
    where proposal_id = p_proposal and response <> 'accepted'
  ) then
    return prop;
  end if;

  -- Everyone accepted. Membership rules are re-checked by join_team; if any
  -- member joined another team meanwhile, the whole formation rolls back.
  select registration_id into leader
  from public.team_proposal_members where proposal_id = p_proposal
  order by position limit 1;

  -- The note (up to 500 characters) explains the proposal to its members; it
  -- stays on the proposal rather than becoming the 200-character description.
  created := public.create_team(leader, prop.name, '{}', null);

  for member in
    select registration_id from public.team_proposal_members
    where proposal_id = p_proposal and registration_id <> leader
  loop
    perform public.join_team(member.registration_id, created.id, 'organizer');
  end loop;

  update public.team_proposals
  set status = 'formed', team_id = created.id, decided_at = now()
  where id = p_proposal
  returning * into prop;

  return prop;
end;
$$;

-- ------------------------------------------------------------
-- Conversations
-- ------------------------------------------------------------

create type public.conversation_kind as enum ('request', 'team');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  edition_slug text not null references public.editions (slug) on update cascade,
  kind public.conversation_kind not null,
  team_id uuid not null,
  request_id uuid unique references public.join_requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (edition_slug, team_id) references public.teams (edition_slug, id) on delete cascade,
  check ((kind = 'request') = (request_id is not null))
);

create unique index conversations_one_per_team
  on public.conversations (team_id) where kind = 'team';

create table public.conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Deleting an account removes its messages with it.
  author_id uuid not null references public.registrations (id) on delete cascade,
  body varchar(2000) not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  -- Set by an organizer resolving a report; the text stays for the audit trail
  -- but is no longer served to participants.
  hidden_at timestamptz
);

create index conversation_messages_conversation_idx
  on public.conversation_messages (conversation_id, id desc);
create index conversation_messages_author_recent_idx
  on public.conversation_messages (author_id, created_at desc);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  last_read_message_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, registration_id)
);

create type public.report_status as enum ('open', 'resolved');

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id bigint references public.conversation_messages (id) on delete set null,
  reporter_id uuid references public.registrations (id) on delete set null,
  reason varchar(1000) not null,
  status public.report_status not null default 'open',
  resolved_by uuid references public.participants (id) on delete set null,
  resolved_at timestamptz,
  resolution_note varchar(1000),
  created_at timestamptz not null default now()
);

create index conversation_reports_status_idx on public.conversation_reports (status, created_at);

-- Who may do what in a conversation, as 'write', 'read' or NULL (no access).
--
-- Team conversation: current members read and write. New members see the
-- whole history (disclosed in the UI); people who leave lose access.
--
-- Request conversation (application or invitation): while the request is
-- pending, the applicant/invitee and the *current* team leader read and
-- write, unless either has blocked the other (then read only). Once resolved
-- it is read-only history for the current leader, and for the applicant only
-- if they joined this team. A former leader, or an applicant who was turned
-- down or joined elsewhere, keeps nothing merely because the request exists.
--
-- Only the current edition is writable; archived editions are read-only.
create or replace function public.conversation_access(
  p_conversation uuid,
  p_registration uuid
)
returns text
language plpgsql
stable
as $$
declare
  conv record;
  reg record;
  req record;
  leader_reg uuid;
  current_edition boolean;
  is_leader boolean;
  is_party boolean;
  mode text;
begin
  select c.*, e.is_current into conv
  from public.conversations c
  join public.editions e on e.slug = c.edition_slug
  where c.id = p_conversation;
  if not found then
    return null;
  end if;

  select id, participant_id, team_id, edition_slug into reg
  from public.registrations where id = p_registration;
  if not found or reg.edition_slug <> conv.edition_slug then
    return null;
  end if;

  current_edition := conv.is_current;

  if conv.kind = 'team' then
    if reg.team_id is distinct from conv.team_id then
      return null;
    end if;
    return case when current_edition then 'write' else 'read' end;
  end if;

  select status, participant_id into req from public.join_requests where id = conv.request_id;
  select leader_id into leader_reg from public.teams where id = conv.team_id;
  is_leader := leader_reg = reg.id;
  is_party := req.participant_id = reg.participant_id;

  if req.status = 'pending' then
    if not (is_leader or is_party) then
      return null;
    end if;
    mode := 'write';
    if public.is_blocked(
      req.participant_id,
      (select participant_id from public.registrations where id = leader_reg)
    ) then
      mode := 'read';
    end if;
  elsif is_leader or (is_party and reg.team_id = conv.team_id) then
    mode := 'read';
  else
    return null;
  end if;

  return case when current_edition then mode else 'read' end;
end;
$$;

-- Team conversations exist from the moment a team does; request
-- conversations start with the request's required message.
create or replace function public.create_team_conversation()
returns trigger
language plpgsql
as $$
begin
  insert into public.conversations (edition_slug, kind, team_id)
  values (new.edition_slug, 'team', new.id);
  return new;
end;
$$;

create trigger create_team_conversation
  after insert on public.teams
  for each row
  execute function public.create_team_conversation();

create or replace function public.create_request_conversation()
returns trigger
language plpgsql
as $$
declare
  conv uuid;
  author uuid;
begin
  -- Requests from before messages were required have nothing to start with.
  if new.message is null then
    return new;
  end if;

  if new.kind = 'invitation' then
    author := new.invited_by;
  else
    select id into author from public.registrations
    where participant_id = new.participant_id and edition_slug = new.edition_slug;
  end if;
  if author is null then
    return new;
  end if;

  insert into public.conversations (edition_slug, kind, team_id, request_id)
  values (new.edition_slug, 'request', new.team_id, new.id)
  returning id into conv;

  insert into public.conversation_messages (conversation_id, author_id, body)
  values (conv, author, new.message);

  return new;
end;
$$;

create trigger create_request_conversation
  after insert on public.join_requests
  for each row
  execute function public.create_request_conversation();

-- Backfill team conversations for teams that already exist.
insert into public.conversations (edition_slug, kind, team_id)
select t.edition_slug, 'team', t.id
from public.teams t
where not exists (
  select 1 from public.conversations c where c.team_id = t.id and c.kind = 'team'
);

-- Backfill conversations for requests still open when this migration runs,
-- opened by their message when they have one. Resolved requests need none.
insert into public.conversations (edition_slug, kind, team_id, request_id)
select jr.edition_slug, 'request', jr.team_id, jr.id
from public.join_requests jr
where jr.status = 'pending'
  and not exists (select 1 from public.conversations c where c.request_id = jr.id);

insert into public.conversation_messages (conversation_id, author_id, body, created_at)
select c.id,
       case when jr.kind = 'invitation' then jr.invited_by else applicant.id end,
       jr.message, jr.created_at
from public.conversations c
join public.join_requests jr on jr.id = c.request_id
left join public.registrations applicant
  on applicant.participant_id = jr.participant_id
 and applicant.edition_slug = jr.edition_slug
where jr.status = 'pending'
  and jr.message is not null
  and (case when jr.kind = 'invitation' then jr.invited_by else applicant.id end) is not null
  and not exists (select 1 from public.conversation_messages m where m.conversation_id = c.id);

-- Send a message within the per-author limits. The advisory lock serialises
-- one author's concurrent sends, so the count and the insert cannot race.
create or replace function public.send_message(
  p_conversation uuid,
  p_author uuid,
  p_body text,
  p_per_minute int,
  p_per_day int
)
returns public.conversation_messages
language plpgsql
as $$
declare
  sent public.conversation_messages;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_author::text, 0));

  if (select count(*) from public.conversation_messages
      where author_id = p_author and created_at > now() - interval '1 minute') >= p_per_minute
     or (select count(*) from public.conversation_messages
         where author_id = p_author and created_at > now() - interval '1 day') >= p_per_day then
    raise exception 'send_rate_limited';
  end if;

  insert into public.conversation_messages (conversation_id, author_id, body)
  values (p_conversation, p_author, btrim(p_body))
  returning * into sent;
  return sent;
end;
$$;

-- Conversations the registration can currently see, with its access mode,
-- unread count and last activity. Hidden messages do not count as unread.
create or replace function public.list_conversations(p_registration uuid)
returns table (
  conversation_id uuid,
  kind public.conversation_kind,
  team_id uuid,
  request_id uuid,
  access text,
  unread bigint,
  last_message_at timestamptz
)
language sql
stable
as $$
  with mine as (
    select r.id, r.participant_id, r.edition_slug, r.team_id from public.registrations r
    where r.id = p_registration
  ),
  candidates as (
    select c.* from public.conversations c, mine
    where c.edition_slug = mine.edition_slug
      and (
        (c.kind = 'team' and c.team_id = mine.team_id)
        or c.request_id in (
          select jr.id from public.join_requests jr
          where jr.participant_id = mine.participant_id and jr.edition_slug = mine.edition_slug
        )
        or c.team_id in (
          select t.id from public.teams t where t.leader_id = p_registration
        )
      )
  ),
  visible as (
    select c.*, public.conversation_access(c.id, p_registration) as access
    from candidates c
  )
  select
    v.id,
    v.kind,
    v.team_id,
    v.request_id,
    v.access,
    (
      select count(*) from public.conversation_messages m
      where m.conversation_id = v.id
        and m.author_id <> p_registration
        and m.hidden_at is null
        and m.id > coalesce(
          (select cr.last_read_message_id from public.conversation_reads cr
           where cr.conversation_id = v.id and cr.registration_id = p_registration),
          0)
    ),
    (select max(m.created_at) from public.conversation_messages m where m.conversation_id = v.id)
  from visible v
  where v.access is not null;
$$;

-- ------------------------------------------------------------
-- Formation source: an invitation keeps the source it was created with
-- (direct invite, recommendation or organizer introduction).
-- ------------------------------------------------------------

create or replace function public.decide_join_request(
  p_request uuid,
  p_actor uuid,
  p_action text
)
returns public.join_requests
language plpgsql
as $$
declare
  req public.join_requests;
  leader uuid;
  target uuid;
begin
  select * into req from public.join_requests where id = p_request for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if req.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  if not (select is_current from public.editions where slug = req.edition_slug) then
    raise exception 'edition_not_writable';
  end if;

  if req.expires_at is not null and req.expires_at <= now() then
    update public.join_requests
    set status = 'expired', close_reason = 'expired', decided_at = now()
    where id = p_request
    returning * into req;
    return req;
  end if;

  select leader_id into leader from public.teams where id = req.team_id for update;
  select id into target from public.registrations
  where participant_id = req.participant_id and edition_slug = req.edition_slug;

  if p_action = 'approve' or p_action = 'reject' then
    if req.kind <> 'application' then
      raise exception 'wrong_kind';
    end if;
    if p_actor is not null and p_actor is distinct from leader then
      raise exception 'not_team_leader';
    end if;
  elsif p_action = 'accept' or p_action = 'decline' then
    if req.kind <> 'invitation' then
      raise exception 'wrong_kind';
    end if;
    if p_actor is distinct from target then
      raise exception 'not_invitee';
    end if;
  elsif p_action = 'withdraw' then
    if (req.kind = 'application' and p_actor is distinct from target)
       or (req.kind = 'invitation' and p_actor is distinct from leader) then
      raise exception 'not_sender';
    end if;
  else
    raise exception 'unknown_action';
  end if;

  if p_action in ('approve', 'accept') then
    if target is null then
      raise exception 'registration_not_found';
    end if;
    perform public.join_team(
      target,
      req.team_id,
      -- 'application' is the column default; on an invitation it can only
      -- mean the sender did not say, which is a direct invite.
      case when req.kind = 'invitation' and req.source = 'application'
           then 'direct_invite'::public.formation_source
           else req.source end,
      req.id
    );
    update public.join_requests
    set status = 'approved', decided_at = now()
    where id = p_request
    returning * into req;
  else
    update public.join_requests
    set status = case when p_action = 'withdraw' then 'withdrawn'::public.request_status
                      else 'rejected'::public.request_status end,
        close_reason = case p_action
          when 'reject' then 'leader_rejected'::public.request_close_reason
          when 'decline' then 'invitee_declined'::public.request_close_reason
          else 'withdrawn'::public.request_close_reason end,
        decided_at = now()
    where id = p_request
    returning * into req;
  end if;

  return req;
end;
$$;

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------

alter table public.recommendation_dismissals enable row level security;
alter table public.recommendation_exposures enable row level security;
alter table public.participant_blocks enable row level security;
alter table public.team_proposals enable row level security;
alter table public.team_proposal_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_reports enable row level security;

revoke all on public.recommendation_dismissals, public.recommendation_exposures,
  public.participant_blocks, public.team_proposals, public.team_proposal_members,
  public.conversations, public.conversation_messages, public.conversation_reads,
  public.conversation_reports
from anon, authenticated;

revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_to_proposal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.conversation_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_conversations(uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.create_team_conversation() from public, anon, authenticated;
revoke all on function public.create_request_conversation() from public, anon, authenticated;
revoke all on function public.decide_join_request(uuid, uuid, text) from public, anon, authenticated;
