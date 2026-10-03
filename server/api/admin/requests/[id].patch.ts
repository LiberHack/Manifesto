import { requireAdmin } from "#server/utils/adminAuth";
import { sendRequestDecisionNotification } from "#server/utils/email";
import { membershipError } from "#server/utils/joinRequests";

/**
 * An organizer approves or rejects an application on the leader's behalf.
 * Goes through the same decide_join_request path as leaders, so capacity and
 * single-team rules still hold. Invitations are only ever answered by the
 * invitee.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const requestId = getRouterParam(event, "id");
  const body = await readBody<{ status: "approved" | "rejected" }>(event);

  if (!["approved", "rejected"].includes(body.status)) {
    throw createError({
      statusCode: 400,
      message: "status must be approved or rejected",
    });
  }

  const { data, error } = await supabase.rpc("decide_join_request", {
    p_request: requestId,
    p_actor: null,
    p_action: body.status === "approved" ? "approve" : "reject",
  });

  if (error) membershipError(error, "admin/requests.patch");
  if (data.status === "expired") {
    throw createError({ statusCode: 409, message: "This request has expired" });
  }

  // Notify requester — fire and forget
  void (async () => {
    const [requester, team] = await Promise.all([
      supabase
        .from("participants")
        .select("email")
        .eq("id", data.participant_id)
        .single(),
      supabase
        .from("teams")
        .select("name")
        .eq("id", data.team_id)
        .single(),
    ]);

    if (requester.data?.email && team.data?.name) {
      await sendRequestDecisionNotification(
        requester.data.email,
        team.data.name,
        body.status
      ).catch(() => {});
    }
  })();

  return data;
});
