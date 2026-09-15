\set ON_ERROR_STOP on

create or replace function assert(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end;
$$;

-- ── Migration outcome ───────────────────────────────────────────────────────
select assert(
  (select count(*) from public.editions where slug = '2026' and status = 'live' and is_current) = 1,
  'edition 2026 is live and current');

select assert(
  (select participant_cap from public.editions where slug = '2026') = 120,
  'edition 2026 carries the 120 cap');

select assert(
  (select count(*) from public.registrations where edition_slug = '2026') = 4,
  'every participant was backfilled into 2026 registrations');

select assert(
  (select accepted_terms_at = registered_at from public.registrations r
   join public.participants p on p.id = r.participant_id
   where p.email = 'ada@example.com') ,
  'accepted_terms_at backfilled from participants.created_at');

select assert(
  (select r.role from public.registrations r
   where r.participant_id = '11111111-1111-1111-1111-111111111111') = 'leader',
  'team leader backfilled with role = leader');

select assert(
  (select r.role from public.registrations r
   where r.participant_id = '22222222-2222-2222-2222-222222222222') = 'participant',
  'non-leader backfilled with role = participant');

select assert(
  (select t.leader_id from public.teams t where t.name = 'fsociety')
  = (select r.id from public.registrations r
     where r.participant_id = '11111111-1111-1111-1111-111111111111' and r.edition_slug = '2026'),
  'teams.leader_id repointed to the leader''s 2026 registration');

select assert(
  (select confrelid::regclass::text from pg_constraint where conname = 'teams_leader_id_fkey')
  = 'registrations',
  'teams_leader_id_fkey now references registrations');

select assert(
  (select count(*) from public.registrations
   where team_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'registrations.team_id carried the team membership over');

-- Counts rather than "all rows", because the announcements migration seeds an
-- extra banner row into the then-current edition.
select assert(
  (select count(*) from public.teams where edition_slug = '2026') = 2
  and (select count(*) from public.join_requests where edition_slug = '2026') = 1
  and (select count(*) from public.schedule_items where edition_slug = '2026') = 1
  and not exists (select 1 from public.teams where edition_slug <> '2026')
  and not exists (select 1 from public.join_requests where edition_slug <> '2026')
  and not exists (select 1 from public.schedule_items where edition_slug <> '2026')
  and not exists (select 1 from public.announcements where edition_slug <> '2026'),
  'teams, join_requests and CMS rows scoped to 2026');

select assert(
  (select count(*) from public.event_config where edition_slug = '2026') = 1
  and not exists (
    select 1 from information_schema.columns
    where table_name = 'event_config' and column_name = 'id'),
  'event_config is keyed per edition, singleton id dropped');

-- ── Invariants ──────────────────────────────────────────────────────────────
do $$
begin
  begin
    insert into public.teams (name, edition_slug, leader_id, skills_wanted)
    values ('FSOCIETY', '2026',
            (select id from public.registrations
             where participant_id = '33333333-3333-3333-3333-333333333333'), '{}');
    raise exception 'FAIL  duplicate team name within an edition was accepted';
  exception when unique_violation then
    raise notice 'PASS  duplicate team name rejected case-insensitively';
  end;
end
$$;

do $$
begin
  begin
    insert into public.editions (slug, name, status, is_current)
    values ('2027', 'LiberHack 2027', 'live', true);
    raise exception 'FAIL  a second current edition was accepted';
  exception when unique_violation then
    raise notice 'PASS  only one edition may be current';
  end;
end
$$;

do $$
begin
  begin
    insert into public.editions (slug, name, status, is_current)
    values ('bad', 'Bad', 'draft', true);
    raise exception 'FAIL  a current non-live edition was accepted';
  exception when check_violation then
    raise notice 'PASS  current_implies_live rejects a current draft';
  end;
end
$$;

-- ── Per-edition cap ─────────────────────────────────────────────────────────
update public.editions set participant_cap = 4 where slug = '2026';

do $$
declare
  uid uuid := gen_random_uuid();
begin
  -- handle_new_user creates the participants row from the auth insert.
  insert into auth.users (id, email) values (uid, 'capped@example.com');
  begin
    insert into public.registrations (participant_id, edition_slug) values (uid, '2026');
    raise exception 'FAIL  registration past the cap was accepted';
  exception when others then
    if sqlerrm like '%registration_closed%' then
      raise notice 'PASS  enforce_edition_cap raises registration_closed at the cap';
    else
      raise;
    end if;
  end;
end
$$;

select assert(
  (select count(*) from public.participants where email = 'capped@example.com') = 1,
  'the account survives a cap failure (auth user is not rolled back)');

update public.editions set participant_cap = 120 where slug = '2026';

-- handle_new_user no longer counts participants
select assert(
  (select prosrc not like '%registration_closed%' from pg_proc
   where proname = 'handle_new_user') ,
  'handle_new_user no longer enforces a participant cap');

-- ── Leader departure ────────────────────────────────────────────────────────
-- Ada leads fsociety with Linus as the other member; deleting her account must
-- promote Linus rather than dissolve the team.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select assert(
  (select count(*) from public.teams where name = 'fsociety') = 1,
  'team survives its leader''s account deletion');

select assert(
  (select t.leader_id from public.teams t where t.name = 'fsociety')
  = (select r.id from public.registrations r
     where r.participant_id = '22222222-2222-2222-2222-222222222222'),
  'leadership auto-promoted to the earliest-registered remaining member');

select assert(
  (select r.role from public.registrations r
   where r.participant_id = '22222222-2222-2222-2222-222222222222') = 'leader',
  'the promoted member''s role became leader');

-- Solo leads a team alone; deleting the account must dissolve it.
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';

select assert(
  (select count(*) from public.teams where name = 'lonewolf') = 0,
  'a sole leader''s team is dissolved on account deletion');

-- ── promote_edition ─────────────────────────────────────────────────────────
insert into public.editions (slug, name, status, participant_cap)
values ('2027', 'LiberHack 2027', 'draft', 80);

select public.promote_edition('2027');

select assert(
  (select count(*) from public.editions where is_current) = 1
  and (select slug from public.editions where is_current) = '2027',
  'promote_edition leaves exactly one current edition');

select assert(
  (select status from public.editions where slug = '2026') = 'archived'
  and not (select is_current from public.editions where slug = '2026'),
  'the outgoing edition was archived');

-- Two of the four seeded accounts were deleted by the leader-departure checks
-- above, leaving Linus + Grace and the single surviving team.
select assert(
  (select count(*) from public.teams where edition_slug = '2026') = 1
  and (select count(*) from public.registrations where edition_slug = '2026') = 2,
  'prior-edition data is untouched by going live');

select assert(
  (select count(*) from public.teams where edition_slug = '2027') = 0
  and (select count(*) from public.registrations where edition_slug = '2027') = 0,
  'the new edition starts with an empty live scope');

do $$
begin
  begin
    perform public.promote_edition('2026');
    raise exception 'FAIL  a non-draft edition was promoted';
  exception when others then
    if sqlerrm like '%edition_not_draft%' then
      raise notice 'PASS  promote_edition refuses a non-draft edition';
    else
      raise;
    end if;
  end;
end
$$;

-- ── Returning user re-registers ─────────────────────────────────────────────
insert into public.registrations (participant_id, edition_slug, skills, experience)
values ('22222222-2222-2222-2222-222222222222', '2027', '{C,Go,Zig}', 'experienced');

select assert(
  (select count(*) from public.registrations
   where participant_id = '22222222-2222-2222-2222-222222222222') = 2,
  'a returning participant holds one registration per edition');

select assert(
  (select team_id is null and role = 'participant' from public.registrations
   where participant_id = '22222222-2222-2222-2222-222222222222' and edition_slug = '2027'),
  'the new registration starts with no team and no leadership');

do $$
begin
  begin
    insert into public.registrations (participant_id, edition_slug)
    values ('22222222-2222-2222-2222-222222222222', '2027');
    raise exception 'FAIL  a duplicate registration was accepted';
  exception when unique_violation then
    raise notice 'PASS  one registration per (participant, edition)';
  end;
end
$$;

-- ── Edition deletion policy ─────────────────────────────────────────────────
-- A RESTRICT violation is raised after the enclosing statement completes, so it
-- cannot be trapped inside a DO block; assert the declared policy instead.
select assert(
  (select bool_and(confdeltype = 'r') from pg_constraint
   where conname in ('teams_edition_slug_fkey',
                     'registrations_edition_slug_fkey',
                     'join_requests_edition_slug_fkey')),
  'content-bearing edition references are ON DELETE RESTRICT');

select assert(
  (select bool_and(confdeltype = 'c') from pg_constraint
   where conname in ('event_config_edition_slug_fkey',
                     'schedule_items_edition_slug_fkey',
                     'announcements_edition_slug_fkey')),
  'owned-config edition references are ON DELETE CASCADE');

select assert(
  (select count(*) = 3 from pg_constraint
   where conname in ('teams_edition_slug_fkey',
                     'registrations_edition_slug_fkey',
                     'join_requests_edition_slug_fkey')
     and confupdtype = 'c'),
  'edition slug renames cascade to their referencing rows');

-- ── Team capacity ───────────────────────────────────────────────────────────
do $$
declare
  team uuid;
  uid uuid;
  reg uuid;
begin
  insert into public.editions (slug, name, status, participant_cap)
    values ('captest', 'Cap Test', 'draft', 100);

  for i in 1..7 loop
    uid := gen_random_uuid();
    insert into auth.users (id, email) values (uid, 'cap' || i || '@example.com');
    insert into public.registrations (participant_id, edition_slug) values (uid, 'captest') returning id into reg;

    if i = 1 then
      insert into public.teams (name, edition_slug, leader_id, skills_wanted)
        values ('capteam', 'captest', reg, '{}') returning id into team;
      update public.registrations set team_id = team, role = 'leader' where id = reg;
    elsif i <= 6 then
      update public.registrations set team_id = team where id = reg;
    else
      begin
        update public.registrations set team_id = team where id = reg;
        raise exception 'FAIL  a 7th member joined the team';
      exception when others then
        if sqlerrm like '%team_full%' then
          raise notice 'PASS  enforce_team_capacity caps a team at 6 registrations';
        else
          raise;
        end if;
      end;
    end if;
  end loop;
end
$$;

select 'VERIFICATION COMPLETE' as result;
