-- ============================================================
-- Phase 3 review fixes: atomic seat admission, a waitlist that always moves
-- when a reserved seat is freed, job claiming for the notification
-- dispatcher, and snapshots that can only be taken inside their window.
-- ============================================================

-- ------------------------------------------------------------
-- Admission: decide accepted vs waitlisted under the edition lock, in the
-- INSERT itself. Nobody jumps a waiting queue: while anyone is still
-- waiting for a first offer, newcomers join the queue too, and the AFTER
-- trigger offers any free seat to the head of it.
-- ------------------------------------------------------------

create or replace function public.admit_new_registration()
returns trigger
language plpgsql
as $$
declare
  cap int;
  taken int;
begin
  if new.seat_state not in ('accepted', 'offered') then
    return new;
  end if;

  select participant_cap into cap from public.editions
  where slug = new.edition_slug
  for no key update;

  if cap is null then
    return new;
  end if;

  select count(*) into taken from public.registrations
  where edition_slug = new.edition_slug and seat_state in ('accepted', 'offered');

  if taken >= cap or exists (
    select 1 from public.registrations
    where edition_slug = new.edition_slug and seat_state = 'waitlisted' and offer_attempts = 0
  ) then
    new.seat_state := 'waitlisted';
    new.offer_expires_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_edition_cap on public.registrations;
create trigger admit_new_registration
  before insert on public.registrations
  for each row
  execute function public.admit_new_registration();

-- Any reserved seat that disappears (a failed signup rolled back by the API,
-- an account deletion) goes to the next person waiting.
create or replace function public.advance_waitlist()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.seat_state = 'waitlisted' then
      perform public.offer_next_seat(new.edition_slug);
    end if;
    return new;
  end if;

  if old.seat_state in ('accepted', 'offered') then
    perform public.offer_next_seat(old.edition_slug);
  end if;
  return old;
end;
$$;

create trigger advance_waitlist_after_insert
  after insert on public.registrations
  for each row
  execute function public.advance_waitlist();

create trigger advance_waitlist_after_delete
  after delete on public.registrations
  for each row
  execute function public.advance_waitlist();

-- Raising the cap frees seats. Offer each newly opened seat to the queue, or a
-- raised capacity sits idle and a newcomer takes a seat ahead of the waitlist.
create or replace function public.advance_waitlist_on_cap_raise()
returns trigger
language plpgsql
as $$
declare
  i int;
begin
  if new.participant_cap > old.participant_cap then
    for i in 1..(new.participant_cap - old.participant_cap) loop
      if public.offer_next_seat(new.slug) is null then
        exit;
      end if;
    end loop;
  end if;
  return null;
end;
$$;

create trigger advance_waitlist_on_cap_raise
  after update of participant_cap on public.editions
  for each row
  execute function public.advance_waitlist_on_cap_raise();

-- ------------------------------------------------------------
-- Notification jobs: claim due work for one dispatcher run. SKIP LOCKED lets
-- concurrent runs split the queue; a job left in 'sending' past its lease
-- (a run that crashed) becomes claimable again. At most five attempts.
-- ------------------------------------------------------------

create or replace function public.claim_notification_jobs(p_limit int)
returns setof public.notification_jobs
language plpgsql
as $$
begin
  return query
  update public.notification_jobs j
  set status = 'sending',
      attempts = j.attempts + 1,
      next_attempt_at = now() + interval '15 minutes'
  where j.id in (
    select id from public.notification_jobs
    where next_attempt_at <= now()
      and attempts < 5
      and status in ('pending', 'failed', 'sending')
    order by next_attempt_at, id
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;

-- ------------------------------------------------------------
-- Snapshots: only inside their window (from the cutoff until the event
-- starts), so an early click cannot freeze the wrong cohort.
-- ------------------------------------------------------------

create or replace function public.snapshot_window_open(p_edition text, p_cutoff text)
returns boolean
language sql
stable
as $$
  select e.starts_at is not null
     and now() >= e.starts_at - case p_cutoff
           when '14_days' then interval '14 days'
           when '7_days' then interval '7 days'
           when '1_day' then interval '1 day'
         end
     and now() < e.starts_at
  from public.editions e
  where e.slug = p_edition;
$$;

create or replace function public.capture_attendance_snapshot(p_edition text, p_cutoff text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  if p_cutoff not in ('14_days', '7_days', '1_day') then
    raise exception 'invalid_cutoff';
  end if;
  if not coalesce(public.snapshot_window_open(p_edition, p_cutoff), false) then
    raise exception 'snapshot_window_closed';
  end if;
  -- Once captured, a cutoff is immutable.
  if exists (
    select 1 from public.attendance_snapshots where edition_slug = p_edition and cutoff = p_cutoff
  ) then
    raise exception 'snapshot_already_captured';
  end if;

  insert into public.attendance_snapshots (edition_slug, cutoff, registration_id, team_id, formation_source)
  select r.edition_slug, p_cutoff, r.id, r.team_id, m.source
  from public.registrations r
  left join lateral (
    select source from public.membership_events
    where registration_id = r.id and event = 'joined' and team_id = r.team_id
    order by created_at desc, id desc limit 1
  ) m on true
  where r.edition_slug = p_edition;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Capture every cutoff whose window is open and not yet captured. Run by the
-- dispatcher, so snapshots happen on schedule without an organizer click.
create or replace function public.capture_due_snapshots(p_edition text)
returns text[]
language plpgsql
as $$
declare
  v_cutoff text;
  captured text[] := '{}';
begin
  foreach v_cutoff in array array['14_days', '7_days', '1_day'] loop
    if coalesce(public.snapshot_window_open(p_edition, v_cutoff), false)
       and not exists (
         select 1 from public.attendance_snapshots s
         where s.edition_slug = p_edition and s.cutoff = v_cutoff
       ) then
      perform public.capture_attendance_snapshot(p_edition, v_cutoff);
      captured := captured || v_cutoff;
    end if;
  end loop;
  return captured;
end;
$$;

revoke all on function public.admit_new_registration() from public, anon, authenticated;
revoke all on function public.advance_waitlist() from public, anon, authenticated;
revoke all on function public.advance_waitlist_on_cap_raise() from public, anon, authenticated;
revoke all on function public.claim_notification_jobs(int) from public, anon, authenticated;
revoke all on function public.snapshot_window_open(text, text) from public, anon, authenticated;
revoke all on function public.capture_attendance_snapshot(text, text) from public, anon, authenticated;
revoke all on function public.capture_due_snapshots(text) from public, anon, authenticated;
