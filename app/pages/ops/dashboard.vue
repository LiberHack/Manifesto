<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const router = useRouter()
const { data: me } = await useFetch<any>('/api/me')

async function logout() {
  await supabase.auth.signOut()
  router.push('/ops/login')
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-8">
    <div class="flex items-center justify-between flex-wrap">
      <h1 class="text-4xl font-black uppercase">Dashboard</h1>
      <div class="flex gap-2 items-center">
        <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase">> Teams</NuxtLink>
        <button class="btn btn-ghost btn-sm" @click="logout">Logout</button>
      </div>
    </div>

    <section v-if="me">
      <h2 class="text-xl font-bold mb-2">Profile</h2>
      <p><strong>Name:</strong> {{ me.name }}</p>
      <p><strong>Email:</strong> {{ me.email }}</p>
      <div class="flex flex-wrap gap-1 mt-2">
        <span v-for="skill in me.skills" :key="skill" class="badge badge-outline">{{ skill }}</span>
      </div>
    </section>

    <section v-if="me?.team">
      <h2 class="text-xl font-bold mb-2">Your Team</h2>
      <NuxtLink :to="`/ops/teams/${me.team.id}`" class="link font-bold text-lg">{{ me.team.name }}</NuxtLink>
      <div class="mt-3">
        <NuxtLink to="/ops/team/manage" class="btn btn-sm btn-outline">Manage Join Requests</NuxtLink>
      </div>
    </section>

    <section v-else-if="me">
      <h2 class="text-xl font-bold mb-2">No Team Yet</h2>
      <div class="flex gap-3">
        <NuxtLink to="/ops/teams" class="btn btn-primary btn-sm font-black uppercase">Browse Teams</NuxtLink>
        <NuxtLink to="/ops/team/create" class="btn btn-outline btn-sm font-black uppercase">Form a Team</NuxtLink>
      </div>
    </section>

    <section v-if="me?.role === 'admin'">
      <NuxtLink to="/ops/admin" class="btn btn-warning btn-sm font-black uppercase">Admin Panel</NuxtLink>
    </section>
  </main>
</template>
