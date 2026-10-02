<script setup lang="ts">
import {
  CONTRIBUTION_ROLES,
  CONTRIBUTION_ROLE_LABELS,
  MAX_INTERESTS,
  MAX_TEAM_SIZE,
  PARTICIPANT_GOALS,
  PARTICIPANT_GOAL_LABELS,
  parseTagText,
  toggleValue,
  type RecruitmentForm,
} from "#shared/teamFormation";

const form = defineModel<RecruitmentForm>({ required: true });
defineProps<{ memberCount: number }>();

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
  <div class="flex flex-col gap-3">
    <label class="flex items-center gap-3 cursor-pointer">
      <input v-model="form.recruiting" type="checkbox" class="toggle toggle-primary" />
      <span class="font-bold text-sm">{{ form.recruiting ? "Recruiting — open to applications" : "Not recruiting" }}</span>
    </label>

    <label class="form-control">
      <span class="label-text font-bold">Desired team size</span>
      <select v-model.number="form.desired_size" class="select select-bordered select-sm w-full max-w-xs">
        <option v-for="n in MAX_TEAM_SIZE" :key="n" :value="n" :disabled="n < memberCount">
          {{ n }}{{ n < memberCount ? " (fewer than current members)" : "" }}
        </option>
      </select>
    </label>

    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">Roles wanted</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="role in CONTRIBUTION_ROLES"
          :key="role"
          type="button"
          class="btn btn-xs"
          :class="form.wanted_roles.includes(role) ? 'btn-primary' : 'btn-outline'"
          :aria-pressed="form.wanted_roles.includes(role)"
          @click="form.wanted_roles = toggleValue(form.wanted_roles, role)"
        >
          {{ CONTRIBUTION_ROLE_LABELS[role] }}
        </button>
      </div>
    </fieldset>

    <fieldset class="form-control">
      <legend class="label-text font-bold mb-1">Team goals</legend>
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
      <span class="label-text font-bold">Challenge interests</span>
      <span class="label-text text-xs opacity-60 mb-1">Up to {{ MAX_INTERESTS }}, comma-separated.</span>
      <input v-model.lazy="interestsText" type="text" class="input input-bordered input-sm w-full" />
    </label>

    <label class="form-control">
      <span class="label-text font-bold">Working languages (optional)</span>
      <input v-model.lazy="languagesText" type="text" class="input input-bordered input-sm w-full" />
    </label>

    <label class="flex items-start gap-3 cursor-pointer">
      <input v-model="form.welcomes_beginners" type="checkbox" class="checkbox checkbox-primary mt-1 shrink-0" />
      <span class="text-sm leading-snug">We welcome beginners and are happy to mentor.</span>
    </label>
  </div>
</template>
