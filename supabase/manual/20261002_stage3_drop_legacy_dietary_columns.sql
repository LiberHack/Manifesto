-- STAGE 3 OF THE DIETARY CLEANUP — REVIEWED MANUAL STEP, NOT A MIGRATION.
--
-- Stage 1 (code, this branch): nothing writes registrations.dietary,
--   participants.dietary or auth metadata "dietary" any more; nothing reads them.
-- Stage 2 (manual): supabase/manual/20261001_cleanup_dietary_copies.sql
--   empties every legacy copy, including auth.users metadata.
-- Stage 3 (this file): drop the now-empty columns.
--
-- It refuses to run unless stage 2 is complete, so it can never be the step
-- that silently destroys data. Dry run (ROLLBACK) unless -v confirm=yes.
-- After running it in production, move this DDL into a numbered migration so
-- fresh environments match.

\set ON_ERROR_STOP on
begin;

do $$
begin
  if exists (select 1 from auth.users where raw_user_meta_data ? 'dietary')
     or exists (select 1 from public.participants where dietary is not null)
     or exists (select 1 from public.registrations where dietary is not null) then
    raise exception 'stage 2 not complete: run 20261001_cleanup_dietary_copies.sql first';
  end if;
end
$$;

alter table public.registrations drop column if exists dietary;
alter table public.participants drop column if exists dietary;

\if :{?confirm}
  \if :confirm
    commit;
    \echo 'Legacy dietary columns dropped.'
  \else
    rollback;
    \echo 'Dry run only — rolled back. Re-run with -v confirm=yes to apply.'
  \endif
\else
  rollback;
  \echo 'Dry run only — rolled back. Re-run with -v confirm=yes to apply.'
\endif
