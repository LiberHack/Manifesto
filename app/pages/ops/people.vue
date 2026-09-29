<script setup lang="ts">
import {
  CONTRIBUTION_ROLES,
  CONTRIBUTION_ROLE_LABELS,
  REQUEST_MESSAGE_MAX_LENGTH,
  REQUEST_MESSAGE_MIN_LENGTH,
  type ContributionRole,
  type PublicProfile,
} from "#shared/teamFormation";

definePageMeta({ middleware: ["auth"] });

interface LookingProfile extends PublicProfile {
  open_request: "application" | "invitation" | null;
}

const { data: me } = await useMe();
const teamId = computed(() => me.value?.team?.id);

const { data: people, error: loadError, refresh } = await useFetch<LookingProfile[]>(
  "/api/participants/looking",
  { default: () => [] },
);

const roleFilter = ref<ContributionRole | "">("");
const visible = computed(() =>
  roleFilter.value
    ? people.value.filter((p) => p.preferred_roles.includes(roleFilter.value as ContributionRole))
    : people.value,
);

const inviting = ref<string | null>(null);
const inviteMessage = ref("");
const sending = ref(false);
const feedback = ref<{ id: string; text: string; ok: boolean } | null>(null);

const messageLength = computed(() => inviteMessage.value.trim().length);
const messageValid = computed(
  () =>
    messageLength.value >= REQUEST_MESSAGE_MIN_LENGTH &&
    messageLength.value <= REQUEST_MESSAGE_MAX_LENGTH,
);

function startInvite(id: string) {
  inviting.value = id;
  inviteMessage.value = "";
  feedback.value = null;
}

async function sendInvite(id: string) {
  sending.value = true;
  try {
    await $fetch(`/api/teams/${teamId.value}/invitations`, {
      method: "POST",
      body: { registration_id: id, message: inviteMessage.value },
    });
    feedback.value = { id, text: "Invitation sent.", ok: true };
    inviting.value = null;
    await refresh();
  } catch (e: any) {
    feedback.value = { id, text: e.data?.message ?? "Something went wrong", ok: false };
  }
  sending.value = false;
}
</script>

<template>
  <main class="max-w-3xl mx-auto p-6 my-8 space-y-6 bg-base-100 border-2 border-primary">
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
        <li v-for="person in visible" :key="person.registration_id" class="p-4 border border-base-content/20 flex flex-col gap-3">
          <ProfileCard :profile="person" />

          <p
            v-if="feedback?.id === person.registration_id"
            class="text-sm"
            :class="feedback.ok ? 'text-success' : 'text-error'"
          >
            {{ feedback.text }}
          </p>

          <p v-if="person.open_request" class="text-xs opacity-60">
            {{ person.open_request === "invitation" ? "Invitation pending." : "They applied to your team — see your dashboard." }}
          </p>

          <form
            v-else-if="inviting === person.registration_id"
            class="flex flex-col gap-2"
            @submit.prevent="sendInvite(person.registration_id)"
          >
            <textarea
              v-model="inviteMessage"
              rows="3"
              :maxlength="REQUEST_MESSAGE_MAX_LENGTH"
              placeholder="Why your team, and what you'd work on together"
              class="textarea textarea-bordered w-full"
            />
            <span class="text-xs" :class="messageValid ? 'opacity-60' : 'text-warning'">
              {{ messageLength }}/{{ REQUEST_MESSAGE_MAX_LENGTH }} (at least {{ REQUEST_MESSAGE_MIN_LENGTH }})
            </span>
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary btn-sm font-black" :disabled="sending || !messageValid">
                {{ sending ? "Sending…" : "Send invitation" }}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" @click="inviting = null">Cancel</button>
            </div>
          </form>

          <button
            v-else
            class="btn btn-outline btn-sm self-start font-black uppercase"
            @click="startInvite(person.registration_id)"
          >
            Invite to your team
          </button>
        </li>
      </ul>
    </template>
  </main>
</template>
