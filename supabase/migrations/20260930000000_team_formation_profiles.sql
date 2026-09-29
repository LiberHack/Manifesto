-- ============================================================
-- Team formation, phase 1: profiles, recruitment, private contacts,
-- applications/invitations and membership history.
-- See docs/superpowers/plans/2026-09-29-team-formation-and-attendance.md.
--
-- Every write goes through Nitro with the service-role client. New tables are
-- closed to anon/authenticated outright, and the membership functions are
-- server-only, like promote_edition.
-- ============================================================

-- ------------------------------------------------------------
-- Vocabulary
-- ------------------------------------------------------------

-- Discovery consent. NULL = not answered yet; only 'looking' makes a
-- registration visible to recruiting leaders. Deliberately separate from
-- registrations.public (archive visibility).
create type public.matching_status as enum ('looking', 'arranging', 'not_needed');

create type public.contribution_role as enum (
  'frontend', 'backend', 'mobile', 'design', 'data', 'hardware',
  'devops', 'product', 'pitching', 'flexible'
);

create type public.participant_goal as enum ('learning', 'meeting_people', 'competing');

create type public.contact_method as enum (
  'phone', 'viber', 'instagram', 'telegram', 'signal', 'session', 'other', 'email_only'
);

create type public.request_kind as enum ('application', 'invitation');

create type public.request_close_reason as enum (
  'leader_rejected', 'invitee_declined', 'withdrawn', 'joined_other_team',
  'expired', 'team_full', 'left_team'
);

create type public.formation_source as enum (
  'founded', 'application', 'direct_invite', 'invite_link',
  'recommendation', 'organizer', 'unknown'
);

-- New values are only referenced inside function bodies below, which resolve
-- them at call time, so adding them in this same migration is safe.
alter type public.request_status add value if not exists 'withdrawn';
alter type public.request_status add value if not exists 'expired';

-- ------------------------------------------------------------
-- Participant profile (per registration, prefilled across editions)
-- ------------------------------------------------------------

alter table public.registrations
  add column matching_status public.matching_status,
  add column intro varchar(500),
  add column preferred_roles public.contribution_role[] not null default '{}',
  add column interests text[] not null default '{}',
  add column goals public.participant_goal[] not null default '{}',
  add column languages text[] not null default '{}',
  -- What the person typed, before case/alias normalisation into `skills`.
  add column skills_input text[] not null default '{}',
  add column github_url text,
  add column gitlab_url text,
  add column codeberg_url text,
  add column portfolio_url text,
  add constraint registrations_interests_max check (cardinality(interests) <= 3),
  add constraint registrations_languages_max check (cardinality(languages) <= 5),
  add constraint registrations_links_http check (
    coalesce(github_url, 'https://') ~* '^https?://'
    and coalesce(gitlab_url, 'https://') ~* '^https?://'
    and coalesce(codeberg_url, 'https://') ~* '^https?://'
    and coalesce(portfolio_url, 'https://') ~* '^https?://'
  );

create index registrations_looking_idx
  on public.registrations (edition_slug)
  where matching_status = 'looking' and team_id is null;

-- ------------------------------------------------------------
-- Team recruitment profile. Vacancies are derived from desired_size and
-- actual membership, never stored.
-- ------------------------------------------------------------

alter table public.teams
  add column recruiting boolean not null default true,
  add column wanted_roles public.contribution_role[] not null default '{}',
  add column desired_size smallint not null default 6,
  add column interests text[] not null default '{}',
  add column goals public.participant_goal[] not null default '{}',
  add column welcomes_beginners boolean not null default false,
  add column languages text[] not null default '{}',
  add constraint teams_desired_size_range check (desired_size between 1 and 6),
  add constraint teams_interests_max check (cardinality(interests) <= 3),
  add constraint teams_languages_max check (cardinality(languages) <= 5);

-- ------------------------------------------------------------
-- Private contact: its own table so no profile query can select it by
-- accident. Organizer-only unless the person shares it with teammates.
-- ------------------------------------------------------------

create table public.registration_contacts (
  registration_id uuid primary key
    references public.registrations (id) on delete cascade,
  method public.contact_method not null,
  handle varchar(100),
  -- Free-text channel name when method = 'other'.
  other_label varchar(40),
  share_with_team boolean not null default false,
  -- Organizer-recorded acknowledgement that the channel works. Not identity
  -- verification, and distinct from merely having saved a value.
  reachable_confirmed_at timestamptz,
  reachable_confirmed_by uuid references public.participants (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint registration_contacts_handle_required check (
    method = 'email_only' or nullif(btrim(handle), '') is not null
  ),
  constraint registration_contacts_other_label check (
    method <> 'other' or nullif(btrim(other_label), '') is not null
  )
);

alter table public.registration_contacts enable row level security;
revoke all on public.registration_contacts from anon, authenticated;

-- ------------------------------------------------------------
-- Applications and invitations share join_requests.
-- ------------------------------------------------------------

alter table public.join_requests
  add column kind public.request_kind not null default 'application',
  -- Kept as submitted; later profile edits do not rewrite it. NULL only on
  -- requests that predate the requirement.
  add column message varchar(500),
  add column invited_by uuid references public.registrations (id) on delete set null,
  add column source public.formation_source not null default 'application',
  add column decided_at timestamptz,
  add column close_reason public.request_close_reason,
  add column expires_at timestamptz,
  add constraint join_requests_message_length check (
    message is null or char_length(btrim(message)) between 20 and 500
  );

-- Added after the column so existing pending requests keep no expiry.
alter table public.join_requests
  alter column expires_at set default now() + interval '7 days';

-- ------------------------------------------------------------
-- Membership history: one row per join/leave, whatever path caused it.
-- ------------------------------------------------------------

create table public.membership_events (
  id bigint generated always as identity primary key,
  edition_slug text not null references public.editions (slug) on update cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  -- No FK: history outlives a dissolved team.
  team_id uuid not null,
  event text not null check (event in ('joined', 'left')),
  source public.formation_source not null default 'unknown',
  request_id uuid,
  created_at timestamptz not null default now()
);

create index membership_events_edition_idx on public.membership_events (edition_slug, created_at);
create index membership_events_registration_idx on public.membership_events (registration_id);

alter table public.membership_events enable row level security;
revoke all on public.membership_events from anon, authenticated;

-- The membership functions below tag their writes through transaction-local
-- settings; any other path (leaving, team deletion cascades) is recorded as
-- 'unknown' for joins, which is all a 'left' row needs.
create or replace function public.record_membership_change()
returns trigger
language plpgsql
as $$
declare
  src public.formation_source :=
    coalesce(nullif(current_setting('app.formation_source', true), ''), 'unknown')::public.formation_source;
  req uuid := nullif(current_setting('app.formation_request', true), '')::uuid;
begin
  if tg_op = 'UPDATE' and old.team_id is not distinct from new.team_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.team_id is not null then
    insert into public.membership_events (edition_slug, registration_id, team_id, event)
    values (old.edition_slug, old.id, old.team_id, 'left');
  end if;

  if new.team_id is not null then
    insert into public.membership_events
      (edition_slug, registration_id, team_id, event, source, request_id)
    values (new.edition_slug, new.id, new.team_id, 'joined', src, req);
  end if;

  return new;
end;
$$;

create trigger record_membership_change
  after insert or update of team_id on public.registrations
  for each row
  execute function public.record_membership_change();

-- ------------------------------------------------------------
-- Atomic membership
-- ------------------------------------------------------------

-- Approvals now go through decide_join_request, which does what this trigger
-- did and more; keeping both would close requests twice.
drop trigger if exists on_request_approved on public.join_requests;
drop function if exists public.handle_request_approved();

-- Put a registration into a team: same edition, not already in a team,
-- capacity available. Locks the team, then the registration, so concurrent
-- joins serialise on the team row.
create or replace function public.join_team(
  p_registration uuid,
  p_team uuid,
  p_source public.formation_source,
  p_request uuid default null
)
returns void
language plpgsql
as $$
declare
  t record;
  r record;
  members int;
begin
  select id, edition_slug into t from public.teams where id = p_team for update;
  if not found then
    raise exception 'team_not_found';
  end if;

  select id, participant_id, edition_slug, team_id into r
  from public.registrations where id = p_registration for update;
  if not found then
    raise exception 'registration_not_found';
  end if;

  if r.edition_slug <> t.edition_slug then
    raise exception 'edition_mismatch';
  end if;
  if r.team_id is not null then
    raise exception 'already_in_team';
  end if;

  select count(*) into members from public.registrations where team_id = p_team;
  if members >= 6 then
    raise exception 'team_full';
  end if;

  perform set_config('app.formation_source', p_source::text, true);
  perform set_config('app.formation_request', coalesce(p_request::text, ''), true);
  update public.registrations set team_id = p_team, role = 'participant' where id = p_registration;
  perform set_config('app.formation_source', '', true);
  perform set_config('app.formation_request', '', true);

  -- Joining one team closes this person's other open requests, recorded as
  -- such rather than as a leader's rejection.
  update public.join_requests
  set status = 'rejected', close_reason = 'joined_other_team', decided_at = now()
  where participant_id = r.participant_id
    and edition_slug = r.edition_slug
    and status = 'pending'
    and id is distinct from p_request;

  if members + 1 >= 6 then
    update public.join_requests
    set status = 'rejected', close_reason = 'team_full', decided_at = now()
    where team_id = p_team and status = 'pending' and id is distinct from p_request;
  end if;
end;
$$;

-- Create a team led by a registration that is not yet in one.
create or replace function public.create_team(
  p_registration uuid,
  p_name text,
  p_skills_wanted text[],
  p_description text
)
returns public.teams
language plpgsql
as $$
declare
  r record;
  created public.teams;
begin
  select id, edition_slug, team_id into r
  from public.registrations where id = p_registration for update;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.team_id is not null then
    raise exception 'already_in_team';
  end if;

  insert into public.teams (name, edition_slug, leader_id, skills_wanted, description)
  values (p_name, r.edition_slug, r.id, coalesce(p_skills_wanted, '{}'), p_description)
  returning * into created;

  perform public.join_team(r.id, created.id, 'founded');
  update public.registrations set role = 'leader' where id = r.id;

  return created;
end;
$$;

-- Resolve a pending application or invitation.
--   approve / reject : the team leader (or an organizer) on an application
--   accept  / decline: the invitee on an invitation
--   withdraw         : whoever sent it
-- p_actor is the acting registration id; NULL means an organizer.
-- Returns the updated row. An expired request is closed and returned with
-- status 'expired' rather than raising, so the closure is not rolled back.
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
      case when req.kind = 'invitation' then 'direct_invite'::public.formation_source
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

revoke all on function public.join_team(uuid, uuid, public.formation_source, uuid) from public, anon, authenticated;
revoke all on function public.create_team(uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.decide_join_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_membership_change() from public, anon, authenticated;
