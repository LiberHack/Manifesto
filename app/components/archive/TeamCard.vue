<!-- app/components/archive/TeamCard.vue -->
<script setup lang="ts">
import type { ArchiveTeam } from '../../../server/utils/archive-types'

defineProps<{
  team: ArchiveTeam
  presentationOrder?: number | null
}>()
</script>

<template>
  <article class="card bg-base-200 border border-base-300">
    <div class="card-body gap-2">
      <header class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-black text-lg uppercase tracking-tight">{{ team.name }}</h3>
          <p v-if="team.description" class="text-sm text-base-content/70">{{ team.description }}</p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span v-if="team.placement" class="badge badge-primary font-bold">#{{ team.placement }}</span>
          <span v-if="presentationOrder" class="badge badge-ghost text-xs">Slot {{ presentationOrder }}</span>
        </div>
      </header>

      <div v-if="team.awards.length" class="flex flex-wrap gap-1">
        <span v-for="award in team.awards" :key="award" class="badge badge-secondary text-xs">{{ award }}</span>
      </div>

      <a v-if="team.github_url" :href="team.github_url" target="_blank" rel="noopener"
         class="link link-accent text-sm font-mono truncate">
        {{ team.github_url }}
      </a>

      <ul v-if="team.members.length" class="space-y-0.5 mt-1">
        <li v-for="m in team.members" :key="m.token" class="text-sm">
          <span class="font-medium">{{ m.name }}</span>
          <span v-if="m.skills.length" class="text-base-content/50 text-xs"> · {{ m.skills.join(', ') }}</span>
        </li>
      </ul>
    </div>
  </article>
</template>
