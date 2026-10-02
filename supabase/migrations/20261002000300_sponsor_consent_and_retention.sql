-- Sponsor sharing becomes voluntary consent; completion and attribution are
-- tied to the registration and stay adjustable until withdrawal is no longer
-- possible; retention is configured explicitly and scheduled.
--
-- Builds on 20261002000100 / 20261002000200 without rewriting their records:
-- existing `acknowledged` sponsor rows stay as they are and never count as
-- consent.

-- ============================================================
-- 0. Retention policies (referenced below)
-- ============================================================

-- One row per category whose period has been DECIDED. No row = no automatic
-- deletion for that category (and, for catering, no free-text dietary notes).
-- Rows are written by an operator with a documented decision, never by the app.
create table if not exists public.retention_policies (
  category   text primary key check (category in (
               'catering_after_edition_end', 'export_audit',
               'superseded_consent_evidence', 'deletion_ledger', 'maintenance_runs')),
  keep_for   interval not null check (keep_for > interval '0'),
  decided_by text not null check (length(trim(decided_by)) > 0),
  decided_at timestamptz not null default now(),
  reference  text not null check (length(trim(reference)) > 0)
);

-- ============================================================
-- 1. Sponsor sharing: explicit Yes/No per named recipient
-- ============================================================

-- "18 or older" for recruitment sharing only. Sharing a minor's profile with a
-- recruiter has no approved handling rule, so exports require `true`.
alter table public.registrations
  add column if not exists recruitment_adult boolean null;

comment on column public.registrations.recruitment_adult is
  'Answer to "18 or older?" asked with the sponsor-sharing choice. Sponsor exports require true.';

-- The previous registration function took an acknowledgment; replaced, not kept.
drop function if exists public.register_with_consents(
  uuid, text, text[], public.experience_level, boolean, text, uuid[], boolean, text, text
);
drop function if exists public.acknowledge_sponsor_recipients(uuid, text, text, uuid[]);

-- Whether free-text dietary notes may be collected: only once a retention
-- period for catering data has been decided (see retention_policies below).
create or replace function public.dietary_notes_enabled()
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.retention_policies where category = 'catering_after_edition_end');
$$;

-- p_sponsor_choices: {"<recipient uuid>": true|false, ...} covering exactly the
-- edition's active recipients. No default: a missing key is an error.
create or replace function public.register_with_consents(
  p_participant       uuid,
  p_edition           text,
  p_skills            text[],
  p_experience        public.experience_level,
  p_public            boolean,
  p_notice_version    text,
  p_sponsor_choices   jsonb,
  p_recruitment_adult boolean,
  p_marketing         boolean,
  p_diet              text,
  p_note              text
)
returns uuid
language plpgsql
as $$
declare
  reg_id uuid;
  recipient uuid;
  current_recipients uuid[];
  answered uuid[];
  any_yes boolean := false;
begin
  if jsonb_typeof(p_sponsor_choices) is distinct from 'object' then
    raise exception 'sponsor_choices_invalid';
  end if;

  select coalesce(array_agg(id order by id), '{}') into current_recipients
  from public.sponsor_recipients
  where edition_slug = p_edition and retired_at is null;

  select coalesce(array_agg(k::uuid order by k::uuid), '{}') into answered
  from jsonb_object_keys(p_sponsor_choices) k;

  if answered is distinct from current_recipients then
    raise exception 'sponsor_recipients_changed';
  end if;

  if exists (select 1 from jsonb_each(p_sponsor_choices) e where jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'sponsor_choices_invalid';
  end if;

  select coalesce(bool_or(e.value::boolean), false) into any_yes from jsonb_each(p_sponsor_choices) e;
  if any_yes and p_recruitment_adult is null then
    raise exception 'recruitment_age_required';
  end if;

  if nullif(trim(p_note), '') is not null and not public.dietary_notes_enabled() then
    raise exception 'dietary_note_disabled';
  end if;

  insert into public.registrations (
    participant_id, edition_slug, skills, experience, public,
    public_opted_in_at, accepted_terms_at, recruitment_adult
  )
  values (
    p_participant, p_edition, coalesce(p_skills, '{}'), p_experience, p_public,
    case when p_public then now() end, now(), p_recruitment_adult
  )
  returning id into reg_id;

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values
    (p_participant, 'terms', p_edition, 'accepted', p_notice_version, null),
    (p_participant, 'privacy_notice', p_edition, 'acknowledged', p_notice_version, null),
    (p_participant, 'marketing_email', null,
       case when p_marketing then 'granted' else 'denied' end::public.consent_decision,
       p_notice_version, null);

  foreach recipient in array current_recipients loop
    insert into public.consent_records
      (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
    values
      (p_participant, 'sponsor_sharing', p_edition,
       case when (p_sponsor_choices ->> recipient::text)::boolean
            then 'granted' else 'denied' end::public.consent_decision,
       p_notice_version, array[recipient]);
  end loop;

  insert into public.registration_catering (registration_id, diet, note, note_consent_at)
  values (reg_id, p_diet, nullif(trim(p_note), ''),
          case when nullif(trim(p_note), '') is not null then now() end);

  if nullif(trim(p_note), '') is not null then
    insert into public.consent_records
      (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
    values (p_participant, 'dietary_note', p_edition, 'granted', p_notice_version, null);
  end if;

  return reg_id;
end;
$$;

-- Editing a note from the dashboard is gated the same way as registration.
create or replace function public.set_dietary_note(
  p_participant    uuid,
  p_edition        text,
  p_notice_version text,
  p_diet           text,
  p_note           text
)
returns void
language plpgsql
as $$
declare
  reg_id uuid;
begin
  if not public.dietary_notes_enabled() then
    raise exception 'dietary_note_disabled';
  end if;
  select id into reg_id from public.registrations
  where participant_id = p_participant and edition_slug = p_edition;
  if reg_id is null then
    raise exception 'not_registered';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'empty_note';
  end if;

  insert into public.registration_catering (registration_id, diet, note, note_consent_at, legacy, updated_at)
  values (reg_id, p_diet, trim(p_note), now(), false, now())
  on conflict (registration_id) do update
    set diet = excluded.diet, note = excluded.note, note_consent_at = excluded.note_consent_at,
        legacy = false, updated_at = excluded.updated_at;

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values (p_participant, 'dietary_note', p_edition, 'granted', p_notice_version, null);
end;
$$;

-- Change one recipient's answer from account settings. Granting needs the
-- age answer; withdrawing never touches the registration.
create or replace function public.set_sponsor_choice(
  p_participant       uuid,
  p_edition           text,
  p_notice_version    text,
  p_recipient         uuid,
  p_grant             boolean,
  p_recruitment_adult boolean
)
returns void
language plpgsql
as $$
declare
  reg_id uuid;
  previous public.consent_decision;
begin
  select id into reg_id from public.registrations
  where participant_id = p_participant and edition_slug = p_edition;
  if reg_id is null then
    raise exception 'not_registered';
  end if;

  if not exists (select 1 from public.sponsor_recipients
                 where id = p_recipient and edition_slug = p_edition and retired_at is null) then
    raise exception 'recipient_not_active';
  end if;

  if p_recruitment_adult is not null then
    update public.registrations set recruitment_adult = p_recruitment_adult where id = reg_id;
  end if;
  if p_grant and (select recruitment_adult from public.registrations where id = reg_id) is null then
    raise exception 'recruitment_age_required';
  end if;

  select decision into previous
  from public.sponsor_consent_state(p_participant, p_edition, p_recipient);

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values (
    p_participant, 'sponsor_sharing', p_edition,
    case when p_grant then 'granted'
         when previous = 'granted' then 'withdrawn'
         else 'denied' end::public.consent_decision,
    p_notice_version, array[p_recipient]
  );
end;
$$;

-- The decision currently in force for one recipient: the latest record that
-- names it, or an edition-wide record (empty scope, e.g. a recorded objection).
create or replace function public.sponsor_consent_state(
  p_participant uuid,
  p_edition     text,
  p_recipient   uuid
)
returns table (decision public.consent_decision, recorded_at timestamptz)
language sql
stable
as $$
  select c.decision, c.recorded_at
  from public.consent_records c
  where c.participant_id = p_participant
    and c.purpose = 'sponsor_sharing'
    and c.edition_slug = p_edition
    and (p_recipient = any (c.recipient_ids) or cardinality(c.recipient_ids) = 0)
  order by c.recorded_at desc, c.id desc
  limit 1;
$$;

-- Eligibility: active recipient, current decision for THIS recipient is
-- `granted`, and the person answered "18 or older". Acknowledgments, denials,
-- withdrawals, objections and missing answers all exclude.
create or replace function public.sponsor_export_rows(p_recipient uuid)
returns table (participant_id uuid, name text, email text, skills text[], experience text)
language sql
stable
as $$
  select p.id, p.name, p.email, r.skills, r.experience::text
  from public.sponsor_recipients s
  join public.registrations r on r.edition_slug = s.edition_slug
  join public.participants p on p.id = r.participant_id
  cross join lateral public.sponsor_consent_state(r.participant_id, r.edition_slug, s.id) c
  where s.id = p_recipient
    and s.retired_at is null
    and c.decision = 'granted'
    and r.recruitment_adult is true
  order by p.name;
$$;

-- ============================================================
-- 2. Completion tied to the registration; attribution live until final
-- ============================================================

-- Completion is no longer "once per browser": two people registering on a
-- shared browser are two registrations. Repeats are prevented per registration
-- instead (analytics_completion_keys).
drop index if exists public.analytics_events_completed_once_idx;
drop index if exists public.analytics_events_dedupe_idx;
create unique index if not exists analytics_events_dedupe_idx
  on public.analytics_events (
    browser_id, event, edition_slug,
    coalesce(source_link_id::text, ref_category, ''), occurred_at
  )
  where event <> 'registration_completed';

-- Attribution is stored on the completion event itself, so withdrawing
-- (which deletes the browser's events) removes it from every report.
alter table public.analytics_events
  add column if not exists attr_first    text null,
  add column if not exists attr_last     text null,
  add column if not exists attr_assisted text[] null;

alter table public.analytics_events
  drop constraint if exists analytics_events_attribution_only_on_completion;
alter table public.analytics_events
  add constraint analytics_events_attribution_only_on_completion
  check ((event = 'registration_completed') = (attr_first is not null and attr_last is not null));

-- "This registration's completion was processed" — the registration id never
-- goes into analytics_events, and this row holds no browser id. Kept 60 days
-- (the latest a retry could matter), removed with the registration.
create table if not exists public.analytics_completion_keys (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  processed_at    timestamptz not null default now()
);

drop function if exists public.analytics_complete_registration(uuid, text, date, text, text, text[]);
drop function if exists public.attribution_increment(text, date, text, text, text[]);

-- The client-facing recorder no longer accepts completion at all: the only
-- way to write one is analytics_complete_registration, keyed by registration.
create or replace function public.analytics_record(
  p_browser     uuid,
  p_event       text,
  p_edition     text,
  p_source_link uuid,
  p_ref         text
)
returns boolean
language plpgsql
as $$
declare
  inserted int;
begin
  if p_event = 'registration_completed' then
    raise exception 'completion_requires_registration';
  end if;

  perform 1
  from public.analytics_browsers b
  join public.editions e on e.slug = p_edition and e.analytics_enabled
  where b.id = p_browser and b.expires_at > now()
  for share of b;
  if not found then
    return false;
  end if;

  if (select count(*) from public.analytics_events
      where browser_id = p_browser and occurred_at > now() - interval '1 day') >= 200 then
    return false;
  end if;

  insert into public.analytics_events (browser_id, event, edition_slug, source_link_id, ref_category)
  values (p_browser, p_event, p_edition, p_source_link, p_ref)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- Same lock discipline as analytics_record: the browser row is held FOR SHARE,
-- so a concurrent withdrawal either waits and then cascades over this event,
-- or has already removed the row and nothing is written.
create or replace function public.analytics_complete_registration(
  p_browser      uuid,
  p_edition      text,
  p_registration uuid,
  p_first        text,
  p_last         text,
  p_assisted     text[]
)
returns boolean
language plpgsql
as $$
declare
  inserted int;
begin
  perform 1
  from public.analytics_browsers b
  join public.editions e on e.slug = p_edition and e.analytics_enabled
  where b.id = p_browser and b.expires_at > now()
  for share of b;
  if not found then
    return false;
  end if;

  insert into public.analytics_completion_keys (registration_id)
  values (p_registration)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  insert into public.analytics_events
    (browser_id, event, edition_slug, attr_first, attr_last, attr_assisted)
  values
    (p_browser, 'registration_completed', p_edition, p_first, p_last, coalesce(p_assisted, '{}'));
  return true;
end;
$$;

-- Days/cohorts already folded into the aggregate tables.
create table if not exists public.analytics_rollup_days (
  edition_slug text not null references public.editions(slug) on update cascade on delete cascade,
  kind         text not null check (kind in ('attribution', 'funnel')),
  day          date not null,
  rolled_at    timestamptz not null default now(),
  primary key (edition_slug, kind, day)
);

-- Registrations per Sofia day, source and model: rolled-up days from
-- attribution_daily, other days live from completion events.
create or replace function public.attribution_report(p_edition text, p_model text)
returns table (day date, source_key text, registrations bigint)
language sql
stable
as $$
  with rolled as (
    select r.day from public.analytics_rollup_days r
    where r.edition_slug = p_edition and r.kind = 'attribution'
  ),
  live as (
    select (e.occurred_at at time zone 'Europe/Sofia')::date as day,
           case p_model when 'first' then array[e.attr_first]
                        when 'last'  then array[e.attr_last]
                        else e.attr_assisted end as keys
    from public.analytics_events e
    where e.edition_slug = p_edition and e.event = 'registration_completed'
  )
  select l.day, k, count(*)
  from live l cross join lateral unnest(l.keys) k
  where l.day not in (select day from rolled)
  group by 1, 2
  union all
  select a.day, a.source_key, a.registrations::bigint
  from public.attribution_daily a
  where a.edition_slug = p_edition and a.model = p_model
    and a.day in (select day from rolled);
$$;

-- Funnel: rolled-up cohorts are final; others are computed live.
create or replace function public.funnel_report(p_edition text)
returns table (
  cohort_day date, channel text,
  landed bigint, cta bigint, started bigint, completed_7d bigint,
  window_closed boolean, final boolean
)
language sql
stable
as $$
  select f.cohort_day, f.channel, f.landed::bigint, f.cta::bigint, f.started::bigint,
         f.completed_7d::bigint, true, true
  from public.funnel_cohort_daily f
  where f.edition_slug = p_edition
  union all
  select l.cohort_day, l.channel, l.landed, l.cta, l.started, l.completed_7d, l.window_closed, false
  from public.funnel_cohorts(p_edition) l
  where not exists (
    select 1 from public.analytics_rollup_days r
    where r.edition_slug = p_edition and r.kind = 'funnel' and r.day = l.cohort_day
  );
$$;

-- ============================================================
-- 3. Retention: explicit policies, deletion ledger, scheduled job
-- ============================================================

-- Ids of erased people and withdrawn analytics browsers, so a restored backup
-- can have those deletions re-applied (reapply_deletion_ledger). Holds ids only.
create table if not exists public.deletion_ledger (
  id          bigint generated always as identity primary key,
  subject     text not null check (subject in ('participant', 'analytics_browser')),
  subject_id  uuid not null,
  recorded_at timestamptz not null default now()
);

create or replace function public.ledger_participant_deletion()
returns trigger
language plpgsql
as $$
begin
  insert into public.deletion_ledger (subject, subject_id) values ('participant', old.id);
  return old;
end;
$$;

drop trigger if exists participants_deletion_ledger on public.participants;
create trigger participants_deletion_ledger
  after delete on public.participants
  for each row execute function public.ledger_participant_deletion();

create or replace function public.analytics_withdraw(p_browser uuid)
returns void
language plpgsql
as $$
begin
  delete from public.analytics_browsers where id = p_browser;
  if found then
    insert into public.deletion_ledger (subject, subject_id) values ('analytics_browser', p_browser);
  end if;
end;
$$;

-- After restoring a backup: delete everything the ledger says was erased.
create or replace function public.reapply_deletion_ledger()
returns jsonb
language plpgsql
as $$
declare
  people int;
  browsers int;
begin
  delete from auth.users u
  using public.deletion_ledger l
  where l.subject = 'participant' and l.subject_id = u.id;
  get diagnostics people = row_count;

  delete from public.participants p
  using public.deletion_ledger l
  where l.subject = 'participant' and l.subject_id = p.id;

  delete from public.analytics_browsers b
  using public.deletion_ledger l
  where l.subject = 'analytics_browser' and l.subject_id = b.id;
  get diagnostics browsers = row_count;

  return jsonb_build_object('participants', people, 'analytics_browsers', browsers);
end;
$$;

-- Analytics retention. Aggregation waits until no browser in the day/cohort
-- can still withdraw (ids live 30 days from consent, consent precedes the
-- first landing), so every withdrawal is reflected exactly in the totals.
create or replace function public.analytics_purge()
returns jsonb
language plpgsql
as $$
declare
  today date := (now() at time zone 'Europe/Sofia')::date;
  final_before date := today - 31;
  ed record;
  n int;
  attribution_days int := 0;
  cohorts int := 0;
  events_deleted int;
  browsers_deleted int;
  keys_deleted int;
  result jsonb;
begin
  for ed in select distinct edition_slug from public.analytics_events loop
    -- Attribution of registration days that can no longer change.
    insert into public.attribution_daily (edition_slug, day, model, source_key, registrations)
    select ed.edition_slug, d.day, m.model, d.source_key, sum(d.registrations)::int
    from (values ('first'), ('last'), ('assisted')) m(model)
    cross join lateral public.attribution_report(ed.edition_slug, m.model) d
    where d.day < final_before
      and not exists (select 1 from public.analytics_rollup_days r
                      where r.edition_slug = ed.edition_slug and r.kind = 'attribution' and r.day = d.day)
    group by ed.edition_slug, d.day, m.model, d.source_key
    on conflict (edition_slug, day, model, source_key)
    do update set registrations = excluded.registrations;

    insert into public.analytics_rollup_days (edition_slug, kind, day)
    select distinct ed.edition_slug, 'attribution', (e.occurred_at at time zone 'Europe/Sofia')::date
    from public.analytics_events e
    where e.edition_slug = ed.edition_slug and e.event = 'registration_completed'
      and (e.occurred_at at time zone 'Europe/Sofia')::date < final_before
    on conflict do nothing;
    get diagnostics n = row_count;
    attribution_days := attribution_days + n;

    -- Funnel cohorts that are closed and can no longer change.
    insert into public.funnel_cohort_daily
      (edition_slug, cohort_day, channel, landed, cta, started, completed_7d)
    select ed.edition_slug, f.cohort_day, f.channel, f.landed, f.cta, f.started, f.completed_7d
    from public.funnel_cohorts(ed.edition_slug) f
    where f.window_closed and f.cohort_day < final_before
      and not exists (select 1 from public.analytics_rollup_days r
                      where r.edition_slug = ed.edition_slug and r.kind = 'funnel' and r.day = f.cohort_day)
    on conflict (edition_slug, cohort_day, channel) do nothing;

    insert into public.analytics_rollup_days (edition_slug, kind, day)
    select distinct ed.edition_slug, 'funnel', f.cohort_day
    from public.funnel_cohorts(ed.edition_slug) f
    where f.window_closed and f.cohort_day < final_before
    on conflict do nothing;
    get diagnostics n = row_count;
    cohorts := cohorts + n;
  end loop;

  delete from public.analytics_events where occurred_at < now() - interval '60 days';
  get diagnostics events_deleted = row_count;

  delete from public.analytics_browsers where expires_at < now() - interval '30 days';
  get diagnostics browsers_deleted = row_count;

  delete from public.analytics_completion_keys where processed_at < now() - interval '60 days';
  get diagnostics keys_deleted = row_count;

  result := jsonb_build_object(
    'attribution_days_finalised', attribution_days,
    'funnel_cohort_days_finalised', cohorts,
    'events_deleted', events_deleted,
    'browsers_deleted', browsers_deleted,
    'completion_keys_deleted', keys_deleted
  );
  insert into public.maintenance_runs (job, details) values ('analytics_purge', result);
  return result;
end;
$$;

-- Everything scheduled, in one call. Categories without a decided policy are
-- reported as skipped, never deleted.
create or replace function public.run_retention()
returns jsonb
language plpgsql
as $$
declare
  analytics jsonb;
  policy interval;
  n int;
  result jsonb := '{}';
begin
  analytics := public.analytics_purge();
  result := result || jsonb_build_object('analytics', analytics);

  select keep_for into policy from public.retention_policies where category = 'catering_after_edition_end';
  if policy is null then
    result := result || '{"catering_after_edition_end": "skipped: no decided policy"}';
  else
    delete from public.registration_catering c
    using public.registrations r, public.editions e
    where r.id = c.registration_id and e.slug = r.edition_slug
      and e.ends_at is not null and e.ends_at < now() - policy;
    get diagnostics n = row_count;
    result := result || jsonb_build_object('catering_after_edition_end', n);
  end if;

  select keep_for into policy from public.retention_policies where category = 'export_audit';
  if policy is null then
    result := result || '{"export_audit": "skipped: no decided policy"}';
  else
    delete from public.export_audit where exported_at < now() - policy;
    get diagnostics n = row_count;
    result := result || jsonb_build_object('export_audit', n);
  end if;

  select keep_for into policy from public.retention_policies where category = 'superseded_consent_evidence';
  if policy is null then
    result := result || '{"superseded_consent_evidence": "skipped: no decided policy"}';
  else
    -- Only records that are no longer the decision in force are removed.
    delete from public.consent_records c
    using (
      select id, row_number() over (
        partition by participant_id, purpose, edition_slug, recipient_ids
        order by recorded_at desc, id desc) as rn
      from public.consent_records
    ) ranked
    where ranked.id = c.id and ranked.rn > 1 and c.recorded_at < now() - policy;
    get diagnostics n = row_count;
    result := result || jsonb_build_object('superseded_consent_evidence', n);
  end if;

  select keep_for into policy from public.retention_policies where category = 'deletion_ledger';
  if policy is null then
    result := result || '{"deletion_ledger": "skipped: no decided policy"}';
  else
    delete from public.deletion_ledger where recorded_at < now() - policy;
    get diagnostics n = row_count;
    result := result || jsonb_build_object('deletion_ledger', n);
  end if;

  select keep_for into policy from public.retention_policies where category = 'maintenance_runs';
  if policy is not null then
    delete from public.maintenance_runs where ran_at < now() - policy;
  end if;

  insert into public.maintenance_runs (job, details) values ('retention', result);
  return result;
end;
$$;

-- ============================================================
-- 4. Access control
-- ============================================================

alter table public.analytics_completion_keys enable row level security;
alter table public.analytics_rollup_days     enable row level security;
alter table public.retention_policies        enable row level security;
alter table public.deletion_ledger           enable row level security;

revoke all on public.analytics_completion_keys, public.analytics_rollup_days,
              public.retention_policies, public.deletion_ledger
  from anon, authenticated;

revoke all on function public.dietary_notes_enabled() from public, anon, authenticated;
revoke all on function public.register_with_consents(
  uuid, text, text[], public.experience_level, boolean, text, jsonb, boolean, boolean, text, text
) from public, anon, authenticated;
revoke all on function public.set_sponsor_choice(uuid, text, text, uuid, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.sponsor_consent_state(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.sponsor_export_rows(uuid) from public, anon, authenticated;
revoke all on function public.analytics_complete_registration(uuid, text, uuid, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.attribution_report(text, text) from public, anon, authenticated;
revoke all on function public.funnel_report(text) from public, anon, authenticated;
revoke all on function public.ledger_participant_deletion() from public, anon, authenticated;
revoke all on function public.analytics_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.reapply_deletion_ledger() from public, anon, authenticated;
revoke all on function public.analytics_purge() from public, anon, authenticated;
revoke all on function public.run_retention() from public, anon, authenticated;

-- ============================================================
-- 5. Scheduling (idempotent)
-- ============================================================

-- Supabase ships pg_cron; plain Postgres (the test harness) may not. Where it
-- is available the extension is enabled and the daily job (re)created; the
-- previous analytics-only job is replaced. Re-running this block is safe.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('analytics-purge', 'liberhack-retention');
    perform cron.schedule('liberhack-retention', '17 3 * * *', 'select public.run_retention()');
  else
    raise notice 'pg_cron not available: schedule run_retention() another way';
  end if;
end
$$;
