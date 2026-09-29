-- Phase 3: attendance, seats and organizer operations. All writes are Nitro/service-role only.
create type public.attendance_intention as enum ('coming', 'unsure', 'cannot_come');
create type public.seat_state as enum ('accepted', 'offered', 'waitlisted', 'cancelled');

alter table public.registrations
  add column intention public.attendance_intention,
  add column intention_at timestamptz,
  add column seat_state public.seat_state not null default 'accepted',
  add column offer_expires_at timestamptz,
  add column offer_attempts integer not null default 0,
  add column checked_in_at timestamptz,
  add column cancelled_at timestamptz,
  add constraint offer_expiry_matches_state check ((seat_state = 'offered') = (offer_expires_at is not null)),
  add constraint intention_timestamp_pair check ((intention is null) = (intention_at is null));
create index registrations_seat_queue on public.registrations (edition_slug, registered_at)
  where seat_state = 'waitlisted';

-- Only accepted and outstanding offers reserve capacity. The edition lock serializes
-- inserts, offers and cancellations in READ COMMITTED transactions.
create or replace function public.enforce_edition_cap()
returns trigger language plpgsql as $$
declare cap integer; taken integer;
begin
  if new.seat_state not in ('accepted', 'offered') then return new; end if;
  if tg_op = 'UPDATE' and old.seat_state in ('accepted', 'offered')
     and old.edition_slug = new.edition_slug then return new; end if;
  select participant_cap into cap from public.editions
    where slug = new.edition_slug for no key update;
  select count(*) into taken from public.registrations
    where edition_slug = new.edition_slug and seat_state in ('accepted', 'offered');
  if taken >= cap then raise exception 'registration_closed'; end if;
  return new;
end; $$;
create trigger enforce_edition_cap_update before update of seat_state, edition_slug
  on public.registrations for each row execute function public.enforce_edition_cap();

create function public.prevent_cap_below_seats() returns trigger language plpgsql as $$
begin
  if new.participant_cap < (select count(*) from public.registrations
    where edition_slug = new.slug and seat_state in ('accepted','offered')) then
    raise exception 'cap_below_reserved_seats';
  end if;
  return new;
end; $$;
create trigger prevent_cap_below_seats before update of participant_cap on public.editions
  for each row execute function public.prevent_cap_below_seats();
revoke all on function public.prevent_cap_below_seats() from public, anon, authenticated;

create table public.attendance_barriers (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  reasons text[] not null default '{}',
  details varchar(500),
  updated_at timestamptz not null default now(),
  constraint barrier_reasons_allowed check (reasons <@ array['transport','equipment','timing','team','other']::text[])
);
alter table public.attendance_barriers enable row level security;
revoke all on public.attendance_barriers from anon, authenticated;

create table public.checkin_events (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  actor_id uuid not null references public.participants(id),
  old_checked_in_at timestamptz,
  new_checked_in_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.checkin_events enable row level security;
revoke all on public.checkin_events from anon, authenticated;

create table public.notification_jobs (
  id bigint generated always as identity primary key,
  edition_slug text not null references public.editions(slug),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  kind text not null,
  dedup_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index notification_jobs_due on public.notification_jobs (next_attempt_at)
  where status in ('pending','failed');
alter table public.notification_jobs enable row level security;
revoke all on public.notification_jobs from anon, authenticated;

create table public.organizer_outreach (
  edition_slug text not null references public.editions(slug),
  queue text not null check (queue in ('unmatched','unanswered_request','uncertain','contact_failure','unconfirmed_team')),
  subject_id uuid not null,
  status text not null default 'open' check (status in ('open','assigned','contacted','resolved')),
  owner_id uuid references public.participants(id),
  outcome varchar(500),
  updated_at timestamptz not null default now(),
  primary key (edition_slug, queue, subject_id)
);
alter table public.organizer_outreach enable row level security;
revoke all on public.organizer_outreach from anon, authenticated;

alter table public.editions
  add column reminder_mixer_days integer not null default 10 check (reminder_mixer_days >= 0),
  add column reminder_reconfirm_days integer not null default 7 check (reminder_reconfirm_days >= 0),
  add column reminder_arrival_hours integer not null default 24 check (reminder_arrival_hours >= 0),
  add column unanswered_request_hours integer not null default 48 check (unanswered_request_hours >= 1),
  add column seat_offer_hours integer not null default 24 check (seat_offer_hours >= 1),
  add column arrival_host varchar(120),
  add column team_formation_slot timestamptz;

-- Caller must be the registration holder. Intentions never mutate seat state.
create function public.set_attendance_intention(p_registration uuid, p_participant uuid,
  p_intention public.attendance_intention, p_reasons text[], p_details text)
returns public.registrations language plpgsql as $$
declare r public.registrations;
begin
  update public.registrations set intention = p_intention, intention_at = now()
  where id = p_registration and participant_id = p_participant
    and seat_state <> 'cancelled' returning * into r;
  if not found then raise exception 'not_eligible'; end if;
  if p_reasons is not null or p_details is not null then
    insert into public.attendance_barriers (registration_id, reasons, details)
    values (r.id, coalesce(p_reasons, '{}'), nullif(btrim(p_details), ''))
    on conflict (registration_id) do update set reasons = excluded.reasons,
      details = excluded.details, updated_at = now();
  end if;
  return r;
end; $$;

-- Called after cancellation or offer expiry while the edition is locked.
create function public.offer_next_seat(p_edition text) returns uuid language plpgsql as $$
declare cap integer; taken integer; candidate uuid; hours integer;
begin
  select participant_cap, seat_offer_hours into cap, hours from public.editions
    where slug = p_edition for no key update;
  select count(*) into taken from public.registrations
    where edition_slug = p_edition and seat_state in ('accepted','offered');
  if taken >= cap then return null; end if;
  select id into candidate from public.registrations
    where edition_slug = p_edition and seat_state = 'waitlisted' and offer_attempts = 0
    order by registered_at, id limit 1 for update;
  if candidate is null then return null; end if;
  update public.registrations set seat_state = 'offered',
    offer_expires_at = now() + make_interval(hours => hours),
    offer_attempts = offer_attempts + 1 where id = candidate;
  insert into public.notification_jobs (edition_slug, registration_id, kind, dedup_key)
    values (p_edition, candidate, 'seat_offer',
      format('seat_offer:%s:%s:%s', p_edition, candidate,
        (select offer_attempts from public.registrations where id = candidate)))
    on conflict (dedup_key) do nothing;
  return candidate;
end; $$;

create function public.change_seat(p_registration uuid, p_participant uuid, p_action text)
returns public.registrations language plpgsql as $$
declare r public.registrations;
begin
  perform 1 from public.editions where slug =
    (select edition_slug from public.registrations where id = p_registration and participant_id = p_participant)
    for no key update;
  select * into r from public.registrations where id = p_registration
    and participant_id = p_participant for update;
  if not found then raise exception 'not_eligible'; end if;
  if p_action = 'accept' and r.seat_state = 'offered'
      and r.offer_expires_at <= now() then
    perform public.expire_seat_offers(r.edition_slug);
    select * into r from public.registrations where id = p_registration;
    return r;
  end if;
  if p_action = 'cancel' and r.seat_state <> 'cancelled' then
    if r.checked_in_at is not null then raise exception 'already_checked_in'; end if;
    update public.registrations set seat_state = 'cancelled', cancelled_at = now(),
      offer_expires_at = null where id = r.id returning * into r;
    perform public.offer_next_seat(r.edition_slug);
  elsif p_action = 'accept' and r.seat_state = 'offered'
      and r.offer_expires_at > now() then
    update public.registrations set seat_state = 'accepted', offer_expires_at = null
      where id = r.id returning * into r;
  else raise exception 'invalid_seat_transition'; end if;
  return r;
end; $$;

create function public.expire_seat_offers(p_edition text) returns integer language plpgsql as $$
declare n integer; cap integer;
begin
  select participant_cap into cap from public.editions where slug = p_edition for no key update;
  update public.registrations set seat_state = 'waitlisted', offer_expires_at = null
    where edition_slug = p_edition and seat_state = 'offered' and offer_expires_at <= now();
  get diagnostics n = row_count;
  for cap in 1..n loop perform public.offer_next_seat(p_edition); end loop;
  return n;
end; $$;

create function public.record_checkin(p_registration uuid, p_actor uuid,
  p_checked_in_at timestamptz, p_reason text) returns public.registrations language plpgsql as $$
declare r public.registrations; old_at timestamptz;
begin
  if not exists (select 1 from public.participants where id = p_actor and role = 'admin')
    then raise exception 'not_organizer'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required'; end if;
  select checked_in_at into old_at from public.registrations where id = p_registration for update;
  if not found then raise exception 'registration_not_found'; end if;
  if p_checked_in_at is not null and not exists
    (select 1 from public.registrations where id = p_registration and seat_state = 'accepted')
    then raise exception 'seat_not_accepted'; end if;
  update public.registrations set checked_in_at = p_checked_in_at
    where id = p_registration returning * into r;
  insert into public.checkin_events (registration_id, actor_id, old_checked_in_at, new_checked_in_at, reason)
    values (p_registration, p_actor, old_at, p_checked_in_at, p_reason);
  return r;
end; $$;

revoke all on function public.set_attendance_intention(uuid, uuid, public.attendance_intention, text[], text) from public, anon, authenticated;
revoke all on function public.offer_next_seat(text) from public, anon, authenticated;
revoke all on function public.change_seat(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_seat_offers(text) from public, anon, authenticated;
revoke all on function public.record_checkin(uuid, uuid, timestamptz, text) from public, anon, authenticated;
