<script setup>
const user = useSupabaseUser()

const { data: requestsCount } = await useFetch(
  () => user.value ? '/api/me/requests-count' : null,
  { key: `req-count-${user.value?.id}` }
)

const pendingCount = computed(() => requestsCount.value.count ?? 0)
const hasPending = computed(() => pendingCount.value > 0)
</script>

<template>
  <NuxtLink v-if="hasPending" to="/ops/dashboard"
    class="flex items-center justify-center gap-2 border-primary animate-snap-color text-sm font-bold py-2 px-4 border-b-2 hover:bg-primary">
    <span>⚠</span>
    <span>{{ pendingCount }} pending join request{{ pendingCount === 1 ? '' : 's' }} — review them</span>
    <span>→</span>
  </NuxtLink>
</template>
