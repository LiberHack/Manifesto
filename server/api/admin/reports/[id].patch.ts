import { requireAdmin } from "#server/utils/adminAuth";

/**
 * Resolve a report, optionally hiding the reported message from participants
 * (its text is kept for the record).
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = (await readBody<{ hide_message?: unknown; note?: unknown }>(event)) ?? {};
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;

  const { data: report } = await supabase
    .from("conversation_reports")
    .select("message_id")
    .eq("id", id)
    .maybeSingle();
  if (!report) throw createError({ statusCode: 404, message: "Report not found" });

  if (body.hide_message === true && report.message_id) {
    await supabase
      .from("conversation_messages")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", report.message_id);
  }

  const { error } = await supabase
    .from("conversation_reports")
    .update({
      status: "resolved",
      resolved_by: user.sub,
      resolved_at: new Date().toISOString(),
      resolution_note: note || null,
    })
    .eq("id", id);
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  return { ok: true };
});
