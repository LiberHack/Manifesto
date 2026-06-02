import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

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
    throw createError({ statusCode: 403, message: "Only the team leader can update this team" });
  }

  const body = await readBody<{ skills_wanted?: unknown; description?: unknown }>(event);

  if (body.skills_wanted === undefined && body.description === undefined) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  const update: Record<string, unknown> = {};

  if (body.skills_wanted !== undefined) {
    if (!Array.isArray(body.skills_wanted)) {
      throw createError({ statusCode: 400, message: "skills_wanted must be an array" });
    }
    const skills = (body.skills_wanted as unknown[])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);

    if (skills.length > MAX_SKILLS) {
      throw createError({ statusCode: 400, message: `Maximum ${MAX_SKILLS} skills allowed` });
    }
    const invalidSkill = skills.find((s) => s.length > MAX_SKILL_LENGTH);
    if (invalidSkill) {
      throw createError({
        statusCode: 400,
        message: `Skill "${invalidSkill}" exceeds ${MAX_SKILL_LENGTH} characters`,
      });
    }
    update.skills_wanted = skills;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw createError({ statusCode: 400, message: "description must be a string" });
    }
    const description =
      body.description === null ? "" : (body.description as string).trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw createError({
        statusCode: 400,
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
      });
    }
    update.description = description === "" ? null : description;
  }

  const { data, error } = await supabase
    .from("teams")
    .update(update)
    .eq("id", teamId!)
    .select()
    .single();

  if (error) {
    console.error("[teams.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
