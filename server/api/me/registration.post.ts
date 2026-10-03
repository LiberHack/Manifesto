import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { requireOpenEdition } from "#server/utils/registrationContext";
import { requireConfirmedEmail } from "#server/utils/requireConfirmedEmail";
import { parseRegistrationInput } from "#server/utils/registrationInput";
import { parseContact, parseProfileFields } from "#server/utils/profileInput";
import { addSkillsToCatalogue, resolveSkills } from "#server/utils/skills";
import { saveContact } from "#server/utils/contacts";
import { dispatchDueJobs } from "#server/utils/notifications";
import { analyticsActivationAllowed, recordRegistrationCompleted } from "#server/utils/analytics";

const CONSENT_ERRORS = [
  "sponsor_recipients_changed",
  "sponsor_choices_invalid",
  "recruitment_age_required",
  "dietary_note_disabled",
] as const;

/**
 * Register the caller for the current edition.
 *
 * The registration itself, every consent the form asked for and catering are
 * written in one transaction (`register_with_consents`). The optional matching
 * profile and the required preferred contact (`{ method: "email_only" }` is the
 * explicit opt-out) are validated before that and attached right after it; a
 * failure to store them removes the registration again.
 *
 * Refused with 403 `ops_closed` until the edition's participant area opens,
 * and with 403 `email_unverified` until the account's email is confirmed.
 * Past the per-edition cap the registration still succeeds with
 * `seat_state = 'waitlisted'` (the `admit_new_registration` trigger).
 * Analytics completion is recorded only by the request that created the
 * registration row, and only for a browser that consented; it can never fail
 * the request.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await requireOpenEdition(supabase);
  await requireConfirmedEmail(supabase, user.sub);

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};

  // Validate everything before writing, so the only failures after the
  // registration exists are database errors.
  const input = parseRegistrationInput(body);
  const profile = parseProfileFields(body);
  const contact = parseContact(body.contact);
  const { skills, skills_input, new_skills } = await resolveSkills(supabase, body.skills, user.sub);

  const { data: registrationId, error } = await supabase.rpc("register_with_consents", {
    p_participant: user.sub,
    p_edition: edition.slug,
    p_skills: skills,
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
    for (const code of CONSENT_ERRORS) {
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

  const id = registrationId as string;

  const { data: registration, error: profileError } = await supabase
    .from("registrations")
    .update({ ...profile, skills_input })
    .eq("id", id)
    .select("id, edition_slug, skills, experience, public, matching_status, seat_state")
    .single();
  const { error: contactError } = profileError
    ? { error: null }
    : await saveContact(supabase, id, contact);

  if (profileError || contactError) {
    // The contact is required, so do not leave a registration without one.
    // Consent records are an append-only ledger and stay as given.
    console.error(
      "[me/registration.post] profile/contact save failed:",
      (profileError ?? contactError)!.message,
    );
    await supabase.from("registrations").delete().eq("id", id);
    throw createError({ statusCode: 500, message: "Failed to register" });
  }

  await addSkillsToCatalogue(supabase, new_skills, user.sub);

  // Persist welcome work for the notification dispatcher.
  const { error: welcomeError } = await supabase.from("notification_jobs").insert({
    edition_slug: edition.slug, registration_id: id,
    kind: "welcome", dedup_key: `welcome:${edition.slug}:${id}`,
  });
  if (welcomeError) console.error("[me/registration.post] welcome job failed:", welcomeError.message);
  // Deliver it (and anything else due) now rather than on the next run.
  await dispatchDueJobs(supabase, 5).catch(() => {});

  if (analyticsActivationAllowed(useRuntimeConfig())) {
    await recordRegistrationCompleted(event, supabase, edition.slug, id);
  }

  return registration;
});
