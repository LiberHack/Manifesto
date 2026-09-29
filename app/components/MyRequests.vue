<script setup lang="ts">
import { CONTRIBUTION_ROLE_LABELS, type ContributionRole } from "#shared/teamFormation";

interface MyRequest {
  id: string;
  kind: "application" | "invitation";
  status: "pending" | "approved" | "rejected" | "withdrawn" | "expired";
  close_reason: string | null;
  message: string | null;
  created_at: string;
  expires_at: string | null;
  conversation: { id: string } | null;
  team: {
    id: string;
    name: string;
    description: string | null;
    wanted_roles: ContributionRole[];
    welcomes_beginners: boolean;
  } | null;
}

const emit = defineEmits<{ joined: [] }>();

const { data: requests, refresh } = await useFetch<MyRequest[]>("/api/me/requests", {
  default: () => [],
});

const invitations = computed(() =>
  requests.value.filter((r) => r.kind === "invitation" && r.status === "pending"),
);
const applications = computed(() =>
  requests.value.filter((r) => r.kind === "application" && r.status === "pending"),
);
const closed = computed(() => requests.value.filter((r) => r.status !== "pending"));

const busy = ref<string | null>(null);
const error = ref("");

async function act(id: string, action: "accept" | "decline" | "withdraw") {
  busy.value = id;
  error.value = "";
  try {
    await $fetch(`/api/requests/${id}`, { method: "PATCH", body: { action } });
    await refresh();
    if (action === "accept") emit("joined");
  } catch (e: any) {
    error.value = e.data?.message ?? "Something went wrong";
    await refresh();
  }
  busy.value = null;
}

const OUTCOME: Record<string, string> = {
  leader_rejected: "Not accepted by the team",
  invitee_declined: "You declined",
  withdrawn: "Withdrawn",
  joined_other_team: "Closed — you joined another team",
  expired: "Expired without an answer",
  team_full: "Closed — the team filled up",
  team_dissolved: "Closed — the team was dissolved",
  left_team: "Closed — you left your team",
};

function outcome(r: MyRequest): string {
  if (r.status === "approved") return r.kind === "invitation" ? "You accepted" : "Accepted";
  if (r.status === "expired") return "Expired without an answer";
  return OUTCOME[r.close_reason ?? ""] ?? "Closed";
}

function expiresIn(r: MyRequest): string | null {
  if (!r.expires_at) return null;
  return new Date(r.expires_at).toLocaleDateString();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

    <p v-if="!requests.length" class="text-sm opacity-60">No applications or invitations yet.</p>

    <div v-if="invitations.length" class="flex flex-col gap-3">
      <h3 class="font-bold">Invitations</h3>
      <div v-for="r in invitations" :key="r.id" class="p-4 border border-primary flex flex-col gap-2">
        <NuxtLink :to="`/ops/teams/${r.team?.id}`" class="link font-bold">{{ r.team?.name }}</NuxtLink>
        <div v-if="r.team?.wanted_roles.length" class="flex gap-1 flex-wrap">
          <span v-for="role in r.team.wanted_roles" :key="role" class="badge badge-xs badge-outline">
            {{ CONTRIBUTION_ROLE_LABELS[role] }}
          </span>
        </div>
        <blockquote class="text-sm whitespace-pre-line border-l-2 border-base-content/30 pl-3">{{ r.message }}</blockquote>
        <p v-if="expiresIn(r)" class="text-xs opacity-60">Open until {{ expiresIn(r) }}</p>
        <NuxtLink v-if="r.conversation" :to="`/ops/messages/${r.conversation.id}`" class="link text-sm">
          Ask the team a question →
        </NuxtLink>
        <div class="flex gap-2">
          <button class="btn btn-success btn-sm font-black" :disabled="busy === r.id" @click="act(r.id, 'accept')">
            Accept
          </button>
          <button class="btn btn-ghost btn-sm" :disabled="busy === r.id" @click="act(r.id, 'decline')">
            Decline
          </button>
        </div>
      </div>
    </div>

    <div v-if="applications.length" class="flex flex-col gap-3">
      <h3 class="font-bold">Your applications</h3>
      <div v-for="r in applications" :key="r.id" class="p-4 border border-base-content/20 flex flex-col gap-2">
        <NuxtLink :to="`/ops/teams/${r.team?.id}`" class="link font-bold">{{ r.team?.name }}</NuxtLink>
        <p class="text-xs opacity-60">
          Waiting for the leader<template v-if="expiresIn(r)"> · open until {{ expiresIn(r) }}</template>
        </p>
        <NuxtLink v-if="r.conversation" :to="`/ops/messages/${r.conversation.id}`" class="link text-sm">
          Conversation with the team →
        </NuxtLink>
        <button class="btn btn-ghost btn-xs self-start" :disabled="busy === r.id" @click="act(r.id, 'withdraw')">
          Withdraw
        </button>
      </div>
    </div>

    <details v-if="closed.length">
      <summary class="cursor-pointer text-sm font-bold">Past requests ({{ closed.length }})</summary>
      <ul class="mt-2 flex flex-col gap-1 text-sm">
        <li v-for="r in closed" :key="r.id">
          {{ r.kind === "invitation" ? "Invitation from" : "Application to" }}
          <strong>{{ r.team?.name ?? "a removed team" }}</strong> — {{ outcome(r) }}
        </li>
      </ul>
    </details>
  </div>
</template>
