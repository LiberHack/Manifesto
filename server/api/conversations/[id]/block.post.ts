import { requireRegistration } from "#server/utils/requireRegistration";
import { requireConversationAccess } from "#server/utils/conversations";

/**
 * Block someone you met in this conversation. Stops new applications,
 * invitations and request messages between you, in every edition. Conflicts
 * inside a team you share go to the organizers through a report instead.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const conversationId = getRouterParam(event, "id")!;
  await requireConversationAccess(supabase, conversationId, registration.id);

  const body = (await readBody<{ participant_id?: unknown }>(event)) ?? {};
  const target = body.participant_id;
  if (typeof target !== "string" || target === registration.participant_id) {
    throw createError({ statusCode: 400, message: "participant_id is required" });
  }

  // Only people who wrote in this conversation can be blocked from it.
  const { data: authored } = await supabase
    .from("conversation_messages")
    .select("author:registrations!inner(participant_id)")
    .eq("conversation_id", conversationId)
    .eq("author.participant_id", target)
    .limit(1);
  if (!authored?.length) throw createError({ statusCode: 404, message: "Person not found" });

  const { error } = await supabase
    .from("participant_blocks")
    .insert({ blocker_id: registration.participant_id, blocked_id: target });
  if (error && error.code !== "23505") {
    console.error("[conversations/block] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return { ok: true };
});
