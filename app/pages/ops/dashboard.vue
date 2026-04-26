<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

const supabase = useSupabaseClient();
const router = useRouter();
const { data: me, refresh: refreshMe } = await useFetch<any>("/api/me");

const isLeader = computed(() => me.value?.team?.leader_id === me.value?.id);

const skillsWanted = ref<string[]>([]);
const skillsSaving = ref(false);
const skillsMessage = ref("");

const leavingTeam = ref(false);
const showLeaveConfirm = ref(false);
const leaveMessage = ref("");
const teamMemberCount = ref<number | null>(null);

watch(showLeaveConfirm, async (open) => {
  if (open && me.value?.team?.id && teamMemberCount.value === null) {
    try {
      const team = await $fetch<{ members: unknown[] }>(`/api/teams/${me.value.team.id}`);
      teamMemberCount.value = team.members.length;
    } catch {
      teamMemberCount.value = 1;
    }
  }
});

const copyingInvite = ref(false);
const rotatingInvite = ref(false);
const inviteCopyMessage = ref("");

watch(
  () => me.value?.team?.skills_wanted,
  (val) => {
    if (val) skillsWanted.value = [...val];
  },
  { immediate: true },
);

async function saveSkills() {
  skillsSaving.value = true;
  skillsMessage.value = "";
  try {
    await $fetch(`/api/teams/${me.value.team.id}`, {
      method: "PATCH",
      body: { skills_wanted: skillsWanted.value },
    });
    skillsMessage.value = "Saved!";
  } catch (e: any) {
    skillsMessage.value = e.data?.message ?? "Something went wrong";
  }
  skillsSaving.value = false;
}

async function leaveTeam() {
  leavingTeam.value = true;
  leaveMessage.value = "";
  try {
    await $fetch("/api/me/team", { method: "DELETE" });
    showLeaveConfirm.value = false;
    teamMemberCount.value = null;
    await refreshMe();
  } catch (e: any) {
    leaveMessage.value = e.data?.message ?? "Something went wrong";
  }
  leavingTeam.value = false;
}

function inviteUrl() {
  return `${window.location.origin}/ops/invite/${me.value?.team?.invite_code}`;
}

async function copyInviteLink() {
  copyingInvite.value = true;
  inviteCopyMessage.value = "";
  try {
    await navigator.clipboard.writeText(inviteUrl());
    inviteCopyMessage.value = "Copied!";
  } catch {
    inviteCopyMessage.value = inviteUrl();
  }
  copyingInvite.value = false;
  setTimeout(() => { inviteCopyMessage.value = ""; }, 3000);
}

async function rotateInviteLink() {
  rotatingInvite.value = true;
  inviteCopyMessage.value = "";
  try {
    await $fetch(`/api/teams/${me.value.team.id}/rotate-invite`, { method: "POST" });
    await refreshMe();
    inviteCopyMessage.value = "Link rotated.";
  } catch (e: any) {
    inviteCopyMessage.value = e.data?.message ?? "Failed to rotate";
  }
  rotatingInvite.value = false;
  setTimeout(() => { inviteCopyMessage.value = ""; }, 3000);
}

async function logout() {
  await supabase.auth.signOut();
  router.push("/ops/login");
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 py-8 flex flex-col">
    <div class="bg-base-100 p-8 flex flex-col gap-8 border-primary border-2">
      <div class="flex items-center justify-between flex-wrap gap-8">
        <h1 class="text-4xl font-black uppercase">Dashboard</h1>
        <div class="flex gap-2 items-center">
          <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase">
            > Teams
          </NuxtLink>
          <button class="btn btn-ghost btn-sm" @click="logout">Logout</button>
        </div>
      </div>

      <section v-if="me">
        <h2 class="text-xl font-bold mb-2">Profile</h2>
        <p><strong>Name:</strong> {{ me.name }}</p>
        <p><strong>Email:</strong> {{ me.email }}</p>
        <div class="flex flex-wrap gap-1 mt-2">
          <span v-for="skill in me.skills" :key="skill" class="badge badge-outline">
            {{ skill }}
          </span>
        </div>
      </section>

      <section v-if="me?.team" class="space-y-8">
        <section>
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <h2 class="text-xl font-bold">Your Team</h2>
            <button class="btn btn-ghost btn-xs text-error font-bold uppercase" @click="showLeaveConfirm = true">
              Leave Team
            </button>
          </div>
          <NuxtLink :to="`/ops/teams/${me.team.id}`" class="link font-bold text-lg">
            {{ me.team.name }}
          </NuxtLink>

          <!-- Leave confirmation -->
          <div v-if="showLeaveConfirm" class="mt-4 p-4 border border-error flex flex-col gap-3">
            <p class="text-sm font-bold">
              <template v-if="teamMemberCount === null">Loading…</template>
              <template v-else-if="isLeader && teamMemberCount > 1">
                You're the leader. Leaving will transfer leadership to the next member.
              </template>
              <template v-else-if="isLeader">
                You're the only member. Leaving will delete the team.
              </template>
              <template v-else>
                Are you sure you want to leave {{ me.team.name }}?
              </template>
            </p>
            <div v-if="leaveMessage" class="alert alert-error text-sm">{{ leaveMessage }}</div>
            <div class="flex gap-2">
              <button :disabled="leavingTeam" class="btn btn-error btn-sm font-black uppercase" @click="leaveTeam">
                {{ leavingTeam ? "Leaving…" : "Confirm Leave" }}
              </button>
              <button class="btn btn-ghost btn-sm" @click="showLeaveConfirm = false">Cancel</button>
            </div>
          </div>
        </section>

        <section v-if="isLeader">
          <h2 class="text-xl font-bold mb-2">Skills Wanted</h2>
          <SkillPicker v-model="skillsWanted" :allow-create="true" class="mb-3" />
          <div v-if="skillsMessage" class="text-sm mb-2"
            :class="skillsMessage === 'Saved!' ? 'text-success' : 'text-error'">
            {{ skillsMessage }}
          </div>
          <button class="btn btn-sm btn-outline font-black uppercase" :disabled="skillsSaving" @click="saveSkills">
            {{ skillsSaving ? "Saving…" : "Save Skills" }}
          </button>
        </section>

        <section v-if="isLeader">
          <h2 class="text-xl font-bold mb-2">Pending requests</h2>
          <ManageRequests />
        </section>

        <!-- Invite link -->
        <section>
          <h2 class="text-xl font-bold mb-3">Invite Link</h2>
          <p class="text-sm opacity-60 mb-3">Share this link to invite people directly to your team.</p>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-outline btn-sm font-black uppercase" :disabled="copyingInvite"
              @click="copyInviteLink">
              Copy Invite Link
            </button>
            <button v-if="isLeader" class="btn btn-ghost btn-sm font-black uppercase" :disabled="rotatingInvite"
              @click="rotateInviteLink">
              {{ rotatingInvite ? "Rotating…" : "Rotate Link" }}
            </button>
          </div>
          <p v-if="inviteCopyMessage" class="text-sm mt-2 text-primary font-mono break-all">
            {{ inviteCopyMessage }}
          </p>
        </section>

      </section>

      <section v-else-if="!me?.team">
        <h2 class="text-xl font-bold mb-2">No Team Yet</h2>
        <div class="flex gap-3">
          <NuxtLink to="/ops/teams" class="btn btn-primary btn-sm font-black uppercase">
            Browse Teams
          </NuxtLink>
          <NuxtLink to="/ops/team/create" class="btn btn-outline btn-sm font-black uppercase">
            Form a Team
          </NuxtLink>
        </div>
      </section>

      <section v-if="me?.role === 'admin'">
        <NuxtLink to="/ops/admin" class="btn btn-warning btn-sm font-black uppercase">
          Admin Panel
        </NuxtLink>
      </section>
    </div>
  </main>
</template>
