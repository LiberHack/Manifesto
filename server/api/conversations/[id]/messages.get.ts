import { requireRegistration } from "#server/utils/requireRegistration";
import {
  PAGE_SIZE,
  namesByRegistration,
  requireConversationAccess,
} from "#server/utils/conversations";

/**
 * A page of messages, oldest first, ending before `?before=<message id>`
 * (or at the newest). Messages hidden by organizers keep their place but not
 * their text.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const conversationId = getRouterParam(event, "id")!;
  const access = await requireConversationAccess(supabase, conversationId, registration.id);

  const before = Number(getQuery(event).before);

  let query = supabase
    .from("conversation_messages")
    .select("id, author_id, body, created_at, hidden_at")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (Number.isInteger(before) && before > 0) query = query.lt("id", before);

  const [{ data, error }, { data: conversation }, { data: read }] = await Promise.all([
    query,
    supabase.from("conversations").select("kind, team:teams(name)").eq("id", conversationId).single(),
    supabase
      .from("conversation_reads")
      .select("last_read_message_id")
      .eq("conversation_id", conversationId)
      .eq("registration_id", registration.id)
      .maybeSingle(),
  ]);

  if (error) {
    console.error("[conversations/messages.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = data ?? [];
  const page = rows.slice(0, PAGE_SIZE);
  const names = await namesByRegistration(supabase, page.map((m) => m.author_id as string));

  return {
    access,
    kind: conversation?.kind,
    team_name: (conversation?.team as unknown as { name: string } | null)?.name ?? "",
    last_read_message_id: read?.last_read_message_id ?? 0,
    has_more: rows.length > PAGE_SIZE,
    messages: page.reverse().map((m) => ({
      id: m.id,
      author: {
        registration_id: m.author_id,
        participant_id: names.get(m.author_id as string)?.participant_id ?? null,
        name: names.get(m.author_id as string)?.name ?? "",
      },
      mine: m.author_id === registration.id,
      body: m.hidden_at ? null : m.body,
      hidden: m.hidden_at !== null,
      created_at: m.created_at,
    })),
  };
});
