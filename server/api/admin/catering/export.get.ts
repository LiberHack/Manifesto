import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";

/**
 * Catering list for the organisers / caterer: name, diet and any note given
 * with explicit consent (legacy notes without it are withheld). Never part of a sponsor export.
 */
interface Row {
  diet: string;
  note: string | null;
  note_consent_at: string | null;
  registration: {
    edition_slug: string;
    participant: { id: string; name: string } | null;
  } | null;
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("registration_catering")
    .select(
      "diet, note, note_consent_at, registration:registrations!inner(edition_slug, participant:participants(id, name))",
    )
    .eq("registration.edition_slug", edition.slug);

  if (error) {
    console.error("[admin/catering/export] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = (data ?? []) as unknown as Row[];
  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "catering",
    editionSlug: edition.slug,
    participantIds: rows.flatMap((r) =>
      r.registration?.participant ? [r.registration.participant.id] : [],
    ),
    rowCount: rows.length,
  });

  setExportHeaders(event, exportFilename("catering", edition.slug));
  return toCsv(
    ["name", "diet", "note"],
    rows.map((r) => [
      r.registration?.participant?.name,
      r.diet,
      // Legacy notes were copied without the explicit consent a note now
      // needs; they stay out of the export until the person re-confirms.
      r.note_consent_at ? r.note : r.note ? "[withheld: needs re-confirmation]" : null,
    ]),
  );
});
