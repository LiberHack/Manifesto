import { requireRegistration } from "#server/utils/requireRegistration";
import { releaseTeamLeadership } from "#server/utils/teamMembership";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const code = getRouterParam(event, "code");
  const body = await readBody<{ confirm_switch?: boolean }>(event).catch(
    () => ({}),
  );

  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("invite_code", code!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!team) throw createError({ statusCode: 404, message: "Invite link not found" });

  if (registration.team_id === team.id) {
    throw createError({ statusCode: 409, message: "Already in this team" });
  }

  if (registration.team_id && !body.confirm_switch) {
    throw createError({ statusCode: 409, message: "already_in_team" });
  }

  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  if ((count ?? 0) >= 6) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  // Switching away from a led team must hand leadership over first, otherwise
  // teams.leader_id would point at a non-member.
  if (registration.team_id) {
    await releaseTeamLeadership(supabase, registration.id, registration.team_id);
  }

  const { error } = await supabase
    .from("registrations")
    .update({ team_id: team.id, role: "participant" })
    .eq("id", registration.id);

  if (error) {
    if (error.message?.includes("team_full")) {
      throw createError({ statusCode: 409, message: "Team is full" });
    }
    console.error("[invite.accept] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  // Cancel any pending join requests for the new member
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("participant_id", registration.participant_id)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending");

  return { team_id: team.id, team_name: team.name };
});
