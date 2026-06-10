<script setup lang="ts">
const emit = defineEmits<{ 'go-live': [slug: string] }>()

const { data: drafts, refresh } = await useFetch<Array<{ slug: string; name: string; starts_at: string | null; ends_at: string | null }>>('/api/admin/editions/drafts')
</script>

<template>
  <div v-if="drafts?.length" class="card bg-base-200 border border-base-300">
    <div class="card-body">
      <h3 class="font-bold">Draft Editions</h3>
      <ul class="space-y-2">
        <li v-for="d in drafts" :key="d.slug" class="flex items-center justify-between">
          <span class="font-mono text-sm">{{ d.slug }} — {{ d.name }}</span>
          <button class="btn btn-xs btn-success" @click="emit('go-live', d.slug)">Go Live</button>
        </li>
      </ul>
    </div>
  </div>
</template>
