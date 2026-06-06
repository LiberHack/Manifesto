<script setup lang="ts">
const route = useRoute();
const user = useSupabaseUser();

const onOpsRoute = computed(() => route.path.startsWith("/ops"));

const { data: me } = await useFetch<any>(
  () => (user.value && onOpsRoute.value ? "/api/me" : null),
  { key: `banners-me-${user.value?.id}` },
);

const isLeader = computed(() => me.value?.team?.leader_id === me.value?.id);

const profileBannerDismissed = ref(true);
const teamEditBannerDismissed = ref(true);

onMounted(() => {
  profileBannerDismissed.value = !!localStorage.getItem(
    "profile_banner_dismissed",
  );
  teamEditBannerDismissed.value = !!localStorage.getItem(
    "team_edit_banner_dismissed",
  );
});

const showProfileBanner = computed(
  () =>
    !profileBannerDismissed.value &&
    !!me.value &&
    (me.value.dietary == null || me.value.experience == null),
);

const showTeamEditBanner = computed(
  () => !teamEditBannerDismissed.value && isLeader.value,
);

function dismissProfileBanner() {
  profileBannerDismissed.value = true;
  localStorage.setItem("profile_banner_dismissed", "1");
}

function dismissTeamEditBanner() {
  teamEditBannerDismissed.value = true;
  localStorage.setItem("team_edit_banner_dismissed", "1");
}
</script>

<template>
  <div
    v-if="showProfileBanner"
    class="flex justify-between items-start gap-3 border-b-2 border-warning bg-base-100 text-sm font-bold py-2 px-4"
  >
    <span>
      Missing profile info — Help us plan catering and workshops by filling in
      your
      <NuxtLink to="/ops/dashboard" class="underline"
        >dietary requirements and experience level</NuxtLink
      >.
    </span>
    <button class="btn btn-ghost btn-xs shrink-0" @click="dismissProfileBanner">
      ✕
    </button>
  </div>

  <div
    v-if="showTeamEditBanner"
    class="flex justify-between items-start gap-3 border-b-2 border-primary bg-base-100 text-sm font-bold py-2 px-4"
  >
    <span>
      New: You can now edit your team's description and wanted skills from the
      <NuxtLink to="/ops/dashboard" class="underline">dashboard</NuxtLink>.
    </span>
    <button
      class="btn btn-ghost btn-xs shrink-0"
      @click="dismissTeamEditBanner"
    >
      ✕
    </button>
  </div>
</template>
