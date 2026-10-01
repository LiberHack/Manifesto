import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";
import { buildSourceReport, readReportQuery } from "#server/utils/sourceReport";

/**
 * Aggregate CSV exports of the Sources view: `?kind=sources` (registrations by
 * date and source for the chosen model) or `?kind=funnel` (cohorts). No
 * per-person or per-browser rows.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const query = getQuery(event);
  const { model, channel } = readReportQuery(query);
  const kind = query.kind;
  if (kind !== "sources" && kind !== "funnel") {
    throw createError({ statusCode: 400, message: "kind must be sources or funnel" });
  }

  const report = await buildSourceReport(supabase, edition.slug, model, channel);
  const labels = new Map(report.sources.map((s) => [s.source_key, s]));

  const csv =
    kind === "sources"
      ? toCsv(
          ["registration_date_sofia", "model", "source", "label", "channel", "registrations"],
          report.daily.map((r) => [
            r.day,
            model,
            r.source_key,
            labels.get(r.source_key)?.label ?? r.source_key,
            labels.get(r.source_key)?.channel ?? "",
            r.registrations,
          ]),
        )
      : toCsv(
          ["cohort_date_sofia", "channel", "window", "landed", "cta_clicked", "started", "completed_within_7d"],
          [
            ...report.funnel.closed.map((r) => [r.cohort_day, r.channel, "closed", r.landed, r.cta, r.started, r.completed_7d]),
            ...report.funnel.open.map((r) => [r.cohort_day, r.channel, "open", r.landed, r.cta, r.started, r.completed_7d]),
          ],
        );

  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: kind === "sources" ? "source_report" : "funnel_report",
    editionSlug: edition.slug,
    rowCount: kind === "sources" ? report.daily.length : report.funnel.closed.length + report.funnel.open.length,
  });

  setExportHeaders(event, exportFilename(kind === "sources" ? `sources-${model}` : "funnel", edition.slug));
  return csv;
});
