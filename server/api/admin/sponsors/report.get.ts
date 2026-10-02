import { requireAdminWithMfa, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";
import { buildSponsorReport } from "#server/utils/suppression";

/**
 * Aggregate profile of an edition's participants for sponsor decks
 * (experience levels, common skills), with small groups suppressed. No
 * per-person data.
 *
 * Only for a final edition (archived, or past its end date): while
 * registrations still change, two exports a day apart could be differenced to
 * reveal one new person's answers. Suppression is a safeguard, not
 * anonymisation.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdminWithMfa(event);
  const edition = await resolveAdminEdition(event, supabase);
  const minGroup = Math.max(3, Number(useRuntimeConfig().sponsorReportMinGroup) || 5);

  const final =
    edition.status === "archived" ||
    (edition.ends_at !== null && Date.parse(edition.ends_at) < Date.now());
  if (!final) {
    throw createError({ statusCode: 409, message: "edition_not_final" });
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("skills, experience")
    .eq("edition_slug", edition.slug);
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });

  const rows = (data ?? []) as { skills: string[]; experience: string | null }[];
  const report = buildSponsorReport(rows, minGroup);

  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "sponsor_report",
    editionSlug: edition.slug,
    rowCount: rows.length,
  });

  const hidden = `<${minGroup}`;
  setExportHeaders(event, exportFilename("sponsor-report", edition.slug));
  return toCsv(
    ["section", "group", "participants"],
    [
      ["total", "all", report.total ?? hidden],
      ...report.experience.map((c) => ["experience", c.key, c.count ?? hidden]),
      ...report.skills.map((s) => ["skill", s.skill, s.participants]),
    ],
  );
});
