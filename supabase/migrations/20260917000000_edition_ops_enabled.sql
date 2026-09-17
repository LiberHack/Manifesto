-- Per-edition gate for the participant area.
--
-- An edition can exist, be current and be live while registration has not
-- opened yet. Until now "a live edition exists" implied "/ops is open", which
-- made the go-live moment and the registration-opens moment the same event.
-- `ops_enabled` separates them, and defaults to closed so that promoting an
-- edition — or backfilling this column onto an existing one — never exposes the
-- participant area before an admin opens it deliberately.

alter table public.editions
  add column if not exists ops_enabled boolean not null default false;

comment on column public.editions.ops_enabled is
  'When false, /ops and every edition-scoped API route are closed to participants (403 ops_closed); /ops/admin is unaffected.';
