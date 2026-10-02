import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { requireOpenEdition } from "#server/utils/registrationContext";
import { requireConfirmedEmail } from "#server/utils/requireConfirmedEmail";
import { parseContact, parseProfileFields } from "#server/utils/profileInput";
import { addSkillsToCatalogue, resolveSkills } from "#server/utils/skills";
import { saveContact } from "#server/utils/contacts";

const EXPERIENCE_VALUES = ["beginner", "intermediate", "experienced"] as const;
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number];

const MAX_DIETARY_LENGTH = 200;

/**
 * Register the caller for the current edition.
 *
 * Besides the core fields it takes the optional matching profile and the
 * required preferred contact (`{ method: "email_only" }` is the explicit
 * opt-out). Refused with 403 `ops_closed` until the edition's participant area
 * opens, and with 403 `email_unverified` until the account's email is
 * confirmed. The per-edition participant cap is enforced by the
 * `enforce_edition_cap` trigger, surfaced here as 409 `registration_closed`.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await requireOpenEdition(supabase);
  await requireConfirmedEmail(supabase, user.sub);

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};

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

  const profile = parseProfileFields(body);
  const contact = parseContact(body.contact);
  const { skills, skills_input, new_skills } = await resolveSkills(supabase, body.skills);

  const { data: registration, error } = await supabase
    .from("registrations")
    .insert({
      ...profile,
      participant_id: user.sub,
      edition_slug: edition.slug,
      skills,
      skills_input,
      dietary: dietary === "" ? null : dietary,
      experience: body.experience as ExperienceLevel,
      public: body.public !== false,
      accepted_terms_at: new Date().toISOString(),
    })
    .select("id, edition_slug, skills, dietary, experience, public, matching_status")
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

  const { error: contactError } = await saveContact(supabase, registration.id, contact);
  if (contactError) {
    // The contact is required, so do not leave a registration without one.
    console.error("[me/registration.post] contact insert failed:", contactError.message);
    await supabase.from("registrations").delete().eq("id", registration.id);
    throw createError({ statusCode: 500, message: "Failed to register" });
  }

  await addSkillsToCatalogue(supabase, new_skills, user.sub);

  return registration;
});
