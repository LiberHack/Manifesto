import {
  assertEditionWritable,
  requireAdmin,
  resolveAdminEdition,
} from "#server/utils/adminAuth";

/** Withdraw an open proposal of the (writable) edition being administered. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const { data } = await supabase
    .from("team_proposals")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", getRouterParam(event, "id")!)
    .eq("edition_slug", edition.slug)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!data) throw createError({ statusCode: 404, message: "No open proposal with that id" });
  return { ok: true };
});
