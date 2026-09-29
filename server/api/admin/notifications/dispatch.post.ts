import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
import { queueDueReminders } from "#server/utils/reminderQueue";
import { dispatchDueJobs } from "#server/utils/notifications";

/**
 * One operations run for an edition: expire lapsed seat offers (passing
 * seats on), capture any cutoff snapshot whose window is open, queue due
 * reminders and unread-message digests, then deliver due notification jobs. Idempotent; meant to be run
 * from the attendance desk, or on a schedule once one is configured.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const [{ data: expired }, { data: snapshots }, { data: digests }] = await Promise.all([
    supabase.rpc("expire_seat_offers", { p_edition: edition.slug }),
    supabase.rpc("capture_due_snapshots", { p_edition: edition.slug }),
    // Messages unread for an hour or more; one digest per person per day.
    supabase.rpc("queue_chat_digests", { p_edition: edition.slug, p_min_age: "1 hour" }),
  ]);

  let queued = 0;
  try {
    queued = (await queueDueReminders(supabase, edition.slug)).candidates;
  } catch (e) {
    console.error("[admin/notifications/dispatch] queueing failed:", (e as Error).message);
  }

  const delivery = await dispatchDueJobs(supabase, 100);
  return {
    expired_offers: expired ?? 0,
    snapshots: snapshots ?? [],
    queued: queued + (digests ?? 0),
    ...delivery,
  };
});
