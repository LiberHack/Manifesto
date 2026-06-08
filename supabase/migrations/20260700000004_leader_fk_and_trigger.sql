-- supabase/migrations/20260700000004_leader_fk_and_trigger.sql

-- 0. Add 'leader' to participant_role enum (was missing, needed for trigger and role tracking)
alter type public.participant_role add value if not exists 'leader';

-- 1. Temp column to hold the resolved registration id for each team's leader
alter table public.teams add column leader_reg_id uuid null;

-- 2. Populate: find the registration whose participant_id = current leader_id (auth user uuid)
update public.teams t
set leader_reg_id = r.id
from public.registrations r
where r.participant_id = t.leader_id
  and r.edition_slug = t.edition_slug;

-- 3. Safety check: any teams where leader_reg_id is still null means the leader
--    has no registration for this edition. Log a warning if any exist.
-- (Actual check done via app before migration — see pre-check step)

-- 4. Drop old FK (references auth.users)
alter table public.teams drop constraint teams_leader_id_fkey;

-- 5. Update leader_id to the resolved registration UUID
update public.teams set leader_id = leader_reg_id where leader_reg_id is not null;

-- 6. Add NOT NULL + new FK → registrations ON DELETE CASCADE
alter table public.teams alter column leader_id set not null;
alter table public.teams
  add constraint teams_leader_id_fkey
    foreign key (leader_id) references public.registrations(id) on delete cascade;

-- 7. Drop temp column
alter table public.teams drop column leader_reg_id;

-- 8. Ensure registrations.role='leader' matches teams.leader_id
update public.registrations r
set role = 'leader'
from public.teams t
where t.leader_id = r.id
  and r.role != 'leader';

-- 9. handle_leader_departure BEFORE DELETE trigger
create or replace function public.handle_leader_departure()
returns trigger language plpgsql as $$
declare
  v_team_id       uuid;
  v_successor_id  uuid;
begin
  -- Find if this registration is a team leader
  select id into v_team_id from public.teams where leader_id = old.id;
  if v_team_id is null then return old; end if;

  -- Find earliest-registered remaining member (not the departing row)
  select r.id into v_successor_id
  from public.registrations r
  where r.team_id = v_team_id
    and r.id != old.id
  order by r.registered_at, r.id
  limit 1;

  if v_successor_id is not null then
    -- Promote successor
    update public.teams       set leader_id = v_successor_id where id = v_team_id;
    update public.registrations set role = 'leader'           where id = v_successor_id;
  end if;
  -- If no successor: leader_id still points to old.id; ON DELETE CASCADE dissolves the team

  return old;
end;
$$;

create trigger handle_leader_departure
  before delete on public.registrations
  for each row execute function public.handle_leader_departure();

-- 10. Update handle_request_approved: set registrations.team_id (not participants.team_id)
create or replace function public.handle_request_approved()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    -- Update the joiner's registration for this edition
    update public.registrations
    set team_id = new.team_id
    where participant_id = new.participant_id
      and edition_slug = (
        select edition_slug from public.teams where id = new.team_id
      );

    -- Cancel other pending requests for this participant
    update public.join_requests
    set status = 'rejected'
    where participant_id = new.participant_id
      and id != new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;
