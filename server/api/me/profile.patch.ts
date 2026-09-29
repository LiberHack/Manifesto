import { requireRegistration } from "#server/utils/requireRegistration";
import { parseProfileFields } from "#server/utils/profileInput";
import { addSkillsToCatalogue, resolveSkills } from "#server/utils/skills";

const EXPERIENCE_VALUES = ["beginner", "intermediate", "experienced"] as const;
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number];

const MAX_DIETARY_LENGTH = 200;

export default defineEventHandler(async (event) => {
  const { user, registration, supabase } = await requireRegistration(event);

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};

  const update: Record<string, unknown> = { ...parseProfileFields(body) };
  let newSkills: string[] = [];

  if (body.skills !== undefined) {
    const resolved = await resolveSkills(supabase, body.skills);
    update.skills = resolved.skills;
    update.skills_input = resolved.skills_input;
    newSkills = resolved.new_skills;
  }

  if (body.dietary !== undefined) {
    if (body.dietary !== null && typeof body.dietary !== "string") {
      throw createError({ statusCode: 400, message: "dietary must be a string" });
    }
    const dietary = body.dietary === null ? "" : (body.dietary as string).trim();
    if (dietary.length > MAX_DIETARY_LENGTH) {
      throw createError({
        statusCode: 400,
        message: `Dietary requirements must be ${MAX_DIETARY_LENGTH} characters or fewer`,
      });
    }
    update.dietary = dietary === "" ? null : dietary;
  }

  if (body.experience !== undefined) {
    if (
      body.experience !== null &&
      body.experience !== "" &&
      !EXPERIENCE_VALUES.includes(body.experience as ExperienceLevel)
    ) {
      throw createError({
        statusCode: 400,
        message: `experience must be one of: ${EXPERIENCE_VALUES.join(", ")}`,
      });
    }
    update.experience =
      body.experience === null || body.experience === "" ? null : (body.experience as string);
  }

  if (body.public !== undefined) {
    if (typeof body.public !== "boolean") {
      throw createError({ statusCode: 400, message: "public must be a boolean" });
    }
    update.public = body.public;
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  // Per-edition profile fields live on the registration, not the identity mirror.
  const { error } = await supabase
    .from("registrations")
    .update(update)
    .eq("id", registration.id);

  if (error) throw createError({ statusCode: 500, message: "Internal server error" });

  await addSkillsToCatalogue(supabase, newSkills, user.sub);

  return { ok: true };
});
