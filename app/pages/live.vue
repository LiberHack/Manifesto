<script setup lang="ts">
interface ScheduleItem {
  id: string;
  label: string;
  starts_at: string;
  ends_at: string | null;
  sort_order: number;
}

interface Announcement {
  id: string;
  body: string;
  sort_order: number;
}

interface LiveConfig {
  event_name: string;
  event_start: string;
  event_end: string;
}

interface LiveData {
  config: LiveConfig | null;
  schedule: ScheduleItem[];
  announcements: Announcement[];
  serverTime: string;
}

interface CountdownParts {
  d: string;
  h: string;
  m: string;
  s: string;
}

const config = ref<LiveConfig | null>(null);
const schedule = ref<ScheduleItem[]>([]);
const announcements = ref<Announcement[]>([]);
const serverTimeOffset = ref(0);
const tick = ref(0);
const announcementIndex = ref(0);

const { data: initialData } = await useFetch<LiveData>("/api/live/data");

if (initialData.value) {
  if (initialData.value.config != null) config.value = initialData.value.config;
  if (initialData.value.schedule != null)
    schedule.value = initialData.value.schedule;
  if (initialData.value.announcements != null)
    announcements.value = initialData.value.announcements;
  if (initialData.value.serverTime) {
    serverTimeOffset.value =
      Date.parse(initialData.value.serverTime) - Date.now();
  }
}

function now(): number {
  return Date.now() + serverTimeOffset.value;
}

function countdown(targetIso: string): CountdownParts {
  const diff = Math.max(0, new Date(targetIso).getTime() - now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return {
    d: String(d).padStart(2, "0"),
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

function sofiaFmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sofia",
    ...opts,
  }).format(new Date(iso));
}

function headerDateRange(start: string, end: string): string {
  const month = sofiaFmt(start, { month: "long" }).toUpperCase();
  const startDay = sofiaFmt(start, { day: "numeric" });
  const endDay = sofiaFmt(end, { day: "numeric" });
  const year = sofiaFmt(start, { year: "numeric" });
  return `${month} ${startDay}–${endDay}, ${year}`;
}

const currentItem = computed(() => {
  void tick.value;
  const n = now();
  return (
    schedule.value.find((item) => {
      if (item.ends_at === null) return false;
      return (
        new Date(item.starts_at).getTime() <= n &&
        new Date(item.ends_at).getTime() > n
      );
    }) ?? null
  );
});

const nextItem = computed(() => {
  void tick.value;
  const n = now();
  return (
    schedule.value
      .filter((item) => new Date(item.starts_at).getTime() > n)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )[0] ?? null
  );
});

type DisplayMode = "now-playing" | "next-up" | "event-end" | "wrap";

const displayMode = computed((): DisplayMode => {
  void tick.value;
  if (currentItem.value) return "now-playing";
  if (nextItem.value) return "next-up";
  if (config.value && new Date(config.value.event_end).getTime() > now())
    return "event-end";
  return "wrap";
});

const mainCountdown = computed((): CountdownParts | null => {
  void tick.value;
  if (displayMode.value === "now-playing" && currentItem.value?.ends_at)
    return countdown(currentItem.value.ends_at);
  if (displayMode.value === "next-up" && nextItem.value)
    return countdown(nextItem.value.starts_at);
  if (displayMode.value === "event-end" && config.value)
    return countdown(config.value.event_end);
  return null;
});

const eventEndCountdown = computed((): CountdownParts | null => {
  void tick.value;
  return config.value ? countdown(config.value.event_end) : null;
});

const activeItem = computed(() =>
  displayMode.value === "now-playing" ? currentItem.value : nextItem.value,
);

const activeItemTime = computed((): string => {
  const item = activeItem.value;
  if (!item) return "";
  const day = sofiaFmt(item.starts_at, { weekday: "long" });
  const time = sofiaFmt(item.starts_at, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${time}`;
});

const currentAnnouncement = computed(() => {
  if (!announcements.value.length) return null;
  return announcements.value[
    announcementIndex.value % announcements.value.length
  ];
});

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let announcementInterval: ReturnType<typeof setInterval> | null = null;
let eventSource: EventSource | null = null;

function startAnnouncementCycle() {
  if (announcementInterval) clearInterval(announcementInterval);
  announcementIndex.value = 0;
  announcementInterval = setInterval(() => {
    if (announcements.value.length > 1) {
      announcementIndex.value =
        (announcementIndex.value + 1) % announcements.value.length;
    }
  }, 6000);
}

onMounted(() => {
  countdownInterval = setInterval(() => {
    tick.value++;
  }, 1000);
  startAnnouncementCycle();

  eventSource = new EventSource("/api/live/stream");
  eventSource.onmessage = (e) => {
    try {
      const data: LiveData = JSON.parse(e.data);
      if (data.config != null) config.value = data.config;
      if (data.schedule != null) schedule.value = data.schedule;
      if (data.announcements != null) {
        const prevLen = announcements.value.length;
        announcements.value = data.announcements;
        if (data.announcements.length !== prevLen) startAnnouncementCycle();
      }
      if (data.serverTime)
        serverTimeOffset.value = Date.parse(data.serverTime) - Date.now();
    } catch {
      /* ignore malformed */
    }
  };
});

onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  if (announcementInterval) clearInterval(announcementInterval);
  if (eventSource) eventSource.close();
});
</script>

<template>
  <div
    class="font-cygrotesk flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8 overflow-hidden"
    :class="currentAnnouncement ? 'pb-28 sm:pb-24' : ''"
  >
    <main
      class="flex-1 flex flex-col items-center justify-center w-full overflow-y-auto gap-4 py-2"
    >
      <template v-if="displayMode !== 'wrap'">
        <div
          class="w-full max-w-5xl flex flex-col md:p-8 items-center justify-center py-6 md:py-10 gap-3 bg-base-100 border-4 border-primary shrink-0"
        >
          <div
            class="text-xs font-black uppercase"
            :class="displayMode === 'event-end' ? 'opacity-65' : 'text-primary'"
          >
            {{
              displayMode === "now-playing"
                ? "NOW PLAYING"
                : displayMode === "next-up"
                  ? "NEXT UP"
                  : "DEV TIME ENDS IN"
            }}
          </div>

          <div
            v-if="activeItem"
            class="text-2xl sm:text-4xl md:text-5xl font-black text-center px-8 leading-tight"
          >
            {{ activeItem.label.toUpperCase() }}
          </div>

          <div v-if="activeItem" class="text-sm opacity-60 tracking-wider">
            {{ activeItemTime }}
          </div>

          <div
            v-if="mainCountdown"
            class="flex flex-col sm:flex-row sm:items-end justify-center mt-2 sm:mt-4 gap-0 sm:gap-1 md:gap-3 w-full px-8 sm:px-0"
          >
            <div
              class="flex sm:flex-col items-center sm:items-center justify-between sm:justify-start gap-2 py-1 sm:py-0 border-b sm:border-b-0 last:border-b-0 border-primary/20"
            >
              <span
                class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60 w-10 sm:w-auto sm:order-last"
                >DAYS</span
              >
              <span
                class="text-[3.5rem] sm:text-[4.5rem] md:text-[5rem] lg:text-[7rem] font-black leading-none tabular-nums"
                >{{ mainCountdown.d }}</span
              >
            </div>
            <span
              class="hidden sm:block text-[3.5rem] md:text-[6rem] font-black leading-none pb-7 text-primary"
              >·</span
            >

            <div
              class="flex sm:flex-col items-center sm:items-center justify-between sm:justify-start gap-2 py-1 sm:py-0 border-b sm:border-b-0 last:border-b-0 border-primary/20"
            >
              <span
                class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60 w-10 sm:w-auto sm:order-last"
                >HRS</span
              >
              <span
                class="text-[3.5rem] sm:text-[4.5rem] md:text-[5rem] lg:text-[7rem] font-black leading-none tabular-nums"
                >{{ mainCountdown.h }}</span
              >
            </div>
            <span
              class="hidden sm:block text-[3.5rem] md:text-[6rem] font-black leading-none pb-7 text-primary"
              >·</span
            >

            <div
              class="flex sm:flex-col items-center sm:items-center justify-between sm:justify-start gap-2 py-1 sm:py-0 border-b sm:border-b-0 last:border-b-0 border-primary/20"
            >
              <span
                class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60 w-10 sm:w-auto sm:order-last"
                >MIN</span
              >
              <span
                class="text-[3.5rem] sm:text-[4.5rem] md:text-[5rem] lg:text-[7rem] font-black leading-none tabular-nums"
                >{{ mainCountdown.m }}</span
              >
            </div>
            <span
              class="hidden sm:block text-[3.5rem] md:text-[6rem] font-black leading-none pb-7 text-primary"
              >·</span
            >

            <div
              class="flex sm:flex-col items-center sm:items-center justify-between sm:justify-start gap-2 py-1 sm:py-0"
            >
              <span
                class="text-[0.6rem] tracking-[0.25em] uppercase opacity-60 w-10 sm:w-auto sm:order-last"
                >SEC</span
              >
              <span
                class="text-[3.5rem] sm:text-[4.5rem] md:text-[5rem] lg:text-[7rem] font-black leading-none tabular-nums"
                >{{ mainCountdown.s }}</span
              >
            </div>
          </div>
        </div>

        <div
          v-if="displayMode === 'now-playing' && nextItem"
          class="w-full max-w-5xl flex flex-col items-center px-8 py-3 gap-2 bg-base-100 border-2 border-primary shrink-0"
        >
          <span class="text-xs font-bold tracking-[0.25em] uppercase">
            <span class="opacity-60">NEXT UP —</span>
            {{ nextItem.label.toUpperCase() }}
          </span>
          <div class="flex items-center gap-2 md:gap-3">
            <span
              class="text-lg md:text-xl font-black tabular-nums text-primary"
              >{{ countdown(nextItem.starts_at).d }}</span
            >
            <span class="text-sm font-black opacity-40">D</span>
            <span class="text-lg md:text-xl font-black text-primary">·</span>
            <span
              class="text-lg md:text-xl font-black tabular-nums text-primary"
              >{{ countdown(nextItem.starts_at).h }}</span
            >
            <span class="text-sm font-black opacity-40">H</span>
            <span class="text-lg md:text-xl font-black text-primary">·</span>
            <span
              class="text-lg md:text-xl font-black tabular-nums text-primary"
              >{{ countdown(nextItem.starts_at).m }}</span
            >
            <span class="text-sm font-black opacity-40">M</span>
            <span class="text-lg md:text-xl font-black text-primary">·</span>
            <span
              class="text-lg md:text-xl font-black tabular-nums text-primary"
              >{{ countdown(nextItem.starts_at).s }}</span
            >
            <span class="text-sm font-black opacity-40">S</span>
          </div>
        </div>

        <div
          v-else-if="eventEndCountdown"
          class="w-full max-w-5xl flex flex-col items-center px-8 py-3 gap-2 bg-base-100 border-2 border-primary shrink-0"
        >
          <span class="text-xs font-bold tracking-[0.25em] uppercase opacity-60"
            >DEV TIME ENDS IN</span
          >
          <div class="flex items-end gap-1 md:gap-2">
            <div class="flex flex-col items-center gap-1">
              <span
                class="text-xl md:text-2xl font-black tabular-nums text-primary"
                >{{ eventEndCountdown.d }}</span
              >
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60"
                >DAYS</span
              >
            </div>
            <span class="text-xl font-black pb-4 text-primary">·</span>
            <div class="flex flex-col items-center gap-1">
              <span
                class="text-xl md:text-2xl font-black tabular-nums text-primary"
                >{{ eventEndCountdown.h }}</span
              >
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60"
                >HRS</span
              >
            </div>
            <span class="text-xl font-black pb-4 text-primary">·</span>
            <div class="flex flex-col items-center gap-1">
              <span
                class="text-xl md:text-2xl font-black tabular-nums text-primary"
                >{{ eventEndCountdown.m }}</span
              >
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60"
                >MIN</span
              >
            </div>
            <span class="text-xl font-black pb-4 text-primary">·</span>
            <div class="flex flex-col items-center gap-1">
              <span
                class="text-xl md:text-2xl font-black tabular-nums text-primary"
                >{{ eventEndCountdown.s }}</span
              >
              <span class="text-[0.55rem] tracking-widest uppercase opacity-60"
                >SEC</span
              >
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div
          class="w-full max-w-5xl flex flex-col items-center py-24 bg-base-100 border-2 border-primary shrink-0"
        >
          <div
            class="text-4xl sm:text-6xl font-black uppercase tracking-tight text-center px-4 text-primary"
          >
            THAT'S A WRAP
          </div>
          <div
            class="text-sm uppercase tracking-widest opacity-60 mt-4 font-bold"
          >
            Thanks for hacking with us.
          </div>
        </div>
      </template>
    </main>

    <footer
      v-if="currentAnnouncement"
      class="fixed bottom-0 inset-x-0 z-50 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-6 py-3 shrink-0 bg-base-100 border-2 border-primary"
    >
      <div class="flex items-center gap-3 sm:gap-4">
        <div
          class="px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-widest shrink-0 bg-primary text-black"
        >
          ANNOUNCE
        </div>
        <span
          class="text-xs opacity-60 shrink-0 tabular-nums font-bold sm:hidden"
        >
          {{ (announcementIndex % announcements.length) + 1 }}/{{
            announcements.length
          }}
        </span>
      </div>
      <span class="text-sm font-bold flex-1 truncate sm:whitespace-normal">{{
        currentAnnouncement.body
      }}</span>
      <span
        class="text-xs opacity-60 shrink-0 tabular-nums font-bold hidden sm:block"
      >
        {{ (announcementIndex % announcements.length) + 1 }}/{{
          announcements.length
        }}
      </span>
    </footer>
  </div>
</template>
