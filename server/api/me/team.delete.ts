import { requireRegistration } from "#server/utils/requireRegistration";
import { releaseTeamLeadership } from "#server/utils/teamMembership";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const teamId = registration.team_id;
  if (!teamId) {
    throw createError({ statusCode: 400, message: "Not in a team" });
  }

  await releaseTeamLeadership(supabase, registration.id, teamId);

  await supabase
    .from("registrations")
    .update({ team_id: null, role: "participant" })
    .eq("id", registration.id);

  // Cancel any pending join requests in this edition
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("participant_id", registration.participant_id)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending");

  return { ok: true };
});
