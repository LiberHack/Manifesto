export interface ConversationSummary {
  id: string;
  kind: "team" | "request";
  access: "read" | "write";
  unread: number;
  last_message_at: string | null;
  team: { id: string; name: string };
  title: string;
  request: { kind: "application" | "invitation"; status: string } | null;
}

/** The caller's conversations, shared by the dashboard badge and the inbox. */
export async function useConversations() {
  const request = useRequestFetch();
  const result = await useAsyncData<ConversationSummary[]>(
    "conversations",
    () => request("/api/me/conversations") as Promise<ConversationSummary[]>,
    { default: () => [] },
  );
  const unreadTotal = computed(() =>
    result.data.value.reduce((sum, c) => sum + c.unread, 0),
  );
  return { ...result, unreadTotal };
}
