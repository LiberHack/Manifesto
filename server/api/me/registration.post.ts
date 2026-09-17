import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

const EXPERIENCE_VALUES = ["beginner", "intermediate", "experienced"] as const;
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number];

const MAX_DIETARY_LENGTH = 200;
const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 30;
const MAX_NEW_SKILLS = 5;

interface Body {
  skills?: unknown;
  dietary?: unknown;
  experience?: unknown;
  public?: unknown;
  accepted_terms?: unknown;
}

/**
 * Register the caller for the current edition.
 *
 * The per-edition participant cap is enforced by the `enforce_edition_cap`
 * trigger, surfaced here as 409 `registration_closed`.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition) {
    throw createError({ statusCode: 503, message: "no_live_edition" });
  }

  const body = await readBody<Body>(event);

  if (body.accepted_terms !== true) {
    throw createError({
      statusCode: 400,
      message: "You must accept the Code of Conduct and Privacy Policy",
    });
  }

  if (!EXPERIENCE_VALUES.includes(body.experience as ExperienceLevel)) {
    throw createError({
      statusCode: 400,
      message: `experience must be one of: ${EXPERIENCE_VALUES.join(", ")}`,
    });
  }

  if (body.skills !== undefined && !Array.isArray(body.skills)) {
    throw createError({ statusCode: 400, message: "skills must be an array" });
  }
  const skills = ((body.skills as unknown[]) ?? [])
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

  if (body.dietary !== undefined && body.dietary !== null && typeof body.dietary !== "string") {
    throw createError({ statusCode: 400, message: "dietary must be a string" });
  }
  const dietary = typeof body.dietary === "string" ? body.dietary.trim() : "";
  if (dietary.length > MAX_DIETARY_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `Dietary requirements must be ${MAX_DIETARY_LENGTH} characters or fewer`,
    });
  }

  // Skills not yet in the catalogue are added on the caller's behalf, capped the
  // same way /api/skills caps them.
  const { data: known } = await supabase.from("skills").select("name");
  const knownNames = new Set(
    (known ?? []).map((s: { name: string }) => s.name.toLowerCase()),
  );
  const newSkills = skills.filter((s) => !knownNames.has(s.toLowerCase()));

  if (newSkills.length > MAX_NEW_SKILLS) {
    throw createError({
      statusCode: 422,
      message: `You can only add up to ${MAX_NEW_SKILLS} new skills`,
    });
  }

  const { data: registration, error } = await supabase
    .from("registrations")
    .insert({
      participant_id: user.sub,
      edition_slug: edition.slug,
      skills,
      dietary: dietary === "" ? null : dietary,
      experience: body.experience as ExperienceLevel,
      public: body.public !== false,
      accepted_terms_at: new Date().toISOString(),
    })
    .select("id, edition_slug, skills, dietary, experience, public")
    .single();

  if (error) {
    if (error.message?.includes("registration_closed")) {
      throw createError({ statusCode: 409, message: "registration_closed" });
    }
    if (error.code === "23505") {
      throw createError({ statusCode: 409, message: "Already registered" });
    }
    console.error("[me/registration.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to register" });
  }

  if (newSkills.length > 0) {
    await supabase
      .from("skills")
      .insert(newSkills.map((name) => ({ name, created_by: user.sub })));
  }

  return registration;
});
