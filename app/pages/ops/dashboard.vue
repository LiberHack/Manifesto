<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();
const { data: me, refresh: refreshMe } = await useMe();

const showCreatedBanner = ref(route.query.created === "1");

// leader_id points at a registration, not an account.
const isLeader = computed(
  () => !!me.value?.team && me.value.team.leader_id === me.value.registration?.id,
);

// ── Profile edit ──────────────────────────────────────────────────────────────
const profileForm = reactive({
  dietary: me.value?.registration?.dietary ?? "",
  experience: (me.value?.registration?.experience ?? "") as
    | ""
    | "beginner"
    | "intermediate"
    | "experienced",
  public: me.value?.registration?.public ?? true,
});
const profileSaving = ref(false);
const profileMessage = ref("");

async function saveProfile() {
  profileSaving.value = true;
  profileMessage.value = "";
  try {
    await $fetch("/api/me/profile", {
      method: "PATCH",
      body: {
        dietary: profileForm.dietary,
        experience: profileForm.experience || null,
        public: profileForm.public,
      },
    });
    await refreshMe();
    profileMessage.value = "Saved!";
  } catch (e: any) {
    profileMessage.value = e.data?.message ?? "Something went wrong";
  }
  profileSaving.value = false;
}

// ── Team edit ─────────────────────────────────────────────────────────────────
const skillsWanted = ref<string[]>([]);
const teamDescription = ref("");
const teamSaving = ref(false);
const teamMessage = ref("");

watch(
  () => me.value?.team,
  (team) => {
    if (team) {
      skillsWanted.value = [...(team.skills_wanted ?? [])];
      teamDescription.value = team.description ?? "";
    }
  },
  { immediate: true },
);

async function saveTeam() {
  teamSaving.value = true;
  teamMessage.value = "";
  try {
    await $fetch(`/api/teams/${me.value.team.id}`, {
      method: "PATCH",
      body: { skills_wanted: skillsWanted.value, description: teamDescription.value },
    });
    teamMessage.value = "Saved!";
  } catch (e: any) {
    teamMessage.value = e.data?.message ?? "Something went wrong";
  }
  teamSaving.value = false;
}

// ── Leave team ────────────────────────────────────────────────────────────────
const leavingTeam = ref(false);
const showLeaveConfirm = ref(false);
const leaveMessage = ref("");
const teamMemberCount = ref<number | null>(null);
const leaveConfirmEl = ref<HTMLElement | null>(null);

watch(showLeaveConfirm, async (open) => {
  if (open) {
    if (me.value?.team?.id && teamMemberCount.value === null) {
      try {
        const team = await $fetch<{ members: unknown[] }>(`/api/teams/${me.value.team.id}`);
        teamMemberCount.value = team.members.length;
      } catch {
        teamMemberCount.value = 1;
      }
    }
    await nextTick();
    leaveConfirmEl.value?.focus();
  }
});

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

// ── Project repo ──────────────────────────────────────────────────────────────
const repoUrl = ref("");
const repoSaving = ref(false);
const repoMessage = ref("");

watch(
  () => me.value?.team,
  (team) => {
    if (team) repoUrl.value = team.github_url ?? "";
  },
  { immediate: true },
);

async function saveRepo() {
  repoSaving.value = true;
  repoMessage.value = "";
  try {
    await $fetch(`/api/teams/${me.value.team.id}/github-url`, {
      method: "PATCH",
      body: { github_url: repoUrl.value || null },
    });
    await refreshMe();
    repoMessage.value = "Saved!";
  } catch (e: any) {
    repoMessage.value = e.data?.message ?? "Something went wrong";
  }
  repoSaving.value = false;
}

// ── Invite link ───────────────────────────────────────────────────────────────
const copyingInvite = ref(false);
const rotatingInvite = ref(false);
const inviteCopyMessage = ref("");
const showRotateConfirm = ref(false);

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
    inviteCopyMessage.value = `Couldn't copy — here's the link: ${inviteUrl()}`;
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
  showRotateConfirm.value = false;
  setTimeout(() => { inviteCopyMessage.value = ""; }, 3000);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function logout() {
  await supabase.auth.signOut();
  router.push("/ops/login");
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 py-8 flex flex-col gap-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <h1 class="text-xl md:text-4xl font-black uppercase">Dashboard</h1>
      <div class="flex gap-3 items-center">
        <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase">> Teams</NuxtLink>
        <div class="w-px h-6 bg-base-content/20" />
        <button class="btn btn-ghost btn-sm" @click="logout">Logout</button>
      </div>
    </div>

    <div
      v-if="showCreatedBanner"
      role="status"
      class="alert border-2 border-primary bg-base-200 text-sm"
    >
      <span>Team created!</span>
      <button class="btn btn-ghost btn-xs" @click="showCreatedBanner = false">✕</button>
    </div>

    <!-- Profile -->
    <section v-if="me" id="profile" class="bg-base-100 p-6 md:p-8 flex flex-col gap-4 border-2 border-base-content/20">
      <h2 class="text-lg font-bold uppercase tracking-tight">Profile</h2>
      <div>
        <p class="mb-1"><strong>Name:</strong> {{ me.name }}</p>
        <p class="mb-2"><strong>Email:</strong> {{ me.email }}</p>
        <div class="flex flex-wrap gap-1">
          <span v-for="skill in me.registration?.skills ?? []" :key="skill" class="badge badge-outline">
            {{ skill }}
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <label class="form-control">
          <span class="label-text font-bold">Experience Level</span>
          <select v-model="profileForm.experience" class="select select-bordered w-full">
            <option value="">— not set —</option>
            <option value="beginner">Beginner — new to hacking / tech events</option>
            <option value="intermediate">Intermediate — comfortable building</option>
            <option value="experienced">Experienced — seasoned hacker</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text font-bold">Dietary Requirements</span>
          <input
            v-model="profileForm.dietary"
            type="text"
            maxlength="200"
            placeholder="e.g. vegetarian, gluten-free, none"
            class="input input-bordered w-full"
          />
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            :checked="!profileForm.public"
            type="checkbox"
            class="checkbox checkbox-primary mt-1 shrink-0"
            @change="profileForm.public = !($event.target as HTMLInputElement).checked"
          />
          <span class="text-sm leading-snug">Hide my profile from the public archive.</span>
        </label>

        <div
          v-if="profileMessage"
          class="text-sm"
          :role="profileMessage === 'Saved!' ? 'status' : 'alert'"
          aria-live="polite"
          :class="profileMessage === 'Saved!' ? 'text-success' : 'text-error'"
        >
          {{ profileMessage }}
        </div>

        <button
          class="btn btn-sm btn-primary font-black uppercase self-start"
          :disabled="profileSaving"
          @click="saveProfile"
        >
          {{ profileSaving ? "Saving…" : "Save Profile" }}
        </button>
      </div>
    </section>

    <!-- Has team -->
    <template v-if="me?.team">
      <section
        id="your-team"
        class="bg-base-100 p-6 md:p-8 flex flex-col gap-4 border-2 border-primary"
      >
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <h2 class="text-xl font-black uppercase tracking-tight">Your Team</h2>
          <button
            class="btn btn-ghost btn-xs text-error font-bold uppercase"
            :aria-expanded="showLeaveConfirm"
            @click="showLeaveConfirm = true"
          >
            Leave Team
          </button>
        </div>
        <NuxtLink :to="`/ops/teams/${me.team.id}`" class="link font-bold text-lg">
          {{ me.team.name }}
        </NuxtLink>

        <div
          v-if="showLeaveConfirm"
          ref="leaveConfirmEl"
          tabindex="-1"
          class="p-4 border border-error flex flex-col gap-3"
        >
          <p class="text-sm font-bold">
            <template v-if="teamMemberCount === null">Loading…</template>
            <template v-else-if="isLeader && teamMemberCount > 1">
              You're the leader. Leaving will transfer leadership to the next member.
            </template>
            <template v-else-if="isLeader">
              You're the only member. Leaving will delete the team.
            </template>
            <template v-else>Are you sure you want to leave {{ me.team.name }}?</template>
          </p>
          <div v-if="leaveMessage" role="alert" class="alert alert-error text-sm">{{ leaveMessage }}</div>
          <div class="flex gap-2">
            <button
              :disabled="leavingTeam"
              class="btn btn-error btn-sm font-black uppercase"
              @click="leaveTeam"
            >
              {{ leavingTeam ? "Leaving…" : "Confirm Leave" }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="showLeaveConfirm = false">Cancel</button>
          </div>
        </div>

        <section v-if="isLeader" id="edit-team" class="pt-4 border-t border-base-content/20 flex flex-col gap-3">
          <h3 class="text-sm font-bold uppercase tracking-wide opacity-70">Edit Team</h3>

          <label class="form-control">
            <span class="label-text font-bold">Description</span>
            <textarea
              v-model="teamDescription"
              maxlength="200"
              placeholder="What's your team about?"
              class="textarea textarea-bordered w-full"
              rows="3"
            />
          </label>

          <div class="form-control">
            <span class="label-text font-bold">Skills Wanted</span>
            <SkillPicker v-model="skillsWanted" :allow-create="true" />
          </div>

          <div
            v-if="teamMessage"
            class="text-sm"
            :role="teamMessage === 'Saved!' ? 'status' : 'alert'"
            aria-live="polite"
            :class="teamMessage === 'Saved!' ? 'text-success' : 'text-error'"
          >
            {{ teamMessage }}
          </div>

          <button
            class="btn btn-sm btn-primary font-black uppercase self-start"
            :disabled="teamSaving"
            @click="saveTeam"
          >
            {{ teamSaving ? "Saving…" : "Save Team" }}
          </button>
        </section>

        <section v-if="isLeader" id="pending-requests" class="pt-4 border-t border-base-content/20">
          <h3 class="text-sm font-bold uppercase tracking-wide opacity-70 mb-2">Pending requests</h3>
          <ManageRequests />
        </section>
      </section>

      <div class="grid gap-6 md:grid-cols-2">
        <section id="invite-link" class="bg-base-100 p-6 flex flex-col gap-3 border border-base-content/20">
          <h2 class="text-sm font-bold uppercase tracking-wide opacity-70">Invite Link</h2>
          <p class="text-sm opacity-60">
            Share this link to invite people directly to your team.
          </p>
          <div class="flex gap-2 flex-wrap">
            <button
              class="btn btn-outline btn-sm font-black uppercase"
              :disabled="copyingInvite"
              @click="copyInviteLink"
            >
              Copy Invite Link
            </button>
            <button
              v-if="isLeader"
              class="btn btn-ghost btn-sm font-black uppercase"
              :disabled="rotatingInvite"
              :aria-expanded="showRotateConfirm"
              @click="showRotateConfirm = true"
            >
              Rotate Link
            </button>
          </div>
          <div
            v-if="inviteCopyMessage"
            role="status"
            aria-live="polite"
            class="text-sm text-primary font-mono break-all"
          >
            {{ inviteCopyMessage }}
          </div>
          <div v-if="showRotateConfirm" class="p-3 border border-warning flex flex-col gap-2">
            <p class="text-sm font-bold">
              This will break the link for anyone who already has it. Continue?
            </p>
            <div class="flex gap-2">
              <button
                :disabled="rotatingInvite"
                class="btn btn-warning btn-sm font-black uppercase"
                @click="rotateInviteLink"
              >
                {{ rotatingInvite ? "Rotating…" : "Confirm Rotate" }}
              </button>
              <button class="btn btn-ghost btn-sm" @click="showRotateConfirm = false">Cancel</button>
            </div>
          </div>
        </section>

        <section id="project-repo" class="bg-base-100 p-6 flex flex-col gap-3 border border-base-content/20">
          <h2 class="text-sm font-bold uppercase tracking-wide opacity-70">Project Repo</h2>
          <p class="text-sm opacity-60">Link your team's GitHub repository.</p>
          <input
            v-model="repoUrl"
            type="text"
            maxlength="500"
            placeholder="https://github.com/your-team/your-project"
            class="input input-bordered w-full"
          />
          <div
            v-if="repoMessage"
            class="text-sm"
            :role="repoMessage === 'Saved!' ? 'status' : 'alert'"
            aria-live="polite"
            :class="repoMessage === 'Saved!' ? 'text-success' : 'text-error'"
          >
            {{ repoMessage }}
          </div>
          <button
            class="btn btn-sm btn-outline font-black uppercase self-start"
            :disabled="repoSaving"
            @click="saveRepo"
          >
            {{ repoSaving ? "Saving…" : "Save Repo" }}
          </button>
        </section>
      </div>
    </template>

    <section v-else id="no-team" class="bg-base-100 p-6 md:p-8 flex flex-col gap-3 border-2 border-base-content/20">
      <h2 class="text-lg font-bold uppercase tracking-tight">No Team Yet</h2>
      <div class="flex flex-col md:flex-row gap-3">
        <NuxtLink to="/ops/teams" class="btn btn-primary btn-sm font-black uppercase">
          Browse Teams
        </NuxtLink>
        <NuxtLink to="/ops/team/create" class="btn btn-outline btn-sm font-black uppercase">
          Form a Team
        </NuxtLink>
      </div>
    </section>

    <section v-if="me?.role === 'admin'" id="admin" class="bg-base-100 p-6 border-2 border-warning">
      <NuxtLink to="/ops/admin" class="btn btn-warning btn-sm font-black uppercase">
        Admin Panel
      </NuxtLink>
    </section>
  </main>
</template>
