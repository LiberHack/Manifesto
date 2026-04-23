import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const { data: team, error } = await supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, members:participants(id, name, skills)",
    )
    .eq("id", id!)
    .single();

  if (error || !team)
    throw createError({ statusCode: 404, message: "Team not found" });
  return team;
});
