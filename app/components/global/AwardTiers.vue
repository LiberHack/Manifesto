<script setup lang="ts">
interface Tier {
  /** Emoji shown before the tier, e.g. "🥇". */
  medal: string;
  label: string;
}

defineProps<{ items: Tier[] }>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="tier in items"
      :key="tier.label"
      class="flex flex-row gap-3 items-center border-primary border-2 p-3"
    >
      <span class="text-2xl font-bold">{{ tier.medal }}</span>
      <span>{{ tier.label }}</span>
    </div>
  </div>
</template>
