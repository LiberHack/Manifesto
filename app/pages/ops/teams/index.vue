<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

const { data: teams } = await useFetch<any[]>("/api/teams");

const nameFilter = ref("");
const selectedSkills = ref<string[]>([]);

const allSkills = computed(() => {
  const set = new Set<string>();
  for (const team of teams.value ?? []) {
    for (const skill of team.skills_wanted ?? []) set.add(skill);
  }
  return [...set].sort();
});

function toggleSkill(skill: string) {
  const idx = selectedSkills.value.indexOf(skill);
  if (idx === -1) selectedSkills.value.push(skill);
  else selectedSkills.value.splice(idx, 1);
}

const filteredTeams = computed(() => {
  let result = teams.value ?? [];
  const q = nameFilter.value.trim().toLowerCase();
  if (q) result = result.filter((t) => t.name.toLowerCase().includes(q));
  if (selectedSkills.value.length)
    result = result.filter((t) =>
      selectedSkills.value.some((s) => t.skills_wanted?.includes(s)),
    );
  return result;
});
</script>

<template>
  <main
    class="max-w-4xl mx-auto p-6 space-y-8 bg-base-100 my-8 border-primary border-2"
  >
    <PendingRequestsBanner />

    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-4xl font-black uppercase">Teams</h1>
      <div class="flex flex-col md:flex-row gap-2">
        <NuxtLink
          to="/ops/team/create"
          class="btn btn-primary font-black uppercase"
          >+ Form Team</NuxtLink
        >
        <NuxtLink
          to="/ops/dashboard"
          class="btn btn-outline font-black uppercase"
          >> Dashboard</NuxtLink
        >
      </div>
    </div>

    <div class="space-y-3">
      <input
        v-model="nameFilter"
        type="text"
        placeholder="Search by team name…"
        class="input input-bordered w-full"
      />

      <div v-if="allSkills.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="skill in allSkills"
          :key="skill"
          class="badge badge-outline cursor-pointer select-none transition-colors"
          :class="
            selectedSkills.includes(skill)
              ? 'badge-primary'
              : 'opacity-60 hover:opacity-100'
          "
          @click="toggleSkill(skill)"
        >
          {{ skill }}
        </button>
      </div>
    </div>

    <div
      v-if="!filteredTeams.length"
      class="text-center opacity-50 py-12 text-xl font-bold uppercase"
    >
      No open teams yet.
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <NuxtLink
        v-for="team in filteredTeams"
        :key="team.id"
        :to="`/ops/teams/${team.id}`"
        class="card bg-base-200 border border-base-content/20 hover:border-primary transition-colors"
      >
        <div class="card-body">
          <h2 class="card-title font-black">{{ team.name }}</h2>
          <p v-if="team.description" class="text-sm opacity-70">
            {{ team.description }}
          </p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="skill in team.skills_wanted"
              :key="skill"
              class="badge badge-outline text-xs"
              :class="selectedSkills.includes(skill) ? 'badge-primary' : ''"
            >
              {{ skill }}
            </span>
          </div>
          <p class="text-xs opacity-50 mt-2">
            {{ team.members.length }}/6 members
          </p>
        </div>
      </NuxtLink>
    </div>
  </main>
</template>
