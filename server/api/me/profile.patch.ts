import { requireRegistration } from "#server/utils/requireRegistration";

const EXPERIENCE_VALUES = ["beginner", "intermediate", "experienced"] as const;
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number];

const MAX_DIETARY_LENGTH = 200;

export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);

  const body = await readBody<{
    dietary?: unknown;
    experience?: unknown;
    public?: unknown;
  }>(event);

  const update: Record<string, string | boolean | null> = {};

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

  return { ok: true };
});
