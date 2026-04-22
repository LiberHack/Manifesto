<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const { data: me } = await useFetch<any>('/api/me')
const teamId = computed(() => me.value?.team?.id)

const { data: requests, refresh } = await useFetch<any[]>(
  () => (teamId.value ? `/api/teams/${teamId.value}/requests` : null) as string
)

async function respond(requestId: string, status: 'approved' | 'rejected') {
  await $fetch(`/api/requests/${requestId}`, { method: 'PATCH', body: { status } })
  await refresh()
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-8">
    <div v-if="!requests?.length" class="opacity-50">No pending requests.</div>

    <ul class="space-y-3">
      <li v-for="req in requests" :key="req.id"
        class="flex items-center justify-between gap-4 p-4 border border-base-content/20 rounded">
        <div>
          <p class="font-bold">{{ req.participant.name }}</p>
          <div class="flex gap-1 flex-wrap mt-1">
            <span v-for="skill in req.participant.skills" :key="skill" class="badge badge-xs badge-outline">{{ skill
            }}</span>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn btn-success btn-sm font-black" @click="respond(req.id, 'approved')">Accept</button>
          <button class="btn btn-error btn-sm font-black" @click="respond(req.id, 'rejected')">Reject</button>
        </div>
      </li>
    </ul>
  </main>
</template>
