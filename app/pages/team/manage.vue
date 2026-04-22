<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const { data: me } = await useFetch<any>('/api/me')
const teamId = computed(() => me.value?.team?.id)

const { data: requests, refresh } = await useFetch<any[]>(
  computed(() => teamId.value ? `/api/teams/${teamId.value}/requests` : null)
)

async function respond(requestId: string, status: 'approved' | 'rejected') {
  await $fetch(`/api/requests/${requestId}`, { method: 'PATCH', body: { status } })
  await refresh()
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-8">
    <div class="flex items-center gap-4">
      <NuxtLink to="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
      <h1 class="text-4xl font-black uppercase">Manage Team</h1>
    </div>

    <div v-if="!teamId" class="text-center opacity-50 py-12">
      <p class="font-bold">You're not in a team.</p>
      <NuxtLink to="/teams" class="btn btn-primary mt-4">Browse Teams</NuxtLink>
    </div>

    <template v-else>
      <h2 class="text-xl font-bold">Pending Requests</h2>

      <div v-if="!requests?.length" class="opacity-50">No pending requests.</div>

      <ul class="space-y-3">
        <li
          v-for="req in requests"
          :key="req.id"
          class="flex items-center justify-between gap-4 p-4 border border-base-content/20 rounded"
        >
          <div>
            <p class="font-bold">{{ req.participant.name }}</p>
            <div class="flex gap-1 flex-wrap mt-1">
              <span
                v-for="skill in req.participant.skills"
                :key="skill"
                class="badge badge-xs badge-outline"
              >{{ skill }}</span>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="btn btn-success btn-sm font-black" @click="respond(req.id, 'approved')">Accept</button>
            <button class="btn btn-error btn-sm font-black" @click="respond(req.id, 'rejected')">Reject</button>
          </div>
        </li>
      </ul>
    </template>
  </main>
</template>
