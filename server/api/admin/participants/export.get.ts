import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";

/**
 * Internal organiser export. Not for sponsors — they get
 * /api/admin/sponsors/:id/export, which enforces eligibility and limits fields.
 * Catering data has its own export.
 */
const COLUMNS = [
  "name",
  "email",
  "team_role",
  "experience",
  "skills",
  "team_id",
  "public_archive",
  "registered_at",
] as const;

interface Row {
  role: string;
  team_id: string | null;
  skills: string[];
  experience: string | null;
  public_opted_in_at: string | null;
  registered_at: string;
  participant: { id: string; name: string; email: string } | null;
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "role, team_id, skills, experience, public_opted_in_at, registered_at, " +
        "participant:participants(id, name, email)",
    )
    .eq("edition_slug", edition.slug)
    .order("registered_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = (data ?? []) as unknown as Row[];
  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "participants",
    editionSlug: edition.slug,
    participantIds: rows.flatMap((r) => (r.participant ? [r.participant.id] : [])),
    rowCount: rows.length,
  });

  setExportHeaders(event, exportFilename("participants", edition.slug));
  return toCsv(
    COLUMNS,
    rows.map((r) => [
      r.participant?.name,
      r.participant?.email,
      r.role,
      r.experience,
      r.skills,
      r.team_id,
      r.public_opted_in_at ? "yes" : "no",
      r.registered_at,
    ]),
  );
});
