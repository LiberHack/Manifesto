<script setup lang="ts">
interface Criterion {
  title: string;
  /** Weight shown in the badge, e.g. "30%". */
  weight: string;
  body: string;
}

defineProps<{ items: Criterion[] }>();
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div
      v-for="(criterion, index) in items"
      :key="criterion.title"
      class="border-primary border-2 p-4 flex flex-col gap-2"
    >
      <div class="flex flex-row justify-between items-center gap-2">
        <h3 class="font-bold text-lg">{{ criterion.title }}</h3>
        <span
          class="badge shrink-0"
          :class="index < 2 ? 'badge-primary' : 'badge-secondary'"
          >{{ criterion.weight }}</span
        >
      </div>
      <p class="text-sm opacity-80">{{ criterion.body }}</p>
    </div>
  </div>
</template>
