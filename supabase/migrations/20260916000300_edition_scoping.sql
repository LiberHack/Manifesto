-- ============================================================
-- Edition archiving, phase 1 — steps 3, 4, 5, 7
-- Spec: docs/superpowers/specs/2026-09-16-second-edition-live-mode-design.md
--
-- 3. edition_slug on teams and join_requests.
-- 4. Repoint teams.leader_id -> registrations(id); handle_leader_departure.
-- 5. event_config keyed per edition; edition_slug on schedule_items/announcements.
-- 7. teams_unique_name_per_edition.
--
-- Plus: the team-membership triggers move from participants.team_id to
-- registrations.team_id, which is the per-edition source of truth from here on.
-- ============================================================

-- ------------------------------------------------------------
-- 3. edition_slug on teams and join_requests
-- ------------------------------------------------------------

alter table public.teams
  add column if not exists edition_slug text;
update public.teams set edition_slug = '2026' where edition_slug is null;
alter table public.teams
  alter column edition_slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_edition_slug_fkey'
  ) then
    alter table public.teams
      add constraint teams_edition_slug_fkey
      foreign key (edition_slug) references public.editions(slug)
      on update cascade on delete restrict;
  end if;
end
$$;

create index if not exists teams_edition_idx on public.teams (edition_slug);

alter table public.join_requests
  add column if not exists edition_slug text;
update public.join_requests set edition_slug = '2026' where edition_slug is null;
alter table public.join_requests
  alter column edition_slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'join_requests_edition_slug_fkey'
  ) then
    alter table public.join_requests
      add constraint join_requests_edition_slug_fkey
      foreign key (edition_slug) references public.editions(slug)
      on update cascade on delete restrict;
  end if;
end
$$;

create index if not exists join_requests_edition_idx on public.join_requests (edition_slug);

-- ------------------------------------------------------------
-- 4. Repoint teams.leader_id -> registrations(id)
--    Must run after registrations is backfilled and before the new FK is added.
-- ------------------------------------------------------------

do $$
declare
  orphan_count int;
begin
  -- Only repoint if leader_id still points at the old identity.
  if exists (
    select 1 from pg_constraint
    where conname = 'teams_leader_id_fkey'
      and confrelid = 'auth.users'::regclass
  ) then
    select count(*) into orphan_count
    from public.teams t
    where not exists (
      select 1 from public.registrations r
      where r.participant_id = t.leader_id and r.edition_slug = t.edition_slug
    );

    if orphan_count > 0 then
      raise exception
        'leader_id repoint aborted: % team(s) have a leader with no registration in their edition',
        orphan_count;
    end if;

    alter table public.teams drop constraint teams_leader_id_fkey;

    update public.teams t
    set leader_id = r.id
    from public.registrations r
    where r.participant_id = t.leader_id
      and r.edition_slug = t.edition_slug;

    alter table public.teams
      add constraint teams_leader_id_fkey
      foreign key (leader_id) references public.registrations(id) on delete cascade;
  end if;
end
$$;

-- Leader departure: auto-promote the earliest-registered remaining member,
-- else let the ON DELETE CASCADE dissolve the team. Runs on the cascade path
-- (auth.users -> participants -> registrations) too, so account deletion always
-- succeeds and never strands teammates.
create or replace function public.handle_leader_departure()
returns trigger
language plpgsql
as $$
declare
  led_team record;
  successor uuid;
begin
  for led_team in
    select id from public.teams where leader_id = old.id
  loop
    select r.id into successor
    from public.registrations r
    where r.team_id = led_team.id
      and r.id <> old.id
    order by r.registered_at, r.id
    limit 1;

    if successor is not null then
      update public.teams set leader_id = successor where id = led_team.id;
      update public.registrations set role = 'leader' where id = successor;
    end if;
    -- No successor: leader_id still points at OLD, so the FK cascade dissolves
    -- the team.
  end loop;

  return old;
end;
$$;

drop trigger if exists on_leader_departure on public.registrations;
create trigger on_leader_departure
  before delete on public.registrations
  for each row
  execute function public.handle_leader_departure();

-- ------------------------------------------------------------
-- 5. Live CMS per edition
-- ------------------------------------------------------------

alter table public.event_config
  add column if not exists edition_slug text;
update public.event_config set edition_slug = '2026' where edition_slug is null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'only_one_row' and conrelid = 'public.event_config'::regclass
  ) then
    alter table public.event_config drop constraint only_one_row;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_config' and column_name = 'id'
  ) then
    alter table public.event_config drop constraint event_config_pkey;
    alter table public.event_config drop column id;
    alter table public.event_config alter column edition_slug set not null;
    alter table public.event_config add primary key (edition_slug);
    alter table public.event_config
      add constraint event_config_edition_slug_fkey
      foreign key (edition_slug) references public.editions(slug)
      on update cascade on delete cascade;
  end if;
end
$$;

alter table public.schedule_items
  add column if not exists edition_slug text;
update public.schedule_items set edition_slug = '2026' where edition_slug is null;
alter table public.schedule_items alter column edition_slug set not null;

alter table public.announcements
  add column if not exists edition_slug text;
update public.announcements set edition_slug = '2026' where edition_slug is null;
alter table public.announcements alter column edition_slug set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_items_edition_slug_fkey') then
    alter table public.schedule_items
      add constraint schedule_items_edition_slug_fkey
      foreign key (edition_slug) references public.editions(slug)
      on update cascade on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'announcements_edition_slug_fkey') then
    alter table public.announcements
      add constraint announcements_edition_slug_fkey
      foreign key (edition_slug) references public.editions(slug)
      on update cascade on delete cascade;
  end if;
end
$$;

create index if not exists schedule_items_edition_idx on public.schedule_items (edition_slug);
create index if not exists announcements_edition_idx on public.announcements (edition_slug);

-- ------------------------------------------------------------
-- 7. Unique team name within an edition (case-insensitive)
-- ------------------------------------------------------------

do $$
declare
  dupes text;
begin
  select string_agg(format('%s (%s)', name, edition_slug), ', ')
  into dupes
  from (
    select edition_slug, min(name) as name
    from public.teams
    group by edition_slug, lower(name)
    having count(*) > 1
  ) d;

  if dupes is not null then
    raise exception
      'teams_unique_name_per_edition aborted: duplicate team names within an edition: %', dupes;
  end if;
end
$$;

create unique index if not exists teams_unique_name_per_edition
  on public.teams (edition_slug, lower(name));

-- ------------------------------------------------------------
-- Team membership triggers move to registrations
-- ------------------------------------------------------------

drop trigger if exists enforce_team_capacity on public.participants;

create or replace function public.check_team_capacity()
returns trigger
language plpgsql
as $$
begin
  if new.team_id is not null
     and (tg_op = 'INSERT' or old.team_id is distinct from new.team_id) then
    if (select count(*) from public.registrations where team_id = new.team_id) >= 6 then
      raise exception 'team_full' using hint = 'Team already has 6 members';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_team_capacity on public.registrations;
create trigger enforce_team_capacity
  before insert or update on public.registrations
  for each row
  execute function public.check_team_capacity();

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
      and edition_slug = new.edition_slug;

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

-- ------------------------------------------------------------
-- RLS: leader_id is a registration id now, not an auth uid
-- ------------------------------------------------------------

drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams
  for update to authenticated using (
    exists (
      select 1 from public.registrations r
      where r.id = teams.leader_id and r.participant_id = auth.uid()
    )
  );

drop policy if exists "teams_delete" on public.teams;
create policy "teams_delete" on public.teams
  for delete to authenticated using (
    exists (
      select 1 from public.registrations r
      where r.id = teams.leader_id and r.participant_id = auth.uid()
    )
  );

drop policy if exists "join_requests_select_own" on public.join_requests;
create policy "join_requests_select_own" on public.join_requests
  for select to authenticated using (
    auth.uid() = participant_id
    or exists (
      select 1 from public.teams t
      join public.registrations r on r.id = t.leader_id
      where t.id = join_requests.team_id and r.participant_id = auth.uid()
    )
  );
