import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;

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
      message: "Only the team leader can update this team",
    });
  }

  const body = await readBody<{ skills_wanted?: string[] }>(event);

  if (!Array.isArray(body.skills_wanted)) {
    throw createError({
      statusCode: 400,
      message: "skills_wanted must be an array",
    });
  }

  const skills = body.skills_wanted
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  if (skills.length > MAX_SKILLS) {
    throw createError({
      statusCode: 400,
      message: `Maximum ${MAX_SKILLS} skills allowed`,
    });
  }

  const invalidSkill = skills.find((s: string) => s.length > MAX_SKILL_LENGTH);
  if (invalidSkill) {
    throw createError({
      statusCode: 400,
      message: `Skill "${invalidSkill}" exceeds ${MAX_SKILL_LENGTH} characters`,
    });
  }

  const { data, error } = await supabase
    .from("teams")
    .update({ skills_wanted: skills })
    .eq("id", teamId!)
    .select()
    .single();

  if (error) {
    console.error("[teams.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
