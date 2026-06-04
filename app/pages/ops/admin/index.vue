<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

definePageMeta({ middleware: ["admin"] });

// ── Existing data ────────────────────────────────────────────────────────────
const { data: participants, refresh: refreshParticipants } = await useFetch<any[]>("/api/admin/participants");
const { data: teams, refresh: refreshTeams } = await useFetch<any[]>("/api/admin/teams");

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

// ── Timezone helpers (Europe/Sofia) ─────────────────────────────────────────
function toSofiaLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Sofia',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  return formatter.format(d).replace(' ', 'T')
}

function fromSofiaLocal(localStr: string): string {
  if (!localStr) return ''
  const sofiaDt = new Date(localStr + ':00.000+03:00')
  return sofiaDt.toISOString()
}

// ── Section visibility toggles ───────────────────────────────────────────────
const showConfig        = ref(true)
const showSchedule      = ref(true)
const showAnnouncements = ref(true)

// ── Event Config ─────────────────────────────────────────────────────────────
interface EventConfig {
  event_name:  string
  event_start: string | null
  event_end:   string | null
}

const { data: rawConfig, refresh: refreshConfig } = await useFetch<EventConfig>("/api/admin/live/config")

const configForm = ref({
  event_name:  rawConfig.value?.event_name  ?? '',
  event_start: toSofiaLocal(rawConfig.value?.event_start ?? null),
  event_end:   toSofiaLocal(rawConfig.value?.event_end   ?? null),
})

const configSaving = ref(false)

async function saveConfig() {
  configSaving.value = true
  try {
    await $fetch('/api/admin/live/config', {
      method: 'PATCH',
      body: {
        event_name:  configForm.value.event_name,
        event_start: configForm.value.event_start ? fromSofiaLocal(configForm.value.event_start) : null,
        event_end:   configForm.value.event_end   ? fromSofiaLocal(configForm.value.event_end)   : null,
      },
    })
    await refreshConfig()
  } finally {
    configSaving.value = false
  }
}

// ── Schedule ─────────────────────────────────────────────────────────────────
interface ScheduleItem {
  id:         string
  label:      string
  starts_at:  string | null
  ends_at:    string | null
  sort_order: number
}

const { data: scheduleData, refresh: refreshSchedule } = await useFetch<ScheduleItem[]>("/api/admin/live/schedule")
const scheduleItems   = computed({
  get: () => scheduleData.value ?? [],
  set: (v) => { if (scheduleData.value) scheduleData.value = v },
})
const scheduleReordering = ref(false)
const scheduleEditId     = ref<string | null>(null)
const scheduleEditForm   = ref({ label: '', starts_at: '', ends_at: '' })

const scheduleNewForm = ref({ label: '', starts_at: '', ends_at: '' })
const scheduleAdding  = ref(false)

async function onScheduleDragEnd() {
  scheduleReordering.value = true
  try {
    await $fetch('/api/admin/live/schedule/reorder', {
      method: 'POST',
      body: { items: scheduleItems.value.map((s, i) => ({ id: s.id, sort_order: i + 1 })) },
    })
    await refreshSchedule()
  } finally {
    scheduleReordering.value = false
  }
}

function startEditSchedule(item: ScheduleItem) {
  scheduleEditId.value   = item.id
  scheduleEditForm.value = {
    label:     item.label,
    starts_at: toSofiaLocal(item.starts_at),
    ends_at:   toSofiaLocal(item.ends_at),
  }
}

async function saveEditSchedule(id: string) {
  await $fetch(`/api/admin/live/schedule/${id}`, {
    method: 'PATCH',
    body: {
      label:     scheduleEditForm.value.label,
      starts_at: scheduleEditForm.value.starts_at ? fromSofiaLocal(scheduleEditForm.value.starts_at) : null,
      ends_at:   scheduleEditForm.value.ends_at   ? fromSofiaLocal(scheduleEditForm.value.ends_at)   : null,
    },
  })
  scheduleEditId.value = null
  await refreshSchedule()
}

async function deleteScheduleItem(id: string) {
  if (!confirm('Delete this schedule item?')) return
  await $fetch(`/api/admin/live/schedule/${id}`, { method: 'DELETE' })
  await refreshSchedule()
}

async function addScheduleItem() {
  if (!scheduleNewForm.value.label.trim()) return
  scheduleAdding.value = true
  try {
    await $fetch('/api/admin/live/schedule', {
      method: 'POST',
      body: {
        label:     scheduleNewForm.value.label.trim(),
        starts_at: scheduleNewForm.value.starts_at ? fromSofiaLocal(scheduleNewForm.value.starts_at) : null,
        ends_at:   scheduleNewForm.value.ends_at   ? fromSofiaLocal(scheduleNewForm.value.ends_at)   : null,
      },
    })
    scheduleNewForm.value = { label: '', starts_at: '', ends_at: '' }
    await refreshSchedule()
  } finally {
    scheduleAdding.value = false
  }
}

// ── Announcements ─────────────────────────────────────────────────────────────
interface Announcement {
  id:         string
  body:       string
  sort_order: number
}

const { data: announcementsData, refresh: refreshAnnouncements } = await useFetch<Announcement[]>("/api/admin/live/announcements")
const announcementItems = computed({
  get: () => announcementsData.value ?? [],
  set: (v) => { if (announcementsData.value) announcementsData.value = v },
})
const announcementsReordering = ref(false)
const announcementEditId      = ref<string | null>(null)
const announcementEditBody    = ref('')

const announcementNewBody = ref('')
const announcementAdding  = ref(false)

async function onAnnouncementsDragEnd() {
  announcementsReordering.value = true
  try {
    await $fetch('/api/admin/live/announcements/reorder', {
      method: 'POST',
      body: { items: announcementItems.value.map((a, i) => ({ id: a.id, sort_order: i + 1 })) },
    })
    await refreshAnnouncements()
  } finally {
    announcementsReordering.value = false
  }
}

function startEditAnnouncement(item: Announcement) {
  announcementEditId.value   = item.id
  announcementEditBody.value = item.body
}

async function saveEditAnnouncement(id: string) {
  await $fetch(`/api/admin/live/announcements/${id}`, {
    method: 'PATCH',
    body: { body: announcementEditBody.value },
  })
  announcementEditId.value = null
  await refreshAnnouncements()
}

async function deleteAnnouncement(id: string) {
  if (!confirm('Delete this announcement?')) return
  await $fetch(`/api/admin/live/announcements/${id}`, { method: 'DELETE' })
  await refreshAnnouncements()
}

async function addAnnouncement() {
  if (!announcementNewBody.value.trim()) return
  announcementAdding.value = true
  try {
    await $fetch('/api/admin/live/announcements', {
      method: 'POST',
      body: { body: announcementNewBody.value.trim() },
    })
    announcementNewBody.value = ''
    await refreshAnnouncements()
  } finally {
    announcementAdding.value = false
  }
}
</script>

<template>
  <main class="max-w-5xl mx-auto p-6 space-y-12 bg-base-100">
    <div class="flex flex-col md:flex-row items-center justify-between">
      <h1 class="text-4xl font-black uppercase">Admin</h1>
      <NuxtLink to="/ops/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
    </div>

    <!-- ── Live CMS ─────────────────────────────────────────────────────── -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold">Live CMS</h2>

      <!-- Event Config -->
      <div class="card bg-base-200 border border-base-content/20">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-lg uppercase">Event Config</h3>
            <button class="btn btn-ghost btn-xs" @click="showConfig = !showConfig">
              {{ showConfig ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div v-show="showConfig" class="space-y-3">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold opacity-70">Event name</label>
              <input
                v-model="configForm.event_name"
                type="text"
                class="input input-bordered input-sm w-full max-w-md"
                placeholder="LiberHack 2025"
              />
            </div>
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-semibold opacity-70">Starts at (Sofia)</label>
                <input
                  v-model="configForm.event_start"
                  type="datetime-local"
                  class="input input-bordered input-sm w-full"
                />
              </div>
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-semibold opacity-70">Ends at (Sofia)</label>
                <input
                  v-model="configForm.event_end"
                  type="datetime-local"
                  class="input input-bordered input-sm w-full"
                />
              </div>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="configSaving"
              @click="saveConfig"
            >
              {{ configSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Schedule -->
      <div class="card bg-base-200 border border-base-content/20">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-lg uppercase">Schedule ({{ scheduleItems.length }})</h3>
            <button class="btn btn-ghost btn-xs" @click="showSchedule = !showSchedule">
              {{ showSchedule ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div v-show="showSchedule" class="space-y-4">
            <div
              class="overflow-x-auto transition-opacity"
              :class="{ 'pointer-events-none opacity-50': scheduleReordering }"
            >
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th class="w-8"></th>
                    <th>Label</th>
                    <th>Starts at (Sofia)</th>
                    <th>Ends at (Sofia)</th>
                    <th></th>
                  </tr>
                </thead>
                <VueDraggable
                  v-model="scheduleItems"
                  tag="tbody"
                  handle=".drag-handle"
                  @end="onScheduleDragEnd"
                >
                  <tr v-for="item in scheduleItems" :key="item.id">
                    <td>
                      <span class="drag-handle cursor-grab select-none text-base opacity-40 hover:opacity-80">⠿</span>
                    </td>
                    <template v-if="scheduleEditId === item.id">
                      <td>
                        <input
                          v-model="scheduleEditForm.label"
                          type="text"
                          class="input input-bordered input-xs w-full min-w-32"
                        />
                      </td>
                      <td>
                        <input
                          v-model="scheduleEditForm.starts_at"
                          type="datetime-local"
                          class="input input-bordered input-xs w-full"
                        />
                      </td>
                      <td>
                        <input
                          v-model="scheduleEditForm.ends_at"
                          type="datetime-local"
                          class="input input-bordered input-xs w-full"
                        />
                      </td>
                      <td class="flex gap-1">
                        <button class="btn btn-success btn-xs" @click="saveEditSchedule(item.id)">Save</button>
                        <button class="btn btn-ghost btn-xs" @click="scheduleEditId = null">Cancel</button>
                      </td>
                    </template>
                    <template v-else>
                      <td class="font-medium">{{ item.label }}</td>
                      <td class="text-xs opacity-70">{{ item.starts_at ? toSofiaLocal(item.starts_at) : '—' }}</td>
                      <td class="text-xs opacity-70">{{ item.ends_at ? toSofiaLocal(item.ends_at) : '—' }}</td>
                      <td class="flex gap-1">
                        <button class="btn btn-outline btn-xs" @click="startEditSchedule(item)">Edit</button>
                        <button class="btn btn-error btn-xs" @click="deleteScheduleItem(item.id)">Delete</button>
                      </td>
                    </template>
                  </tr>
                </VueDraggable>
              </table>
            </div>

            <!-- Add row -->
            <div class="flex flex-col sm:flex-row gap-2 items-end border-t border-base-content/10 pt-3">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-xs opacity-60">Label</label>
                <input
                  v-model="scheduleNewForm.label"
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Opening ceremony"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs opacity-60">Starts at (Sofia)</label>
                <input
                  v-model="scheduleNewForm.starts_at"
                  type="datetime-local"
                  class="input input-bordered input-sm"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs opacity-60">Ends at (Sofia, optional)</label>
                <input
                  v-model="scheduleNewForm.ends_at"
                  type="datetime-local"
                  class="input input-bordered input-sm"
                />
              </div>
              <button
                class="btn btn-primary btn-sm shrink-0"
                :disabled="scheduleAdding || !scheduleNewForm.label.trim()"
                @click="addScheduleItem"
              >
                {{ scheduleAdding ? 'Adding…' : '+ Add' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Announcements -->
      <div class="card bg-base-200 border border-base-content/20">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-lg uppercase">Announcements ({{ announcementItems.length }})</h3>
            <button class="btn btn-ghost btn-xs" @click="showAnnouncements = !showAnnouncements">
              {{ showAnnouncements ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div v-show="showAnnouncements" class="space-y-4">
            <div
              class="overflow-x-auto transition-opacity"
              :class="{ 'pointer-events-none opacity-50': announcementsReordering }"
            >
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th class="w-8"></th>
                    <th>Body</th>
                    <th></th>
                  </tr>
                </thead>
                <VueDraggable
                  v-model="announcementItems"
                  tag="tbody"
                  handle=".ann-drag-handle"
                  @end="onAnnouncementsDragEnd"
                >
                  <tr v-for="item in announcementItems" :key="item.id">
                    <td>
                      <span class="ann-drag-handle cursor-grab select-none text-base opacity-40 hover:opacity-80">⠿</span>
                    </td>
                    <template v-if="announcementEditId === item.id">
                      <td>
                        <input
                          v-model="announcementEditBody"
                          type="text"
                          class="input input-bordered input-xs w-full min-w-48"
                        />
                      </td>
                      <td class="flex gap-1">
                        <button class="btn btn-success btn-xs" @click="saveEditAnnouncement(item.id)">Save</button>
                        <button class="btn btn-ghost btn-xs" @click="announcementEditId = null">Cancel</button>
                      </td>
                    </template>
                    <template v-else>
                      <td>{{ item.body }}</td>
                      <td class="flex gap-1">
                        <button class="btn btn-outline btn-xs" @click="startEditAnnouncement(item)">Edit</button>
                        <button class="btn btn-error btn-xs" @click="deleteAnnouncement(item.id)">Delete</button>
                      </td>
                    </template>
                  </tr>
                </VueDraggable>
              </table>
            </div>

            <!-- Add row -->
            <div class="flex gap-2 items-end border-t border-base-content/10 pt-3">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-xs opacity-60">Announcement text</label>
                <input
                  v-model="announcementNewBody"
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Lunch is served on floor 2!"
                />
              </div>
              <button
                class="btn btn-primary btn-sm shrink-0"
                :disabled="announcementAdding || !announcementNewBody.trim()"
                @click="addAnnouncement"
              >
                {{ announcementAdding ? 'Adding…' : '+ Add' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Participants ────────────────────────────────────────────────────── -->
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

    <!-- ── Teams ──────────────────────────────────────────────────────────── -->
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
