import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Access = "read" | "write";

export const MESSAGE_MAX_LENGTH = 2000;
export const PAGE_SIZE = 30;
/** Per-person send limits across all conversations (enforced by send_message). */
export const SEND_LIMIT_PER_MINUTE = 10;
export const SEND_LIMIT_PER_DAY = 200;

/**
 * The caller's access to a conversation, from conversation_access() — the one
 * place the rules live. Throws 404 when there is none, so the existence of a
 * conversation someone cannot see is not revealed.
 */
export async function requireConversationAccess(
  supabase: SupabaseClient,
  conversationId: string,
  registrationId: string,
): Promise<Access> {
  const { data, error } = await supabase.rpc("conversation_access", {
    p_conversation: conversationId,
    p_registration: registrationId,
  });
  if (error) {
    // A malformed id is a miss, not a server error.
    if (error.code === "22P02") throw createError({ statusCode: 404, message: "Conversation not found" });
    console.error("[conversations] access check failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  if (data !== "read" && data !== "write") {
    throw createError({ statusCode: 404, message: "Conversation not found" });
  }
  return data;
}

/** Display names for registration ids, via the identity mirror. */
export async function namesByRegistration(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string; participant_id: string }>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("registrations")
    .select("id, participant_id, participant:participants(name)")
    .in("id", [...new Set(ids)]);
  return new Map(
    ((data ?? []) as unknown as Array<{
      id: string;
      participant_id: string;
      participant: { name: string } | null;
    }>).map((r) => [r.id, { name: r.participant?.name ?? "", participant_id: r.participant_id }]),
  );
}
