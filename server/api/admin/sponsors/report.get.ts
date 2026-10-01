import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";
import { suppressSmallGroups, type CountCell } from "#server/utils/suppression";

/**
 * Aggregate profile of an edition's participants for sponsor decks:
 * experience levels and the most common skills, with small groups suppressed
 * (threshold: runtimeConfig.sponsorReportMinGroup, never below 3). No names,
 * emails or other per-person data.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const minGroup = Math.max(3, Number(useRuntimeConfig().sponsorReportMinGroup) || 5);

  const { data, error } = await supabase
    .from("registrations")
    .select("skills, experience")
    .eq("edition_slug", edition.slug);
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });

  const rows = (data ?? []) as { skills: string[]; experience: string | null }[];

  const experience: CountCell[] = ["beginner", "intermediate", "experienced", "not_set"].map(
    (level) => ({
      key: level,
      count: rows.filter((r) => (r.experience ?? "not_set") === level).length,
    }),
  );

  const skillCounts = new Map<string, number>();
  for (const r of rows) {
    for (const skill of new Set(r.skills.map((s) => s.toLowerCase()))) {
      skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
    }
  }
  // Skills are reported individually only when common enough; a skill is not
  // a partition of people, so its rows are thresholded, not complemented.
  const skills = [...skillCounts.entries()]
    .filter(([, count]) => count >= minGroup)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 20);

  const exp = suppressSmallGroups(experience, minGroup);

  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "sponsor_report",
    editionSlug: edition.slug,
    rowCount: rows.length,
  });

  setExportHeaders(event, exportFilename("sponsor-report", edition.slug));
  return toCsv(
    ["section", "group", "participants"],
    [
      ["total", "all", exp.total ?? `<${minGroup}`],
      ...exp.cells.map((c) => ["experience", c.key, c.count ?? `<${minGroup}`]),
      ...skills.map(([skill, count]) => ["skill", skill, count]),
    ],
  );
});
