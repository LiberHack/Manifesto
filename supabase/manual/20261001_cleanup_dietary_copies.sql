-- REVIEWED MANUAL CLEANUP — NOT A MIGRATION.
--
-- `supabase db push` does not run files in supabase/manual/. Run this by hand,
-- once, after:
--   1. migration 20261002000100_consent_records.sql is applied (it copies the
--      current edition's free-text dietary answers into registration_catering);
--   2. the code that stops reading registrations.dietary is deployed;
--   3. a human has reviewed this file and taken a backup they are allowed to
--      keep (see docs/privacy/retention-and-deletion.md, "Backups").
--
-- It removes the old copies of free-text dietary data, which can reveal health
-- or religion:
--   - auth.users.raw_user_meta_data->'dietary'  (signup form metadata)
--   - public.participants.dietary               (pre-edition column, unused)
--   - public.registrations.dietary              (replaced by registration_catering)
--
-- Run it in a transaction and check the counts before COMMIT:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/manual/20261001_cleanup_dietary_copies.sql
-- The script ends with ROLLBACK unless you pass -v confirm=yes.

\set ON_ERROR_STOP on
begin;

select count(*) as auth_metadata_copies
from auth.users where raw_user_meta_data ? 'dietary';

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'dietary'
where raw_user_meta_data ? 'dietary';

update public.participants set dietary = null where dietary is not null;

update public.registrations set dietary = null where dietary is not null;

select
  (select count(*) from auth.users where raw_user_meta_data ? 'dietary') as auth_left,
  (select count(*) from public.participants where dietary is not null)  as participants_left,
  (select count(*) from public.registrations where dietary is not null) as registrations_left;

\if :{?confirm}
  \if :confirm
    commit;
    \echo 'Dietary copies removed.'
  \else
    rollback;
    \echo 'Dry run only — rolled back. Re-run with -v confirm=yes to apply.'
  \endif
\else
  rollback;
  \echo 'Dry run only — rolled back. Re-run with -v confirm=yes to apply.'
\endif
