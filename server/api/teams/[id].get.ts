import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const [{ data: team, error }, { data: config }, { data: participant }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, leader_id, skills_wanted, description, created_at, github_url, members:participants(id, name, skills)")
      .eq("id", id!)
      .single(),
    supabase.from("event_config").select("github_urls_public").eq("id", 1).single(),
    supabase.from("participants").select("team_id").eq("id", user.sub).single(),
  ]);

  if (error || !team)
    throw createError({ statusCode: 404, message: "Team not found" });

  const isMember = participant?.team_id === id;
  const urlsPublic = config?.github_urls_public === true;

  if (!isMember && !urlsPublic) {
    const { github_url: _omitted, ...rest } = team;
    return rest;
  }

  return team;
});
