<!-- app/pages/archive/[slug].vue -->
<script setup lang="ts">
const route = useRoute()
const slug = computed(() => route.params.slug as string)

const { getEdition } = useArchive()
const { data: edition, status, error } = await getEdition(slug.value)

if (import.meta.server && error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, message: 'Edition not found' })
}

useSeoMeta({
  title: computed(() => edition.value ? `${edition.value.name} — LiberHack Archive` : 'Archive'),
})
</script>

<template>
  <main class="container mx-auto px-4 py-8 max-w-4xl">
    <NuxtLink to="/archive" class="link text-sm text-base-content/50 mb-4 block">← All editions</NuxtLink>

    <div v-if="status === 'pending'" class="text-center py-16 text-base-content/40">Loading…</div>
    <div v-else-if="error" class="alert alert-error">Failed to load edition.</div>

    <template v-else-if="edition">
      <header class="mb-6">
        <h1 class="text-4xl font-black uppercase tracking-tighter">{{ edition.name }}</h1>
        <p v-if="edition.starts_at" class="text-base-content/60 font-mono text-sm mt-1">
          <ClientOnly>
            {{ new Date(edition.starts_at).toLocaleDateString('en-GB') }}
            <template v-if="edition.ends_at">
              – {{ new Date(edition.ends_at).toLocaleDateString('en-GB') }}
            </template>
            <template #fallback>
              {{ edition.starts_at?.slice(0, 10) }}
              <template v-if="edition.ends_at"> – {{ edition.ends_at.slice(0, 10) }}</template>
            </template>
          </ClientOnly>
        </p>
        <div class="flex gap-4 text-sm mt-2">
          <span>{{ edition.team_count }} teams</span>
          <span>{{ edition.participant_count }} participants</span>
          <span v-if="edition.opted_out">+ {{ edition.opted_out }} opted out of public archive</span>
        </div>
      </header>

      <ArchivePrivacyBanner />

      <ul v-if="edition.teams.length" class="grid gap-4 mt-6 sm:grid-cols-2">
        <li v-for="team in edition.teams" :key="team.name">
          <ArchiveTeamCard :team="team" :presentation-order="team.presentation_order" />
        </li>
      </ul>
      <p v-else class="text-base-content/40 text-sm mt-4">No public teams in this edition.</p>
    </template>
  </main>
</template>
