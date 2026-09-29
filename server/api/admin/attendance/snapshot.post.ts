import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const body = await readBody<{ cutoff?: string }>(event);
  if (!["14_days", "7_days", "1_day"].includes(body?.cutoff ?? "")) throw createError({ statusCode: 400, message: "Invalid cutoff" });
  const { data, error } = await supabase.rpc("capture_attendance_snapshot", { p_edition: edition.slug, p_cutoff: body.cutoff });
  if (error) throw createError({ statusCode: 409, message: "Snapshot already captured or unavailable" });
  return { captured: data };
});
