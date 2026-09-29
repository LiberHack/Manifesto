<script setup lang="ts">
import {
  CONTACT_METHOD_LABELS,
  CONTRIBUTION_ROLE_LABELS,
  PARTICIPANT_GOAL_LABELS,
  REQUEST_MESSAGE_MAX_LENGTH,
  REQUEST_MESSAGE_MIN_LENGTH,
  type ContactMethod,
} from "#shared/teamFormation";

definePageMeta({ middleware: ["auth"] });

const route = useRoute();
const { data: team } = await useFetch<any>(`/api/teams/${route.params.id}`);
const { data: me } = await useMe();

const safeRepoUrl = computed(() => {
  const url = team.value?.github_url;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
});

const sending = ref(false);
const message = ref("");
// Prefilled from the profile introduction; what is sent is stored as-is.
const applicationMessage = ref(me.value?.registration?.intro ?? "");
const messageLength = computed(() => applicationMessage.value.trim().length);
const messageValid = computed(
  () =>
    messageLength.value >= REQUEST_MESSAGE_MIN_LENGTH &&
    messageLength.value <= REQUEST_MESSAGE_MAX_LENGTH,
);
const canApply = computed(() => team.value?.recruiting && team.value?.vacancies > 0);

function contactLabel(contact: { method: ContactMethod; other_label: string | null }) {
  return contact.method === "other" ? contact.other_label : CONTACT_METHOD_LABELS[contact.method];
}

// Members are keyed by registration id, which is also what leader_id points at.
const isMember = computed(() =>
  team.value?.members?.some(
    (m: { id: string }) => m.id === me.value?.registration?.id,
  ),
);
const alreadyInTeam = computed(() => !!me.value?.registration?.team_id);

async function sendRequest() {
  sending.value = true;
  message.value = "";
  try {
    await $fetch(`/api/teams/${route.params.id}/requests`, {
      method: "POST",
      body: { message: applicationMessage.value },
    });
    message.value = "Request sent!";
  } catch (e: any) {
    message.value = e.data?.message ?? "Something went wrong";
  }
  sending.value = false;
}
</script>

<template>
  <main
    class="max-w-2xl mx-auto p-6 space-y-6 bg-base-100 border-2 border-primary my-8"
  >
    <NuxtLink to="/ops/teams" class="btn btn-ghost btn-sm">← Back</NuxtLink>

    <template v-if="team">
      <h1 class="text-xl md:text-4xl font-black uppercase">{{ team.name }}</h1>
      <p v-if="team.description" class="opacity-70">{{ team.description }}</p>

      <div class="flex flex-wrap gap-2">
        <span
          v-for="skill in team.skills_wanted"
          :key="skill"
          class="badge badge-primary badge-outline"
          >{{ skill }}</span
        >
      </div>

      <div class="flex flex-wrap gap-2 text-sm">
        <span v-if="!team.recruiting" class="badge badge-ghost">Not recruiting</span>
        <span v-else-if="team.vacancies > 0" class="badge badge-success">
          {{ team.vacancies }} open {{ team.vacancies === 1 ? "place" : "places" }}
        </span>
        <span v-else class="badge badge-ghost">Full</span>
        <span v-if="team.welcomes_beginners" class="badge badge-info">Beginners welcome</span>
      </div>

      <div v-if="team.wanted_roles?.length">
        <h2 class="font-bold mb-1">Looking for</h2>
        <div class="flex flex-wrap gap-1">
          <span v-for="role in team.wanted_roles" :key="role" class="badge badge-primary badge-outline">
            {{ CONTRIBUTION_ROLE_LABELS[role as keyof typeof CONTRIBUTION_ROLE_LABELS] }}
          </span>
        </div>
      </div>

      <p v-if="team.interests?.length || team.goals?.length" class="text-sm opacity-70">
        <template v-if="team.interests?.length">Interests: {{ team.interests.join(", ") }}</template>
        <template v-if="team.interests?.length && team.goals?.length"> · </template>
        <template v-if="team.goals?.length">
          Goals: {{ team.goals.map((g: keyof typeof PARTICIPANT_GOAL_LABELS) => PARTICIPANT_GOAL_LABELS[g]).join(", ") }}
        </template>
      </p>
      <p v-if="team.languages?.length" class="text-sm opacity-70">
        Working languages: {{ team.languages.join(", ") }}
      </p>

      <h2 class="text-xl font-bold mt-6 mb-3">
        Members ({{ team.members?.length ?? 0 }}/{{ team.desired_size }})
      </h2>
      <ul class="space-y-2">
        <li
          v-for="member in team.members"
          :key="member.id"
          class="flex items-center gap-3"
        >
          <span class="font-medium">{{ member.name }}</span>
          <div class="flex gap-1 flex-wrap">
            <span
              v-for="skill in member.skills"
              :key="skill"
              class="badge badge-outline text-xs"
              >{{ skill }}</span
            >
          </div>
          <span v-if="member.shared_contact" class="text-xs opacity-70">
            {{ contactLabel(member.shared_contact) }}: {{ member.shared_contact.handle }}
          </span>
        </li>
      </ul>

      <div v-if="safeRepoUrl" class="mt-6">
        <h2 class="text-xl font-bold mb-1">Project Repo</h2>
        <a
          :href="safeRepoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="link link-primary break-all"
        >{{ team.github_url }}</a>
      </div>

      <div class="mt-8">
        <div
          v-if="message"
          class="alert mb-4"
          :class="message === 'Request sent!' ? 'alert-success' : 'alert-error'"
        >
          {{ message }}
        </div>

        <form
          v-if="!isMember && !alreadyInTeam && canApply && message !== 'Request sent!'"
          class="flex flex-col gap-2"
          @submit.prevent="sendRequest"
        >
          <label class="form-control">
            <span class="label-text font-bold">Your message to the team</span>
            <span class="label-text text-xs opacity-60 mb-1">
              What would you like to contribute, and why does this team interest you?
              A short beginner introduction is enough.
            </span>
            <textarea
              v-model="applicationMessage"
              rows="4"
              :maxlength="REQUEST_MESSAGE_MAX_LENGTH"
              class="textarea textarea-bordered w-full"
            />
            <span class="label-text-alt text-right" :class="messageValid ? 'opacity-60' : 'text-warning'">
              {{ messageLength }}/{{ REQUEST_MESSAGE_MAX_LENGTH }}
              (at least {{ REQUEST_MESSAGE_MIN_LENGTH }})
            </span>
          </label>
          <button
            type="submit"
            :disabled="sending || !messageValid"
            class="btn btn-primary font-black uppercase self-start"
          >
            {{ sending ? "Sending…" : "Request to Join" }}
          </button>
        </form>

        <p v-else-if="!isMember && !alreadyInTeam && !canApply" class="opacity-60">
          This team isn't taking applications right now.
        </p>

        <p v-else-if="isMember" class="font-bold text-success">
          You're a member of this team.
        </p>
        <p v-else-if="alreadyInTeam" class="opacity-60">You're already in a team.</p>
      </div>
    </template>
  </main>
</template>
