import { requireAdmin } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EligibleRow {
  participant_id: string;
  name: string;
  email: string;
  skills: string[];
  experience: string | null;
}

/**
 * Recruitment export for one named sponsor.
 *
 * Eligibility is decided in the database at the moment of export
 * (`sponsor_export_rows`): the recipient must be active and each person's
 * current sponsor-sharing decision must be an acknowledgment that lists this
 * recipient. Objections and acknowledgments that predate the recipient are
 * excluded. Only the fields disclosed for this recipient are written.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  // Launch blocker gate: no per-person sponsor export until the legal basis
  // for mandatory sharing is documented and an operator sets
  // NUXT_SPONSOR_EXPORTS_ENABLED=true for the environment.
  if (useRuntimeConfig().sponsorExportsEnabled !== true) {
    throw createError({ statusCode: 409, message: "sponsor_exports_disabled" });
  }
  const id = getRouterParam(event, "id");
  if (!id || !UUID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, message: "Invalid recipient id" });
  }

  const { data: recipient } = await supabase
    .from("sponsor_recipients")
    .select("id, edition_slug, organisation, shared_fields, retired_at")
    .eq("id", id)
    .maybeSingle();
  if (!recipient) throw createError({ statusCode: 404, message: "Recipient not found" });
  if (recipient.retired_at) {
    throw createError({ statusCode: 409, message: "Recipient is retired" });
  }

  const { data, error } = await supabase.rpc("sponsor_export_rows", { p_recipient: id });
  if (error) {
    console.error("[admin/sponsors/export] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  const rows = (data ?? []) as EligibleRow[];

  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "sponsor",
    editionSlug: recipient.edition_slug,
    recipientId: recipient.id,
    participantIds: rows.map((r) => r.participant_id),
    rowCount: rows.length,
  });

  const fields = (recipient.shared_fields as string[]).filter((f) =>
    ["name", "email", "skills", "experience"].includes(f),
  ) as (keyof Omit<EligibleRow, "participant_id">)[];

  const slug = recipient.organisation.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  setExportHeaders(event, exportFilename(`sponsor-${slug}`, recipient.edition_slug));
  return toCsv(
    fields,
    rows.map((r) => fields.map((f) => r[f])),
  );
});
