-- ============================================================
-- Lock down direct (anon/authenticated) access to participant data.
--
-- Every read and write the app makes goes through Nitro routes using the
-- service-role client, which bypasses RLS. The browser only talks to
-- Supabase Auth. The policies below were therefore never needed by the app,
-- but they let any signed-in user reach PostgREST directly and:
--   * set participants.role = 'admin' on their own row,
--   * read every participant's email and dietary details,
--   * read every team's invite_code,
--   * edit or delete a team they once led, archived editions included,
--   * rotate any team's invite code via the SECURITY DEFINER RPC,
--   * insert arbitrary skills, bypassing the 5-skill cap and created_by
--     attribution enforced in the signup trigger.
-- The server routes are now the only write path; direct reads are limited
-- to the caller's own rows.
-- ============================================================

-- ------------------------------------------------------------
-- participants: own row only, no direct writes
-- ------------------------------------------------------------

drop policy if exists "participants_select" on public.participants;
drop policy if exists "participants_update_own" on public.participants;

create policy "participants_select_own" on public.participants
  for select to authenticated using (auth.uid() = id);

revoke insert, update, delete on public.participants from anon, authenticated;

-- ------------------------------------------------------------
-- teams: no direct access (invite_code is a bearer secret)
-- ------------------------------------------------------------

drop policy if exists "teams_select" on public.teams;
drop policy if exists "teams_update" on public.teams;
drop policy if exists "teams_delete" on public.teams;

revoke all on public.teams from anon, authenticated;

-- ------------------------------------------------------------
-- registrations / join_requests: keep select-own, no direct writes
-- (writes skip edition-writable and OPS-open checks done in the API)
-- ------------------------------------------------------------

drop policy if exists "join_requests_insert_own" on public.join_requests;

-- The old policy also let leaders read their team's requests by looking up
-- teams, which clients can no longer read; leaders go through the API.
drop policy if exists "join_requests_select_own" on public.join_requests;
create policy "join_requests_select_own" on public.join_requests
  for select to authenticated using (auth.uid() = participant_id);

revoke insert, update, delete on public.registrations from anon, authenticated;
revoke insert, update, delete on public.join_requests from anon, authenticated;

-- ------------------------------------------------------------
-- rotate_team_invite_code: server-only, like promote_edition
-- ------------------------------------------------------------

revoke all on function public.rotate_team_invite_code(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- skills: read-only to clients. The 5-skill cap and created_by attribution
-- live in the signup trigger (SECURITY DEFINER); a direct PostgREST insert
-- bypasses both.
-- ------------------------------------------------------------

drop policy if exists "skills_insert" on public.skills;
revoke insert, update, delete on public.skills from anon, authenticated;

-- ------------------------------------------------------------
-- Caps: serialise competing admissions before counting.
-- Under READ COMMITTED each statement takes a fresh snapshot, so once the
-- lock is held the count sees every committed competitor. NO KEY UPDATE
-- does not block the KEY SHARE locks taken by foreign-key checks.
-- ------------------------------------------------------------

create or replace function public.enforce_edition_cap()
returns trigger
language plpgsql
as $$
declare
  cap int;
  taken int;
begin
  select participant_cap into cap
  from public.editions
  where slug = new.edition_slug
  for no key update;

  if cap is null then
    return new;
  end if;

  select count(*) into taken
  from public.registrations
  where edition_slug = new.edition_slug;

  if taken >= cap then
    raise exception 'registration_closed'
      using hint = format('Registration is closed — %s participant limit reached', cap);
  end if;

  return new;
end;
$$;

create or replace function public.check_team_capacity()
returns trigger
language plpgsql
as $$
begin
  if new.team_id is not null
     and (tg_op = 'INSERT' or old.team_id is distinct from new.team_id) then
    perform 1 from public.teams where id = new.team_id for no key update;

    if (select count(*) from public.registrations where team_id = new.team_id) >= 6 then
      raise exception 'team_full' using hint = 'Team already has 6 members';
    end if;
  end if;
  return new;
end;
$$;
