-- ============================================================
-- Atomic team creation.
--
-- POST /api/teams used to insert the team, then conditionally set the
-- leader's registration, then best-effort delete the team if that update
-- lost a race. The delete's error was ignored, so a failure there left an
-- orphan team whose leader was not a member. Doing all three in one function
-- makes the team and the leader's membership commit or roll back together.
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

  return created;
end;
$$;

revoke all on function public.create_team(uuid, text, text[], text)
  from public, anon, authenticated;
