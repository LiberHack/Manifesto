<script setup lang="ts">
import type { PublicProfile } from "#shared/teamFormation";

interface Proposal {
  id: string;
  name: string;
  note: string | null;
  my_response: "pending" | "accepted" | "declined";
  members: Array<{ response: string; profile: PublicProfile }>;
}

const emit = defineEmits<{ changed: [] }>();
const { data: proposals, refresh } = await useFetch<Proposal[]>("/api/me/proposals", { default: () => [] });

const busy = ref<string | null>(null);
const error = ref("");

async function respond(id: string, accept: boolean) {
  busy.value = id;
  error.value = "";
  try {
    await $fetch(`/api/proposals/${id}`, { method: "PATCH", body: { accept } });
    emit("changed");
  } catch (e: any) {
    error.value = e.data?.message ?? "Something went wrong";
  }
  await refresh();
  busy.value = null;
}
</script>

<template>
  <section v-if="proposals.length" id="proposals" class="flex flex-col gap-3">
    <h2 class="text-xl font-bold">Team suggested by the organizers</h2>
    <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>
    <div v-for="p in proposals" :key="p.id" class="p-4 border-2 border-primary flex flex-col gap-3">
      <p class="font-black text-lg">{{ p.name }}</p>
      <p v-if="p.note" class="text-sm whitespace-pre-line">{{ p.note }}</p>
      <p class="text-xs opacity-70">
        The team forms only when everyone accepts. Nobody is placed without agreeing.
      </p>
      <ul class="flex flex-col gap-3">
        <li v-for="m in p.members" :key="m.profile.registration_id" class="flex flex-col gap-1">
          <ProfileCard :profile="m.profile" />
          <span class="text-xs opacity-60">{{ m.response }}</span>
        </li>
      </ul>
      <div v-if="p.my_response === 'pending'" class="flex gap-2">
        <button class="btn btn-success btn-sm font-black" :disabled="busy === p.id" @click="respond(p.id, true)">Accept</button>
        <button class="btn btn-ghost btn-sm" :disabled="busy === p.id" @click="respond(p.id, false)">Decline</button>
      </div>
      <p v-else class="text-sm">You {{ p.my_response }}. Waiting for the others.</p>
    </div>
  </section>
</template>
