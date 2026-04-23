import { requireAdmin } from "#server/utils/adminAuth";
import { sendRequestDecisionNotification } from "#server/utils/email";

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

  const { data, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", requestId!)
    .select()
    .single();

  if (error) {
    console.error("[admin/requests.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to update request" });
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
