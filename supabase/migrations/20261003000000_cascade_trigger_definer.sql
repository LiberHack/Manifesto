-- auth.admin.deleteUser deletes from auth.users as supabase_auth_admin, which
-- has no privileges in `public`. On Postgres 17 (Supabase), AFTER triggers
-- fired by the FK cascade run as that outer role, so any of them that writes
-- to a public table failed the whole deletion with "permission denied".
-- Postgres 18 runs them as the role that queued them, which is why the local
-- migration tests did not catch it.
--
-- The AFTER triggers on the auth.users -> participants -> teams/registrations
-- cascade path, all of which write to public tables:
--   participants_deletion_ledger   -> deletion_ledger
--   advance_waitlist_after_delete  -> registrations, notification_jobs
--   record_membership_change       -> membership_events (team dissolved, team_id nulled)
-- Their bodies already use schema-qualified names, so an empty search_path is safe.
alter function public.ledger_participant_deletion() security definer set search_path = '';
alter function public.advance_waitlist() security definer set search_path = '';
alter function public.record_membership_change() security definer set search_path = '';

revoke all on function public.advance_waitlist() from public, anon, authenticated;
revoke all on function public.record_membership_change() from public, anon, authenticated;
