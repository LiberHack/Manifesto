<script setup lang="ts">
// A bordered sub-block inside a reglament section, e.g. "Партньорски направления".
defineProps<{ title: string }>();
</script>

<template>
  <div class="flex flex-col gap-3 border-l-2 border-primary pl-4 mt-2">
    <h3 class="text-xl font-bold">{{ title }}</h3>
    <slot />
  </div>
</template>
