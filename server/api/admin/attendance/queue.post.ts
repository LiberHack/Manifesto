import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
import { queueDueReminders } from "#server/utils/reminderQueue";

/** Queue due milestone and unanswered-application jobs with stable dedup keys. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  try {
    return await queueDueReminders(supabase, edition.slug);
  } catch {
    throw createError({ statusCode: 500, message: "Could not queue reminders" });
  }
});
