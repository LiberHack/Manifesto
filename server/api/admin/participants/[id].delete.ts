import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Deleting from auth.users cascades to participants
  const { error } = await supabase.auth.admin.deleteUser(id!);
  if (error) {
    console.error("[admin/participants.delete] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  return { success: true };
});
