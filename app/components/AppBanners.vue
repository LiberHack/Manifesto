<script setup lang="ts">
import {
  shouldShowAnnouncement,
  sortAnnouncements,
  type Announcement,
} from "~/composables/useAnnouncementAudience";

const DISMISSED_KEY = "dismissed_announcements";

const route = useRoute();

const onOpsRoute = computed(() => route.path.startsWith("/ops"));

const { data: announcements } = await useFetch<Announcement[]>(
  "/api/announcements",
  { key: "announcements", default: () => [] },
);

// Shared with the rest of the app; resolves to null without a request when
// nobody is signed in, so public pages pay nothing for it. Only `ops` rows
// consult it — see shouldShowAnnouncement.
const { data: me } = await useMe();

// SSR renders nothing dismissible-dependent, so the list is read on mount.
const dismissed = ref<string[]>([]);

onMounted(() => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      dismissed.value = parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // Unreadable or malformed storage just means nothing is dismissed yet.
    dismissed.value = [];
  }
});

const visible = computed(() =>
  sortAnnouncements(
    (announcements.value ?? []).filter(
      (row) =>
        shouldShowAnnouncement(row, me.value, onOpsRoute.value) &&
        !(row.dismissible && dismissed.value.includes(row.id)),
    ),
  ),
);

function dismiss(id: string) {
  if (dismissed.value.includes(id)) return;
  dismissed.value = [...dismissed.value, id];
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.value));
  } catch {
    // Dismissal just does not persist when storage is unavailable.
  }
}
</script>

<template>
  <div
    v-for="announcement in visible"
    :key="announcement.id"
    class="flex justify-between items-start gap-3 border-b-2 bg-base-100 text-sm font-bold py-2 px-4"
    :class="announcement.variant === 'warning' ? 'border-warning' : 'border-primary'"
  >
    <span>
      {{ announcement.body }}
      <NuxtLink v-if="announcement.href" :to="announcement.href" class="underline">
        →
      </NuxtLink>
    </span>
    <button
      v-if="announcement.dismissible"
      class="btn btn-ghost btn-xs shrink-0"
      :aria-label="`Dismiss: ${announcement.body}`"
      @click="dismiss(announcement.id)"
    >
      ✕
    </button>
  </div>
</template>
