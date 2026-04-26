<script setup lang="ts">
definePageMeta({ middleware: ["admin"] });

const { data: participants, refresh: refreshParticipants } = await useFetch<
  any[]
>("/api/admin/participants");
const { data: teams, refresh: refreshTeams } =
  await useFetch<any[]>("/api/admin/teams");

async function deleteParticipant(id: string) {
  if (!confirm("Delete this participant? This cannot be undone.")) return;
  await $fetch(`/api/admin/participants/${id}`, { method: "DELETE" });
  await refreshParticipants();
}

async function deleteTeam(id: string) {
  if (!confirm("Delete this team? All members will be freed.")) return;
  await $fetch(`/api/admin/teams/${id}`, { method: "DELETE" });
  await refreshTeams();
  await refreshParticipants();
}
</script>

<template>
  <main class="max-w-5xl mx-auto p-6 space-y-12 bg-base-100">
    <div class="flex flex-col md:flex-row items-center justify-between">
      <h1 class="text-4xl font-black uppercase">Admin</h1>
      <NuxtLink to="/ops/dashboard" class="btn btn-ghost btn-sm"
        >← Dashboard</NuxtLink
      >
    </div>

    <section>
      <h2 class="text-2xl font-bold mb-4">
        Participants ({{ participants?.length ?? 0 }})
      </h2>
      <div class="overflow-x-auto">
        <table class="table table-xs md:table-md w-full">
          <thead class="text-xs md:text-lg">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th></th>
            </tr>
          </thead>
          <tbody class="text-xs md:text-lg">
            <tr v-for="p in participants" :key="p.id">
              <td class="font-medium">{{ p.name }}</td>
              <td>{{ p.email }}</td>
              <td>
                <span
                  class="badge"
                  :class="p.role === 'admin' ? 'badge-warning' : 'badge-ghost'"
                >
                  {{ p.role }}
                </span>
              </td>
              <td>{{ p.team_id ? "✓" : "—" }}</td>
              <td>
                <button
                  class="btn btn-error btn-xs"
                  @click="deleteParticipant(p.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 class="text-2xl font-bold mb-4">Teams ({{ teams?.length ?? 0 }})</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="team in teams"
          :key="team.id"
          class="card bg-base-200 border border-base-content/20"
        >
          <div class="card-body">
            <div class="flex items-start justify-between">
              <h3 class="card-title font-black text-base">{{ team.name }}</h3>
              <button
                class="btn btn-error btn-xs shrink-0"
                @click="deleteTeam(team.id)"
              >
                Delete
              </button>
            </div>
            <p class="text-sm opacity-60">
              {{ team.members?.length ?? 0 }} member(s)
            </p>
            <ul class="text-xs opacity-50 space-y-0.5 mt-1">
              <li v-for="m in team.members" :key="m.id">{{ m.name }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
