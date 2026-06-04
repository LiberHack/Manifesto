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

interface CountdownParts { d: string; h: string; m: string; s: string }

const config = ref<LiveConfig | null>(null)
const schedule = ref<ScheduleItem[]>([])
const announcements = ref<Announcement[]>([])
const serverTimeOffset = ref(0)
const tick = ref(0)
const announcementIndex = ref(0)

const { data: initialData } = await useFetch<LiveData>('/api/live/data')

if (initialData.value) {
  if (initialData.value.config != null) config.value = initialData.value.config
  if (initialData.value.schedule != null) schedule.value = initialData.value.schedule
  if (initialData.value.announcements != null) announcements.value = initialData.value.announcements
  if (initialData.value.serverTime) {
    serverTimeOffset.value = Date.parse(initialData.value.serverTime) - Date.now()
  }
}

function now(): number {
  return Date.now() + serverTimeOffset.value
}

function countdown(targetIso: string): CountdownParts {
  const diff = Math.max(0, new Date(targetIso).getTime() - now())
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return {
    d: String(d).padStart(2, '0'),
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  }
}

function sofiaFmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Sofia', ...opts }).format(new Date(iso))
}

function headerDateRange(start: string, end: string): string {
  const month = sofiaFmt(start, { month: 'long' }).toUpperCase()
  const startDay = sofiaFmt(start, { day: 'numeric' })
  const endDay = sofiaFmt(end, { day: 'numeric' })
  const year = sofiaFmt(start, { year: 'numeric' })
  return `${month} ${startDay}–${endDay}, ${year}`
}

const currentItem = computed(() => {
  void tick.value
  const n = now()
  return schedule.value.find(item => {
    if (item.ends_at === null) return false
    return new Date(item.starts_at).getTime() <= n && new Date(item.ends_at).getTime() > n
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

const mainCountdown = computed((): CountdownParts | null => {
  void tick.value
  if (displayMode.value === 'now-playing' && currentItem.value?.ends_at) return countdown(currentItem.value.ends_at)
  if (displayMode.value === 'next-up' && nextItem.value) return countdown(nextItem.value.starts_at)
  if (displayMode.value === 'event-end' && config.value) return countdown(config.value.event_end)
  return null
})

const eventEndCountdown = computed((): CountdownParts | null => {
  void tick.value
  return config.value ? countdown(config.value.event_end) : null
})

const activeItem = computed(() =>
  displayMode.value === 'now-playing' ? currentItem.value : nextItem.value
)

const activeItemTime = computed((): string => {
  const item = activeItem.value
  if (!item) return ''
  const day = sofiaFmt(item.starts_at, { weekday: 'long' })
  const time = sofiaFmt(item.starts_at, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} ${time}`
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
  countdownInterval = setInterval(() => { tick.value++ }, 1000)
  startAnnouncementCycle()

  eventSource = new EventSource('/api/live/stream')
  eventSource.onmessage = (e) => {
    try {
      const data: LiveData = JSON.parse(e.data)
      if (data.config != null) config.value = data.config
      if (data.schedule != null) schedule.value = data.schedule
      if (data.announcements != null) {
        const prevLen = announcements.value.length
        announcements.value = data.announcements
        if (data.announcements.length !== prevLen) startAnnouncementCycle()
      }
      if (data.serverTime) serverTimeOffset.value = Date.parse(data.serverTime) - Date.now()
    } catch { /* ignore malformed */ }
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
    class="font-cygrotesk min-h-screen w-full flex flex-col items-center"
    style="background-image: url('/index.webp'); background-size: cover; background-position: center;"
  >
  <div class="w-full max-w-7xl flex flex-col min-h-screen">
    <!-- Header -->
    <header
      class="flex items-center justify-between px-6 py-4 shrink-0"
      style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
    >
      <span class="text-2xl font-cy tracking-tight">
        L1BERH4CK
      </span>
      <span v-if="config" class="text-sm font-bold tracking-widest">
        {{ headerDateRange(config.event_start, config.event_end) }}
      </span>
    </header>

    <!-- Main area -->
    <main class="flex-1 flex flex-col justify-center">

      <!-- Active countdown box -->
      <template v-if="displayMode !== 'wrap'">
        <div
          class="w-full flex flex-col items-center py-10 gap-3"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <!-- Mode label -->
          <div
            class="text-xs font-black tracking-[0.35em] uppercase"
            :style="displayMode === 'event-end' ? 'opacity: 0.65' : `color: var(--color-primary)`"
          >
            {{ displayMode === 'now-playing' ? 'NOW PLAYING' : displayMode === 'next-up' ? 'NEXT UP' : 'DEV TIME ENDS IN' }}
          </div>

          <!-- Event name -->
          <div v-if="activeItem" class="text-4xl md:text-5xl font-black text-center px-8 leading-tight">
            {{ activeItem.label.toUpperCase() }}
          </div>

          <!-- Day + time -->
          <div v-if="activeItem" class="text-sm opacity-60 tracking-wider">
            {{ activeItemTime }}
          </div>

          <!-- Countdown: DD · HH · MM · SS -->
          <div v-if="mainCountdown" class="flex items-end justify-center mt-4 gap-1 md:gap-3">
            <div class="flex flex-col items-center gap-2">
              <span class="text-[4.5rem] md:text-[8rem] font-black leading-none tabular-nums">{{ mainCountdown.d }}</span>
              <span class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60">DAYS</span>
            </div>
            <span class="text-[3.5rem] md:text-[6rem] font-black leading-none pb-7" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-2">
              <span class="text-[4.5rem] md:text-[8rem] font-black leading-none tabular-nums">{{ mainCountdown.h }}</span>
              <span class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60">HRS</span>
            </div>
            <span class="text-[3.5rem] md:text-[6rem] font-black leading-none pb-7" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-2">
              <span class="text-[4.5rem] md:text-[8rem] font-black leading-none tabular-nums">{{ mainCountdown.m }}</span>
              <span class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60">MIN</span>
            </div>
            <span class="text-[3.5rem] md:text-[6rem] font-black leading-none pb-7" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-2">
              <span class="text-[4.5rem] md:text-[8rem] font-black leading-none tabular-nums">{{ mainCountdown.s }}</span>
              <span class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60">SEC</span>
            </div>
          </div>
        </div>

        <!-- Secondary strip: NEXT UP (during now-playing) or DEV TIME ENDS IN (during next-up) -->
        <div
          v-if="displayMode === 'now-playing' && nextItem"
          class="w-full flex flex-col items-center px-8 py-3 gap-2 mt-[2px]"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <span class="text-xs font-bold tracking-[0.25em] uppercase">
            <span class="opacity-60">NEXT UP —</span> {{ nextItem.label.toUpperCase() }}
          </span>
          <div class="flex items-center gap-2 md:gap-3">
            <span class="text-lg md:text-xl font-black tabular-nums" style="color: var(--color-primary);">{{ countdown(nextItem.starts_at).d }}</span>
            <span class="text-sm font-black opacity-40">D</span>
            <span class="text-lg md:text-xl font-black" style="color: var(--color-primary);">·</span>
            <span class="text-lg md:text-xl font-black tabular-nums" style="color: var(--color-primary);">{{ countdown(nextItem.starts_at).h }}</span>
            <span class="text-sm font-black opacity-40">H</span>
            <span class="text-lg md:text-xl font-black" style="color: var(--color-primary);">·</span>
            <span class="text-lg md:text-xl font-black tabular-nums" style="color: var(--color-primary);">{{ countdown(nextItem.starts_at).m }}</span>
            <span class="text-sm font-black opacity-40">M</span>
            <span class="text-lg md:text-xl font-black" style="color: var(--color-primary);">·</span>
            <span class="text-lg md:text-xl font-black tabular-nums" style="color: var(--color-primary);">{{ countdown(nextItem.starts_at).s }}</span>
            <span class="text-sm font-black opacity-40">S</span>
          </div>
        </div>
        <div
          v-else-if="displayMode === 'next-up' && eventEndCountdown"
          class="w-full flex flex-col items-center px-8 py-4 gap-3 mt-[2px]"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <span class="text-xs font-bold tracking-[0.25em] uppercase opacity-60">DEV TIME ENDS IN</span>
          <div class="flex items-end gap-1 md:gap-2">
            <div class="flex flex-col items-center gap-1">
              <span class="text-xl md:text-2xl font-black tabular-nums" style="color: var(--color-primary);">{{ eventEndCountdown.d }}</span>
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60">DAYS</span>
            </div>
            <span class="text-xl font-black pb-4" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-1">
              <span class="text-xl md:text-2xl font-black tabular-nums" style="color: var(--color-primary);">{{ eventEndCountdown.h }}</span>
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60">HRS</span>
            </div>
            <span class="text-xl font-black pb-4" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-1">
              <span class="text-xl md:text-2xl font-black tabular-nums" style="color: var(--color-primary);">{{ eventEndCountdown.m }}</span>
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60">MIN</span>
            </div>
            <span class="text-xl font-black pb-4" style="color: var(--color-primary);">·</span>
            <div class="flex flex-col items-center gap-1">
              <span class="text-xl md:text-2xl font-black tabular-nums" style="color: var(--color-primary);">{{ eventEndCountdown.s }}</span>
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60">SEC</span>
            </div>
          </div>
        </div>
      </template>

      <!-- THAT'S A WRAP -->
      <template v-else>
        <div
          class="w-full flex flex-col items-center py-24"
          style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
        >
          <div class="text-6xl font-black uppercase tracking-tight" style="color: var(--color-primary);">
            THAT'S A WRAP
          </div>
          <div class="text-sm uppercase tracking-widest opacity-60 mt-4 font-bold">
            Thanks for hacking with us.
          </div>
        </div>
      </template>
    </main>

    <!-- Announcement ticker -->
    <footer
      v-if="currentAnnouncement"
      class="flex items-center gap-4 px-6 py-3 shrink-0"
      style="background: var(--color-base-100); border: 2px solid var(--color-primary);"
    >
      <div
        class="px-3 py-1 text-xs font-black uppercase tracking-widest shrink-0"
        style="background: var(--color-primary); color: #000;"
      >
        ANNOUNCEMENTS
      </div>
      <span class="text-sm font-bold flex-1 truncate">{{ currentAnnouncement.body }}</span>
      <span class="text-xs opacity-60 shrink-0 tabular-nums font-bold">
        {{ (announcementIndex % announcements.length) + 1 }}/{{ announcements.length }}
      </span>
    </footer>
  </div>
  </div>
</template>
