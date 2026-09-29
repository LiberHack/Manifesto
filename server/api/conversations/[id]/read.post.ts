import { requireRegistration } from "#server/utils/requireRegistration";
import { requireConversationAccess } from "#server/utils/conversations";

/** Move the caller's read position forward (never back). */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const conversationId = getRouterParam(event, "id")!;
  await requireConversationAccess(supabase, conversationId, registration.id);

  const body = (await readBody<{ message_id?: unknown }>(event)) ?? {};
  const messageId = Number(body.message_id);
  if (!Number.isInteger(messageId) || messageId < 0) {
    throw createError({ statusCode: 400, message: "message_id is required" });
  }

  const { data: current } = await supabase
    .from("conversation_reads")
    .select("last_read_message_id")
    .eq("conversation_id", conversationId)
    .eq("registration_id", registration.id)
    .maybeSingle();

  const next = Math.max(messageId, Number(current?.last_read_message_id ?? 0));
  await supabase.from("conversation_reads").upsert({
    conversation_id: conversationId,
    registration_id: registration.id,
    last_read_message_id: next,
    updated_at: new Date().toISOString(),
  });

  return { last_read_message_id: next };
});
