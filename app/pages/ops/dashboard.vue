<script setup lang="ts">
import {
  CONTACT_METHOD_LABELS,
  contactFormFrom,
  profileFormFrom,
  recruitmentFormFrom,
  type ContactForm,
  type ContactMethod,
  type ProfileForm,
  type RecruitmentForm,
} from "#shared/teamFormation";

definePageMeta({ middleware: ["auth"] });

const supabase = useSupabaseClient();
const router = useRouter();
const { data: me, refresh: refreshMe } = await useMe();
const { unreadTotal } = await useConversations();

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
const profileSkills = ref<string[]>([...(me.value?.registration?.skills ?? [])]);
const matchingProfile = ref<ProfileForm>(profileFormFrom(me.value?.registration));
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
        skills: profileSkills.value,
        ...matchingProfile.value,
      },
    });
    await refreshMe();
    profileMessage.value = "Saved!";
  } catch (e: any) {
    profileMessage.value = e.data?.message ?? "Something went wrong";
  }
  profileSaving.value = false;
}

// ── Completion prompt ─────────────────────────────────────────────────────────
// Participants who registered before these fields existed finish them here.
const missingContact = computed(() => me.value?.registration?.contact_complete === false);
const missingMatching = computed(
  () => !!me.value?.registration && !me.value.team && me.value.registration.matching_status === null,
);

// ── Contact ───────────────────────────────────────────────────────────────────
interface OwnContact {
  method: ContactMethod;
  handle: string | null;
  other_label: string | null;
  share_with_team: boolean;
  reachable_confirmed_at: string | null;
}
const { data: savedContact, refresh: refreshContact } = await useFetch<OwnContact | null>(
  "/api/me/contact",
);
const contactForm = ref<ContactForm>(contactFormFrom(savedContact.value));
const contactSaving = ref(false);
const contactMessage = ref("");

async function saveContact() {
  contactSaving.value = true;
  contactMessage.value = "";
  try {
    await $fetch("/api/me/contact", { method: "PUT", body: contactForm.value });
    await Promise.all([refreshContact(), refreshMe()]);
    contactMessage.value = "Saved!";
  } catch (e: any) {
    contactMessage.value = e.data?.message ?? "Something went wrong";
  }
  contactSaving.value = false;
}

// ── Team edit ─────────────────────────────────────────────────────────────────
const skillsWanted = ref<string[]>([]);
const teamDescription = ref("");
const recruitment = ref<RecruitmentForm>(recruitmentFormFrom(null));
const memberCount = ref(1);
const teamSaving = ref(false);
const teamMessage = ref("");

watch(
  () => me.value?.team,
  (team) => {
    if (team) {
      skillsWanted.value = [...(team.skills_wanted ?? [])];
      teamDescription.value = team.description ?? "";
      recruitment.value = recruitmentFormFrom(team);
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
      body: {
        skills_wanted: skillsWanted.value,
        description: teamDescription.value,
        ...recruitment.value,
      },
    });
    await refreshMe();
    teamMessage.value = "Saved!";
  } catch (e: any) {
    teamMessage.value = e.data?.message ?? "Something went wrong";
  }
  teamSaving.value = false;
}

if (me.value?.team?.id && isLeader.value) {
  const { data: teamDetail } = await useFetch<{ members: unknown[] }>(
    `/api/teams/${me.value.team.id}`,
  );
  memberCount.value = teamDetail.value?.members.length ?? 1;
}

// ── Leave team ────────────────────────────────────────────────────────────────
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

// ── Auth ──────────────────────────────────────────────────────────────────────
async function logout() {
  await supabase.auth.signOut();
  router.push("/ops/login");
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 py-8 flex flex-col">
    <div class="bg-base-100 p-8 flex flex-col gap-8 border-primary border-2">

      <div class="flex items-center justify-between flex-wrap gap-8">
        <h1 class="text-xl md:text-4xl font-black uppercase">Dashboard</h1>
        <div class="flex gap-2 items-center">
          <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase">> Teams</NuxtLink>
          <NuxtLink to="/ops/messages" class="btn btn-outline font-black uppercase">
            > Messages
            <span v-if="unreadTotal" class="badge badge-primary" :aria-label="`${unreadTotal} unread`">{{ unreadTotal }}</span>
          </NuxtLink>
          <button class="btn btn-ghost btn-sm" @click="logout">Logout</button>
        </div>
      </div>

      <div v-if="missingContact || missingMatching" role="status" class="alert alert-warning flex flex-col items-start gap-1">
        <strong>Finish your profile for this edition</strong>
        <a v-if="missingContact" href="#contact" class="link text-sm">
          Add a preferred contact so organizers can reach you →
        </a>
        <a v-if="missingMatching" href="#profile" class="link text-sm">
          Tell us whether you're looking for a team →
        </a>
      </div>

      <!-- Profile -->
      <section v-if="me" id="profile">
        <h2 class="text-xl font-bold mb-3">Profile</h2>
        <p class="mb-1"><strong>Name:</strong> {{ me.name }}</p>
        <p class="mb-2"><strong>Email:</strong> {{ me.email }}</p>
        <div class="flex flex-col gap-3">
          <div class="form-control">
            <span class="label-text font-bold">Skills</span>
            <SkillPicker v-model="profileSkills" allow-create />
          </div>

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

          <div class="divider my-1" />
          <ProfileFields v-model="matchingProfile" />

          <div
            v-if="profileMessage"
            class="text-sm"
            :class="profileMessage === 'Saved!' ? 'text-success' : 'text-error'"
          >
            {{ profileMessage }}
          </div>

          <button
            class="btn btn-sm btn-outline font-black uppercase"
            :disabled="profileSaving"
            @click="saveProfile"
          >
            {{ profileSaving ? "Saving…" : "Save Profile" }}
          </button>
        </div>
      </section>

      <section v-if="me?.registration" id="contact" class="flex flex-col gap-3">
        <h2 class="text-xl font-bold">Contact</h2>
        <p v-if="savedContact" class="text-sm">
          <strong>{{ CONTACT_METHOD_LABELS[savedContact.method] }}</strong>
          <template v-if="savedContact.handle"> · {{ savedContact.handle }}</template>
          <span v-if="savedContact.reachable_confirmed_at" class="badge badge-success badge-sm ml-2">
            Confirmed by organizers
          </span>
        </p>
        <ContactFields v-model="contactForm" />
        <div
          v-if="contactMessage"
          class="text-sm"
          :class="contactMessage === 'Saved!' ? 'text-success' : 'text-error'"
        >
          {{ contactMessage }}
        </div>
        <button
          class="btn btn-sm btn-outline font-black uppercase"
          :disabled="contactSaving || !contactForm.method"
          @click="saveContact"
        >
          {{ contactSaving ? "Saving…" : "Save Contact" }}
        </button>
      </section>

      <MyProposals v-if="me?.registration && !me.team" @changed="refreshMe" />

      <section v-if="me?.registration" id="my-requests">
        <h2 class="text-xl font-bold mb-3">Applications &amp; invitations</h2>
        <MyRequests @joined="refreshMe" />
      </section>

      <!-- Has team -->
      <section v-if="me?.team" class="space-y-8">
        <section id="your-team">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <h2 class="text-xl font-bold">Your Team</h2>
            <button
              class="btn btn-ghost btn-xs text-error font-bold uppercase"
              @click="showLeaveConfirm = true"
            >
              Leave Team
            </button>
          </div>
          <NuxtLink :to="`/ops/teams/${me.team.id}`" class="link font-bold text-lg">
            {{ me.team.name }}
          </NuxtLink>
          <NuxtLink to="/ops/messages" class="link text-sm ml-3">Team chat →</NuxtLink>

          <div v-if="showLeaveConfirm" class="mt-4 p-4 border border-error flex flex-col gap-3">
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
            <div v-if="leaveMessage" class="alert alert-error text-sm">{{ leaveMessage }}</div>
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
        </section>

        <section v-if="isLeader" id="edit-team">
          <h2 class="text-xl font-bold mb-3">Edit Team</h2>

          <label class="form-control mb-3">
            <span class="label-text font-bold">Description</span>
            <textarea
              v-model="teamDescription"
              maxlength="200"
              placeholder="What's your team about?"
              class="textarea textarea-bordered w-full"
              rows="3"
            />
          </label>

          <div class="form-control mb-3">
            <span class="label-text font-bold">Skills Wanted</span>
            <SkillPicker v-model="skillsWanted" :allow-create="true" />
          </div>

          <TeamRecruitmentFields v-model="recruitment" :member-count="memberCount" />

          <div
            v-if="teamMessage"
            class="text-sm mb-2"
            :class="teamMessage === 'Saved!' ? 'text-success' : 'text-error'"
          >
            {{ teamMessage }}
          </div>

          <button
            class="btn btn-sm btn-outline font-black uppercase mt-3"
            :disabled="teamSaving"
            @click="saveTeam"
          >
            {{ teamSaving ? "Saving…" : "Save Team" }}
          </button>
        </section>

        <section v-if="isLeader" id="pending-requests">
          <div class="flex items-center justify-between gap-4 flex-wrap mb-2">
            <h2 class="text-xl font-bold">Pending requests</h2>
            <NuxtLink to="/ops/people" class="btn btn-outline btn-xs font-black uppercase">
              Find people to invite
            </NuxtLink>
          </div>
          <ManageRequests :team-id="me.team.id" @changed="refreshMe" />
        </section>

        <section id="invite-link">
          <h2 class="text-xl font-bold mb-3">Invite Link</h2>
          <p class="text-sm opacity-60 mb-3">
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
              @click="rotateInviteLink"
            >
              {{ rotatingInvite ? "Rotating…" : "Rotate Link" }}
            </button>
          </div>
          <p v-if="inviteCopyMessage" class="text-sm mt-2 text-primary font-mono break-all">
            {{ inviteCopyMessage }}
          </p>
        </section>

        <section id="project-repo">
          <h2 class="text-xl font-bold mb-3">Project Repo</h2>
          <p class="text-sm opacity-60 mb-3">Link your team's GitHub repository.</p>
          <input
            v-model="repoUrl"
            type="text"
            maxlength="500"
            placeholder="https://github.com/your-team/your-project"
            class="input input-bordered w-full mb-3"
          />
          <div
            v-if="repoMessage"
            class="text-sm mb-2"
            :class="repoMessage === 'Saved!' ? 'text-success' : 'text-error'"
          >
            {{ repoMessage }}
          </div>
          <button
            class="btn btn-sm btn-outline font-black uppercase"
            :disabled="repoSaving"
            @click="saveRepo"
          >
            {{ repoSaving ? "Saving…" : "Save Repo" }}
          </button>
        </section>
      </section>
      <section v-else id="no-team" class="flex flex-col gap-3">
        <h2 class="text-xl font-bold">No Team Yet</h2>
        <SuggestedTeams
          :help-requested-at="me?.registration?.organizer_help_requested_at ?? null"
          @changed="refreshMe"
        />
        <NuxtLink to="/ops/team/create" class="btn btn-outline btn-sm font-black uppercase self-start">
          Form a Team
        </NuxtLink>
      </section>

      <section v-if="me?.role === 'admin'" id="admin">
        <NuxtLink to="/ops/admin" class="btn btn-warning btn-sm font-black uppercase">
          Admin Panel
        </NuxtLink>
      </section>

    </div>
  </main>
</template>
