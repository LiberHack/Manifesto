import { requireRegistration } from "#server/utils/requireRegistration";
import {
  sendInvitationAcceptedNotification,
  sendRequestDecisionNotification,
} from "#server/utils/email";
import { membershipError } from "#server/utils/joinRequests";

const ACTIONS = ["approve", "reject", "accept", "decline", "withdraw"] as const;
type Action = (typeof ACTIONS)[number];

// The original API took { status }; keep accepting it.
const LEGACY_STATUS: Record<string, Action> = { approved: "approve", rejected: "reject" };

/**
 * Act on an application or invitation. Who may do what is enforced inside
 * decide_join_request, together with the membership rules, in one transaction.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const requestId = getRouterParam(event, "id")!;
  const body = (await readBody<{ action?: string; status?: string }>(event)) ?? {};
  const action = (body.action ?? LEGACY_STATUS[body.status ?? ""]) as Action;

  if (!ACTIONS.includes(action)) {
    throw createError({
      statusCode: 400,
      message: `action must be one of: ${ACTIONS.join(", ")}`,
    });
  }

  const { data: existing } = await supabase
    .from("join_requests")
    .select("id")
    .eq("id", requestId)
    .eq("edition_slug", edition.slug)
    .maybeSingle();
  if (!existing) throw createError({ statusCode: 404, message: "Request not found" });

  const { data: updated, error } = await supabase.rpc("decide_join_request", {
    p_request: requestId,
    p_actor: registration.id,
    p_action: action,
  });

  if (error) membershipError(error, "requests.patch");

  if (updated.status === "expired") {
    throw createError({ statusCode: 409, message: "This request has expired" });
  }

  notify(supabase, updated, action);
  return updated;
});

function notify(
  supabase: Awaited<ReturnType<typeof requireRegistration>>["supabase"],
  request: { participant_id: string; team_id: string },
  action: Action,
) {
  // Fire and forget: a failed email never undoes the decision.
  void (async () => {
    const [person, team] = await Promise.all([
      supabase
        .from("participants")
        .select("name, email")
        .eq("id", request.participant_id)
        .single(),
      supabase
        .from("teams")
        .select("name, leader:registrations!teams_leader_id_fkey(participant:participants(email))")
        .eq("id", request.team_id)
        .single(),
    ]);
    if (!person.data || !team.data) return;

    if (action === "approve" || action === "reject") {
      await sendRequestDecisionNotification(
        person.data.email,
        team.data.name,
        action === "approve" ? "approved" : "rejected",
      );
    } else if (action === "accept") {
      const leaderEmail = (
        team.data.leader as unknown as { participant: { email: string } | null } | null
      )?.participant?.email;
      if (leaderEmail) {
        await sendInvitationAcceptedNotification(leaderEmail, person.data.name, team.data.name);
      }
    }
  })().catch(() => {});
}
