<script setup lang="ts">
/**
 * Second factor for admins. Personal-data exports are refused unless the
 * session is `aal2` (checked server-side from the JWT). Enrol a TOTP app once,
 * then verify a code whenever a new session needs it.
 */
definePageMeta({ middleware: ["admin"] });

const supabase = useSupabaseClient();

const level = ref<{ current: string | null; next: string | null }>({ current: null, next: null });
const factorId = ref<string | null>(null);
const qrCode = ref<string | null>(null);
const secret = ref<string | null>(null);
const code = ref("");
const message = ref("");
const error = ref("");
const busy = ref(false);

async function load() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  level.value = { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  factorId.value = factors?.totp.find((f) => f.status === "verified")?.id ?? null;
}

async function enrol() {
  busy.value = true;
  error.value = "";
  const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  busy.value = false;
  if (e || !data) {
    error.value = e?.message ?? "Could not start enrolment.";
    return;
  }
  factorId.value = data.id;
  // The QR image comes from Supabase Auth itself; nothing is sent to a third party.
  qrCode.value = data.totp.qr_code;
  secret.value = data.totp.secret;
}

async function verify() {
  if (!factorId.value) return;
  busy.value = true;
  error.value = "";
  const { error: e } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factorId.value,
    code: code.value.trim(),
  });
  busy.value = false;
  if (e) {
    error.value = "That code did not work. Check the time on your device and try again.";
    return;
  }
  code.value = "";
  qrCode.value = null;
  secret.value = null;
  message.value = "Verified. Exports are available in this session.";
  await load();
}

onMounted(load);
</script>

<template>
  <main class="w-full min-h-screen flex justify-center p-4 py-12">
    <div class="w-full max-w-md min-w-0 bg-base-100 p-4 sm:p-8 border-primary border-2 flex flex-col gap-4 [overflow-wrap:anywhere]">
      <h1 class="text-3xl font-black uppercase tracking-tight">Admin second factor</h1>
      <p class="text-sm opacity-70">
        Exports of participant data need a verified second factor in this
        session. Current level: <strong>{{ level.current ?? "unknown" }}</strong>.
      </p>

      <div v-if="message" role="status" class="alert alert-success text-sm">{{ message }}</div>
      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <template v-if="level.current !== 'aal2'">
        <button
          v-if="!factorId && !qrCode"
          type="button"
          class="btn btn-primary"
          :disabled="busy"
          @click="enrol"
        >
          Set up an authenticator app
        </button>

        <div v-if="qrCode" class="flex flex-col gap-2">
          <p class="text-sm">Scan this with your authenticator app, then enter the 6-digit code.</p>
          <img :src="qrCode" alt="Authenticator QR code" class="max-w-full w-48 bg-white p-2" />
          <p class="text-xs break-all opacity-70">Or enter the key: <code>{{ secret }}</code></p>
        </div>

        <form v-if="factorId" class="flex flex-wrap gap-2 items-end" @submit.prevent="verify">
          <label class="form-control">
            <span class="label-text font-bold">Code</span>
            <input
              v-model="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              required
              class="input input-bordered w-32"
            />
          </label>
          <button type="submit" class="btn btn-primary" :disabled="busy">Verify</button>
        </form>
      </template>

      <NuxtLink to="/ops/admin" class="link text-sm">← Back to admin</NuxtLink>
    </div>
  </main>
</template>
