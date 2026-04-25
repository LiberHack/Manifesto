<script setup lang="ts">
definePageMeta({ middleware: [] });

const route = useRoute();
const router = useRouter();
const user = useSupabaseUser();
const code = route.params.code as string;

const { data: team, error: teamError } = await useFetch<any>(`/api/invite/${code}`);

if (teamError.value?.statusCode === 404) {
  throw createError({ statusCode: 404, message: "Invite link not found or expired." });
}

const { data: me, refresh: refreshMe } = await useFetch<any>("/api/me", {
  default: () => null,
});

const joining = ref(false);
const message = ref("");
const needsConfirmSwitch = ref(false);

const isMember = computed(() => me.value?.team?.id === team.value?.id);
const isInOtherTeam = computed(() => !!me.value?.team && me.value.team.id !== team.value?.id);

async function join(confirmSwitch = false) {
  joining.value = true;
  message.value = "";
  try {
    await $fetch(`/api/invite/${code}/accept`, {
      method: "POST",
      body: confirmSwitch ? { confirm_switch: true } : {},
    });
    await refreshMe();
    router.push("/ops/dashboard");
  } catch (e: any) {
    if (e.data?.message === "already_in_team") {
      needsConfirmSwitch.value = true;
    } else {
      message.value = e.data?.message ?? "Something went wrong";
    }
  }
  joining.value = false;
}
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4 py-12">
    <div class="w-full max-w-md flex flex-col gap-4 bg-base-100 p-8 border-primary border-2">

      <p class="text-xs font-bold tracking-widest text-primary uppercase">Team Invite</p>

      <template v-if="team">
        <h1 class="text-3xl font-black uppercase tracking-tight">{{ team.name }}</h1>
        <p v-if="team.description" class="opacity-70 text-sm">{{ team.description }}</p>

        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="skill in team.skills_wanted"
            :key="skill"
            class="badge badge-outline text-xs"
          >{{ skill }}</span>
        </div>

        <p class="text-xs opacity-50">{{ team.member_count }}/6 members</p>

        <div v-if="message" role="alert" class="alert alert-error text-sm">{{ message }}</div>

        <!-- Not logged in -->
        <template v-if="!user">
          <p class="text-sm opacity-70">Register or log in to join this team.</p>
          <div class="flex flex-col gap-2">
            <NuxtLink
              :to="`/ops/register?invite=${code}`"
              class="btn btn-primary font-black uppercase"
            >
              Register to Join
            </NuxtLink>
            <NuxtLink
              :to="`/ops/login?invite=${code}`"
              class="btn btn-outline font-black uppercase"
            >
              Log In
            </NuxtLink>
          </div>
        </template>

        <!-- Already a member -->
        <template v-else-if="isMember">
          <p class="font-bold text-success">You're already in this team.</p>
          <NuxtLink to="/ops/dashboard" class="btn btn-outline btn-sm font-black uppercase">
            Go to Dashboard
          </NuxtLink>
        </template>

        <!-- Needs to switch teams — confirmation step -->
        <template v-else-if="needsConfirmSwitch">
          <div class="alert alert-warning text-sm">
            <strong>You're already in a team.</strong> Joining <strong>{{ team.name }}</strong> will remove you from your current team.
          </div>
          <div class="flex gap-2">
            <button
              :disabled="joining"
              class="btn btn-error font-black uppercase"
              @click="join(true)"
            >
              {{ joining ? "Switching…" : "Switch Teams" }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="needsConfirmSwitch = false">Cancel</button>
          </div>
        </template>

        <!-- Logged in, no team -->
        <template v-else>
          <button
            :disabled="joining"
            class="btn btn-primary font-black uppercase"
            @click="join(false)"
          >
            {{ joining ? "Joining…" : `Join ${team.name}` }}
          </button>
        </template>
      </template>

    </div>
  </main>
</template>
