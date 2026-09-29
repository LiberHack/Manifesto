import { requireRegistration } from "#server/utils/requireRegistration";
import {
  MESSAGE_MAX_LENGTH,
  SEND_LIMIT_PER_DAY,
  SEND_LIMIT_PER_MINUTE,
  requireConversationAccess,
} from "#server/utils/conversations";

/** Send a text message. Rendered as text by clients; never as HTML. */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const conversationId = getRouterParam(event, "id")!;

  const access = await requireConversationAccess(supabase, conversationId, registration.id);
  if (access !== "write") {
    throw createError({ statusCode: 403, message: "This conversation is read-only" });
  }

  const body = (await readBody<{ body?: unknown }>(event)) ?? {};
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > MESSAGE_MAX_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `Messages must be 1–${MESSAGE_MAX_LENGTH} characters`,
    });
  }

  // Counted and inserted in one transaction under a per-author lock.
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation: conversationId,
    p_author: registration.id,
    p_body: text,
    p_per_minute: SEND_LIMIT_PER_MINUTE,
    p_per_day: SEND_LIMIT_PER_DAY,
  });

  if (error) {
    if (error.message?.includes("send_rate_limited")) {
      throw createError({ statusCode: 429, message: "You're sending messages too quickly" });
    }
    console.error("[conversations/messages.post] send failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to send" });
  }

  // Your own message is read by definition.
  await supabase.from("conversation_reads").upsert({
    conversation_id: conversationId,
    registration_id: registration.id,
    last_read_message_id: data.id,
    updated_at: new Date().toISOString(),
  });

  return { id: data.id, created_at: data.created_at };
});
