import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Null out team_id for all members
  await supabase
    .from("participants")
    .update({ team_id: null })
    .eq("team_id", id!);

  // Cancel pending requests for this team
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("team_id", id!)
    .eq("status", "pending");

  const { error } = await supabase.from("teams").delete().eq("id", id!);
  if (error) {
    console.error("[admin/teams.delete] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  return { success: true };
});
