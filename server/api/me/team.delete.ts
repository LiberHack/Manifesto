import { requireRegistration } from "#server/utils/requireRegistration";
import { membershipError } from "#server/utils/joinRequests";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  if (!registration.team_id) {
    throw createError({ statusCode: 400, message: "Not in a team" });
  }

  // Hands leadership over (or dissolves a team of one) in the same transaction.
  const { error } = await supabase.rpc("leave_team", { p_registration: registration.id });
  if (error) membershipError(error, "me/team.delete");

  // Close anything still open for this person in this edition
  await supabase
    .from("join_requests")
    .update({
      status: "withdrawn",
      close_reason: "left_team",
      decided_at: new Date().toISOString(),
    })
    .eq("participant_id", registration.participant_id)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending");

  return { ok: true };
});
