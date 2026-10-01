import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Export audit log for an edition: who exported what, to which recipient,
 * when, and how many rows. `?participant=<id>` narrows it to exports that
 * included that person — the starting point for a rights request about data a
 * sponsor already received.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  setHeader(event, "Cache-Control", "no-store, private");

  const { participant } = getQuery(event) as { participant?: string };
  let query = supabase
    .from("export_audit")
    .select(
      "id, export_kind, row_count, exported_at, " +
        "exporter:participants!export_audit_exported_by_fkey(name), " +
        "recipient:sponsor_recipients(organisation)",
    )
    .eq("edition_slug", edition.slug)
    .order("exported_at", { ascending: false })
    .limit(200);

  if (participant !== undefined) {
    if (!UUID_PATTERN.test(participant)) {
      throw createError({ statusCode: 400, message: "Invalid participant id" });
    }
    query = query.contains("participant_ids", [participant]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/exports] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data ?? [];
});
