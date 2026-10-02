<script setup lang="ts">
import { CONTRIBUTION_ROLE_LABELS, type ContributionRole } from "#shared/teamFormation";

interface Suggestion {
  team: {
    id: string;
    name: string;
    description: string | null;
    wanted_roles: ContributionRole[];
    welcomes_beginners: boolean;
    vacancies: number;
  };
  reasons: string[];
  evidence: "none" | "weak" | "some";
}

const props = defineProps<{ helpRequestedAt: string | null }>();
const emit = defineEmits<{ changed: [] }>();

const { data, refresh } = await useFetch<{ suggestions: Suggestion[] }>("/api/recommendations/teams", {
  default: () => ({ suggestions: [] }),
});

async function dismiss(teamId: string) {
  await $fetch("/api/recommendations/dismiss", { method: "POST", body: { team_id: teamId } });
  await refresh();
}

const helpBusy = ref(false);
async function toggleHelp() {
  helpBusy.value = true;
  await $fetch("/api/me/help", { method: "POST", body: { requested: !props.helpRequestedAt } });
  emit("changed");
  helpBusy.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm opacity-70">
      Suggestions based on the roles, interests and goals you and each team shared.
      A suggestion doesn't hold a place — apply like any other team.
    </p>

    <p v-if="!data.suggestions.length" class="text-sm opacity-60">
      No suggestions right now. Filling in your roles and interests helps, or browse all teams.
    </p>

    <div v-for="s in data.suggestions" :key="s.team.id" class="p-4 border border-base-content/20 flex flex-col gap-2">
      <div class="flex items-start justify-between gap-2">
        <NuxtLink :to="`/ops/teams/${s.team.id}?recommended=1`" class="link font-bold">{{ s.team.name }}</NuxtLink>
        <button class="btn btn-ghost btn-xs" :aria-label="`Hide ${s.team.name} from suggestions`" @click="dismiss(s.team.id)">
          Not for me
        </button>
      </div>
      <p v-if="s.team.description" class="text-sm opacity-70">{{ s.team.description }}</p>
      <ul v-if="s.reasons.length" class="text-xs list-disc pl-4">
        <li v-for="r in s.reasons" :key="r">{{ r }}</li>
      </ul>
      <p v-else class="text-xs opacity-60">Not enough profile information on either side to compare yet.</p>
      <div class="flex flex-wrap gap-1">
        <span v-for="role in s.team.wanted_roles" :key="role" class="badge badge-xs badge-outline">
          {{ CONTRIBUTION_ROLE_LABELS[role] }}
        </span>
        <span class="badge badge-xs badge-success">{{ s.team.vacancies }} open</span>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <NuxtLink to="/ops/teams" class="btn btn-outline btn-sm font-black uppercase">Browse all teams</NuxtLink>
      <button class="btn btn-ghost btn-sm" :disabled="helpBusy" @click="toggleHelp">
        {{ helpRequestedAt ? "Cancel my request for organizer help" : "Ask the organizers to help me find a team" }}
      </button>
    </div>
    <p v-if="helpRequestedAt" class="text-xs text-success">
      The organizers know you'd like help and will be in touch.
    </p>
  </div>
</template>
