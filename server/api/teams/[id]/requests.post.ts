import { requireRegistration } from "#server/utils/requireRegistration";
import { sendJoinRequestNotification } from "#server/utils/email";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const teamId = getRouterParam(event, "id");

  if (registration.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, leader_id")
    .eq("id", teamId!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!team) throw createError({ statusCode: 404, message: "Team not found" });

  const { count: memberCount } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId!);

  if ((memberCount ?? 0) >= 6) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  const { data: existing } = await supabase
    .from("join_requests")
    .select("id")
    .eq("participant_id", registration.participant_id)
    .eq("team_id", teamId!)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    throw createError({ statusCode: 409, message: "Request already pending" });
  }

  const { data: request, error } = await supabase
    .from("join_requests")
    .insert({
      participant_id: registration.participant_id,
      team_id: teamId!,
      edition_slug: edition.slug,
    })
    .select()
    .single();

  if (error) {
    console.error("[teams/requests.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to submit request" });
  }

  // Notify team leader — fire and forget, don't block response.
  // leader_id is a registration id, so the email address is two hops away.
  void (async () => {
    const [requester, leader] = await Promise.all([
      supabase
        .from("participants")
        .select("name")
        .eq("id", registration.participant_id)
        .single(),
      supabase
        .from("registrations")
        .select("participant:participants(email)")
        .eq("id", team.leader_id)
        .single(),
    ]);

    const leaderEmail = (
      leader.data?.participant as unknown as { email: string } | null
    )?.email;

    if (leaderEmail && requester.data?.name) {
      await sendJoinRequestNotification(
        leaderEmail,
        requester.data.name,
        team.name,
      ).catch(() => {});
    }
  })();

  return request;
});
