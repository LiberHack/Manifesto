\set ON_ERROR_STOP on

-- Runs after 06-verify-privacy.sql. '2027' is current.

select assert(
  not (select analytics_enabled from public.editions where slug = '2027'),
  'analytics ships switched off for every edition');

select public.analytics_grant('v-test') as b1 \gset

select assert(
  not public.analytics_record(:'b1', 'landing_viewed', '2027', null, 'direct'),
  'nothing is recorded while analytics is off for the edition, even with consent');

update public.editions set analytics_enabled = true where slug = '2027';

-- ------------------------------------------------------------
-- Consent-gated recording
-- ------------------------------------------------------------

select assert(
  (select expires_at = consented_at + interval '30 days'
   from public.analytics_browsers where id = :'b1'),
  'a browser id lives exactly 30 days from consent');

select assert(
  not public.analytics_record(gen_random_uuid(), 'landing_viewed', '2027', null, 'direct'),
  'an id without a consent row records nothing');

insert into public.analytics_browsers (id, consented_at, expires_at, notice_version)
values ('b0000000-0000-0000-0000-00000000000e', now() - interval '31 days',
        now() - interval '1 day', 'v-test');

select assert(
  not public.analytics_record('b0000000-0000-0000-0000-00000000000e', 'landing_viewed', '2027', null, 'direct'),
  'an expired id records nothing (expiry is not extended)');

insert into public.source_links (id, tag, label, edition_slug, channel) values
  ('c0000000-0000-0000-0000-000000000001', 'poster-fmi', 'FMI poster', '2027', 'poster');

select assert(
  public.analytics_record(:'b1', 'landing_viewed', '2027', 'c0000000-0000-0000-0000-000000000001', null),
  'a consenting browser landing through a known link is recorded');

select assert(
  not public.analytics_record(:'b1', 'landing_viewed', '2027', 'c0000000-0000-0000-0000-000000000001', null),
  'the same landing in the same hour is deduplicated');

select assert(
  public.analytics_record(:'b1', 'registration_completed', '2027', null, null)
  and not public.analytics_record(:'b1', 'registration_completed', '2027', null, null),
  'completion is recorded once per browser and edition, whatever the retries');

select assert(
  (select bool_and(occurred_at = date_trunc('hour', occurred_at))
   from public.analytics_events where browser_id = :'b1'),
  'event timestamps are stored to the hour only');

do $$
begin
  begin
    insert into public.analytics_events (browser_id, event, edition_slug, ref_category)
    values ((select id from public.analytics_browsers limit 1), 'page_scrolled', '2027', null);
    raise exception 'FAIL  an undefined event name was stored';
  exception when check_violation then
    raise notice 'PASS  only the four predefined events can be stored';
  end;
  begin
    insert into public.analytics_events (browser_id, event, edition_slug, ref_category)
    values ((select id from public.analytics_browsers limit 1), 'landing_viewed', '2027', 'ref-evil.example');
    raise exception 'FAIL  a free-form referrer was stored';
  exception when check_violation then
    raise notice 'PASS  only normalised referrer categories can be stored';
  end;
end
$$;

-- ------------------------------------------------------------
-- Source links: reserved, immutable, archived not deleted
-- ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['ref-instagram', 'direct', 'unknown', 'Poster FMI', 'x'] loop
    begin
      insert into public.source_links (tag, label, edition_slug, channel)
      values (t, 'bad', '2027', 'poster');
      raise exception 'FAIL  reserved or malformed tag % was accepted', t;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'PASS  system sources and malformed tags cannot be link tags';

  begin
    update public.source_links set tag = 'poster-other' where tag = 'poster-fmi';
    raise exception 'FAIL  a tag was renamed';
  exception when others then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
  begin
    delete from public.source_links where tag = 'poster-fmi';
    raise exception 'FAIL  a source link was deleted';
  exception when others then
    if sqlerrm not like '%archived, not deleted%' then raise; end if;
  end;
  raise notice 'PASS  tags are immutable and links are never deleted';
end
$$;

update public.source_links set active = false, archived_at = now() where tag = 'poster-fmi';

select assert(
  (select count(*) from public.analytics_events
   where source_link_id = 'c0000000-0000-0000-0000-000000000001') = 1,
  'archiving a link keeps the history recorded through it');

do $$
begin
  update public.source_links set active = true where tag = 'poster-fmi';
  raise exception 'FAIL  an archived link was reactivated';
exception when others then
  if sqlerrm like '%cannot be restored%' then
    raise notice 'PASS  an archived link cannot be reactivated or its tag recycled';
  else
    raise;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Withdrawal
-- ------------------------------------------------------------

select public.analytics_withdraw(:'b1');

select assert(
  not exists (select 1 from public.analytics_events where browser_id = :'b1')
  and not exists (select 1 from public.analytics_browsers where id = :'b1'),
  'withdrawal deletes the browser''s events and its id');

select assert(
  not public.analytics_record(:'b1', 'registration_cta_clicked', '2027', null, null),
  'an event arriving after withdrawal cannot recreate history');

-- ------------------------------------------------------------
-- Funnel cohorts and aggregates
-- ------------------------------------------------------------

-- Three browsers that first landed 10 days ago (window closed) and one today.
insert into public.analytics_browsers (id, consented_at, expires_at, notice_version) values
  ('b0000000-0000-0000-0000-000000000002', now() - interval '10 days', now() + interval '20 days', 'v-test'),
  ('b0000000-0000-0000-0000-000000000003', now() - interval '10 days', now() + interval '20 days', 'v-test'),
  ('b0000000-0000-0000-0000-000000000004', now() - interval '10 days', now() + interval '20 days', 'v-test'),
  ('b0000000-0000-0000-0000-000000000005', now(), now() + interval '30 days', 'v-test');

insert into public.analytics_events (browser_id, event, edition_slug, ref_category, occurred_at) values
  ('b0000000-0000-0000-0000-000000000002', 'landing_viewed', '2027', 'ref-instagram', date_trunc('hour', now() - interval '10 days')),
  ('b0000000-0000-0000-0000-000000000002', 'registration_cta_clicked', '2027', null, date_trunc('hour', now() - interval '10 days')),
  ('b0000000-0000-0000-0000-000000000002', 'registration_started', '2027', null, date_trunc('hour', now() - interval '9 days')),
  ('b0000000-0000-0000-0000-000000000002', 'registration_completed', '2027', null, date_trunc('hour', now() - interval '9 days')),
  ('b0000000-0000-0000-0000-000000000003', 'landing_viewed', '2027', 'ref-instagram', date_trunc('hour', now() - interval '10 days')),
  ('b0000000-0000-0000-0000-000000000004', 'landing_viewed', '2027', 'ref-instagram', date_trunc('hour', now() - interval '10 days')),
  ('b0000000-0000-0000-0000-000000000004', 'registration_completed', '2027', null, date_trunc('hour', now() - interval '1 day')),
  ('b0000000-0000-0000-0000-000000000005', 'landing_viewed', '2027', 'direct', date_trunc('hour', now()));

select assert(
  (select landed = 3 and cta = 1 and started = 1 and completed_7d = 1 and window_closed
   from public.funnel_cohorts('2027') where channel = 'referral'),
  'a closed cohort counts the same browsers in numerator and denominator; completion after 7 days is excluded');

select assert(
  (select not window_closed from public.funnel_cohorts('2027') where channel = 'direct'),
  'a cohort whose 7 days are not over is reported as open');

select public.attribution_increment('2027', current_date, 'poster-fmi', 'ref-instagram', array['poster-fmi']);
select public.attribution_increment('2027', current_date, 'poster-fmi', 'poster-fmi', '{}');

-- Completion + attribution in one call: counted once, never on a replay.
select assert(
  public.analytics_complete_registration('b0000000-0000-0000-0000-000000000005', '2027', current_date, 'direct', 'direct', '{}'),
  'a first completion is recorded with its attribution');
select assert(
  not public.analytics_complete_registration('b0000000-0000-0000-0000-000000000005', '2027', current_date, 'direct', 'direct', '{}'),
  'a replayed completion is not recorded again');
select assert(
  (select registrations from public.attribution_daily
   where edition_slug = '2027' and model = 'first' and source_key = 'direct') = 1,
  'the replay did not increment the aggregates');

select assert(
  (select registrations from public.attribution_daily
   where edition_slug = '2027' and model = 'first' and source_key = 'poster-fmi') = 2
  and (select registrations from public.attribution_daily
   where edition_slug = '2027' and model = 'assisted' and source_key = 'poster-fmi') = 1,
  'attribution aggregates count each registration once per model');

-- ------------------------------------------------------------
-- Retention job
-- ------------------------------------------------------------

insert into public.analytics_browsers (id, consented_at, expires_at, notice_version) values
  ('b0000000-0000-0000-0000-000000000006', now() - interval '61 days', now() - interval '31 days', 'v-test');
insert into public.analytics_events (browser_id, event, edition_slug, ref_category, occurred_at) values
  ('b0000000-0000-0000-0000-000000000006', 'landing_viewed', '2027', 'direct', date_trunc('hour', now() - interval '45 days')),
  ('b0000000-0000-0000-0000-000000000003', 'registration_cta_clicked', '2027', null, date_trunc('hour', now() - interval '61 days'));

select public.analytics_purge() as purge \gset

select assert(
  not exists (select 1 from public.analytics_browsers where id = 'b0000000-0000-0000-0000-000000000006')
  and not exists (select 1 from public.analytics_events where browser_id = 'b0000000-0000-0000-0000-000000000006'),
  'an id 30 days past expiry is deleted with its remaining events');

select assert(
  not exists (select 1 from public.analytics_events where occurred_at < now() - interval '60 days'),
  'no individual event outlives 60 days');

select assert(
  (select landed = 3 and completed_7d = 1 from public.funnel_cohort_daily
   where edition_slug = '2027' and channel = 'referral'),
  'closed cohorts are rolled into aggregates before their events expire');

select assert(
  not exists (select 1 from public.funnel_cohort_daily
              where cohort_day = (now() at time zone 'Europe/Sofia')::date),
  'open cohorts are not rolled up early');

select assert(
  exists (select 1 from public.maintenance_runs where job = 'analytics_purge'),
  'each retention run is logged for monitoring');

-- ------------------------------------------------------------
-- Access control
-- ------------------------------------------------------------

select assert(
  bool_and(not has_table_privilege(r.role, t.tbl, 'select')
           and not has_table_privilege(r.role, t.tbl, 'insert')),
  'client roles cannot read or write analytics or source tables')
from (values ('anon'), ('authenticated')) r(role)
cross join (values ('public.analytics_browsers'), ('public.analytics_events'),
                   ('public.source_links'), ('public.attribution_daily'),
                   ('public.funnel_cohort_daily'), ('public.maintenance_runs')) t(tbl);

select assert(
  bool_and(not has_function_privilege(r.role, f.fn, 'execute')),
  'client roles cannot call any analytics function')
from (values ('anon'), ('authenticated')) r(role)
cross join (values
  ('public.analytics_grant(text)'),
  ('public.analytics_withdraw(uuid)'),
  ('public.analytics_record(uuid, text, text, uuid, text)'),
  ('public.attribution_increment(text, date, text, text, text[])'),
  ('public.funnel_cohorts(text)'),
  ('public.analytics_complete_registration(uuid, text, date, text, text, text[])'),
  ('public.analytics_purge()')
) f(fn);

do $$
begin
  set local role anon;
  perform public.analytics_grant('forged');
  raise exception 'FAIL  anon minted an analytics id directly';
exception when insufficient_privilege then
  raise notice 'PASS  a direct anon RPC cannot mint an analytics id';
end
$$;
reset role;

-- Leave '2027' with analytics on and no stray browsers for the race test.
delete from public.analytics_browsers;

select 'ANALYTICS VERIFICATION COMPLETE' as result;
