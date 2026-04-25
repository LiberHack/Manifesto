import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const teamId = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const { data: team } = await supabase
    .from("teams")
    .select("leader_id")
    .eq("id", teamId!)
    .single();

  if (!team) throw createError({ statusCode: 404, message: "Team not found" });
  if (team.leader_id !== user.sub) {
    throw createError({
      statusCode: 403,
      message: "Only the team leader can view requests",
    });
  }

  const { data, error } = await supabase
    .from("join_requests")
    .select(
      "id, status, created_at, participant:participants(id, name, skills)",
    )
    .eq("team_id", teamId!)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[teams/requests.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
