-- Source links and consent-gated funnel analytics.
--
-- Collection only ever happens for a browser that clicked "Allow analytics":
-- that click creates an analytics_browsers row whose random id the server sets
-- as an HttpOnly cookie. No row, no event. There is no anonymous fallback
-- tracker. Analytics is also off per edition until an admin turns it on
-- (editions.analytics_enabled), so shipping this migration activates nothing.
--
-- Lifetimes (product defaults, see docs/privacy/retention-and-deletion.md):
--   browser id + journey   fixed 30 days from consent, never extended
--   individual events      at most 60 days from collection
--   aggregates             attribution_daily / funnel_cohort_daily, no ids

alter table public.editions
  add column if not exists analytics_enabled boolean not null default false;

comment on column public.editions.analytics_enabled is
  'Consent banner and analytics collection are off until an admin enables them for the edition.';

-- ------------------------------------------------------------
-- Source links
-- ------------------------------------------------------------

-- System sources are reserved and can never be a link tag:
--   direct, unknown, ref-<category> (see shared/utils/source.ts).
create table if not exists public.source_links (
  id           uuid primary key default gen_random_uuid(),
  tag          text not null unique
                 check (tag ~ '^[a-z0-9][a-z0-9-]{1,47}$'
                        and tag !~ '^ref-'
                        and tag not in ('direct', 'unknown', 'go')),
  label        text not null check (length(trim(label)) between 1 and 80),
  note         text null check (note is null or length(note) <= 300),
  edition_slug text not null references public.editions(slug) on update cascade on delete restrict,
  channel      text not null check (channel in
                 ('instagram', 'poster', 'print', 'partner', 'email', 'other')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz null
);

-- Tags are printed on posters: immutable, never deleted, never recycled.
create or replace function public.source_links_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'source_links are archived, not deleted';
  end if;
  if new.tag is distinct from old.tag then
    raise exception 'source_links.tag is immutable';
  end if;
  if old.archived_at is not null and (new.archived_at is null or new.active) then
    raise exception 'an archived source link cannot be restored';
  end if;
  return new;
end;
$$;

drop trigger if exists source_links_guard on public.source_links;
create trigger source_links_guard
  before update or delete on public.source_links
  for each row execute function public.source_links_guard();

-- ------------------------------------------------------------
-- Analytics browsers and events
-- ------------------------------------------------------------

create table if not exists public.analytics_browsers (
  id             uuid primary key default gen_random_uuid(),
  consented_at   timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days',
  notice_version text not null check (length(notice_version) between 1 and 40),
  check (expires_at = consented_at + interval '30 days')
);

create table if not exists public.analytics_events (
  id             bigint generated always as identity primary key,
  browser_id     uuid not null references public.analytics_browsers(id) on delete cascade,
  event          text not null check (event in
                   ('landing_viewed', 'registration_cta_clicked',
                    'registration_started', 'registration_completed')),
  edition_slug   text not null references public.editions(slug) on update cascade on delete cascade,
  -- Archived links keep their history: restrict, never cascade.
  source_link_id uuid null references public.source_links(id) on delete restrict,
  ref_category   text null check (ref_category is null or ref_category in
                   ('direct', 'ref-instagram', 'ref-facebook', 'ref-google', 'ref-telegram',
                    'ref-linkedin', 'ref-tiktok', 'ref-youtube', 'ref-x', 'ref-other')),
  -- Hour precision is all the reports need.
  occurred_at    timestamptz not null default date_trunc('hour', now())
                   check (occurred_at = date_trunc('hour', occurred_at)),
  check (source_link_id is null or ref_category is null),
  check ((event = 'landing_viewed') = (source_link_id is not null or ref_category is not null))
);

-- One row per browser, event, source and hour: replays and double fires collapse.
create unique index if not exists analytics_events_dedupe_idx
  on public.analytics_events (
    browser_id, event, edition_slug,
    coalesce(source_link_id::text, ref_category, ''), occurred_at
  );

-- Completion is counted once per browser and edition, whatever retries.
create unique index if not exists analytics_events_completed_once_idx
  on public.analytics_events (browser_id, edition_slug)
  where event = 'registration_completed';

create index if not exists analytics_events_edition_idx
  on public.analytics_events (edition_slug, event, occurred_at);

-- ------------------------------------------------------------
-- Aggregates (no browser or account ids)
-- ------------------------------------------------------------

create table if not exists public.attribution_daily (
  edition_slug text not null references public.editions(slug) on update cascade on delete cascade,
  day          date not null,                     -- registration date, Europe/Sofia
  model        text not null check (model in ('first', 'last', 'assisted')),
  source_key   text not null,                     -- link tag or system source
  registrations int not null check (registrations > 0),
  primary key (edition_slug, day, model, source_key)
);

create table if not exists public.funnel_cohort_daily (
  edition_slug text not null references public.editions(slug) on update cascade on delete cascade,
  cohort_day   date not null,                     -- first landing, Europe/Sofia
  channel      text not null,
  landed       int not null,
  cta          int not null,
  started      int not null,
  completed_7d int not null,
  rolled_at    timestamptz not null default now(),
  primary key (edition_slug, cohort_day, channel)
);

create table if not exists public.maintenance_runs (
  id      bigint generated always as identity primary key,
  job     text not null,
  ran_at  timestamptz not null default now(),
  details jsonb not null default '{}'
);

-- ------------------------------------------------------------
-- Functions
-- ------------------------------------------------------------

-- "Allow analytics": a fresh random id with a fixed 30-day life.
create or replace function public.analytics_grant(p_notice_version text)
returns uuid
language sql
as $$
  insert into public.analytics_browsers (notice_version)
  values (p_notice_version)
  returning id;
$$;

-- Withdrawal / rejection: the browser's events and its id go together.
create or replace function public.analytics_withdraw(p_browser uuid)
returns void
language sql
as $$
  delete from public.analytics_browsers where id = p_browser;
$$;

-- Record one event for a consenting browser.
--
-- The FOR SHARE lock is what makes withdrawal safe against in-flight events:
-- withdraw's DELETE waits for this transaction, then cascades over whatever it
-- inserted; an event arriving after the DELETE finds no row and records
-- nothing. Returns true only when a new row was written.
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
  perform 1
  from public.analytics_browsers b
  join public.editions e on e.slug = p_edition and e.analytics_enabled
  where b.id = p_browser and b.expires_at > now()
  for share of b;
  if not found then
    return false;
  end if;

  -- Abuse ceiling per browser per day; dedupe handles honest repeats.
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

create or replace function public.attribution_increment(
  p_edition  text,
  p_day      date,
  p_first    text,
  p_last     text,
  p_assisted text[]
)
returns void
language sql
as $$
  insert into public.attribution_daily (edition_slug, day, model, source_key, registrations)
  select p_edition, p_day, m.model, m.source_key, 1
  from (
    select 'first' as model, p_first as source_key
    union all select 'last', p_last
    union all select 'assisted', a from unnest(coalesce(p_assisted, '{}')) a
  ) m
  on conflict (edition_slug, day, model, source_key)
  do update set registrations = public.attribution_daily.registrations + 1;
$$;

-- Server-side registration completion and its attribution, atomically: the
-- aggregates are incremented in the same transaction that writes the
-- completion, and only when it was newly written. A failure rolls both back,
-- so a retry can still count it; a replay can never count it twice.
create or replace function public.analytics_complete_registration(
  p_browser  uuid,
  p_edition  text,
  p_day      date,
  p_first    text,
  p_last     text,
  p_assisted text[]
)
returns boolean
language plpgsql
as $$
begin
  if not public.analytics_record(p_browser, 'registration_completed', p_edition, null, null) then
    return false;
  end if;
  perform public.attribution_increment(p_edition, p_day, p_first, p_last, p_assisted);
  return true;
end;
$$;

-- Funnel per first-landing cohort, computed from individual events. A cohort's
-- seven-day window is closed once the whole Sofia day plus seven days is past;
-- open cohorts are reported separately.
create or replace function public.funnel_cohorts(p_edition text)
returns table (
  cohort_day date, channel text,
  landed bigint, cta bigint, started bigint, completed_7d bigint,
  window_closed boolean
)
language sql
stable
as $$
  with firsts as (
    select distinct on (e.browser_id)
      e.browser_id,
      e.occurred_at as first_at,
      coalesce(sl.channel, case when e.ref_category = 'direct' then 'direct' else 'referral' end) as channel
    from public.analytics_events e
    left join public.source_links sl on sl.id = e.source_link_id
    where e.edition_slug = p_edition and e.event = 'landing_viewed'
    order by e.browser_id, e.occurred_at, e.id
  ),
  reached as (
    select f.browser_id, f.first_at, f.channel,
      coalesce(bool_or(e.event = 'registration_cta_clicked'), false) as cta,
      coalesce(bool_or(e.event = 'registration_started'), false) as started,
      coalesce(bool_or(e.event = 'registration_completed'), false) as completed
    from firsts f
    left join public.analytics_events e
      on e.browser_id = f.browser_id
     and e.edition_slug = p_edition
     and e.occurred_at >= f.first_at
     and e.occurred_at < f.first_at + interval '7 days'
    group by f.browser_id, f.first_at, f.channel
  )
  select
    (r.first_at at time zone 'Europe/Sofia')::date as cohort_day,
    r.channel,
    count(*),
    count(*) filter (where r.cta),
    count(*) filter (where r.started),
    count(*) filter (where r.completed),
    (((r.first_at at time zone 'Europe/Sofia')::date + 8)::timestamp
       at time zone 'Europe/Sofia') <= now()
  from reached r
  group by 1, 2, 7;
$$;

-- Daily retention job: roll closed cohorts into aggregates, then delete
-- individual data past its lifetime. Every run is logged for monitoring.
create or replace function public.analytics_purge()
returns jsonb
language plpgsql
as $$
declare
  rolled int := 0;
  n int;
  events_deleted int;
  browsers_deleted int;
  ed record;
  result jsonb;
begin
  for ed in select distinct edition_slug from public.analytics_events loop
    insert into public.funnel_cohort_daily
      (edition_slug, cohort_day, channel, landed, cta, started, completed_7d)
    select ed.edition_slug, f.cohort_day, f.channel, f.landed, f.cta, f.started, f.completed_7d
    from public.funnel_cohorts(ed.edition_slug) f
    where f.window_closed
    on conflict (edition_slug, cohort_day, channel) do nothing;
    get diagnostics n = row_count;
    rolled := rolled + n;
  end loop;

  delete from public.analytics_events where occurred_at < now() - interval '60 days';
  get diagnostics events_deleted = row_count;

  -- An id stops recording at expires_at (30 days); its remaining events go with
  -- it 30 days later, so no event outlives 60 days from collection.
  delete from public.analytics_browsers where expires_at < now() - interval '30 days';
  get diagnostics browsers_deleted = row_count;

  result := jsonb_build_object(
    'cohorts_rolled_up', rolled,
    'events_deleted', events_deleted,
    'browsers_deleted', browsers_deleted
  );
  insert into public.maintenance_runs (job, details) values ('analytics_purge', result);
  return result;
end;
$$;

-- ------------------------------------------------------------
-- Access control
-- ------------------------------------------------------------

alter table public.source_links        enable row level security;
alter table public.analytics_browsers  enable row level security;
alter table public.analytics_events    enable row level security;
alter table public.attribution_daily   enable row level security;
alter table public.funnel_cohort_daily enable row level security;
alter table public.maintenance_runs    enable row level security;

revoke all on public.source_links, public.analytics_browsers, public.analytics_events,
              public.attribution_daily, public.funnel_cohort_daily, public.maintenance_runs
  from anon, authenticated;

revoke all on function public.source_links_guard() from public, anon, authenticated;
revoke all on function public.analytics_grant(text) from public, anon, authenticated;
revoke all on function public.analytics_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.analytics_record(uuid, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.attribution_increment(text, date, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.funnel_cohorts(text) from public, anon, authenticated;
revoke all on function public.analytics_complete_registration(uuid, text, date, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.analytics_purge() from public, anon, authenticated;

-- Schedule the purge only where pg_cron is already enabled; enabling it is a
-- deliberate operator step (docs/privacy/retention-and-deletion.md).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('analytics-purge', '17 3 * * *', 'select public.analytics_purge()');
  end if;
end
$$;
