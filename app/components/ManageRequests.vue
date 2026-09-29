<script setup lang="ts">
import type { PublicProfile } from "#shared/teamFormation";

interface TeamRequest {
  id: string;
  kind: "application" | "invitation";
  message: string | null;
  created_at: string;
  expires_at: string | null;
  conversation: { id: string } | null;
  profile: PublicProfile | null;
}

const props = defineProps<{ teamId: string }>();
const emit = defineEmits<{ changed: [] }>();

const { data: requests, refresh } = await useFetch<TeamRequest[]>(
  () => `/api/teams/${props.teamId}/requests`,
  { default: () => [] },
);

const applications = computed(() => requests.value.filter((r) => r.kind === "application"));
const invitations = computed(() => requests.value.filter((r) => r.kind === "invitation"));

const busy = ref<string | null>(null);
const error = ref("");

async function act(id: string, action: "approve" | "reject" | "withdraw") {
  busy.value = id;
  error.value = "";
  try {
    await $fetch(`/api/requests/${id}`, { method: "PATCH", body: { action } });
    emit("changed");
  } catch (e: any) {
    error.value = e.data?.message ?? "Something went wrong";
  }
  await refresh();
  busy.value = null;
}

defineExpose({ refresh });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

    <p v-if="!applications.length" class="text-sm opacity-60">No pending applications.</p>

    <ul class="flex flex-col gap-3">
      <li
        v-for="req in applications"
        :key="req.id"
        class="p-4 border border-base-content/20 flex flex-col gap-3"
      >
        <ProfileCard v-if="req.profile" :profile="req.profile" />
        <blockquote
          v-if="req.message"
          class="text-sm whitespace-pre-line border-l-2 border-primary pl-3"
        >{{ req.message }}</blockquote>
        <NuxtLink v-if="req.conversation" :to="`/ops/messages/${req.conversation.id}`" class="link text-sm">
          Reply or ask a question →
        </NuxtLink>
        <div class="flex gap-2">
          <button class="btn btn-success btn-sm font-black" :disabled="busy === req.id" @click="act(req.id, 'approve')">
            Accept
          </button>
          <button class="btn btn-error btn-sm font-black" :disabled="busy === req.id" @click="act(req.id, 'reject')">
            Reject
          </button>
        </div>
      </li>
    </ul>

    <div v-if="invitations.length" class="flex flex-col gap-2">
      <h3 class="font-bold text-sm">Invitations awaiting an answer</h3>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="req in invitations" :key="req.id" class="flex items-center justify-between gap-2">
          <span>{{ req.profile?.name }}</span>
          <button class="btn btn-ghost btn-xs" :disabled="busy === req.id" @click="act(req.id, 'withdraw')">
            Withdraw
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
