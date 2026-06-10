<!-- app/pages/archive/index.vue -->
<script setup lang="ts">
const { listEditions } = useArchive()
const { data: index, status, error } = await listEditions()
</script>

<template>
  <main class="container mx-auto px-4 py-8 max-w-4xl">
    <h1 class="text-4xl font-black uppercase tracking-tighter mb-2">Archive</h1>
    <p class="text-base-content/60 mb-8">Every past edition of LiberHack.</p>

    <ArchivePrivacyBanner />

    <div v-if="status === 'pending'" class="text-center py-16 text-base-content/40">Loading…</div>
    <div v-else-if="error" class="alert alert-error">Failed to load archive.</div>
    <div v-else-if="!index?.editions.length" class="text-center py-16 text-base-content/40">
      No archived editions yet.
    </div>
    <ul v-else class="grid gap-4 sm:grid-cols-2">
      <li v-for="edition in index.editions" :key="edition.slug">
        <ArchiveEditionCard :edition="edition" />
      </li>
    </ul>
  </main>
</template>
