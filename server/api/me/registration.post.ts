import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { parseRegistrationInput } from "#server/utils/registrationInput";
import { analyticsActivationAllowed, recordRegistrationCompleted } from "#server/utils/analytics";

const MAX_NEW_SKILLS = 5;

/**
 * Register the caller for the current edition, with every decision the form
 * asked for, in one transaction (`register_with_consents`).
 *
 * The per-edition participant cap is enforced by the `enforce_edition_cap`
 * trigger, surfaced here as 409 `registration_closed`. Analytics completion is
 * recorded only by the request that created the registration row, and only
 * for a browser that consented; it can never fail the request.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition) {
    throw createError({ statusCode: 503, message: "no_live_edition" });
  }

  const input = parseRegistrationInput(await readBody(event));

  // Skills not yet in the catalogue are added on the caller's behalf, capped the
  // same way /api/skills caps them.
  const { data: known } = await supabase.from("skills").select("name");
  const knownNames = new Set(
    (known ?? []).map((s: { name: string }) => s.name.toLowerCase()),
  );
  const newSkills = input.skills.filter((s) => !knownNames.has(s.toLowerCase()));

  if (newSkills.length > MAX_NEW_SKILLS) {
    throw createError({
      statusCode: 422,
      message: `You can only add up to ${MAX_NEW_SKILLS} new skills`,
    });
  }

  const { data: registrationId, error } = await supabase.rpc("register_with_consents", {
    p_participant: user.sub,
    p_edition: edition.slug,
    p_skills: input.skills,
    p_experience: input.experience,
    p_public: input.public,
    p_notice_version: input.noticeVersion,
    p_sponsor_choices: input.sponsorChoices,
    p_recruitment_adult: input.recruitmentAdult,
    p_marketing: input.marketingEmail,
    p_diet: input.diet,
    p_note: input.dietaryNote,
  });

  if (error) {
    if (error.message?.includes("registration_closed")) {
      throw createError({ statusCode: 409, message: "registration_closed" });
    }
    for (const code of [
      "sponsor_recipients_changed",
      "sponsor_choices_invalid",
      "recruitment_age_required",
      "dietary_note_disabled",
    ]) {
      if (error.message?.includes(code)) {
        throw createError({ statusCode: code === "sponsor_recipients_changed" ? 409 : 400, message: code });
      }
    }
    if (error.code === "23505") {
      // Not a completion: counting it would let anyone re-post an existing
      // registration from fresh browser ids to inflate attribution.
      throw createError({ statusCode: 409, message: "Already registered" });
    }
    console.error("[me/registration.post] registration failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to register" });
  }

  if (newSkills.length > 0) {
    await supabase
      .from("skills")
      .insert(newSkills.map((name) => ({ name, created_by: user.sub })));
  }

  if (analyticsActivationAllowed(useRuntimeConfig())) {
    await recordRegistrationCompleted(event, supabase, edition.slug, registrationId as string);
  }

  return {
    id: registrationId as string,
    edition_slug: edition.slug,
    skills: input.skills,
    experience: input.experience,
    public: input.public,
  };
});
