<script setup lang="ts">
import {
  CONTRIBUTION_ROLES,
  CONTRIBUTION_ROLE_LABELS,
  INTRO_MAX_LENGTH,
  MATCHING_STATUSES,
  MATCHING_STATUS_LABELS,
  MAX_INTERESTS,
  PARTICIPANT_GOALS,
  PARTICIPANT_GOAL_LABELS,
  PROFILE_LINK_FIELDS,
  PROFILE_LINK_LABELS,
  UNDECIDED_INTEREST,
  parseTagText,
  toggleValue,
  type ProfileForm,
} from "#shared/teamFormation";

const form = defineModel<ProfileForm>({ required: true });

// Comma-separated editing for the free-text tag lists.
function tagsText(field: "interests" | "languages") {
  return computed({
    get: () => form.value[field].join(", "),
    set: (text: string) => {
      form.value[field] = parseTagText(text);
    },
  });
}
const interestsText = tagsText("interests");
const languagesText = tagsText("languages");
</script>

<template>
  <div class="flex flex-col gap-4">
    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">Team matching (optional)</legend>
      <span class="label-text text-xs opacity-60 mb-2">
        Only "Looking for a team" makes your profile visible to recruiting team
        leaders. This is separate from the public archive setting.
      </span>
      <label
        v-for="status in MATCHING_STATUSES"
        :key="status"
        class="flex items-center gap-2 cursor-pointer text-sm py-1"
      >
        <input
          v-model="form.matching_status"
          type="radio"
          :value="status"
          class="radio radio-primary radio-sm"
        />
        {{ MATCHING_STATUS_LABELS[status] }}
      </label>
    </fieldset>

    <label class="form-control">
      <span class="label-text font-bold">Introduce yourself (optional)</span>
      <span class="label-text text-xs opacity-60 mb-1">
        What you'd like to work on and what you bring. A beginner intro is great.
        Reused as the starting point for your applications.
      </span>
      <textarea
        v-model="form.intro"
        :maxlength="INTRO_MAX_LENGTH"
        rows="3"
        class="textarea textarea-bordered w-full"
      />
      <span class="label-text-alt text-right opacity-60">
        {{ form.intro.length }}/{{ INTRO_MAX_LENGTH }}
      </span>
    </label>

    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">How you'd like to contribute (optional)</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="role in CONTRIBUTION_ROLES"
          :key="role"
          type="button"
          class="btn btn-xs"
          :class="form.preferred_roles.includes(role) ? 'btn-primary' : 'btn-outline'"
          :aria-pressed="form.preferred_roles.includes(role)"
          @click="form.preferred_roles = toggleValue(form.preferred_roles, role)"
        >
          {{ CONTRIBUTION_ROLE_LABELS[role] }}
        </button>
      </div>
    </fieldset>

    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">Goals (optional)</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="goal in PARTICIPANT_GOALS"
          :key="goal"
          type="button"
          class="btn btn-xs"
          :class="form.goals.includes(goal) ? 'btn-primary' : 'btn-outline'"
          :aria-pressed="form.goals.includes(goal)"
          @click="form.goals = toggleValue(form.goals, goal)"
        >
          {{ PARTICIPANT_GOAL_LABELS[goal] }}
        </button>
      </div>
    </fieldset>

    <label class="form-control">
      <span class="label-text font-bold">Challenge interests (optional)</span>
      <span class="label-text text-xs opacity-60 mb-1">
        Up to {{ MAX_INTERESTS }}, comma-separated. "{{ UNDECIDED_INTEREST }}" is fine.
      </span>
      <input
        v-model.lazy="interestsText"
        type="text"
        class="input input-bordered w-full"
        :placeholder="`e.g. climate, health, ${UNDECIDED_INTEREST}`"
      />
    </label>

    <label class="form-control">
      <span class="label-text font-bold">Working languages (optional)</span>
      <input
        v-model.lazy="languagesText"
        type="text"
        class="input input-bordered w-full"
        placeholder="e.g. Bulgarian, English"
      />
    </label>

    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">Profile links (optional)</legend>
      <span class="label-text text-xs opacity-60 mb-2">
        Not required, and never used to rank you.
      </span>
      <label v-for="field in PROFILE_LINK_FIELDS" :key="field" class="flex flex-col gap-1 mb-2">
        <span class="text-xs">{{ PROFILE_LINK_LABELS[field] }}</span>
        <input
          v-model="form[field]"
          type="url"
          maxlength="300"
          placeholder="https://"
          class="input input-bordered input-sm w-full"
        />
      </label>
    </fieldset>
  </div>
</template>
