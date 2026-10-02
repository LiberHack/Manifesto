import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { buildSourceReport, readReportQuery } from "#server/utils/sourceReport";

/** Sources view data: attribution by model and channel, daily series, funnel. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const { model, channel } = readReportQuery(getQuery(event));
  setHeader(event, "Cache-Control", "no-store, private");
  return buildSourceReport(supabase, edition.slug, model, channel);
});
