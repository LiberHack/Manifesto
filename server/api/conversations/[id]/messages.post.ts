import { requireRegistration } from "#server/utils/requireRegistration";
import {
  MESSAGE_MAX_LENGTH,
  enforceSendLimits,
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

  await enforceSendLimits(supabase, registration.id);

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({ conversation_id: conversationId, author_id: registration.id, body: text })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[conversations/messages.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to send" });
  }

  // Your own message is read by definition.
  await supabase.from("conversation_reads").upsert({
    conversation_id: conversationId,
    registration_id: registration.id,
    last_read_message_id: data.id,
    updated_at: new Date().toISOString(),
  });

  return data;
});
