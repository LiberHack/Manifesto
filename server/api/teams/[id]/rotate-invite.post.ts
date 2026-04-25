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
    throw createError({ statusCode: 403, message: "Only the team leader can rotate the invite link" });
  }

  const { data, error } = await supabase
    .rpc("rotate_team_invite_code", { team_id: teamId! });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return { invite_code: data };
});
