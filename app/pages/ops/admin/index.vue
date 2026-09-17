<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

definePageMeta({ middleware: ["admin"] });

// ── Editions ─────────────────────────────────────────────────────────────────
interface Edition {
  slug: string
  name: string
  starts_at: string | null
  ends_at: string | null
  status: 'draft' | 'live' | 'archived'
  is_current: boolean
  participant_cap: number
  ops_enabled: boolean
}

const { data: editions, refresh: refreshEditions } = await useFetch<Edition[]>("/api/admin/editions")

const currentEdition = computed(() => editions.value?.find((e) => e.is_current) ?? null)
const selectedSlug = ref<string>(currentEdition.value?.slug ?? '')
const selectedEdition = computed(
  () => editions.value?.find((e) => e.slug === selectedSlug.value) ?? null,
)

// Archived editions are viewable but never writable in this phase.
const editionReadOnly = computed(() => selectedEdition.value?.status === 'archived')

// Every admin read is scoped by this; changing it refetches each section.
const editionQuery = computed(() => ({ edition: selectedSlug.value || undefined }))

const showEditions = ref(true)
const editionError = ref('')
const editionBusy = ref(false)

const newEdition = ref({ slug: '', name: '', starts_at: '', ends_at: '', participant_cap: 120 })

async function createEdition() {
  editionBusy.value = true
  editionError.value = ''
  try {
    await $fetch('/api/admin/editions', {
      method: 'POST',
      body: {
        slug: newEdition.value.slug.trim(),
        name: newEdition.value.name.trim(),
        starts_at: newEdition.value.starts_at ? fromSofiaLocal(newEdition.value.starts_at) : null,
        ends_at: newEdition.value.ends_at ? fromSofiaLocal(newEdition.value.ends_at) : null,
        participant_cap: Number(newEdition.value.participant_cap),
      },
    })
    newEdition.value = { slug: '', name: '', starts_at: '', ends_at: '', participant_cap: 120 }
    await refreshEditions()
  } catch (e: unknown) {
    editionError.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed to create edition'
  } finally {
    editionBusy.value = false
  }
}

/**
 * Open or close the participant area for an edition. Closing it leaves every
 * account and registration intact — /ops just answers "not open yet" — so it is
 * also the switch to throw while a schema change is rolling out.
 */
async function setOpsEnabled(edition: Edition, opsEnabled: boolean) {
  if (
    !opsEnabled &&
    !confirm(
      `Close the participant area for "${edition.slug}"? Registration and every team page stop working for participants until you reopen it.`,
    )
  )
    return

  editionBusy.value = true
  editionError.value = ''
  try {
    await $fetch(`/api/admin/editions/${edition.slug}`, {
      method: 'PATCH',
      body: { ops_enabled: opsEnabled },
    })
    await refreshEditions()
  } catch (e: unknown) {
    editionError.value =
      (e as { data?: { message?: string } }).data?.message ?? 'Failed to update edition'
  } finally {
    editionBusy.value = false
  }
}

async function goLive(slug: string) {
  if (
    !confirm(
      `Make "${slug}" the live edition? The current edition will be archived and participants will be asked to re-register.`,
    )
  )
    return

  editionBusy.value = true
  editionError.value = ''
  try {
    await $fetch(`/api/admin/editions/${slug}/go-live`, { method: 'POST' })
    await refreshEditions()
    selectedSlug.value = slug
  } catch (e: unknown) {
    editionError.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed to promote edition'
  } finally {
    editionBusy.value = false
  }
}

// ── Existing data ────────────────────────────────────────────────────────────
const { data: participants, refresh: refreshParticipants } = await useFetch<any[]>("/api/admin/participants", { query: editionQuery });
const { data: teams, refresh: refreshTeams } = await useFetch<any[]>("/api/admin/teams", { query: editionQuery });

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
  // Compute the UTC offset for Europe/Sofia at the given local time.
  // We interpret localStr as a Sofia wall-clock time (YYYY-MM-DDTHH:mm),
  // then find the UTC equivalent by probing with Intl.DateTimeFormat.
  const probe = new Date(localStr)
  const sofiaStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Sofia',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(probe).replace(' ', 'T')
  const offsetMs = probe.getTime() - new Date(sofiaStr).getTime()
  return new Date(new Date(localStr).getTime() - offsetMs).toISOString()
}

// ── Section visibility toggles ───────────────────────────────────────────────
const showConfig        = ref(true)
const showSchedule      = ref(true)
const showAnnouncements = ref(true)

// ── Event Config ─────────────────────────────────────────────────────────────
interface EventConfig {
  event_name:         string
  event_start:        string | null
  event_end:          string | null
  github_urls_public: boolean
}

const { data: rawConfig, refresh: refreshConfig } = await useFetch<EventConfig>("/api/admin/live/config", { query: editionQuery })

const configForm = ref({
  event_name:         rawConfig.value?.event_name         ?? '',
  event_start:        toSofiaLocal(rawConfig.value?.event_start ?? null),
  event_end:          toSofiaLocal(rawConfig.value?.event_end   ?? null),
  github_urls_public: rawConfig.value?.github_urls_public ?? false,
})

const configSaving = ref(false)

// rawConfig refetches when the edition selector changes; mirror it into the form.
watch(rawConfig, (config) => {
  configForm.value = {
    event_name:         config?.event_name         ?? '',
    event_start:        toSofiaLocal(config?.event_start ?? null),
    event_end:          toSofiaLocal(config?.event_end   ?? null),
    github_urls_public: config?.github_urls_public ?? false,
  }
})

watch(selectedSlug, () => { selected.value = null })

async function saveConfig() {
  configSaving.value = true
  try {
    await $fetch('/api/admin/live/config', {
      method: 'PATCH',
      query: editionQuery.value,
      body: {
        event_name:         configForm.value.event_name,
        event_start:        configForm.value.event_start ? fromSofiaLocal(configForm.value.event_start) : null,
        event_end:          configForm.value.event_end   ? fromSofiaLocal(configForm.value.event_end)   : null,
        github_urls_public: configForm.value.github_urls_public,
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

const { data: scheduleData, refresh: refreshSchedule } = await useFetch<ScheduleItem[]>("/api/admin/live/schedule", { query: editionQuery })
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
      query: editionQuery.value,
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
    query: editionQuery.value,
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
  await $fetch(`/api/admin/live/schedule/${id}`, { method: 'DELETE', query: editionQuery.value })
  await refreshSchedule()
}

async function addScheduleItem() {
  if (!scheduleNewForm.value.label.trim()) return
  scheduleAdding.value = true
  try {
    await $fetch('/api/admin/live/schedule', {
      method: 'POST',
      query: editionQuery.value,
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
// One table, three channels: `live` is the /live ticker, `ops` banners show to
// logged-in participants, `site` banners show to everyone.
type AnnouncementChannel  = 'live' | 'ops' | 'site'
type AnnouncementAudience = 'all' | 'leaders' | 'no_team' | 'missing_profile'
type AnnouncementVariant  = 'info' | 'warning'

interface Announcement {
  id:          string
  body:        string
  channel:     AnnouncementChannel
  audience:    AnnouncementAudience
  variant:     AnnouncementVariant
  href:        string | null
  dismissible: boolean
  active:      boolean
  starts_at:   string | null
  ends_at:     string | null
  sort_order:  number
}

const ANNOUNCEMENT_CHANNELS: { value: AnnouncementChannel; label: string }[] = [
  { value: 'live', label: 'Live ticker' },
  { value: 'ops',  label: 'Ops banner (logged-in participants)' },
  { value: 'site', label: 'Site banner (everyone)' },
]

const ANNOUNCEMENT_AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all',             label: 'Everyone registered' },
  { value: 'leaders',         label: 'Team leaders' },
  { value: 'no_team',         label: 'Participants without a team' },
  { value: 'missing_profile', label: 'Missing dietary or experience' },
]

const { data: announcementsData, refresh: refreshAnnouncements } = await useFetch<Announcement[]>("/api/admin/live/announcements", { query: editionQuery })

const announcementChannel = ref<AnnouncementChannel>('live')

// Drag-and-drop reorders within the selected channel only, so the list the
// draggable owns is the filtered one.
const announcementItems = computed({
  get: () => (announcementsData.value ?? []).filter((a) => a.channel === announcementChannel.value),
  set: (v) => {
    if (!announcementsData.value) return
    const others = announcementsData.value.filter((a) => a.channel !== announcementChannel.value)
    announcementsData.value = [...others, ...v]
  },
})

const announcementsReordering = ref(false)
const announcementEditId      = ref<string | null>(null)
const announcementError       = ref('')

function blankAnnouncement() {
  return {
    body:        '',
    channel:     announcementChannel.value,
    audience:    'all' as AnnouncementAudience,
    variant:     'info' as AnnouncementVariant,
    href:        '',
    dismissible: true,
    active:      true,
    starts_at:   '',
    ends_at:     '',
  }
}

const announcementEditForm = ref(blankAnnouncement())
const announcementNewForm  = ref(blankAnnouncement())
const announcementAdding   = ref(false)

watch(announcementChannel, () => {
  announcementNewForm.value.channel = announcementChannel.value
})

function announcementPayload(form: ReturnType<typeof blankAnnouncement>) {
  return {
    body:        form.body.trim(),
    channel:     form.channel,
    audience:    form.audience,
    variant:     form.variant,
    href:        form.href.trim() || null,
    dismissible: form.dismissible,
    active:      form.active,
    starts_at:   form.starts_at ? fromSofiaLocal(form.starts_at) : null,
    ends_at:     form.ends_at   ? fromSofiaLocal(form.ends_at)   : null,
  }
}

async function onAnnouncementsDragEnd() {
  announcementsReordering.value = true
  try {
    await $fetch('/api/admin/live/announcements/reorder', {
      method: 'POST',
      query: editionQuery.value,
      body: {
        channel: announcementChannel.value,
        items: announcementItems.value.map((a, i) => ({ id: a.id, sort_order: i + 1 })),
      },
    })
    await refreshAnnouncements()
  } finally {
    announcementsReordering.value = false
  }
}

function startEditAnnouncement(item: Announcement) {
  announcementEditId.value = item.id
  announcementEditForm.value = {
    body:        item.body,
    channel:     item.channel,
    audience:    item.audience,
    variant:     item.variant,
    href:        item.href ?? '',
    dismissible: item.dismissible,
    active:      item.active,
    starts_at:   toSofiaLocal(item.starts_at),
    ends_at:     toSofiaLocal(item.ends_at),
  }
}

async function saveEditAnnouncement(id: string) {
  announcementError.value = ''
  try {
    await $fetch(`/api/admin/live/announcements/${id}`, {
      method: 'PATCH',
      query: editionQuery.value,
      body: announcementPayload(announcementEditForm.value),
    })
    announcementEditId.value = null
    await refreshAnnouncements()
  } catch (e: unknown) {
    announcementError.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed to save'
  }
}

async function toggleAnnouncementActive(item: Announcement) {
  announcementError.value = ''
  try {
    await $fetch(`/api/admin/live/announcements/${item.id}`, {
      method: 'PATCH',
      query: editionQuery.value,
      body: { active: !item.active },
    })
    await refreshAnnouncements()
  } catch (e: unknown) {
    announcementError.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed to save'
  }
}

async function deleteAnnouncement(id: string) {
  if (!confirm('Delete this announcement?')) return
  await $fetch(`/api/admin/live/announcements/${id}`, { method: 'DELETE', query: editionQuery.value })
  await refreshAnnouncements()
}

async function addAnnouncement() {
  if (!announcementNewForm.value.body.trim()) return
  announcementAdding.value = true
  announcementError.value = ''
  try {
    await $fetch('/api/admin/live/announcements', {
      method: 'POST',
      query: editionQuery.value,
      body: announcementPayload(announcementNewForm.value),
    })
    announcementNewForm.value = blankAnnouncement()
    await refreshAnnouncements()
  } catch (e: unknown) {
    announcementError.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed to add'
  } finally {
    announcementAdding.value = false
  }
}
</script>

<template>
  <main class="max-w-5xl mx-auto p-6 space-y-12 bg-base-100">
    <div class="flex flex-col md:flex-row items-center justify-between gap-3">
      <h1 class="text-4xl font-black uppercase">Admin</h1>
      <div class="flex items-center gap-3">
        <label class="text-sm font-semibold opacity-70">Edition</label>
        <select v-model="selectedSlug" class="select select-bordered select-sm">
          <option v-for="e in editions ?? []" :key="e.slug" :value="e.slug">
            {{ e.name }}{{ e.is_current ? ' (current)' : ` — ${e.status}` }}
          </option>
        </select>
        <NuxtLink to="/ops/dashboard" class="btn btn-ghost btn-sm">← Dashboard</NuxtLink>
      </div>
    </div>

    <div v-if="editionReadOnly" class="alert alert-warning text-sm">
      Viewing an archived edition. Its data is read-only.
    </div>

    <!-- ── Editions ─────────────────────────────────────────────────────── -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold">Editions</h2>

      <div class="card bg-base-200 border border-base-content/20">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-lg uppercase">All editions</h3>
            <button class="btn btn-ghost btn-xs" @click="showEditions = !showEditions">
              {{ showEditions ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div v-show="showEditions" class="space-y-4">
            <div v-if="editionError" class="alert alert-error text-sm">{{ editionError }}</div>

            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Slug</th><th>Name</th><th>Status</th><th>Cap</th><th>Participant area</th><th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in editions ?? []" :key="e.slug">
                    <td class="font-mono">{{ e.slug }}</td>
                    <td>{{ e.name }}</td>
                    <td>
                      <span
                        class="badge badge-sm"
                        :class="{
                          'badge-success': e.is_current,
                          'badge-ghost': e.status === 'draft',
                          'badge-neutral': e.status === 'archived',
                        }"
                      >
                        {{ e.is_current ? 'live (current)' : e.status }}
                      </span>
                    </td>
                    <td>{{ e.participant_cap }}</td>
                    <td>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          class="toggle toggle-sm toggle-success"
                          :checked="e.ops_enabled"
                          :disabled="editionBusy || e.status === 'archived'"
                          @change="setOpsEnabled(e, ($event.target as HTMLInputElement).checked)"
                        />
                        <span class="text-xs uppercase font-bold opacity-70">
                          {{ e.ops_enabled ? 'open' : 'closed' }}
                        </span>
                      </label>
                    </td>
                    <td>
                      <button
                        v-if="e.status === 'draft'"
                        class="btn btn-warning btn-xs font-black uppercase"
                        :disabled="editionBusy"
                        @click="goLive(e.slug)"
                      >
                        Go live
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="border-t border-base-content/20 pt-4 space-y-3">
              <h4 class="font-bold text-sm uppercase opacity-70">Create next edition (draft)</h4>
              <div class="flex flex-col sm:flex-row gap-3">
                <input
                  v-model="newEdition.slug"
                  type="text"
                  placeholder="2027"
                  class="input input-bordered input-sm flex-1"
                />
                <input
                  v-model="newEdition.name"
                  type="text"
                  placeholder="LiberHack 2027"
                  class="input input-bordered input-sm flex-1"
                />
                <input
                  v-model.number="newEdition.participant_cap"
                  type="number"
                  min="1"
                  class="input input-bordered input-sm w-28"
                />
              </div>
              <div class="flex flex-col sm:flex-row gap-3">
                <div class="flex flex-col gap-1 flex-1">
                  <label class="text-sm font-semibold opacity-70">Starts at (Sofia)</label>
                  <input v-model="newEdition.starts_at" type="datetime-local" class="input input-bordered input-sm w-full" />
                </div>
                <div class="flex flex-col gap-1 flex-1">
                  <label class="text-sm font-semibold opacity-70">Ends at (Sofia)</label>
                  <input v-model="newEdition.ends_at" type="datetime-local" class="input input-bordered input-sm w-full" />
                </div>
              </div>
              <button
                class="btn btn-primary btn-sm font-black uppercase"
                :disabled="editionBusy || !newEdition.slug.trim() || !newEdition.name.trim()"
                @click="createEdition"
              >
                {{ editionBusy ? 'Working…' : 'Create draft' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

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
            <div class="flex items-center gap-3">
              <label class="text-sm font-semibold opacity-70">Show project repos</label>
              <input
                v-model="configForm.github_urls_public"
                type="checkbox"
                class="toggle toggle-primary"
              />
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="editionReadOnly || configSaving"
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
                :disabled="editionReadOnly || scheduleAdding || !scheduleNewForm.label.trim()"
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
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h3 class="font-black text-lg uppercase">Announcements ({{ announcementItems.length }})</h3>
            <div class="flex items-center gap-2">
              <select v-model="announcementChannel" class="select select-bordered select-xs">
                <option v-for="c in ANNOUNCEMENT_CHANNELS" :key="c.value" :value="c.value">
                  {{ c.label }}
                </option>
              </select>
              <button class="btn btn-ghost btn-xs" @click="showAnnouncements = !showAnnouncements">
                {{ showAnnouncements ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <div v-show="showAnnouncements" class="space-y-4">
            <div v-if="announcementError" class="alert alert-error text-sm">{{ announcementError }}</div>

            <div
              class="overflow-x-auto transition-opacity"
              :class="{ 'pointer-events-none opacity-50': announcementsReordering }"
            >
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th class="w-8" />
                    <th>Body</th>
                    <th>Shown to</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <VueDraggable
                  v-model="announcementItems"
                  tag="tbody"
                  handle=".ann-drag-handle"
                  @end="onAnnouncementsDragEnd"
                >
                  <tr v-for="item in announcementItems" :key="item.id" :class="{ 'opacity-40': !item.active }">
                    <td>
                      <span class="ann-drag-handle cursor-grab select-none text-base opacity-40 hover:opacity-80">⠿</span>
                    </td>
                    <template v-if="announcementEditId === item.id">
                      <td colspan="4">
                        <div class="flex flex-col gap-2 py-2">
                          <textarea
                            v-model="announcementEditForm.body"
                            rows="2"
                            maxlength="300"
                            class="textarea textarea-bordered textarea-xs w-full min-w-64"
                          />
                          <div class="flex flex-wrap gap-2">
                            <select v-model="announcementEditForm.channel" class="select select-bordered select-xs">
                              <option v-for="c in ANNOUNCEMENT_CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
                            </select>
                            <select
                              v-if="announcementEditForm.channel === 'ops'"
                              v-model="announcementEditForm.audience"
                              class="select select-bordered select-xs"
                            >
                              <option v-for="a in ANNOUNCEMENT_AUDIENCES" :key="a.value" :value="a.value">{{ a.label }}</option>
                            </select>
                            <select v-model="announcementEditForm.variant" class="select select-bordered select-xs">
                              <option value="info">Info</option>
                              <option value="warning">Warning</option>
                            </select>
                            <input
                              v-model="announcementEditForm.href"
                              type="text"
                              placeholder="/ops/dashboard or https://…"
                              class="input input-bordered input-xs flex-1 min-w-48"
                            />
                          </div>
                          <div class="flex flex-wrap gap-3 items-center">
                            <label class="flex items-center gap-1 text-xs">
                              <input v-model="announcementEditForm.dismissible" type="checkbox" class="checkbox checkbox-xs" />
                              Dismissible
                            </label>
                            <label class="flex items-center gap-1 text-xs">
                              <input v-model="announcementEditForm.active" type="checkbox" class="checkbox checkbox-xs" />
                              Active
                            </label>
                            <label class="flex items-center gap-1 text-xs">
                              From
                              <input v-model="announcementEditForm.starts_at" type="datetime-local" class="input input-bordered input-xs" />
                            </label>
                            <label class="flex items-center gap-1 text-xs">
                              Until
                              <input v-model="announcementEditForm.ends_at" type="datetime-local" class="input input-bordered input-xs" />
                            </label>
                          </div>
                          <div class="flex gap-1">
                            <button class="btn btn-success btn-xs" @click="saveEditAnnouncement(item.id)">Save</button>
                            <button class="btn btn-ghost btn-xs" @click="announcementEditId = null">Cancel</button>
                          </div>
                        </div>
                      </td>
                    </template>
                    <template v-else>
                      <td>
                        {{ item.body }}
                        <span v-if="item.href" class="opacity-50 font-mono text-[10px] block">{{ item.href }}</span>
                      </td>
                      <td>
                        <span v-if="item.channel === 'ops'" class="badge badge-ghost badge-xs">{{ item.audience }}</span>
                        <span v-else class="opacity-40">—</span>
                      </td>
                      <td class="whitespace-nowrap">
                        <span class="badge badge-xs" :class="item.variant === 'warning' ? 'badge-warning' : 'badge-ghost'">
                          {{ item.variant }}
                        </span>
                        <span v-if="!item.dismissible" class="badge badge-xs badge-neutral ml-1">pinned</span>
                        <span v-if="item.starts_at || item.ends_at" class="badge badge-xs badge-outline ml-1">scheduled</span>
                      </td>
                      <td class="flex gap-1">
                        <button
                          class="btn btn-xs"
                          :class="item.active ? 'btn-outline' : 'btn-warning'"
                          :disabled="editionReadOnly"
                          @click="toggleAnnouncementActive(item)"
                        >
                          {{ item.active ? 'Disable' : 'Enable' }}
                        </button>
                        <button class="btn btn-outline btn-xs" :disabled="editionReadOnly" @click="startEditAnnouncement(item)">Edit</button>
                        <button class="btn btn-error btn-xs" :disabled="editionReadOnly" @click="deleteAnnouncement(item.id)">Delete</button>
                      </td>
                    </template>
                  </tr>
                </VueDraggable>
              </table>
            </div>

            <!-- Add row -->
            <div class="flex flex-col gap-2 border-t border-base-content/10 pt-3">
              <label class="text-xs opacity-60">New announcement</label>
              <textarea
                v-model="announcementNewForm.body"
                rows="2"
                maxlength="300"
                class="textarea textarea-bordered textarea-sm w-full"
                placeholder="Lunch is served on floor 2!"
              />
              <div class="flex flex-wrap gap-2">
                <select v-model="announcementNewForm.channel" class="select select-bordered select-xs">
                  <option v-for="c in ANNOUNCEMENT_CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <select
                  v-if="announcementNewForm.channel === 'ops'"
                  v-model="announcementNewForm.audience"
                  class="select select-bordered select-xs"
                >
                  <option v-for="a in ANNOUNCEMENT_AUDIENCES" :key="a.value" :value="a.value">{{ a.label }}</option>
                </select>
                <select v-model="announcementNewForm.variant" class="select select-bordered select-xs">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                </select>
                <input
                  v-model="announcementNewForm.href"
                  type="text"
                  placeholder="/ops/dashboard or https://…"
                  class="input input-bordered input-xs flex-1 min-w-48"
                />
              </div>
              <div class="flex flex-wrap gap-3 items-center">
                <label class="flex items-center gap-1 text-xs">
                  <input v-model="announcementNewForm.dismissible" type="checkbox" class="checkbox checkbox-xs" />
                  Dismissible
                </label>
                <label class="flex items-center gap-1 text-xs">
                  <input v-model="announcementNewForm.active" type="checkbox" class="checkbox checkbox-xs" />
                  Active
                </label>
                <label class="flex items-center gap-1 text-xs">
                  From
                  <input v-model="announcementNewForm.starts_at" type="datetime-local" class="input input-bordered input-xs" />
                </label>
                <label class="flex items-center gap-1 text-xs">
                  Until
                  <input v-model="announcementNewForm.ends_at" type="datetime-local" class="input input-bordered input-xs" />
                </label>
                <button
                  class="btn btn-primary btn-sm shrink-0"
                  :disabled="editionReadOnly || announcementAdding || !announcementNewForm.body.trim()"
                  @click="addAnnouncement"
                >
                  {{ announcementAdding ? 'Adding…' : '+ Add' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Participants ────────────────────────────────────────────────────── -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">Participants ({{ participants?.length ?? 0 }})</h2>
        <a :href="`/api/admin/participants/export?edition=${selectedSlug}`" download class="btn btn-outline btn-sm">↓ Export CSV</a>
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
                  :disabled="editionReadOnly"
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
        <a :href="`/api/admin/teams/export?edition=${selectedSlug}`" download class="btn btn-outline btn-sm">↓ Export CSV</a>
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
                :disabled="editionReadOnly"
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
          <span>{{ new Date(selected.registered_at).toLocaleString() }}</span>

          <span class="opacity-50 font-semibold">Public</span>
          <span>{{ selected.public ? 'yes' : 'opted out' }}</span>
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
          :disabled="editionReadOnly"
          @click="deleteParticipant(selected.id)"
        >Delete participant</button>
        <button class="btn btn-sm" @click="selected = null">Close</button>
      </div>
    </div>
  </dialog>
</template>
