-- ============================================================
-- Atomic team creation.
--
-- POST /api/teams used to insert the team, then conditionally set the
-- leader's registration, then best-effort delete the team if that update
-- lost a race. The delete's error was ignored, so a failure there left an
-- orphan team whose leader was not a member. Doing all three in one function
-- makes the team and the leader's membership commit or roll back together.
--
-- The other two writers of registrations.team_id -- invite acceptance and
-- join-request approval -- must not overwrite a membership set after they
-- read it, or the new team is orphaned all the same. Approval now only fills
-- an empty team_id (the invite route conditions its own update).
-- ============================================================

create or replace function public.create_team(
  p_registration_id uuid,
  p_name text,
  p_skills_wanted text[],
  p_description text
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  reg public.registrations;
  created public.teams;
begin
  -- The row lock serialises against a concurrent create or join for the same
  -- registration; whoever commits second sees team_id already set.
  select * into reg
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception 'registration_not_found';
  end if;

  if reg.team_id is not null then
    raise exception 'already_in_team' using hint = 'Already in a team';
  end if;

  insert into public.teams (name, edition_slug, leader_id, skills_wanted, description)
  values (p_name, reg.edition_slug, reg.id, coalesce(p_skills_wanted, '{}'), p_description)
  returning * into created;

  update public.registrations
  set team_id = created.id, role = 'leader'
  where id = reg.id;

  -- A leader cannot also be waiting to join another team.
  update public.join_requests
  set status = 'rejected'
  where participant_id = reg.participant_id
    and edition_slug = reg.edition_slug
    and status = 'pending';

  return created;
end;
$$;

revoke all on function public.create_team(uuid, text, text[], text)
  from public, anon, authenticated;

create or replace function public.handle_request_approved()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    update public.registrations
    set team_id = new.team_id
    where participant_id = new.participant_id
      and edition_slug = new.edition_slug
      and team_id is null;

    if not found then
      raise exception 'already_in_team'
        using hint = 'The requester has joined or created a team since asking';
    end if;

    update public.join_requests
    set status = 'rejected'
    where participant_id = new.participant_id
      and edition_slug = new.edition_slug
      and id != new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;
