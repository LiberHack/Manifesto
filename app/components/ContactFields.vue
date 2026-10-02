<script setup lang="ts">
import {
  CONTACT_METHODS,
  CONTACT_METHOD_LABELS,
  type ContactForm,
} from "#shared/teamFormation";

const form = defineModel<ContactForm>({ required: true });

const needsHandle = computed(() => form.value.method !== "" && form.value.method !== "email_only");
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="label-text font-bold">Preferred direct contact</legend>
    <span class="label-text text-xs opacity-60">
      Only organizers see this, so they can reach you quickly before the event.
      Email stays the fallback.
    </span>

    <select v-model="form.method" required class="select select-bordered w-full">
      <option value="" disabled>Choose a channel…</option>
      <option v-for="method in CONTACT_METHODS" :key="method" :value="method">
        {{ CONTACT_METHOD_LABELS[method] }}
      </option>
    </select>

    <input
      v-if="form.method === 'other'"
      v-model="form.other_label"
      type="text"
      maxlength="40"
      required
      placeholder="Which app? e.g. Matrix"
      class="input input-bordered w-full"
    />

    <input
      v-if="needsHandle"
      v-model="form.handle"
      :type="form.method === 'phone' ? 'tel' : 'text'"
      maxlength="100"
      required
      :placeholder="form.method === 'phone' || form.method === 'viber' ? '+359…' : 'Your handle or number'"
      class="input input-bordered w-full"
    />

    <label v-if="needsHandle" class="flex items-start gap-3 cursor-pointer">
      <input v-model="form.share_with_team" type="checkbox" class="checkbox checkbox-primary mt-1 shrink-0" />
      <span class="text-sm leading-snug">
        Also share it with my teammates once I'm in a team.
      </span>
    </label>
  </fieldset>
</template>
