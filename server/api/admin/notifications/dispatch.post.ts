import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
import { queueDueReminders } from "#server/utils/reminderQueue";
import { dispatchDueJobs } from "#server/utils/notifications";

/**
 * One operations run for an edition: expire lapsed seat offers (passing
 * seats on), capture any cutoff snapshot whose window is open, queue due
 * reminders, then deliver due notification jobs. Idempotent; meant to be run
 * from the attendance desk, or on a schedule once one is configured.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const [{ data: expired }, { data: snapshots }] = await Promise.all([
    supabase.rpc("expire_seat_offers", { p_edition: edition.slug }),
    supabase.rpc("capture_due_snapshots", { p_edition: edition.slug }),
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
    queued,
    ...delivery,
  };
});
