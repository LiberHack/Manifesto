<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

interface Message {
  id: number;
  author: { registration_id: string; participant_id: string | null; name: string };
  mine: boolean;
  body: string | null;
  hidden: boolean;
  created_at: string;
}

interface Page {
  access: "read" | "write";
  kind: "team" | "request";
  team_name: string;
  last_read_message_id: number;
  has_more: boolean;
  messages: Message[];
}

const MAX_LENGTH = 2000;
const POLL_MS = 10_000;

const route = useRoute();
const id = computed(() => route.params.id as string);
const { refresh: refreshConversations } = await useConversations();

const { data: page, error: loadError } = await useFetch<Page>(
  () => `/api/conversations/${id.value}/messages`,
);

const messages = ref<Message[]>(page.value?.messages ?? []);
const hasMore = ref(page.value?.has_more ?? false);
const access = computed(() => page.value?.access ?? "read");

function merge(incoming: Message[]) {
  const byId = new Map(messages.value.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  messages.value = [...byId.values()].sort((a, b) => a.id - b.id);
}

async function markRead() {
  const last = messages.value.at(-1);
  if (!last) return;
  await $fetch(`/api/conversations/${id.value}/read`, {
    method: "POST",
    body: { message_id: last.id },
  }).catch(() => {});
  await refreshConversations();
}

// Polling rather than a realtime channel: the server re-checks access on every
// call, so someone who leaves the team stops receiving messages at once.
async function poll() {
  try {
    const latest = await $fetch<Page>(`/api/conversations/${id.value}/messages`);
    const before = messages.value.at(-1)?.id ?? 0;
    merge(latest.messages);
    if ((messages.value.at(-1)?.id ?? 0) > before) await markRead();
  } catch {
    // Lost access (e.g. left the team): stop and show the error state.
    stopPolling();
    loadError.value = createError({ statusCode: 404, message: "Conversation not available" });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}
onMounted(() => {
  markRead();
  timer = setInterval(poll, POLL_MS);
});
onUnmounted(stopPolling);

const loadingOlder = ref(false);
async function loadOlder() {
  const oldest = messages.value[0]?.id;
  if (!oldest) return;
  loadingOlder.value = true;
  try {
    const older = await $fetch<Page>(`/api/conversations/${id.value}/messages`, {
      query: { before: oldest },
    });
    merge(older.messages);
    hasMore.value = older.has_more;
  } finally {
    loadingOlder.value = false;
  }
}

const draft = ref("");
const sending = ref(false);
const sendError = ref("");
const draftValid = computed(() => {
  const n = draft.value.trim().length;
  return n > 0 && n <= MAX_LENGTH;
});

async function send() {
  if (!draftValid.value) return;
  sending.value = true;
  sendError.value = "";
  try {
    await $fetch(`/api/conversations/${id.value}/messages`, {
      method: "POST",
      body: { body: draft.value },
    });
    draft.value = "";
    await poll();
  } catch (e: any) {
    sendError.value = e.data?.message ?? "Could not send";
  }
  sending.value = false;
}

// ── Report / block ────────────────────────────────────────────────────────────
const reporting = ref<number | "conversation" | null>(null);
const reportReason = ref("");
const notice = ref("");

async function submitReport() {
  try {
    await $fetch(`/api/conversations/${id.value}/reports`, {
      method: "POST",
      body: {
        reason: reportReason.value,
        message_id: reporting.value === "conversation" ? null : reporting.value,
      },
    });
    notice.value = "Thanks — the organizers will look at this.";
    reporting.value = null;
    reportReason.value = "";
  } catch (e: any) {
    notice.value = e.data?.message ?? "Could not send the report";
  }
}

async function block(m: Message) {
  if (!m.author.participant_id) return;
  if (!confirm(`Block ${m.author.name}? They won't be able to apply to, invite, or message you about teams.`)) return;
  try {
    await $fetch(`/api/conversations/${id.value}/block`, {
      method: "POST",
      body: { participant_id: m.author.participant_id },
    });
    notice.value = `${m.author.name} is blocked. You can undo this from your dashboard.`;
  } catch (e: any) {
    notice.value = e.data?.message ?? "Could not block";
  }
}

function time(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-4 md:p-6 my-8 flex flex-col gap-4 bg-base-100 border-2 border-primary">
    <NuxtLink to="/ops/messages" class="btn btn-ghost btn-sm self-start">← Messages</NuxtLink>

    <p v-if="loadError" role="alert" class="alert alert-warning">
      This conversation isn't available to you.
    </p>

    <template v-else-if="page">
      <h1 class="text-xl md:text-3xl font-black uppercase">
        {{ page.team_name }}<span class="opacity-60"> — {{ page.kind === "team" ? "team chat" : "request" }}</span>
      </h1>

      <p v-if="page.kind === 'team'" class="text-xs opacity-70">
        Everyone who joins the team can read the whole history here. Leaving the team
        removes your access.
      </p>
      <p v-if="access === 'read'" class="alert alert-info text-sm">
        This conversation is read-only.
      </p>
      <p v-if="notice" role="status" class="alert text-sm">{{ notice }}</p>

      <button v-if="hasMore" class="btn btn-ghost btn-xs self-center" :disabled="loadingOlder" @click="loadOlder">
        {{ loadingOlder ? "Loading…" : "Load earlier messages" }}
      </button>

      <ol class="flex flex-col gap-3" aria-live="polite">
        <li
          v-for="m in messages"
          :key="m.id"
          class="flex flex-col max-w-[85%]"
          :class="m.mine ? 'self-end items-end' : 'self-start items-start'"
        >
          <span class="text-xs opacity-60">{{ m.mine ? "You" : m.author.name }} · {{ time(m.created_at) }}</span>
          <div class="px-3 py-2 border" :class="m.mine ? 'border-primary' : 'border-base-content/30'">
            <em v-if="m.hidden" class="opacity-60">Removed by the organizers.</em>
            <MessageText v-else :text="m.body ?? ''" />
          </div>
          <span v-if="!m.mine && !m.hidden" class="flex gap-2 text-xs">
            <button class="link opacity-60" @click="reporting = m.id">Report</button>
            <button v-if="page.kind === 'request'" class="link opacity-60" @click="block(m)">Block</button>
          </span>
        </li>
      </ol>

      <form v-if="reporting !== null" class="flex flex-col gap-2 border border-warning p-3" @submit.prevent="submitReport">
        <label class="form-control">
          <span class="label-text font-bold">What's wrong?</span>
          <textarea v-model="reportReason" rows="2" maxlength="1000" class="textarea textarea-bordered w-full" />
        </label>
        <div class="flex gap-2">
          <button type="submit" class="btn btn-warning btn-sm" :disabled="reportReason.trim().length < 5">Send report</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="reporting = null">Cancel</button>
        </div>
      </form>

      <form v-if="access === 'write'" class="flex flex-col gap-2" @submit.prevent="send">
        <label class="sr-only" for="message-draft">Message</label>
        <textarea
          id="message-draft"
          v-model="draft"
          rows="3"
          :maxlength="MAX_LENGTH"
          class="textarea textarea-bordered w-full"
          placeholder="Write a message…"
          @keydown.enter.exact.prevent="send"
        />
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="link text-xs opacity-60" @click="reporting = 'conversation'">
            Report this conversation
          </button>
          <button type="submit" class="btn btn-primary btn-sm font-black" :disabled="sending || !draftValid">
            {{ sending ? "Sending…" : "Send" }}
          </button>
        </div>
        <p v-if="sendError" class="text-error text-sm">{{ sendError }}</p>
      </form>
    </template>
  </main>
</template>
