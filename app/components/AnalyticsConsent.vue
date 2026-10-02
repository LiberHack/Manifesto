<script setup lang="ts">
import { ANALYTICS_ID_DAYS, ANALYTICS_REJECTION_DAYS } from "#shared/utils/privacy";

/**
 * Analytics consent banner and the "Privacy settings" dialog.
 *
 * The banner only appears when an admin has enabled analytics for the edition
 * and the visitor has not answered (or their 30-day grant has expired). It
 * does not block the page and has no close button: ignoring it, scrolling or
 * navigating is not an answer, and nothing is collected meanwhile. The dialog
 * is always reachable from the persistent link, so a grant can be withdrawn
 * even after analytics is switched off.
 */
const { data: edition } = await useCurrentEdition();
const { choice, settingsOpen, decide, withdraw } = useAnalyticsConsent();

const busy = ref(false);
const error = ref("");

const showBanner = computed(
  () => edition.value.analytics_enabled && choice.value.state === "unset" && !settingsOpen.value,
);

const expiresOn = computed(() =>
  choice.value.state === "granted"
    ? new Date(choice.value.expiresAt).toLocaleDateString("en-GB")
    : "",
);

async function run(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (e: unknown) {
    const message = (e as { data?: { message?: string } }).data?.message;
    error.value =
      message === "analytics_disabled"
        ? "Analytics is switched off right now, so there is nothing to allow."
        : "That did not work — please try again.";
  }
  busy.value = false;
}
</script>

<template>
  <section
    v-if="showBanner || settingsOpen"
    role="region"
    aria-labelledby="analytics-consent-title"
    class="fixed bottom-0 inset-x-0 z-50 max-h-[100dvh] overflow-y-auto p-3 sm:p-4"
  >
    <div class="mx-auto max-w-2xl min-w-0 bg-base-100 border-2 border-primary p-4 flex flex-col gap-3 shadow-lg">
      <h2 id="analytics-consent-title" class="font-black uppercase tracking-tight text-lg">
        {{ settingsOpen ? "Privacy settings" : "Can we count where you came from?" }}
      </h2>
      <p class="text-sm leading-snug">
        With your permission we set a random ID in this browser for
        {{ ANALYTICS_ID_DAYS }} days and record four things: that you opened
        the site (with the poster or post link that brought you, if any), that
        you clicked "register", started the form, and finished registering.
        We do not store your name, email, form answers or IP address with it,
        and we use no third-party trackers.
        It helps us see which posters and posts actually work. Registering works
        the same either way.
      </p>
      <p class="text-xs opacity-70 leading-snug">
        Counting starts when you allow it: we record the page you are on now,
        nothing from before. Details in the
        <NuxtLink to="/legal/privacy" class="link">Privacy Notice</NuxtLink>.
      </p>

      <p v-if="settingsOpen" class="text-sm font-bold">
        <template v-if="choice.state === 'granted'">
          Analytics is allowed until {{ expiresOn }}.
        </template>
        <template v-else-if="choice.state === 'denied'">
          Analytics is off. We will ask again in up to {{ ANALYTICS_REJECTION_DAYS }} days.
        </template>
        <template v-else>You have not chosen yet.</template>
      </p>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <template v-if="settingsOpen && choice.state === 'granted'">
          <button
            type="button"
            class="btn btn-primary h-auto min-h-12 whitespace-normal font-black uppercase"
            :disabled="busy"
            @click="run(withdraw)"
          >
            Withdraw and delete my analytics
          </button>
          <button type="button" class="btn btn-outline h-auto min-h-12 whitespace-normal font-black uppercase" @click="settingsOpen = false">
            Keep and close
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn btn-primary h-auto min-h-12 whitespace-normal font-black uppercase"
            :disabled="busy || !edition.analytics_enabled"
            @click="run(() => decide('granted'))"
          >
            Allow analytics
          </button>
          <button
            type="button"
            class="btn btn-primary h-auto min-h-12 whitespace-normal font-black uppercase"
            :disabled="busy"
            @click="run(() => decide('denied'))"
          >
            Reject analytics
          </button>
        </template>
      </div>
      <button
        v-if="settingsOpen && choice.state !== 'granted'"
        type="button"
        class="btn btn-ghost btn-sm self-end"
        @click="settingsOpen = false"
      >
        Close without changing
      </button>
    </div>
  </section>
</template>
