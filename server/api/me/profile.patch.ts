import { requireRegistration } from "#server/utils/requireRegistration";
import {
  DIETS,
  MAX_DIETARY_NOTE_LENGTH,
  PRIVACY_NOTICE_VERSION,
  type Diet,
} from "#shared/utils/privacy";
import { EXPERIENCE_VALUES, type ExperienceLevel } from "#server/utils/registrationInput";
import { parseProfileFields } from "#server/utils/profileInput";
import { addSkillsToCatalogue, resolveSkills } from "#server/utils/skills";

interface Body {
  skills?: unknown;
  experience?: unknown;
  public?: unknown;
  diet?: unknown;
  dietary_note?: unknown;
  dietary_note_consent?: unknown;
}

/**
 * Edit the caller's per-edition profile: skills, experience, the matching
 * profile, public-archive opt-in and catering. A dietary note is stored only with an explicit consent and
 * clearing it withdraws that consent and deletes the note.
 */
export default defineEventHandler(async (event) => {
  const { user, registration, edition, supabase } = await requireRegistration(event);
  // Typed catering/profile fields plus the open matching-profile fields that
  // parseProfileFields validates.
  const body = (await readBody<Body & Record<string, unknown>>(event)) ?? {};

  const update: Record<string, unknown> = { ...parseProfileFields(body) };
  let newSkills: string[] = [];

  if (body.skills !== undefined) {
    const resolved = await resolveSkills(supabase, body.skills);
    update.skills = resolved.skills;
    update.skills_input = resolved.skills_input;
    newSkills = resolved.new_skills;
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
    update.public_opted_in_at = body.public ? new Date().toISOString() : null;
  }

  if (body.diet !== undefined && !DIETS.includes(body.diet as Diet)) {
    throw createError({ statusCode: 400, message: `diet must be one of: ${DIETS.join(", ")}` });
  }
  if (
    body.dietary_note !== undefined &&
    body.dietary_note !== null &&
    typeof body.dietary_note !== "string"
  ) {
    throw createError({ statusCode: 400, message: "dietary_note must be a string" });
  }
  const note =
    typeof body.dietary_note === "string" ? body.dietary_note.trim() : body.dietary_note;
  if (typeof note === "string" && note.length > MAX_DIETARY_NOTE_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `The dietary note must be ${MAX_DIETARY_NOTE_LENGTH} characters or fewer`,
    });
  }
  if (typeof note === "string" && note !== "" && body.dietary_note_consent !== true) {
    throw createError({
      statusCode: 400,
      message: "A dietary note needs your explicit consent to store it",
    });
  }

  if (typeof note === "string" && note !== "" && body.diet === undefined) {
    throw createError({ statusCode: 400, message: "diet is required with a dietary note" });
  }

  const touchesCatering = body.diet !== undefined || note !== undefined;
  if (Object.keys(update).length === 0 && !touchesCatering) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("registrations")
      .update(update)
      .eq("id", registration.id);
    if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("registration_catering")
    .select("note")
    .eq("registration_id", registration.id)
    .maybeSingle();
  const existingNote = (existing as { note: string | null } | null)?.note ?? null;

  const withNewNote = typeof note === "string" && note !== "" && note !== existingNote;
  if (withNewNote) {
    // Note and its consent record in one transaction.
    const { error } = await supabase.rpc("set_dietary_note", {
      p_participant: user.sub,
      p_edition: edition.slug,
      p_notice_version: PRIVACY_NOTICE_VERSION,
      p_diet: body.diet as Diet,
      p_note: note,
    });
    if (error?.message?.includes("dietary_note_disabled")) {
      throw createError({ statusCode: 400, message: "dietary_note_disabled" });
    }
    if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  } else if (body.diet !== undefined) {
    const { error } = await supabase.from("registration_catering").upsert(
      { registration_id: registration.id, diet: body.diet as Diet, updated_at: now },
      { onConflict: "registration_id" },
    );
    if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  }

  if (note === null || note === "") {
    // Only a stored note has a consent to withdraw; saving without one is a no-op.
    if (existingNote !== null) {
      const { error } = await supabase.rpc("withdraw_dietary_note", {
        p_participant: user.sub,
        p_edition: edition.slug,
        p_notice_version: PRIVACY_NOTICE_VERSION,
      });
      if (error) throw createError({ statusCode: 500, message: "Internal server error" });
    }
  }

  await addSkillsToCatalogue(supabase, newSkills, user.sub);

  return { ok: true };
});
