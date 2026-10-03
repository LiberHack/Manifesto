import type { SupabaseClient } from "@supabase/supabase-js";

export type ExportKind =
  | "participants"
  | "participants_contacts"
  | "teams"
  | "catering"
  | "sponsor"
  | "sponsor_report"
  | "source_report"
  | "funnel_report";

export interface ExportAuditEntry {
  exportedBy: string;
  kind: ExportKind;
  editionSlug: string;
  recipientId?: string | null;
  participantIds?: string[];
  rowCount: number;
}

/**
 * Log an export before its data leaves the server. If the log cannot be
 * written the export is refused: an unaudited export must not happen.
 */
export async function recordExport(
  supabase: SupabaseClient,
  entry: ExportAuditEntry,
): Promise<void> {
  const { error } = await supabase.from("export_audit").insert({
    exported_by: entry.exportedBy,
    export_kind: entry.kind,
    edition_slug: entry.editionSlug,
    recipient_id: entry.recipientId ?? null,
    participant_ids: entry.participantIds ?? [],
    row_count: entry.rowCount,
  });
  if (error) {
    console.error("[export-audit] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Export could not be audited" });
  }
}

/** `<kind>-<edition>-<YYYY-MM-DD>.csv` */
export function exportFilename(kind: string, editionSlug: string): string {
  return `${kind}-${editionSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
}
