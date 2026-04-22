import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;

const validateSkills = (skillsWanted: any): string[] => {
  let skills: string[] = [];

  if (skillsWanted) {
    if (!Array.isArray(skillsWanted)) {
      throw createError({
        statusCode: 400,
        message: "skills_wanted must be an array",
      });
    }

    skills = skillsWanted.map((s) => s.trim()).filter((s) => s.length > 0);

    if (skills.length > MAX_SKILLS) {
      throw createError({
        statusCode: 400,
        message: `Maximum ${MAX_SKILLS} skills allowed`,
      });
    }

    const invalidSkill = skills.find((s) => s.length > MAX_SKILL_LENGTH);

    if (invalidSkill) {
      throw createError({
        statusCode: 400,
        message: `Skill "${invalidSkill}" exceeds ${MAX_SKILL_LENGTH} characters`,
      });
    }
  }

  return skills;
};

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();

  const { data: participant } = await supabase
    .from("participants")
    .select("team_id")
    .eq("id", user.sub)
    .single();

  if (participant?.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  const body = await readBody<{
    name: string;
    skills_wanted?: string[];
    description?: string;
  }>(event);

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, message: "Team name is required" });
  }

  const skills = validateSkills(body.skills_wanted);

  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      name: body.name.trim(),
      leader_id: user.sub,
      skills_wanted: skills,
      description: body.description ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[teams.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to create team" });
  }

  await supabase
    .from("participants")
    .update({ team_id: team.id })
    .eq("id", user.sub);

  return team;
});
