import { requireRegistration } from "#server/utils/requireRegistration";

const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;

const validateSkills = (skillsWanted: unknown): string[] => {
  if (!skillsWanted) return [];

  if (!Array.isArray(skillsWanted)) {
    throw createError({
      statusCode: 400,
      message: "skills_wanted must be an array",
    });
  }

  const skills = skillsWanted
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

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

  return skills;
};

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  if (registration.team_id) {
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
      edition_slug: edition.slug,
      leader_id: registration.id,
      skills_wanted: skills,
      description: body.description ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError({
        statusCode: 409,
        message: "A team with that name already exists in this edition",
      });
    }
    console.error("[teams.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to create team" });
  }

  await supabase
    .from("registrations")
    .update({ team_id: team.id, role: "leader" })
    .eq("id", registration.id);

  return team;
});
