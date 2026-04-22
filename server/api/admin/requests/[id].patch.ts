import { requireAdmin } from "#server/utils/adminAuth";

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

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
