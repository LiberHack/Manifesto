import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Deleting from auth.users cascades to participants
  const { error } = await supabase.auth.admin.deleteUser(id!);
  if (error) throw createError({ statusCode: 500, message: error.message });

  return { success: true };
});
