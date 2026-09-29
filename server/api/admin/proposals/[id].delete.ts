import { requireAdmin } from "#server/utils/adminAuth";

/** Withdraw an open proposal. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const { data } = await supabase
    .from("team_proposals")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", getRouterParam(event, "id")!)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!data) throw createError({ statusCode: 404, message: "No open proposal with that id" });
  return { ok: true };
});
