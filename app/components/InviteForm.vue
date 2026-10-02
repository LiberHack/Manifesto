<script setup lang="ts">
import {
  REQUEST_MESSAGE_MAX_LENGTH,
  REQUEST_MESSAGE_MIN_LENGTH,
} from "#shared/teamFormation";

const props = defineProps<{ teamId: string; registrationId: string; recommended?: boolean }>();
const emit = defineEmits<{ sent: []; cancel: [] }>();

const message = ref("");
const sending = ref(false);
const error = ref("");

const length = computed(() => message.value.trim().length);
const valid = computed(
  () => length.value >= REQUEST_MESSAGE_MIN_LENGTH && length.value <= REQUEST_MESSAGE_MAX_LENGTH,
);

async function send() {
  sending.value = true;
  error.value = "";
  try {
    await $fetch(`/api/teams/${props.teamId}/invitations`, {
      method: "POST",
      body: {
        registration_id: props.registrationId,
        message: message.value,
        recommended: props.recommended === true,
      },
    });
    emit("sent");
  } catch (e: any) {
    error.value = e.data?.message ?? "Something went wrong";
  }
  sending.value = false;
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="send">
    <textarea
      v-model="message"
      rows="3"
      :maxlength="REQUEST_MESSAGE_MAX_LENGTH"
      placeholder="Why your team, and what you'd work on together"
      class="textarea textarea-bordered w-full"
    />
    <span class="text-xs" :class="valid ? 'opacity-60' : 'text-warning'">
      {{ length }}/{{ REQUEST_MESSAGE_MAX_LENGTH }} (at least {{ REQUEST_MESSAGE_MIN_LENGTH }})
    </span>
    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-primary btn-sm font-black" :disabled="sending || !valid">
        {{ sending ? "Sending…" : "Send invitation" }}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
