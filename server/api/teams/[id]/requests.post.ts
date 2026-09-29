import { requireRegistration } from "#server/utils/requireRegistration";
import { sendJoinRequestNotification } from "#server/utils/email";
import { parseRequestMessage } from "#server/utils/profileInput";
import { getSeatState } from "#server/utils/joinRequests";
import { isBlocked, wasRecommended } from "#server/utils/recommendations";

/**
 * Apply to join a team. The message is required and stored as submitted.
 * Refused when the team is not recruiting or has no vacancies left.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const teamId = getRouterParam(event, "id")!;
  const body = (await readBody<{ message?: unknown; recommended?: unknown }>(event)) ?? {};
  const message = parseRequestMessage(body.message);

  if (registration.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, leader_id")
    .eq("id", teamId)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!team) throw createError({ statusCode: 404, message: "Team not found" });

  const seats = await getSeatState(supabase, teamId);
  if (!seats.recruiting) {
    throw createError({ statusCode: 409, message: "This team is not recruiting" });
  }
  if (seats.vacancies === 0) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  const { data: leaderReg } = await supabase
    .from("registrations")
    .select("participant_id")
    .eq("id", team.leader_id)
    .single();
  if (leaderReg && (await isBlocked(supabase, registration.participant_id, leaderReg.participant_id))) {
    throw createError({ statusCode: 403, message: "You can't apply to this team" });
  }

  // Attributed to recommendations only if this person was actually shown it.
  const recommended =
    body.recommended === true &&
    (await wasRecommended(supabase, registration.id, teamId, null));

  const { data: request, error } = await supabase
    .from("join_requests")
    .insert({
      participant_id: registration.participant_id,
      team_id: teamId,
      edition_slug: edition.slug,
      kind: "application",
      source: recommended ? "recommendation" : "application",
      message,
    })
    .select("id, kind, status, message, created_at, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, message: "Request already pending" });
    }
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
