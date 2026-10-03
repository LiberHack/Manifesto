<script setup lang="ts">
defineProps<{ editionQuery: { edition?: string }; readOnly: boolean }>();
</script>

<template>
  <section class="flex flex-col gap-6">
    <h2 class="text-2xl font-bold">Sources</h2>
    <AdminSourceLinks :edition-query="editionQuery" :read-only="readOnly" />
    <AdminSourceReport :edition-query="editionQuery" />
  </section>
</template>
