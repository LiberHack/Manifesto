<!-- app/components/archive/PrivacyBanner.vue -->
<script setup lang="ts">
const config = useRuntimeConfig()
const isDormant = computed(() => config.public.siteMode === 'dormant')
</script>

<template>
  <aside v-if="isDormant" class="alert alert-info border border-info/40 text-sm">
    <span>
      This is an archived edition. To request removal of your data, email
      <a href="mailto:privacy@liberhack.org" class="link font-mono">privacy@liberhack.org</a>.
    </span>
  </aside>
</template>
