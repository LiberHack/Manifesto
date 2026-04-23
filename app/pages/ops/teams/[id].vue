<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

const route = useRoute();
const { data: team } = await useFetch<any>(`/api/teams/${route.params.id}`);
const { data: me } = await useFetch<any>("/api/me");

const sending = ref(false);
const message = ref("");

const isMember = computed(() =>
  team.value?.members?.some((m: { id: string }) => m.id === me.value?.id),
);
const alreadyInTeam = computed(() => !!me.value?.team_id);

async function sendRequest() {
  sending.value = true;
  message.value = "";
  try {
    await $fetch(`/api/teams/${route.params.id}/requests`, { method: "POST" });
    message.value = "Request sent!";
  } catch (e: any) {
    message.value = e.data?.message ?? "Something went wrong";
  }
  sending.value = false;
}
</script>

<template>
  <main
    class="max-w-2xl mx-auto p-6 space-y-6 bg-base-100 border-2 border-primary my-8"
  >
    <NuxtLink to="/ops/teams" class="btn btn-ghost btn-sm">← Back</NuxtLink>

    <template v-if="team">
      <h1 class="text-4xl font-black uppercase">{{ team.name }}</h1>
      <p v-if="team.description" class="opacity-70">{{ team.description }}</p>

      <div class="flex flex-wrap gap-2">
        <span
          v-for="skill in team.skills_wanted"
          :key="skill"
          class="badge badge-primary badge-outline"
          >{{ skill }}</span
        >
      </div>

      <h2 class="text-xl font-bold mt-6 mb-3">
        Members ({{ team.members?.length ?? 0 }}/6)
      </h2>
      <ul class="space-y-2">
        <li
          v-for="member in team.members"
          :key="member.id"
          class="flex items-center gap-3"
        >
          <span class="font-medium">{{ member.name }}</span>
          <div class="flex gap-1 flex-wrap">
            <span
              v-for="skill in member.skills"
              :key="skill"
              class="badge badge-outline text-xs"
              >{{ skill }}</span
            >
          </div>
        </li>
      </ul>

      <div class="mt-8">
        <div
          v-if="message"
          class="alert mb-4"
          :class="message === 'Request sent!' ? 'alert-success' : 'alert-error'"
        >
          {{ message }}
        </div>

        <button
          v-if="!isMember && !alreadyInTeam"
          :disabled="sending"
          class="btn btn-primary font-black uppercase"
          @click="sendRequest"
        >
          {{ sending ? "Sending…" : "Request to Join" }}
        </button>

        <p v-else-if="isMember" class="font-bold text-success">
          You're a member of this team.
        </p>
        <p v-else class="opacity-60">You're already in a team.</p>
      </div>
    </template>
  </main>
</template>
