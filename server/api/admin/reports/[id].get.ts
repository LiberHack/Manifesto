import { requireAdmin } from "#server/utils/adminAuth";
import { namesByRegistration } from "#server/utils/conversations";

/**
 * One report with the conversation it concerns — the only way an organizer
 * reads participant conversations.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const { data: report } = await supabase
    .from("conversation_reports")
    .select("id, conversation_id, message_id, reason, status, resolution_note, created_at")
    .eq("id", getRouterParam(event, "id")!)
    .maybeSingle();
  if (!report) throw createError({ statusCode: 404, message: "Report not found" });

  const { data: messages } = await supabase
    .from("conversation_messages")
    .select("id, author_id, body, created_at, hidden_at")
    .eq("conversation_id", report.conversation_id)
    .order("id", { ascending: true })
    .limit(500);

  const names = await namesByRegistration(supabase, (messages ?? []).map((m) => m.author_id as string));
  return {
    report,
    messages: (messages ?? []).map((m) => ({
      ...m,
      author_name: names.get(m.author_id as string)?.name ?? "",
      reported: m.id === report.message_id,
    })),
  };
});
