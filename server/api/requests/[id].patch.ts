import { requireRegistration } from "#server/utils/requireRegistration";
import { sendRequestDecisionNotification } from "#server/utils/email";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const requestId = getRouterParam(event, "id");
  const body = await readBody<{ status: "approved" | "rejected" }>(event);

  if (!["approved", "rejected"].includes(body.status)) {
    throw createError({
      statusCode: 400,
      message: "status must be approved or rejected",
    });
  }

  const { data: joinRequest } = await supabase
    .from("join_requests")
    .select("id, status, team_id, team:teams(leader_id)")
    .eq("id", requestId!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!joinRequest)
    throw createError({ statusCode: 404, message: "Request not found" });
  if (joinRequest.status !== "pending") {
    throw createError({ statusCode: 409, message: "Request is not pending" });
  }

  const leaderId = (joinRequest.team as unknown as { leader_id: string } | null)
    ?.leader_id;
  if (leaderId !== registration.id) {
    throw createError({
      statusCode: 403,
      message: "Only the team leader can respond to requests",
    });
  }

  // DB trigger handles setting registrations.team_id and rejecting the
  // requester's other pending requests on approval
  const { data: updated, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", requestId!)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    // No row: the request stopped being pending since it was read (e.g. the
    // requester created a team, which rejects their pending requests).
    if (error.code === "PGRST116") {
      throw createError({ statusCode: 409, message: "Request is not pending" });
    }
    if (error.message?.includes("already_in_team")) {
      throw createError({
        statusCode: 409,
        message: "The requester is already in a team",
      });
    }
    if (error.message?.includes("team_full")) {
      throw createError({ statusCode: 409, message: "Team is already full" });
    }
    console.error("[requests.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to update request" });
  }

  // Notify requester — fire and forget
  void (async () => {
    const [requester, team] = await Promise.all([
      supabase
        .from("participants")
        .select("email")
        .eq("id", updated.participant_id)
        .single(),
      supabase.from("teams").select("name").eq("id", updated.team_id).single(),
    ]);

    if (requester.data?.email && team.data?.name) {
      await sendRequestDecisionNotification(
        requester.data.email,
        team.data.name,
        body.status,
      ).catch(() => {});
    }
  })();

  return updated;
});
