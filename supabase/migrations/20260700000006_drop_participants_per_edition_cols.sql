-- supabase/migrations/20260700000006_drop_participants_per_edition_cols.sql
-- Run only after all backfill tests pass on the real DB.

alter table public.participants
  drop column if exists team_id,
  drop column if exists role,
  drop column if exists skills,
  drop column if exists dietary,
  drop column if exists experience;
