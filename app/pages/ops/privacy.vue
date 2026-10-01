<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

interface PrivacyState {
  notice_version: string;
  marketing_email: boolean;
  marketing_answered: boolean;
  edition: { slug: string; name: string } | null;
  registration: {
    public: boolean;
    has_dietary_note: boolean;
    sponsor: {
      recipients: { id: string; organisation: string; purpose: string; shared_fields: string[] }[];
      acknowledged_recipient_ids: string[];
      covers_current: boolean;
      objected: boolean;
    };
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
      m === "sponsor_recipients_changed"
        ? "The sponsor list just changed. Please review it again."
        : "That did not work — please try again.";
    if (m === "sponsor_recipients_changed") await refresh();
  }
  busy.value = false;
}
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
        <section class="flex flex-col gap-2">
          <h2 class="font-black uppercase">Sponsor sharing — {{ state.edition?.name }}</h2>
          <p v-if="state.registration.sponsor.objected" class="text-sm">
            You objected to sponsor sharing. You are excluded from all sponsor exports.
          </p>
          <template v-else-if="!state.registration.sponsor.covers_current">
            <p class="text-sm">
              New sponsor organisations were added after you registered. Your
              details are not shared with them until you confirm:
            </p>
            <ul class="text-sm list-disc pl-5">
              <li v-for="r in state.registration.sponsor.recipients" :key="r.id">
                <strong>{{ r.organisation }}</strong> — {{ r.purpose }}; receives
                {{ r.shared_fields.join(", ") }}.
              </li>
            </ul>
            <button
              type="button"
              class="btn btn-primary btn-sm self-start"
              :disabled="busy"
              @click="change(
                { sponsor_acknowledge_recipient_ids: state.registration.sponsor.recipients.map((r) => r.id) },
                'Sponsor list confirmed.',
              )"
            >
              I understand my details will be shared with these organisations
            </button>
          </template>
          <p v-else class="text-sm">
            Your name, email, skills and experience level are shared with:
            {{ state.registration.sponsor.recipients.map((r) => r.organisation).join(", ") || "no organisation yet" }}.
          </p>
          <p class="text-xs opacity-70">
            To object to sponsor sharing, or for data a sponsor already received,
            email us — see "Your rights" in the Privacy Notice.
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
