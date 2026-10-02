\set ON_ERROR_STOP on

-- Runs after 04-verify-ops-toggle.sql: '2027' is the current live edition and
-- '2026' (the seeded one) is archived.

-- ------------------------------------------------------------
-- Legacy data is not turned into consent
-- ------------------------------------------------------------

select assert(
  (select count(*) from public.consent_records) = 0,
  'no consent or acknowledgment is backfilled from legacy accepted_terms_at');

-- Compare the migration's catering copies with the rows they came from.
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
-- Registration: sponsor sharing is an explicit Yes/No per recipient
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'p1@example.com', '{"name":"P One"}'),
  ('a0000000-0000-0000-0000-000000000002', 'p2@example.com', '{"name":"P Two"}'),
  ('a0000000-0000-0000-0000-000000000003', 'p3@example.com', '{"name":"P Three"}'),
  ('a0000000-0000-0000-0000-000000000004', 'p4@example.com', '{"name":"P Four"}');

insert into public.sponsor_recipients (id, edition_slug, organisation) values
  ('50000000-0000-0000-0000-000000000001', '2027', 'Acme Ltd'),
  ('50000000-0000-0000-0000-000000000002', '2027', 'Beta AD');

-- A missing answer for one recipient is refused, and nothing is written.
do $$
begin
  perform public.register_with_consents(
    'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
    '{"50000000-0000-0000-0000-000000000001": true}'::jsonb, true, false, 'none', null);
  raise exception 'FAIL  a registration without an answer for every recipient was accepted';
exception when others then
  if sqlerrm like '%sponsor_recipients_changed%' then
    raise notice 'PASS  every named recipient needs its own explicit answer';
  else
    raise;
  end if;
end
$$;

do $$
begin
  perform public.register_with_consents(
    'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
    '{"50000000-0000-0000-0000-000000000001": "yes", "50000000-0000-0000-0000-000000000002": null}'::jsonb,
    true, false, 'none', null);
  raise exception 'FAIL  a non-boolean sponsor answer was accepted';
exception when others then
  if sqlerrm like '%sponsor_choices_invalid%' then
    raise notice 'PASS  a sponsor answer must be a real yes or no';
  else
    raise;
  end if;
end
$$;

do $$
begin
  perform public.register_with_consents(
    'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
    '{"50000000-0000-0000-0000-000000000001": true, "50000000-0000-0000-0000-000000000002": false}'::jsonb,
    null, false, 'none', null);
  raise exception 'FAIL  a Yes without the 18+ answer was accepted';
exception when others then
  if sqlerrm like '%recruitment_age_required%' then
    raise notice 'PASS  saying yes to a recruiter requires the 18+ answer';
  else
    raise;
  end if;
end
$$;

select assert(
  not exists (select 1 from public.registrations
              where participant_id = 'a0000000-0000-0000-0000-000000000001'),
  'failed registrations leave no partial rows');

-- P1: Yes to Acme, No to Beta, adult. P2: No to both (no age needed).
-- P3: Yes to both but under 18. All three register.
select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000001', '2027', '{Go}', 'beginner', false, 'v-test',
  '{"50000000-0000-0000-0000-000000000001": true, "50000000-0000-0000-0000-000000000002": false}'::jsonb,
  true, false, 'none', null) is not null as ok \gset
select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000002', '2027', '{Rust}', 'experienced', true, 'v-test',
  '{"50000000-0000-0000-0000-000000000001": false, "50000000-0000-0000-0000-000000000002": false}'::jsonb,
  null, true, 'none', null) is not null as ok \gset
select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000003', '2027', '{C}', 'intermediate', false, 'v-test',
  '{"50000000-0000-0000-0000-000000000001": true, "50000000-0000-0000-0000-000000000002": true}'::jsonb,
  false, false, 'none', null) is not null as ok \gset

select assert(
  (select count(*) from public.registrations where edition_slug = '2027'
   and participant_id in ('a0000000-0000-0000-0000-000000000001',
                          'a0000000-0000-0000-0000-000000000002',
                          'a0000000-0000-0000-0000-000000000003')) = 3,
  'Yes and No to sponsor sharing both allow registration');

select assert(
  (select count(*) from public.consent_records
   where participant_id = 'a0000000-0000-0000-0000-000000000001' and purpose = 'sponsor_sharing'
     and cardinality(recipient_ids) = 1 and notice_version = 'v-test') = 2
  and (select decision = 'denied' from public.sponsor_consent_state(
     'a0000000-0000-0000-0000-000000000001', '2027', '50000000-0000-0000-0000-000000000002')),
  'each recipient gets its own record with decision, scope and notice version');

select assert(
  (select decision = 'denied' from public.latest_consent(
     'a0000000-0000-0000-0000-000000000001', 'marketing_email', null)),
  'marketing No is recorded as denied, not skipped');

select assert(
  (select public_opted_in_at is not null from public.registrations
   where participant_id = 'a0000000-0000-0000-0000-000000000002' and edition_slug = '2027')
  and (select public_opted_in_at is null from public.registrations
   where participant_id = 'a0000000-0000-0000-0000-000000000001' and edition_slug = '2027'),
  'archive visibility is set only by an explicit opt-in');

-- ------------------------------------------------------------
-- Sponsor export eligibility (fails closed)
-- ------------------------------------------------------------

select assert(
  (select array_agg(participant_id) from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001'))
    = array['a0000000-0000-0000-0000-000000000001']::uuid[],
  'only an adult who said Yes to this recipient is exported; No and under-18 are not');

select assert(
  not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000002')),
  'a No for one recipient is respected even when the same person said Yes to another');

-- P4 registered under the previous scheme: an acknowledgment, no choice.
insert into public.registrations (participant_id, edition_slug, experience, recruitment_adult)
values ('a0000000-0000-0000-0000-000000000004', '2027', 'beginner', true);
insert into public.consent_records (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
values ('a0000000-0000-0000-0000-000000000004', 'sponsor_sharing', '2027', 'acknowledged', '2026-10-draft',
        array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002']::uuid[]);

select assert(
  not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')
              where participant_id = 'a0000000-0000-0000-0000-000000000004'),
  'a legacy acknowledgment never makes anyone eligible');

select assert(
  (select decision = 'acknowledged' from public.sponsor_consent_state(
     'a0000000-0000-0000-0000-000000000004', '2027', '50000000-0000-0000-0000-000000000001')),
  'the legacy acknowledgment is preserved as an acknowledgment');

select public.set_sponsor_choice('a0000000-0000-0000-0000-000000000004', '2027', 'v-test',
  '50000000-0000-0000-0000-000000000001', true, null);

select assert(
  exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')
          where participant_id = 'a0000000-0000-0000-0000-000000000004'),
  'a fresh Yes is what makes an existing participant eligible');

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
  not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000003')),
  'a recipient added later is not covered by any earlier answer');

-- Withdrawal from account settings.
select public.set_sponsor_choice('a0000000-0000-0000-0000-000000000001', '2027', 'v-test',
  '50000000-0000-0000-0000-000000000001', false, null);

select assert(
  (select decision = 'withdrawn' from public.sponsor_consent_state(
     'a0000000-0000-0000-0000-000000000001', '2027', '50000000-0000-0000-0000-000000000001'))
  and not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')
                  where participant_id = 'a0000000-0000-0000-0000-000000000001'),
  'withdrawing removes the person from the next export');

select assert(
  exists (select 1 from public.registrations
          where participant_id = 'a0000000-0000-0000-0000-000000000001' and edition_slug = '2027'),
  'withdrawing does not cancel the registration');

do $$
begin
  perform public.set_sponsor_choice('a0000000-0000-0000-0000-000000000002', '2027', 'v-test',
    '50000000-0000-0000-0000-000000000001', true, null);
  raise exception 'FAIL  a Yes without the 18+ answer was accepted from settings';
exception when others then
  if sqlerrm like '%recruitment_age_required%' then
    raise notice 'PASS  settings also require the 18+ answer before a Yes';
  else
    raise;
  end if;
end
$$;

-- An objection recorded by an admin (empty scope) overrides earlier Yes answers.
insert into public.consent_records
  (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids, recorded_by)
values
  ('a0000000-0000-0000-0000-000000000004', 'sponsor_sharing', '2027', 'objected', 'v-test', '{}',
   'a0000000-0000-0000-0000-000000000003');

select assert(
  not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001')
              where participant_id = 'a0000000-0000-0000-0000-000000000004'),
  'a recorded objection excludes the person for every recipient');

update public.sponsor_recipients set retired_at = now()
where id = '50000000-0000-0000-0000-000000000002';

select assert(
  not exists (select 1 from public.sponsor_export_rows('50000000-0000-0000-0000-000000000002')),
  'a retired recipient gets no rows');

-- ------------------------------------------------------------
-- Dietary notes need a decided catering retention period
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000005', 'p5@example.com', '{"name":"P Five"}');

do $$
begin
  perform public.register_with_consents(
    'a0000000-0000-0000-0000-000000000005', '2027', '{}', 'beginner', false, 'v-test',
    '{"50000000-0000-0000-0000-000000000001": false, "50000000-0000-0000-0000-000000000003": false}'::jsonb,
    null, false, 'other', 'no nuts');
  raise exception 'FAIL  a dietary note was accepted with no catering retention period decided';
exception when others then
  if sqlerrm like '%dietary_note_disabled%' then
    raise notice 'PASS  free-text dietary notes stay off until a retention period is decided';
  else
    raise;
  end if;
end
$$;

insert into public.retention_policies (category, keep_for, decided_by, reference)
values ('catering_after_edition_end', interval '30 days', 'test', 'test fixture');

select public.register_with_consents(
  'a0000000-0000-0000-0000-000000000005', '2027', '{}', 'beginner', false, 'v-test',
  '{"50000000-0000-0000-0000-000000000001": false, "50000000-0000-0000-0000-000000000003": false}'::jsonb,
  null, false, 'other', 'no nuts') is not null as ok \gset

select assert(
  (select note = 'no nuts' and note_consent_at is not null
   from public.registration_catering c join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000005'),
  'with a decided period, a note is stored with its explicit consent time');

select public.withdraw_dietary_note('a0000000-0000-0000-0000-000000000005', '2027', 'v-test');

select assert(
  (select note is null and note_consent_at is null and diet = 'other'
   from public.registration_catering c join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000005'),
  'withdrawing the dietary-note consent deletes the note and keeps the diet choice');

-- set_dietary_note writes the note and its consent record together.
select public.set_dietary_note('a0000000-0000-0000-0000-000000000005', '2027', 'v-test', 'other', ' halal ');

select assert(
  (select note = 'halal' and note_consent_at is not null
   from public.registration_catering c join public.registrations r on r.id = c.registration_id
   where r.participant_id = 'a0000000-0000-0000-0000-000000000005')
  and (select decision = 'granted' from public.latest_consent(
     'a0000000-0000-0000-0000-000000000005', 'dietary_note', '2027')),
  'a dietary note is stored only together with its consent record');

-- ------------------------------------------------------------
-- Evidence: not rewritable, but erasable
-- ------------------------------------------------------------

-- The admin who recorded P4's objection (P3) deletes their account.
delete from auth.users where id = 'a0000000-0000-0000-0000-000000000003';

select assert(
  (select recorded_by is null and decision = 'objected'
   from public.consent_records
   where participant_id = 'a0000000-0000-0000-0000-000000000004' and decision = 'objected'),
  'an admin who recorded a decision can still delete their account; the record stays');

select assert(
  exists (select 1 from public.deletion_ledger
          where subject = 'participant' and subject_id = 'a0000000-0000-0000-0000-000000000003'),
  'an erased participant is written to the deletion ledger for backup re-application');

select assert(
  not exists (select 1 from public.consent_records
              where participant_id = 'a0000000-0000-0000-0000-000000000003'),
  'erasing a participant removes their consent records too (append-only blocks edits, not erasure)');

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
  'anon and authenticated have no privileges on consent, sponsor, export, catering, retention or ledger tables')
from (values ('anon'), ('authenticated')) r(role)
cross join (values ('public.consent_records'), ('public.sponsor_recipients'),
                   ('public.export_audit'), ('public.registration_catering'),
                   ('public.retention_policies'), ('public.deletion_ledger')) t(tbl);

select assert(
  bool_and(c.relrowsecurity),
  'RLS is enabled on every new privacy table')
from pg_class c
where c.oid in ('public.consent_records'::regclass, 'public.sponsor_recipients'::regclass,
                'public.export_audit'::regclass, 'public.registration_catering'::regclass,
                'public.retention_policies'::regclass, 'public.deletion_ledger'::regclass);

select assert(
  bool_and(not has_function_privilege(r.role, f.fn, 'execute')),
  'client roles cannot call the consent, eligibility, registration or retention functions')
from (values ('anon'), ('authenticated')) r(role)
cross join (values
  ('public.sponsor_export_rows(uuid)'),
  ('public.sponsor_consent_state(uuid, text, uuid)'),
  ('public.set_sponsor_choice(uuid, text, text, uuid, boolean, boolean)'),
  ('public.latest_consent(uuid, public.consent_purpose, text)'),
  ('public.withdraw_dietary_note(uuid, text, text)'),
  ('public.set_dietary_note(uuid, text, text, text, text)'),
  ('public.register_with_consents(uuid, text, text[], public.experience_level, boolean, text, jsonb, boolean, boolean, text, text)'),
  ('public.run_retention()'),
  ('public.reapply_deletion_ledger()')
) f(fn);

-- Direct API calls as the client roles PostgREST uses.
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

do $$
begin
  set local role authenticated;
  perform * from public.sponsor_export_rows('50000000-0000-0000-0000-000000000001');
  raise exception 'FAIL  an authenticated user called sponsor_export_rows directly';
exception when insufficient_privilege then
  raise notice 'PASS  a signed-in user cannot call the sponsor export function directly';
end
$$;
reset role;

select 'PRIVACY VERIFICATION COMPLETE' as result;
