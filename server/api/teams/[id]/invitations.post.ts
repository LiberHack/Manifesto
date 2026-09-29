import { requireRegistration } from "#server/utils/requireRegistration";
import { requireTeamLeadership } from "#server/utils/registrationContext";
import { parseRequestMessage } from "#server/utils/profileInput";
import { getSeatState } from "#server/utils/joinRequests";
import { sendInvitationNotification } from "#server/utils/email";
import { isBlocked, wasRecommended } from "#server/utils/recommendations";

/**
 * A leader invites a specific participant. Only people who opted into
 * discovery (`matching_status = 'looking'`) and are not in a team can be
 * invited; they must accept before anything changes.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireRegistration(event);
  const { registration, edition, supabase } = ctx;

  const teamId = getRouterParam(event, "id")!;
  const team = await requireTeamLeadership(ctx, teamId, "Only the team leader can invite");

  const body =
    (await readBody<{ registration_id?: unknown; message?: unknown; recommended?: unknown }>(event)) ??
    {};
  const message = parseRequestMessage(body.message);
  if (typeof body.registration_id !== "string") {
    throw createError({ statusCode: 400, message: "registration_id is required" });
  }

  const { data: invitee } = await supabase
    .from("registrations")
    .select("id, participant_id, team_id, matching_status, participant:participants(email)")
    .eq("id", body.registration_id)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!invitee || invitee.matching_status !== "looking") {
    throw createError({ statusCode: 404, message: "Participant not found" });
  }
  if (invitee.id === registration.id) {
    throw createError({ statusCode: 400, message: "You cannot invite yourself" });
  }
  if (invitee.team_id) {
    throw createError({ statusCode: 409, message: "That participant already has a team" });
  }

  if (await isBlocked(supabase, registration.participant_id, invitee.participant_id)) {
    // Reported as not found so a block is not revealed to the blocked side.
    throw createError({ statusCode: 404, message: "Participant not found" });
  }

  const seats = await getSeatState(supabase, teamId);
  if (seats.vacancies === 0) {
    throw createError({ statusCode: 409, message: "Your team has no open places" });
  }

  const { data: request, error } = await supabase
    .from("join_requests")
    .insert({
      participant_id: invitee.participant_id,
      team_id: teamId,
      edition_slug: edition.slug,
      kind: "invitation",
      source:
        body.recommended === true &&
        (await wasRecommended(supabase, registration.id, teamId, invitee.id))
          ? "recommendation"
          : "direct_invite",
      invited_by: registration.id,
      message,
    })
    .select("id, kind, status, message, created_at, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError({
        statusCode: 409,
        message: "There is already an open request between you and this participant",
      });
    }
    console.error("[teams/invitations.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to send invitation" });
  }

  const email = (invitee.participant as unknown as { email: string } | null)?.email;
  if (email) {
    void sendInvitationNotification(email, team.name).catch(() => {});
  }

  return request;
});
