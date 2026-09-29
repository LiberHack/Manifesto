import { requireAdmin } from "#server/utils/adminAuth";

/** Conversation reports, open ones first. The reported text itself is only loaded per report. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const { data, error } = await supabase
    .from("conversation_reports")
    .select(
      "id, status, reason, created_at, resolved_at, message_id, " +
        "conversation:conversations(id, kind, team:teams(name)), " +
        "reporter:registrations(participant:participants(name))",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/reports.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data ?? [];
});
