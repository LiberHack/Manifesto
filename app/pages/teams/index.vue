<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const skillsFilter = ref('')
const { data: teams, refresh } = await useFetch('/api/teams', {
  query: computed(() => skillsFilter.value ? { skills: skillsFilter.value } : {}),
})
</script>

<template>
  <main class="max-w-4xl mx-auto p-6 space-y-8">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-4xl font-black uppercase">Teams</h1>
      <div class="flex gap-2">
        <NuxtLink to="/team/create" class="btn btn-primary font-black uppercase">+ Form Team</NuxtLink>
        <NuxtLink to="/dashboard" class="btn btn-outline font-black uppercase">> Dashboard</NuxtLink>
      </div>
    </div>

    <div class="flex gap-2">
      <input v-model="skillsFilter" type="text" placeholder="Filter by skill (e.g. TypeScript)"
        class="input input-bordered flex-1" @keyup.enter="refresh()" />
      <button class="btn btn-outline" @click="refresh()">Filter</button>
    </div>

    <div v-if="!teams?.length" class="text-center opacity-50 py-12 text-xl font-bold uppercase">
      No open teams yet.
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <NuxtLink v-for="team in (teams as any[])" :key="team.id" :to="`/teams/${team.id}`"
        class="card bg-base-200 border border-base-content/20 hover:border-primary transition-colors">
        <div class="card-body">
          <h2 class="card-title font-black">{{ team.name }}</h2>
          <p v-if="team.description" class="text-sm opacity-70">{{ team.description }}</p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span v-for="skill in team.skills_wanted" :key="skill" class="badge badge-outline text-xs">{{ skill
              }}</span>
          </div>
          <p class="text-xs opacity-50 mt-2">{{ team.members.length }}/6 members</p>
        </div>
      </NuxtLink>
    </div>
  </main>
</template>
