<script setup lang="ts">
import {
  CONTRIBUTION_ROLES,
  CONTRIBUTION_ROLE_LABELS,
  type ContributionRole,
  type PublicProfile,
} from "#shared/teamFormation";

definePageMeta({ middleware: ["auth"] });

interface LookingProfile extends PublicProfile {
  open_request: "application" | "invitation" | null;
}

interface Suggestion {
  profile: PublicProfile;
  reasons: string[];
  evidence: "none" | "weak" | "some";
}

const { data: me } = await useMe();
const teamId = computed(() => me.value?.team?.id ?? "");

const [{ data: people, error: loadError, refresh }, { data: suggested, refresh: refreshSuggested }] =
  await Promise.all([
    useFetch<LookingProfile[]>("/api/participants/looking", { default: () => [] }),
    useFetch<{ suggestions: Suggestion[]; reason?: string }>("/api/recommendations/candidates", {
      default: () => ({ suggestions: [] }),
    }),
  ]);

const roleFilter = ref<ContributionRole | "">("");
const visible = computed(() =>
  roleFilter.value
    ? people.value.filter((p) => p.preferred_roles.includes(roleFilter.value as ContributionRole))
    : people.value,
);

// "s:<id>" for a suggestion card, "l:<id>" for the full list.
const inviting = ref<string | null>(null);
const notice = ref("");

async function onSent(name: string) {
  inviting.value = null;
  notice.value = `Invitation sent to ${name}.`;
  await Promise.all([refresh(), refreshSuggested()]);
}

async function dismiss(candidateId: string) {
  await $fetch("/api/recommendations/dismiss", { method: "POST", body: { candidate_id: candidateId } });
  await refreshSuggested();
}
</script>

<template>
  <main class="w-full max-w-3xl min-w-0 mx-auto p-4 sm:p-6 my-8 space-y-6 bg-base-100 border-2 border-primary">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-xl md:text-4xl font-black uppercase">People looking for a team</h1>
      <NuxtLink to="/ops/dashboard" class="btn btn-outline btn-sm font-black uppercase">> Dashboard</NuxtLink>
    </div>

    <p v-if="loadError" role="alert" class="alert alert-warning text-sm">
      {{ loadError.data?.message ?? "Only team leaders can browse this list." }}
    </p>

    <template v-else>
      <p class="text-sm opacity-70">
        Everyone here chose to be found by teams. Invitations need their acceptance,
        and nobody's contact details are shown.
      </p>
      <p v-if="notice" role="status" class="alert alert-success text-sm">{{ notice }}</p>

      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-bold">Suggested for your team</h2>
        <p v-if="suggested.reason === 'not_recruiting'" class="text-sm opacity-60">
          Your team isn't recruiting. Turn recruiting on in your dashboard to get suggestions.
        </p>
        <p v-else-if="suggested.reason === 'full'" class="text-sm opacity-60">Your team has no open places.</p>
        <p v-else-if="!suggested.suggestions.length" class="text-sm opacity-60">
          No suggestions right now — try the full list below.
        </p>
        <div
          v-for="s in suggested.suggestions"
          :key="s.profile.registration_id"
          class="p-4 border border-primary flex flex-col gap-3"
        >
          <ProfileCard :profile="s.profile" />
          <ul v-if="s.reasons.length" class="text-xs list-disc pl-4">
            <li v-for="r in s.reasons" :key="r">{{ r }}</li>
          </ul>
          <p v-else class="text-xs opacity-60">Not enough profile information to compare yet.</p>
          <InviteForm
            v-if="inviting === `s:${s.profile.registration_id}`"
            :team-id="teamId"
            :registration-id="s.profile.registration_id"
            recommended
            @sent="onSent(s.profile.name)"
            @cancel="inviting = null"
          />
          <div v-else class="flex flex-wrap gap-2">
            <button class="btn btn-outline btn-sm font-black uppercase" @click="inviting = `s:${s.profile.registration_id}`">
              Invite
            </button>
            <button class="btn btn-ghost btn-sm" @click="dismiss(s.profile.registration_id)">Not a fit</button>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-bold">Everyone looking</h2>
        <label class="form-control max-w-xs">
          <span class="label-text font-bold">Filter by role</span>
          <select v-model="roleFilter" class="select select-bordered select-sm">
            <option value="">Any role</option>
            <option v-for="role in CONTRIBUTION_ROLES" :key="role" :value="role">
              {{ CONTRIBUTION_ROLE_LABELS[role] }}
            </option>
          </select>
        </label>

        <p v-if="!visible.length" class="opacity-60">Nobody matches right now.</p>

        <ul class="flex flex-col gap-4">
          <li
            v-for="person in visible"
            :key="person.registration_id"
            class="p-4 border border-base-content/20 flex flex-col gap-3"
          >
            <ProfileCard :profile="person" />
            <p v-if="person.open_request" class="text-xs opacity-60">
              {{ person.open_request === "invitation" ? "Invitation pending." : "They applied to your team — see your dashboard." }}
            </p>
            <InviteForm
              v-else-if="inviting === `l:${person.registration_id}`"
              :team-id="teamId"
              :registration-id="person.registration_id"
              @sent="onSent(person.name)"
              @cancel="inviting = null"
            />
            <button
              v-else
              class="btn btn-outline btn-sm self-start font-black uppercase"
              @click="inviting = `l:${person.registration_id}`"
            >
              Invite to your team
            </button>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
