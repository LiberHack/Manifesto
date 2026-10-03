<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

const { data: conversations, refresh } = await useConversations();

// Polling, not realtime: access is re-checked by the server on every call.
useVisiblePolling(refresh, 10_000);
</script>

<template>
  <main class="w-full max-w-2xl min-w-0 mx-auto p-4 sm:p-6 my-8 space-y-6 bg-base-100 border-2 border-primary">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-xl md:text-4xl font-black uppercase">Messages</h1>
      <NuxtLink to="/ops/dashboard" class="btn btn-outline btn-sm font-black uppercase">> Dashboard</NuxtLink>
    </div>

    <p v-if="!conversations.length" class="opacity-60">
      No conversations yet. Applying to a team or joining one starts a conversation.
    </p>

    <ul class="flex flex-col divide-y divide-base-content/10">
      <li v-for="c in conversations" :key="c.id">
        <NuxtLink :to="`/ops/messages/${c.id}`" class="flex items-center justify-between gap-3 min-w-0 py-3 hover:bg-base-200 px-2">
          <span class="flex flex-col min-w-0 break-words">
            <span class="font-bold">{{ c.title }}</span>
            <span class="text-xs opacity-60">
              <template v-if="c.kind === 'team'">Team chat</template>
              <template v-else>{{ c.request?.kind === "invitation" ? "Invitation" : "Application" }} · {{ c.request?.status }}</template>
              <template v-if="c.access === 'read'"> · read-only</template>
            </span>
          </span>
          <span v-if="c.unread" class="badge badge-primary" :aria-label="`${c.unread} unread`">{{ c.unread }}</span>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
