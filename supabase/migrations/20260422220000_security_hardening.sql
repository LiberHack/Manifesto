-- ============================================================
-- 1. Enforce max 6 members per team at the DB level
--    Prevents race conditions that bypass the app-layer check.
-- ============================================================

create or replace function public.check_team_capacity()
returns trigger
language plpgsql
as $$
begin
  if new.team_id is not null and (old.team_id is null or old.team_id is distinct from new.team_id) then
    if (select count(*) from public.participants where team_id = new.team_id) >= 6 then
      raise exception 'team_full' using hint = 'Team already has 6 members';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_team_capacity
  before update on public.participants
  for each row
  execute function public.check_team_capacity();

-- ============================================================
-- 2. Row-Level Security
--    The app uses the service-role key for all mutations, so
--    these policies guard direct anon/authenticated access.
-- ============================================================

alter table public.teams          enable row level security;
alter table public.participants   enable row level security;
alter table public.join_requests  enable row level security;

-- teams: anyone authenticated can view; only the leader can update/delete
create policy "teams_select" on public.teams
  for select to authenticated using (true);

create policy "teams_update" on public.teams
  for update to authenticated using (auth.uid() = leader_id);

create policy "teams_delete" on public.teams
  for delete to authenticated using (auth.uid() = leader_id);

-- participants: authenticated users can view all; each user manages their own row
create policy "participants_select" on public.participants
  for select to authenticated using (true);

create policy "participants_update_own" on public.participants
  for update to authenticated using (auth.uid() = id);

-- join_requests: users see only their own requests or requests for teams they lead
create policy "join_requests_select_own" on public.join_requests
  for select to authenticated using (
    auth.uid() = participant_id
    or auth.uid() = (select leader_id from public.teams where id = team_id)
  );

create policy "join_requests_insert_own" on public.join_requests
  for insert to authenticated with check (auth.uid() = participant_id);

-- Service role bypasses RLS automatically; no service-role policies needed.
