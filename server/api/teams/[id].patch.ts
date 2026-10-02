import { requireRegistration } from "#server/utils/requireRegistration";
import { requireTeamLeadership } from "#server/utils/registrationContext";
import { parseTeamRecruitmentFields } from "#server/utils/profileInput";
import { membershipError } from "#server/utils/joinRequests";

const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

export default defineEventHandler(async (event) => {
  const ctx = await requireRegistration(event);
  const { supabase } = ctx;

  const teamId = getRouterParam(event, "id");
  await requireTeamLeadership(
    ctx,
    teamId!,
    "Only the team leader can update this team",
  );

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};

  const update: Record<string, unknown> = { ...parseTeamRecruitmentFields(body) };

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

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("teams")
    .update(update)
    .eq("id", teamId!)
    .select()
    .single();

  // The check_desired_size trigger rejects a size below the current membership,
  // under the same row lock joins take.
  if (error) membershipError(error, "teams.patch");
  return data;
});
