import { requireRegistration } from "#server/utils/requireRegistration";
import { requireConversationAccess } from "#server/utils/conversations";

/**
 * Report a conversation (optionally one message) to the organizers. Only a
 * reported conversation is ever opened for organizer review.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const conversationId = getRouterParam(event, "id")!;
  await requireConversationAccess(supabase, conversationId, registration.id);

  const body = (await readBody<{ message_id?: unknown; reason?: unknown }>(event)) ?? {};
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 1000) {
    throw createError({ statusCode: 400, message: "Describe the problem in 5–1000 characters" });
  }

  let messageId: number | null = null;
  if (body.message_id !== undefined && body.message_id !== null) {
    messageId = Number(body.message_id);
    const { data: message } = await supabase
      .from("conversation_messages")
      .select("id")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (!message) throw createError({ statusCode: 404, message: "Message not found" });
  }

  const { error } = await supabase.from("conversation_reports").insert({
    conversation_id: conversationId,
    message_id: messageId,
    reporter_id: registration.id,
    reason,
  });
  if (error) {
    console.error("[conversations/reports.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to send report" });
  }
  return { ok: true };
});
