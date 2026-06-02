<script setup lang="ts">
definePageMeta({ middleware: ["admin"] });

const { data: participants, refresh: refreshParticipants } = await useFetch<
  any[]
>("/api/admin/participants");
const { data: teams, refresh: refreshTeams } =
  await useFetch<any[]>("/api/admin/teams");

const selected = ref<any | null>(null);

function teamName(teamId: string | null) {
  if (!teamId) return null;
  return teams.value?.find((t) => t.id === teamId)?.name ?? teamId;
}

async function deleteParticipant(id: string) {
  if (!confirm("Delete this participant? This cannot be undone.")) return;
  await $fetch(`/api/admin/participants/${id}`, { method: "DELETE" });
  selected.value = null;
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
      <NuxtLink to="/ops/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
    </div>

    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">Participants ({{ participants?.length ?? 0 }})</h2>
        <a href="/api/admin/participants/export" download class="btn btn-outline btn-sm">↓ Export CSV</a>
      </div>
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
            <tr
              v-for="p in participants"
              :key="p.id"
              class="hover cursor-pointer"
              @click="selected = p"
            >
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
                  @click.stop="deleteParticipant(p.id)"
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
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">Teams ({{ teams?.length ?? 0 }})</h2>
        <a href="/api/admin/teams/export" download class="btn btn-outline btn-sm">↓ Export CSV</a>
      </div>
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

  <!-- Participant detail modal -->
  <dialog v-if="selected" class="modal modal-open" @click.self="selected = null">
    <div class="modal-box max-w-lg">
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        @click="selected = null"
      >✕</button>

      <h3 class="font-black text-xl uppercase mb-4">{{ selected.name }}</h3>

      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-[7rem_1fr] gap-y-2">
          <span class="opacity-50 font-semibold">Email</span>
          <span>{{ selected.email }}</span>

          <span class="opacity-50 font-semibold">Role</span>
          <span>
            <span
              class="badge badge-sm"
              :class="selected.role === 'admin' ? 'badge-warning' : 'badge-ghost'"
            >{{ selected.role }}</span>
          </span>

          <span class="opacity-50 font-semibold">Team</span>
          <span>{{ teamName(selected.team_id) ?? '—' }}</span>

          <span class="opacity-50 font-semibold">Experience</span>
          <span>{{ selected.experience ?? '—' }}</span>

          <span class="opacity-50 font-semibold">Dietary</span>
          <span>{{ selected.dietary || '—' }}</span>

          <span class="opacity-50 font-semibold">Registered</span>
          <span>{{ new Date(selected.created_at).toLocaleString() }}</span>
        </div>

        <div v-if="selected.skills?.length">
          <p class="opacity-50 font-semibold mb-1">Skills</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="skill in selected.skills"
              :key="skill"
              class="badge badge-outline badge-sm"
            >{{ skill }}</span>
          </div>
        </div>
        <div v-else>
          <span class="opacity-50 font-semibold">Skills</span>
          <span class="ml-2">—</span>
        </div>
      </div>

      <div class="modal-action">
        <button
          class="btn btn-error btn-sm"
          @click="deleteParticipant(selected.id)"
        >Delete participant</button>
        <button class="btn btn-sm" @click="selected = null">Close</button>
      </div>
    </div>
  </dialog>
</template>
