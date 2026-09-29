import { requireRegistration } from "#server/utils/requireRegistration";

/** Ask the organizers for help finding a team (or clear it with `{ requested: false }`). */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const body = (await readBody<{ requested?: unknown }>(event)) ?? {};
  const requested = body.requested !== false;

  const { error } = await supabase
    .from("registrations")
    .update({ organizer_help_requested_at: requested ? new Date().toISOString() : null })
    .eq("id", registration.id);

  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  return { requested };
});
