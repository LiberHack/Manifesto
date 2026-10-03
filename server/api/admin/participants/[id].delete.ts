import { requireAdmin } from "#server/utils/adminAuth";
import { dispatchDueJobs } from "#server/utils/notifications";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Deleting from auth.users cascades to participants
  const { error } = await supabase.auth.admin.deleteUser(id!);
  if (error) {
    console.error("[admin/participants.delete] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  // A freed seat is offered to the next waitlisted person on the spot; send
  // that offer now, as the other seat-freeing routes do.
  await dispatchDueJobs(supabase, 5).catch(() => {});

  return { success: true };
});
