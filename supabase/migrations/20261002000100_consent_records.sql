-- Consent, acknowledgment and export evidence; restricted catering data;
-- opt-in public archive.
--
-- Purposes are recorded separately and never inferred from one another. In
-- particular nothing here is backfilled from registrations.accepted_terms_at:
-- a legacy terms acceptance is not a sponsor-sharing acknowledgment, a
-- marketing opt-in or an analytics consent.
--
-- Every table is server-only: RLS on, no policies, and table privileges revoked
-- from the client roles. The app reaches them through the service key.

-- ------------------------------------------------------------
-- Sponsor recipients
-- ------------------------------------------------------------

-- The named organisations a participant's data may be shared with in an
-- edition. A recipient is retired, never deleted, so old acknowledgments keep
-- pointing at what they covered.
create table if not exists public.sponsor_recipients (
  id            uuid primary key default gen_random_uuid(),
  edition_slug  text not null references public.editions(slug) on update cascade on delete restrict,
  organisation  text not null check (length(trim(organisation)) between 1 and 120),
  purpose       text not null default 'Internship and job recruitment'
                  check (length(trim(purpose)) between 1 and 300),
  -- Only the fields disclosed for recruitment may ever be listed.
  shared_fields text[] not null default '{name,email,skills,experience}'
                  check (shared_fields <@ array['name','email','skills','experience']::text[]
                         and cardinality(shared_fields) > 0),
  created_at    timestamptz not null default now(),
  retired_at    timestamptz null
);

create index if not exists sponsor_recipients_edition_idx
  on public.sponsor_recipients (edition_slug);

-- ------------------------------------------------------------
-- Consent records (append-only)
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'consent_purpose') then
    create type public.consent_purpose as enum (
      'terms',             -- event rules + Code of Conduct (required agreement)
      'privacy_notice',    -- notice read; an acknowledgment, not a consent
      'sponsor_sharing',   -- recruitment sharing with named recipients
      'marketing_email',   -- future-event emails (optional consent)
      'dietary_note'       -- free-text catering note (explicit consent)
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'consent_decision') then
    create type public.consent_decision as enum (
      'accepted', 'acknowledged', 'granted', 'denied', 'withdrawn', 'objected'
    );
  end if;
end
$$;

create table if not exists public.consent_records (
  id             bigint generated always as identity primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  purpose        public.consent_purpose not null,
  -- Null for account-level purposes (marketing_email).
  edition_slug   text null references public.editions(slug) on update cascade on delete restrict,
  decision       public.consent_decision not null,
  notice_version text not null check (length(notice_version) between 1 and 40),
  -- sponsor_sharing only: the exact recipients this decision covered.
  recipient_ids  uuid[] null,
  -- An admin acting on a rights request (e.g. a recorded objection); null when
  -- the participant decided themselves.
  recorded_by    uuid null references public.participants(id) on delete set null,
  recorded_at    timestamptz not null default now(),
  check ((purpose = 'sponsor_sharing') = (recipient_ids is not null))
);

create index if not exists consent_records_lookup_idx
  on public.consent_records (participant_id, purpose, edition_slug, recorded_at desc, id desc);

-- Records are never edited. The one update allowed is the FK action that
-- nulls `recorded_by` when the admin who recorded a decision deletes their
-- account; without it, that account could not be deleted.
create or replace function public.consent_records_append_only()
returns trigger
language plpgsql
as $$
begin
  if new.recorded_by is null and old.recorded_by is not null
     and (new.id, new.participant_id, new.purpose, new.edition_slug, new.decision,
          new.notice_version, new.recipient_ids, new.recorded_at)
         is not distinct from
         (old.id, old.participant_id, old.purpose, old.edition_slug, old.decision,
          old.notice_version, old.recipient_ids, old.recorded_at) then
    return new;
  end if;
  raise exception 'consent_records is append-only';
end;
$$;

drop trigger if exists consent_records_no_update on public.consent_records;
create trigger consent_records_no_update
  before update on public.consent_records
  for each row execute function public.consent_records_append_only();

-- The participant's latest decision for one purpose (and edition).
create or replace function public.latest_consent(
  p_participant uuid,
  p_purpose public.consent_purpose,
  p_edition text
)
returns public.consent_records
language sql
stable
as $$
  select *
  from public.consent_records c
  where c.participant_id = p_participant
    and c.purpose = p_purpose
    and c.edition_slug is not distinct from p_edition
  order by c.recorded_at desc, c.id desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- Sponsor export eligibility
-- ------------------------------------------------------------

-- Registrations whose *current* sponsor-sharing decision covers this recipient.
-- Evaluated at export time, so an objection or withdrawal excludes the person
-- from every later export, and a recipient added after someone acknowledged
-- is not covered until they acknowledge again.
create or replace function public.sponsor_export_rows(p_recipient uuid)
returns table (participant_id uuid, name text, email text, skills text[], experience text)
language sql
stable
as $$
  select p.id, p.name, p.email, r.skills, r.experience::text
  from public.sponsor_recipients s
  join public.registrations r on r.edition_slug = s.edition_slug
  join public.participants p on p.id = r.participant_id
  cross join lateral public.latest_consent(r.participant_id, 'sponsor_sharing', r.edition_slug) c
  where s.id = p_recipient
    and s.retired_at is null
    and c.decision = 'acknowledged'
    and p_recipient = any (c.recipient_ids)
  order by p.name;
$$;

-- ------------------------------------------------------------
-- Export audit
-- ------------------------------------------------------------

create table if not exists public.export_audit (
  id              bigint generated always as identity primary key,
  exported_by     uuid null references public.participants(id) on delete set null,
  export_kind     text not null check (export_kind in
                    ('participants', 'participants_contacts', 'teams', 'catering', 'sponsor', 'sponsor_report',
                     'source_report', 'funnel_report')),
  edition_slug    text not null references public.editions(slug) on update cascade on delete restrict,
  recipient_id    uuid null references public.sponsor_recipients(id) on delete restrict,
  participant_ids uuid[] not null default '{}',
  row_count       int not null,
  exported_at     timestamptz not null default now()
);

create index if not exists export_audit_edition_idx
  on public.export_audit (edition_slug, exported_at desc);

-- ------------------------------------------------------------
-- Catering (restricted)
-- ------------------------------------------------------------

-- Diet is a short structured choice. The free-text note can reveal health or
-- religion, so it is only stored with an explicit consent (dietary_note) and is
-- deleted when that consent is withdrawn.
create table if not exists public.registration_catering (
  registration_id  uuid primary key references public.registrations(id) on delete cascade,
  diet             text not null check (diet in ('none', 'vegetarian', 'vegan', 'other')),
  note             text null check (note is null or length(note) between 1 and 200),
  note_consent_at  timestamptz null,
  -- Copied from registrations.dietary by this migration rather than entered
  -- under the current notice; see docs/privacy/retention-and-deletion.md.
  legacy           boolean not null default false,
  updated_at       timestamptz not null default now(),
  check (note is null or note_consent_at is not null or legacy)
);

-- Copy free-text dietary answers of editions that are not archived. Archived
-- editions' copies are left for the reviewed cleanup script to clear, together
-- with the copies in auth.users metadata.
insert into public.registration_catering (registration_id, diet, note, legacy)
select r.id, 'other', left(trim(r.dietary), 200), true
from public.registrations r
join public.editions e on e.slug = r.edition_slug
where e.status <> 'archived'
  and nullif(trim(r.dietary), '') is not null
on conflict (registration_id) do nothing;

-- ------------------------------------------------------------
-- Public archive: opt-in, not opt-out
-- ------------------------------------------------------------

alter table public.registrations alter column public set default false;

-- Set only by an explicit opt-in. Archive/showcase tooling must publish a
-- profile only when this is non-null: `public = true` on older rows was a
-- default, not a choice.
alter table public.registrations
  add column if not exists public_opted_in_at timestamptz null;

-- ------------------------------------------------------------
-- Registration with its decisions, atomically
-- ------------------------------------------------------------

create or replace function public.register_with_consents(
  p_participant      uuid,
  p_edition          text,
  p_skills           text[],
  p_experience       public.experience_level,
  p_public           boolean,
  p_notice_version   text,
  p_recipient_ids    uuid[],
  p_marketing        boolean,
  p_diet             text,
  p_note             text
)
returns uuid
language plpgsql
as $$
declare
  reg_id uuid;
  current_recipients uuid[];
begin
  -- The acknowledgment must cover exactly the recipients currently listed for
  -- the edition; a stale form (recipients changed while it was open) fails.
  select coalesce(array_agg(id order by id), '{}') into current_recipients
  from public.sponsor_recipients
  where edition_slug = p_edition and retired_at is null;

  if current_recipients is distinct from
     (select coalesce(array_agg(x order by x), '{}') from unnest(p_recipient_ids) x) then
    raise exception 'sponsor_recipients_changed';
  end if;

  insert into public.registrations (
    participant_id, edition_slug, skills, experience, public,
    public_opted_in_at, accepted_terms_at
  )
  values (
    p_participant, p_edition, coalesce(p_skills, '{}'), p_experience, p_public,
    case when p_public then now() end, now()
  )
  returning id into reg_id;

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values
    (p_participant, 'terms', p_edition, 'accepted', p_notice_version, null),
    (p_participant, 'privacy_notice', p_edition, 'acknowledged', p_notice_version, null),
    (p_participant, 'sponsor_sharing', p_edition, 'acknowledged', p_notice_version, current_recipients),
    (p_participant, 'marketing_email', null,
       case when p_marketing then 'granted' else 'denied' end::public.consent_decision,
       p_notice_version, null);

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

-- Re-acknowledge after recipients changed (e.g. a sponsor was added). Same
-- stale-form check as registration.
create or replace function public.acknowledge_sponsor_recipients(
  p_participant    uuid,
  p_edition        text,
  p_notice_version text,
  p_recipient_ids  uuid[]
)
returns void
language plpgsql
as $$
declare
  current_recipients uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into current_recipients
  from public.sponsor_recipients
  where edition_slug = p_edition and retired_at is null;

  if current_recipients is distinct from
     (select coalesce(array_agg(x order by x), '{}') from unnest(p_recipient_ids) x) then
    raise exception 'sponsor_recipients_changed';
  end if;

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values
    (p_participant, 'sponsor_sharing', p_edition, 'acknowledged', p_notice_version, current_recipients);
end;
$$;

-- Withdrawing the dietary-note consent deletes the note in the same
-- transaction; the structured diet choice stays.
create or replace function public.withdraw_dietary_note(
  p_participant    uuid,
  p_edition        text,
  p_notice_version text
)
returns void
language plpgsql
as $$
begin
  update public.registration_catering c
  set note = null, note_consent_at = null, legacy = false, updated_at = now()
  from public.registrations r
  where r.id = c.registration_id
    and r.participant_id = p_participant
    and r.edition_slug = p_edition;

  insert into public.consent_records
    (participant_id, purpose, edition_slug, decision, notice_version, recipient_ids)
  values (p_participant, 'dietary_note', p_edition, 'withdrawn', p_notice_version, null);
end;
$$;

-- Store or replace a dietary note together with its explicit consent record,
-- in one transaction: the note never exists without its evidence.
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

-- ------------------------------------------------------------
-- Access control
-- ------------------------------------------------------------

alter table public.sponsor_recipients     enable row level security;
alter table public.consent_records        enable row level security;
alter table public.export_audit           enable row level security;
alter table public.registration_catering  enable row level security;

revoke all on public.sponsor_recipients, public.consent_records,
              public.export_audit, public.registration_catering
  from anon, authenticated;

revoke all on function public.latest_consent(uuid, public.consent_purpose, text)
  from public, anon, authenticated;
revoke all on function public.sponsor_export_rows(uuid) from public, anon, authenticated;
revoke all on function public.register_with_consents(
  uuid, text, text[], public.experience_level, boolean, text, uuid[], boolean, text, text
) from public, anon, authenticated;
revoke all on function public.consent_records_append_only() from public, anon, authenticated;
revoke all on function public.acknowledge_sponsor_recipients(uuid, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.withdraw_dietary_note(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.set_dietary_note(uuid, text, text, text, text)
  from public, anon, authenticated;
