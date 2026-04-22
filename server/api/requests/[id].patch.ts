import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const requestId = getRouterParam(event, "id");
  const body = await readBody<{ status: "approved" | "rejected" }>(event);

  if (!["approved", "rejected"].includes(body.status)) {
    throw createError({
      statusCode: 400,
      message: "status must be approved or rejected",
    });
  }

  const supabase = useSupabaseAdmin();

  const { data: joinRequest } = await supabase
    .from("join_requests")
    .select("id, status, team_id, team:teams(leader_id)")
    .eq("id", requestId!)
    .single();

  if (!joinRequest)
    throw createError({ statusCode: 404, message: "Request not found" });
  if (joinRequest.status !== "pending") {
    throw createError({ statusCode: 409, message: "Request is not pending" });
  }

  const leaderId = (joinRequest.team as { leader_id: string } | null)
    ?.leader_id;
  if (leaderId !== user.sub) {
    throw createError({
      statusCode: 403,
      message: "Only the team leader can respond to requests",
    });
  }

  // DB trigger handles setting team_id and rejecting other requests on approval
  const { data: updated, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", requestId!)
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return updated;
});
