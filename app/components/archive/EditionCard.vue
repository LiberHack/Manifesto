<!-- app/components/archive/EditionCard.vue -->
<script setup lang="ts">
import type { ArchiveIndexEntry } from '../../../server/utils/archive-types'

defineProps<{
  edition: ArchiveIndexEntry
}>()
</script>

<template>
  <article class="card bg-base-200 border border-base-300 hover:border-primary transition-colors">
    <div class="card-body gap-1">
      <h2 class="card-title text-xl font-black uppercase tracking-tight">{{ edition.name }}</h2>
      <p v-if="edition.starts_at" class="text-sm text-base-content/60 font-mono">
        {{ new Date(edition.starts_at).toLocaleDateString('en-GB', { timeZone: 'UTC' }) }}
        <template v-if="edition.ends_at">
          – {{ new Date(edition.ends_at).toLocaleDateString('en-GB', { timeZone: 'UTC' }) }}
        </template>
      </p>
      <div class="flex gap-4 mt-1 text-sm">
        <span>{{ edition.team_count }} teams</span>
        <span>{{ edition.participant_count }} participants</span>
      </div>
      <ul v-if="edition.winners.length" class="mt-2 space-y-0.5">
        <li v-for="w in edition.winners.slice(0, 3)" :key="w.team_name" class="text-sm">
          <span class="font-bold">#{{ w.placement }}</span> {{ w.team_name }}
          <span v-if="w.awards.length" class="text-base-content/50 text-xs"> · {{ w.awards.join(', ') }}</span>
        </li>
      </ul>
      <div class="card-actions justify-end mt-2">
        <NuxtLink :to="`/archive/${edition.slug}`" class="btn btn-sm btn-primary">View</NuxtLink>
      </div>
    </div>
  </article>
</template>
