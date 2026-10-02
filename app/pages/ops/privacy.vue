<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

interface PrivacyState {
  notice_version: string;
  marketing_email: boolean;
  marketing_answered: boolean;
  edition: { slug: string; name: string } | null;
  registration: {
    public: boolean;
    recruitment_adult: boolean | null;
    has_dietary_note: boolean;
    sponsors: {
      id: string;
      organisation: string;
      purpose: string;
      shared_fields: string[];
      choice: "yes" | "no" | "unanswered" | "objected";
    }[];
  } | null;
}

const { data: state, refresh } = await useFetch<PrivacyState>("/api/me/privacy");
const { choice, settingsOpen } = useAnalyticsConsent();

const busy = ref(false);
const message = ref("");
const error = ref("");

async function change(body: Record<string, unknown>, done: string) {
  busy.value = true;
  message.value = "";
  error.value = "";
  try {
    await $fetch("/api/me/privacy", { method: "POST", body });
    await refresh();
    message.value = done;
  } catch (e: unknown) {
    const m = (e as { data?: { message?: string } }).data?.message;
    error.value =
      m === "recruitment_age_required"
        ? "Please answer whether you are 18 or older first."
        : m === "recipient_not_active"
          ? "That organisation is no longer on the list."
          : "That did not work — please try again.";
    await refresh();
  }
  busy.value = false;
}
const adult = ref<boolean | null>(null);
watch(
  () => state.value?.registration?.recruitment_adult,
  (v) => (adult.value = v ?? null),
  { immediate: true },
);

function setSponsor(recipientId: string, share: boolean) {
  return change(
    { sponsor_choice: { recipient_id: recipientId, share }, recruitment_adult: adult.value ?? undefined },
    share ? "Your profile will be included for this organisation." : "Your profile will not be shared with this organisation.",
  );
}

const CHOICE_LABEL = {
  yes: "Sharing: yes",
  no: "Sharing: no",
  unanswered: "Not answered — not shared",
  objected: "Objection recorded — not shared",
} as const;
</script>

<template>
  <main class="w-full min-h-screen flex justify-center p-4 py-12">
    <div class="w-full max-w-lg bg-base-100 p-8 border-primary border-2 flex flex-col gap-5">
      <h1 class="text-3xl font-black uppercase tracking-tight">Your privacy</h1>
      <p class="text-sm opacity-70">
        Changing any of these never cancels your registration or anything you get
        from taking part. Full details:
        <NuxtLink to="/legal/privacy" class="link">Privacy Notice</NuxtLink>.
      </p>

      <div v-if="message" role="status" class="alert alert-success text-sm">{{ message }}</div>
      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <section class="flex flex-col gap-2">
        <h2 class="font-black uppercase">Event emails</h2>
        <p class="text-sm">
          Emails about future LiberHack events:
          <strong>{{ state?.marketing_email ? "on" : "off" }}</strong>.
        </p>
        <button
          type="button"
          class="btn btn-outline btn-sm self-start"
          :disabled="busy"
          @click="change({ marketing_email: !state?.marketing_email }, 'Email preference saved.')"
        >
          {{ state?.marketing_email ? "Stop these emails" : "Send me these emails" }}
        </button>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="font-black uppercase">Analytics in this browser</h2>
        <p class="text-sm">
          This is stored in your browser, not your account, so it works without
          logging in too. Currently:
          <strong>{{ choice.state === "granted" ? "allowed" : choice.state === "denied" ? "off" : "not chosen" }}</strong>.
        </p>
        <button type="button" class="btn btn-outline btn-sm self-start" @click="settingsOpen = true">
          Open analytics settings
        </button>
      </section>

      <template v-if="state?.registration">
        <section v-if="state.registration.sponsors.length" class="flex flex-col gap-3">
          <h2 class="font-black uppercase">Jobs and internships — {{ state.edition?.name }}</h2>
          <p class="text-sm">
            Should we share your name, email, skills and experience level with
            these organisations so they can contact you about jobs and
            internships? Your answer does not affect your participation.
            Nothing is shared without a Yes, and only if you are 18 or older.
          </p>
          <div role="radiogroup" aria-labelledby="privacy-age" class="flex flex-wrap items-center gap-3 text-sm">
            <span id="privacy-age">Are you 18 or older?</span>
            <label class="flex items-center gap-1"><input v-model="adult" type="radio" name="privacy-age" :value="true" class="radio radio-sm" /> Yes</label>
            <label class="flex items-center gap-1"><input v-model="adult" type="radio" name="privacy-age" :value="false" class="radio radio-sm" /> No</label>
          </div>
          <div v-for="r in state.registration.sponsors" :key="r.id" class="flex flex-col gap-1 border border-base-content/20 p-2">
            <p class="text-sm"><strong>{{ r.organisation }}</strong> — {{ r.purpose }}</p>
            <p class="text-xs opacity-70">{{ CHOICE_LABEL[r.choice] }}</p>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn btn-xs"
                :class="r.choice === 'yes' ? 'btn-primary' : 'btn-outline'"
                :aria-pressed="r.choice === 'yes'"
                :disabled="busy || adult === null"
                @click="setSponsor(r.id, true)"
              >Yes, share my profile</button>
              <button
                type="button"
                class="btn btn-xs"
                :class="r.choice === 'no' ? 'btn-primary' : 'btn-outline'"
                :aria-pressed="r.choice === 'no'"
                :disabled="busy"
                @click="setSponsor(r.id, false)"
              >No, do not share my profile</button>
            </div>
          </div>
          <p class="text-xs opacity-70">
            Saying No later stops sharing in future exports. For data an
            organisation already received, email us — see "Your rights" in the
            Privacy Notice.
          </p>
        </section>

        <section v-if="state.registration.has_dietary_note" class="flex flex-col gap-2">
          <h2 class="font-black uppercase">Food note</h2>
          <p class="text-sm">You gave us a short food note with your explicit consent.</p>
          <button
            type="button"
            class="btn btn-outline btn-sm self-start"
            :disabled="busy"
            @click="change({ withdraw_dietary_note: true }, 'Food note deleted.')"
          >
            Withdraw consent and delete the note
          </button>
        </section>
      </template>
    </div>
  </main>
</template>
