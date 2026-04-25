import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, "code");
  const supabase = useSupabaseAdmin();

  const { data: team, error } = await supabase
    .from("teams")
    .select("id, name, description, skills_wanted")
    .eq("invite_code", code!)
    .single();

  if (error || !team) {
    throw createError({ statusCode: 404, message: "Invite link not found" });
  }

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  return { ...team, member_count: count ?? 0 };
});
