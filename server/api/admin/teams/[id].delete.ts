import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  // Detach members and demote them; registrations.team_id is ON DELETE SET NULL
  // but the role has to be reset explicitly.
  await supabase
    .from("registrations")
    .update({ team_id: null, role: "participant" })
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
