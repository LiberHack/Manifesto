<script setup lang="ts">
definePageMeta({ layout: false })

interface ScheduleItem {
  id: string
  label: string
  starts_at: string
  ends_at: string | null
  sort_order: number
}

interface Announcement {
  id: string
  body: string
  sort_order: number
}

interface LiveConfig {
  event_name: string
  event_start: string
  event_end: string
}

interface LiveData {
  config: LiveConfig | null
  schedule: ScheduleItem[]
  announcements: Announcement[]
  serverTime: string
}

const config = ref<LiveConfig | null>(null)
const schedule = ref<ScheduleItem[]>([])
const announcements = ref<Announcement[]>([])
const serverTimeOffset = ref(0)
const tick = ref(0)
const announcementIndex = ref(0)

// Fetch initial state (SSR-compatible)
const { data: initialData } = await useFetch<LiveData>('/api/live/data')

if (initialData.value) {
  if (initialData.value.config) config.value = initialData.value.config
  if (initialData.value.schedule?.length) schedule.value = initialData.value.schedule
  if (initialData.value.announcements?.length) announcements.value = initialData.value.announcements
  if (initialData.value.serverTime) {
    serverTimeOffset.value = Date.parse(initialData.value.serverTime) - Date.now()
  }
}

function now(): number {
  return Date.now() + serverTimeOffset.value
}

function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - now())
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatSofia(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', ...opts }).format(new Date(iso))
}

const currentItem = computed(() => {
  // Reference tick to make this reactive to the interval
  void tick.value
  const n = now()
  return schedule.value.find(item => {
    const starts = new Date(item.starts_at).getTime()
    if (item.ends_at === null) return false // point-in-time, never "now playing"
    const ends = new Date(item.ends_at).getTime()
    return starts <= n && ends > n
  }) ?? null
})

const nextItem = computed(() => {
  void tick.value
  const n = now()
  return schedule.value
    .filter(item => new Date(item.starts_at).getTime() > n)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null
})

type DisplayMode = 'now-playing' | 'next-up' | 'event-end' | 'wrap'

const displayMode = computed((): DisplayMode => {
  void tick.value
  if (currentItem.value) return 'now-playing'
  if (nextItem.value) return 'next-up'
  if (config.value && new Date(config.value.event_end).getTime() > now()) return 'event-end'
  return 'wrap'
})

const currentAnnouncement = computed(() => {
  if (!announcements.value.length) return null
  return announcements.value[announcementIndex.value % announcements.value.length]
})

let countdownInterval: ReturnType<typeof setInterval> | null = null
let announcementInterval: ReturnType<typeof setInterval> | null = null
let eventSource: EventSource | null = null

function startAnnouncementCycle() {
  if (announcementInterval) clearInterval(announcementInterval)
  announcementIndex.value = 0
  announcementInterval = setInterval(() => {
    if (announcements.value.length > 1) {
      announcementIndex.value = (announcementIndex.value + 1) % announcements.value.length
    }
  }, 6000)
}

onMounted(() => {
  // Start countdown tick
  countdownInterval = setInterval(() => {
    tick.value++
  }, 1000)

  // Start announcement cycle
  startAnnouncementCycle()

  // Open SSE stream
  eventSource = new EventSource('/api/live/stream')
  eventSource.onmessage = (event) => {
    try {
      const data: LiveData = JSON.parse(event.data)
      if (data.config != null) config.value = data.config
      if (data.schedule != null) schedule.value = data.schedule
      if (data.announcements != null) {
        const prevLen = announcements.value.length
        announcements.value = data.announcements
        if (data.announcements.length !== prevLen) startAnnouncementCycle()
      }
      if (data.serverTime) {
        serverTimeOffset.value = Date.parse(data.serverTime) - Date.now()
      }
    } catch {
      // ignore malformed events
    }
  }
})

onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval)
  if (announcementInterval) clearInterval(announcementInterval)
  if (eventSource) eventSource.close()
})
</script>

<template>
  <div
    class="font-cygrotesk min-h-screen w-full flex flex-col relative overflow-hidden"
    style="background-image: url('/index.webp'); background-size: cover; background-position: center;"
  >
    <!-- Dark overlay for readability -->
    <div class="absolute inset-0 bg-black/60 z-0" />

    <!-- Header bar -->
    <header
      class="relative z-10 flex items-center justify-between px-6 py-3"
      style="background: var(--color-base-100); border-bottom: 2px solid var(--color-primary);"
    >
      <span class="text-2xl font-black tracking-tight uppercase">
        LIBER<span style="color: var(--color-primary);">H4CK</span>
      </span>
      <span v-if="config" class="text-sm font-bold uppercase opacity-80 tracking-widest">
        {{ formatSofia(config.event_start, { day: 'numeric' }) }}–{{ formatSofia(config.event_end, { day: 'numeric', month: 'long', year: 'numeric' }) }}
      </span>
    </header>

    <!-- Main content area -->
    <main class="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">

      <!-- Mode A: NOW PLAYING -->
      <template v-if="displayMode === 'now-playing' && currentItem">
        <div
          class="w-full max-w-2xl flex flex-col items-center gap-4 p-8 text-center"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="badge badge-lg font-black uppercase tracking-widest" style="background: var(--color-primary); color: #000;">
            NOW PLAYING
          </div>
          <div class="text-3xl font-black uppercase tracking-tight leading-tight">
            {{ currentItem.label }}
          </div>
          <div class="text-6xl font-black tabular-nums" style="color: var(--color-primary);">
            {{ formatCountdown(currentItem.ends_at!) }}
          </div>
          <div class="text-xs uppercase tracking-widest opacity-50">time remaining</div>
        </div>

        <!-- Next up strip -->
        <div
          v-if="nextItem"
          class="mt-4 w-full max-w-2xl flex items-center gap-3 px-5 py-3"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="badge badge-sm font-bold uppercase tracking-widest shrink-0" style="background: var(--color-primary); color: #000;">
            NEXT UP
          </div>
          <span class="text-sm font-bold uppercase tracking-wide truncate">{{ nextItem.label }}</span>
          <span class="text-xs opacity-50 shrink-0 ml-auto">
            {{ formatSofia(nextItem.starts_at, { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </template>

      <!-- Mode B: NEXT UP -->
      <template v-else-if="displayMode === 'next-up' && nextItem">
        <div
          class="w-full max-w-2xl flex flex-col items-center gap-4 p-8 text-center"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="badge badge-lg font-black uppercase tracking-widest" style="background: var(--color-primary); color: #000;">
            NEXT UP
          </div>
          <div class="text-3xl font-black uppercase tracking-tight leading-tight">
            {{ nextItem.label }}
          </div>
          <div class="text-6xl font-black tabular-nums" style="color: var(--color-primary);">
            {{ formatCountdown(nextItem.starts_at) }}
          </div>
          <div class="text-xs uppercase tracking-widest opacity-50">starts in</div>
        </div>

        <!-- Event ends strip -->
        <div
          v-if="config"
          class="mt-4 w-full max-w-2xl flex items-center gap-3 px-5 py-3"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <span class="text-xs font-bold uppercase tracking-widest opacity-60 shrink-0">EVENT ENDS IN</span>
          <span class="text-sm font-black tabular-nums ml-auto" style="color: var(--color-primary);">
            {{ formatCountdown(config.event_end) }}
          </span>
        </div>
      </template>

      <!-- Mode C: EVENT ENDS IN -->
      <template v-else-if="displayMode === 'event-end' && config">
        <div
          class="w-full max-w-2xl flex flex-col items-center gap-4 p-8 text-center"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="text-sm font-bold uppercase tracking-widest opacity-60">EVENT ENDS IN</div>
          <div class="text-7xl font-black tabular-nums" style="color: var(--color-primary);">
            {{ formatCountdown(config.event_end) }}
          </div>
        </div>
      </template>

      <!-- Mode C: WRAP -->
      <template v-else-if="displayMode === 'wrap'">
        <div
          class="w-full max-w-2xl flex flex-col items-center gap-6 p-10 text-center"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="text-5xl font-black uppercase tracking-tight" style="color: var(--color-primary);">
            THAT'S A WRAP
          </div>
          <div class="text-sm uppercase tracking-widest opacity-60 font-bold">
            Thanks for hacking with us.
          </div>
        </div>
      </template>

    </main>

    <!-- Announcement ticker (fixed bottom) -->
    <footer
      v-if="currentAnnouncement"
      class="relative z-10 flex items-center gap-4 px-6 py-3"
      style="background: var(--color-base-100); border-top: 2px solid var(--color-primary);"
    >
      <div class="badge badge-sm font-black uppercase tracking-widest shrink-0" style="background: var(--color-primary); color: #000;">
        ANNOUNCEMENTS
      </div>
      <span class="text-sm font-bold flex-1 truncate">{{ currentAnnouncement.body }}</span>
      <span class="text-xs opacity-40 shrink-0 tabular-nums font-bold">
        {{ (announcementIndex % announcements.length) + 1 }}/{{ announcements.length }}
      </span>
    </footer>
  </div>
</template>
