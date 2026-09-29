import { requireRegistration } from "#server/utils/requireRegistration";
import { releaseTeamLeadership } from "#server/utils/teamMembership";
import { membershipError } from "#server/utils/joinRequests";

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

  // Checked again under a lock by join_team; this early check only avoids
  // leaving the current team for one that is already full.
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
    await supabase
      .from("registrations")
      .update({ team_id: null, role: "participant" })
      .eq("id", registration.id);
  }

  // join_team checks capacity under a lock and closes the person's other open
  // requests as joined_other_team.
  const { error } = await supabase.rpc("join_team", {
    p_registration: registration.id,
    p_team: team.id,
    p_source: "invite_link",
  });
  if (error) membershipError(error, "invite.accept");

  return { team_id: team.id, team_name: team.name };
});
