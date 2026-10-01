\set ON_ERROR_STOP on

-- Runs after 04-verify-ops-toggle.sql: '2027' is the current live edition and
-- '2026' (the seeded one) is archived.

-- ------------------------------------------------------------
-- Legacy data is not turned into consent
-- ------------------------------------------------------------

select assert(
  (select count(*) from public.consent_records) = 0,
  'no consent or acknowledgment is backfilled from legacy accepted_terms_at');

-- Seed a surviving 2026 dietary answer the way the old form stored it, then
-- re-run the copy step's logic is not needed: compare the migration's copies
-- with the rows they came from.
select assert(
  (select count(*) from public.registration_catering c
   join public.registrations r on r.id = c.registration_id
   where c.legacy and c.note_consent_at is null and c.note = trim(r.dietary))
  = (select count(*) from public.registrations
     where edition_slug = '2026' and nullif(trim(dietary), '') is not null)
  and not exists (select 1 from public.registration_catering where not legacy),
  'free-text dietary answers were copied as legacy notes, with no invented consent');

select assert(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'registrations' and column_name = 'public') = 'false',
  'the public archive defaults to off');

select assert(
  not exists (select 1 from public.registrations where public_opted_in_at is not null),
  'no existing registration is treated as an archive opt-in');

-- A pre-change account as the old signup form left it: dietary text in auth
-- metadata and in the old participants column. Cleaned up by 08.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000009', 'legacy@example.com',
   '{"name":"Legacy","dietary":"halal","skills":["Go"]}');
update public.participants set dietary = 'halal'
where id = 'a0000000-0000-0000-0000-000000000009';

-- ------------------------------------------------------------
-- Registration with separate decisions
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'p1@example.com', '{"name":"P One"}'),
  ('a0000000-0000-0000-0000-000000000002', 'p2@example.com', '{"name":"P Two"}'),
  ('a0000000-0000-0000-0000-000000000003', 'p3@example.com', '{"name":"P Three"}');

insert into public.sponsor_recipients (id, edition_slug, organisation) values
  ('50000000-0000-0000-0000-000000000001', '2027', 'Acme Ltd'),
  ('50000000-0000-0000-0000-000000000002', '2027', 'Beta AD');

do $$
begin
  perform public.register_with_consents(
    'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
    array['50000000-0000-0000-0000-000000000001']::uuid[], false, 'none', null);
  raise exception 'FAIL  a registration acknowledging a stale recipient list was accepted';
exception when others then
  if sqlerrm like '%sponsor_recipients_changed%' then
    raise notice 'PASS  an acknowledgment must cover exactly the current recipients';
  else
    raise;
  end if;
end
$$;

select assert(
  not exists (select 1 from public.registrations
              where participant_id = 'a0000000-0000-0000-0000-000000000001'),
  'the failed registration left no partial row');

-- P1: marketing No, no note.
select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
  array['50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001']::uuid[],
  false, 'none', null) is not null as registered \gset

-- P2: marketing Yes, dietary note with consent, archive opt-in.
select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000002', '2027', '{Rust}', 'experienced', true, 'v-test',
  array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002']::uuid[],
  true, 'other', 'no nuts') is not null as registered \gset

select assert(
  (select count(*) from public.registrations where edition_slug = '2027'
     and participant_id in ('a0000000-0000-0000-0000-000000000001',
                            'a0000000-0000-0000-0000-000000000002')) = 2,
  'registration succeeds whether marketing is yes or no');

select assert(
  (select decision = 'denied' from public.latest_consent(
     'a0000000-0000-0000-0000-000000000001', 'marketing_email', null)),
  'marketing No is recorded as denied, not skipped');

select assert(
  (select count(*) from public.consent_records
   where participant_id = 'a0000000-0000-0000-0000-000000000001'
     and purpose in ('terms', 'privacy_notice', 'sponsor_sharing', 'marketing_email')
     and notice_version = 'v-test') = 4,
  'each purpose gets its own record with the notice version');

select assert(
  (select decision = 'acknowledged' and cardinality(recipient_ids) = 2
   from public.latest_consent('a0000000-0000-0000-0000-000000000001', 'sponsor_sharing', '2027')),
  'the sponsor acknowledgment stores the exact recipient scope');

select assert(
  (select note = 'no nuts' and note_consent_at is not null and not legacy
   from public.registration_catering c
   join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000002'),
  'a dietary note is stored with its explicit consent time');

select assert(
  (select public_opted_in_at is not null from public.registrations
   where participant_id = 'a0000000-0000-0000-0000-000000000002' and edition_slug = '2027')
  and (select public_opted_in_at is null from public.registrations
   where participant_id = 'a0000000-0000-0000-0000-000000000001' and edition_slug = '2027'),
  'archive visibility is set only by an explicit opt-in');

-- ------------------------------------------------------------
-- Sponsor export eligibility
-- ------------------------------------------------------------

select assert(
  (select count(*) from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')) = 2,
  'both acknowledging registrants are eligible for a listed recipient');

select assert(
  not exists (
    select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001') e
    where e.participant_id in ('11111111-1111-1111-1111-111111111111',
                               '22222222-2222-2222-2222-222222222222')),
  'legacy registrants are never eligible');

select assert(
  pg_get_function_result('public.sponsor_export_rows(uuid)'::regprocedure)
    = 'TABLE(participant_id uuid, name text, email text, skills text[], experience text)',
  'the sponsor export can only return name, email, skills and experience');

insert into public.sponsor_recipients (id, edition_slug, organisation) values
  ('50000000-0000-0000-0000-000000000003', '2027', 'Gamma OOD');

select assert(
  (select count(*) from public.sponsor_export_rows('50000000-0000-0000-0000-000000000003')) = 0,
  'a recipient added later is not covered by earlier acknowledgments');

select public.acknowledge_sponsor_recipients(
  'a0000000-0000-0000-0000-000000000001', '2027', 'v-test',
  array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
        '50000000-0000-0000-0000-000000000003']::uuid[]);

select assert(
  (select count(*) from public.sponsor_export_rows('50000000-0000-0000-0000-000000000003')) = 1,
  're-acknowledging the new list makes that person eligible for the new recipient');

insert into public.consent_records
  (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids, recorded_by)
values
  ('a0000000-0000-0000-0000-000000000002', 'sponsor_sharing', '2027', 'objected', 'v-test', '{}',
   'a0000000-0000-0000-0000-000000000003');

select assert(
  not exists (
    select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')
    where participant_id = 'a0000000-0000-0000-0000-000000000002'),
  'a recorded objection excludes the person from later exports');

select assert(
  exists (select 1 from public.registrations
          where participant_id = 'a0000000-0000-0000-0000-000000000002' and edition_slug = '2027'),
  'objecting does not cancel the registration');

update public.sponsor_recipients set retired_at = now()
where id = '50000000-0000-0000-0000-000000000002';

select assert(
  (select count(*) from public.sponsor_export_rows('50000000-0000-0000-0000-000000000002')) = 0,
  'a retired recipient gets no rows');

-- ------------------------------------------------------------
-- Dietary note withdrawal
-- ------------------------------------------------------------

select public.withdraw_dietary_note('a0000000-0000-0000-0000-000000000002', '2027', 'v-test');

select assert(
  (select note is null and note_consent_at is null and diet = 'other'
   from public.registration_catering c
   join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000002' and r.edition_slug = '2027'),
  'withdrawing the dietary-note consent deletes the note and keeps the diet choice');

select assert(
  (select decision = 'withdrawn' from public.latest_consent(
     'a0000000-0000-0000-0000-000000000002', 'dietary_note', '2027')),
  'the withdrawal is recorded');

-- The admin who recorded P2's objection (P3) deletes their account: the FK
-- nulls recorded_by, which the append-only trigger must allow.
delete from auth.users where id = 'a0000000-0000-0000-0000-000000000003';

select assert(
  (select recorded_by is null and decision = 'objected'
   from public.latest_consent('a0000000-0000-0000-0000-000000000002', 'sponsor_sharing', '2027')),
  'an admin who recorded a decision can still delete their account; the record stays');

-- set_dietary_note writes the note and its consent record together.
select public.set_dietary_note('a0000000-0000-0000-0000-000000000001', '2027', 'v-test', 'other', ' halal ');

select assert(
  (select note = 'halal' and note_consent_at is not null
   from public.registration_catering c join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000001' and r.edition_slug = '2027')
  and (select decision = 'granted' from public.latest_consent(
     'a0000000-0000-0000-0000-000000000001', 'dietary_note', '2027')),
  'a dietary note is stored only together with its consent record');

do $$
begin
  update public.consent_records set decision = 'granted' where id = (select min(id) from public.consent_records);
  raise exception 'FAIL  a consent record was edited';
exception when others then
  if sqlerrm like '%append-only%' then
    raise notice 'PASS  consent records are append-only';
  else
    raise;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Access control: client roles cannot reach any of it
-- ------------------------------------------------------------

select assert(
  bool_and(not has_table_privilege(r.role, t.tbl, 'select')
           and not has_table_privilege(r.role, t.tbl, 'insert')
           and not has_table_privilege(r.role, t.tbl, 'update')
           and not has_table_privilege(r.role, t.tbl, 'delete')),
  'anon and authenticated have no table privileges on consent, sponsor, export or catering tables')
from (values ('anon'), ('authenticated')) r(role)
cross join (values ('public.consent_records'), ('public.sponsor_recipients'),
                   ('public.export_audit'), ('public.registration_catering')) t(tbl);

select assert(
  bool_and(c.relrowsecurity),
  'RLS is enabled on every new privacy table')
from pg_class c
where c.oid in ('public.consent_records'::regclass, 'public.sponsor_recipients'::regclass,
                'public.export_audit'::regclass, 'public.registration_catering'::regclass);

select assert(
  bool_and(not has_function_privilege(r.role, f.fn, 'execute')),
  'client roles cannot call the consent, eligibility or registration functions')
from (values ('anon'), ('authenticated')) r(role)
cross join (values
  ('public.sponsor_export_rows(uuid)'),
  ('public.latest_consent(uuid, public.consent_purpose, text)'),
  ('public.acknowledge_sponsor_recipients(uuid, text, text, uuid[])'),
  ('public.withdraw_dietary_note(uuid, text, text)'),
  ('public.set_dietary_note(uuid, text, text, text, text)'),
  ('public.register_with_consents(uuid, text, text[], public.experience_level, boolean, text, uuid[], boolean, text, text)')
) f(fn);

-- A direct API call as `anon` (what PostgREST does with the publishable key).
do $$
begin
  set local role anon;
  perform 1 from public.consent_records limit 1;
  raise exception 'FAIL  anon read consent_records';
exception when insufficient_privilege then
  raise notice 'PASS  a direct anon query on consent_records is refused';
end
$$;
reset role;

select 'PRIVACY VERIFICATION COMPLETE' as result;
