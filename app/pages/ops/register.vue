<script setup lang="ts">
definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();
// Confirm on whichever host served this page (production, staging or a PR preview);
// every such origin must be allow-listed in supabase/config.toml additional_redirect_urls.
const confirmUrl = `${useRequestURL().origin}/ops/confirm`;

const rawInvite = route.query.invite as string | undefined;
const inviteCode = rawInvite?.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;
const inviteTeam = ref<{ name: string } | null>(null);

if (inviteCode) {
  try {
    inviteTeam.value = await $fetch<{ name: string }>(`/api/invite/${inviteCode}`);
  } catch {
    // invalid invite — proceed without it
  }
}

// Pre-flight: the cap now lives on registrations, so signup itself no longer
// fails when an edition is full — the form has to check and say so. The same
// call says whether registration has opened at all.
const { data: editionState } = await useCurrentEdition();

const opsClosed = computed(() => !editionState.value.ops_open);
const registrationFull = computed(
  () => !editionState.value.edition || editionState.value.full,
);

const form = reactive({
  name: "",
  email: "",
  password: "",
  skills: [] as string[],
  experience: "" as "" | "beginner" | "intermediate" | "experienced",
});
const error = ref("");
const emailTaken = ref(false);
const loading = ref(false);

const { track } = useAnalyticsConsent();
onMounted(() => track("registration_started"));

async function register() {
  error.value = "";
  emailTaken.value = false;
  loading.value = true;

  const { skills, experience } = form;

  const { error: authError } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: {
      // Only what pre-fills the edition form. Dietary details and every
      // consent are collected there, never in auth metadata.
      data: { name: form.name, skills, experience },
      emailRedirectTo: inviteCode ? `${confirmUrl}?invite=${inviteCode}` : confirmUrl,
    },
  });

  loading.value = false;

  if (authError) {
    if (authError.message.includes("registration_closed"))
      error.value = "Registration is closed — the participant limit has been reached.";
    else if (authError.message.includes("too_many_skills"))
      error.value = "You can add at most 5 skills.";
    // GoTrue rejects a signup for an address that already has a confirmed
    // account; say so in our own words and point at the login page.
    else if (
      authError.code === "user_already_exists" ||
      authError.message.includes("already registered")
    )
      emailTaken.value = true;
    else error.value = authError.message;
    return;
  }

  router.push(`/ops/verify-email?email=${encodeURIComponent(form.email)}`);
}
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4 py-12">
    <div
      v-if="opsClosed"
      class="w-full max-w-md min-w-0 flex flex-col gap-4 bg-base-100 p-4 sm:p-8 border-primary border-2 [overflow-wrap:break-word]"
    >
      <h1 class="text-2xl sm:text-4xl font-black uppercase tracking-tight">
        Registration is not open yet
      </h1>
      <p class="text-sm opacity-70">
        Sign-ups for the next LiberHack have not started. Watch this page — and
        our channels — for the date.
      </p>
      <NuxtLink to="/" class="btn btn-primary font-black uppercase">
        Back to the site
      </NuxtLink>
    </div>

    <form
      v-else
      class="w-full max-w-md min-w-0 flex flex-col gap-2 bg-base-100 p-4 sm:p-8 border-primary border-2 [overflow-wrap:break-word]"
      @submit.prevent="register"
    >
      <h1 class="text-4xl font-black uppercase tracking-tight">Register</h1>

      <div v-if="inviteTeam" class="alert text-sm border-2 border-primary bg-base-200">
        <span>
          After verifying your email, you'll be invited to join
          <strong class="text-primary">{{ inviteTeam.name }}</strong>.
        </span>
      </div>

      <div v-if="registrationFull" role="alert" class="alert alert-error text-sm">
        Registration is closed — the participant limit has been reached.
      </div>

      <div v-if="error" role="alert" class="alert alert-error text-sm">
        {{ error }}
      </div>

      <div v-if="emailTaken" role="alert" class="alert alert-error text-sm">
        <span>
          An account already exists for {{ form.email }}.
          <NuxtLink to="/ops/login" class="link font-bold">Log in</NuxtLink>
          instead, or
          <NuxtLink to="/ops/forgot-password" class="link font-bold">reset your password</NuxtLink>.
        </span>
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Name</span>
        <input v-model="form.name" type="text" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input v-model="form.email" type="email" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Password</span>
        <input v-model="form.password" type="password" required minlength="8" class="input input-bordered w-full" />
      </label>

      <div class="form-control">
        <span class="label-text font-bold">Your Skills</span>
        <SkillPicker v-model="form.skills" allow-create />
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Experience Level</span>
        <span class="label-text text-xs opacity-60 mb-1">
          Helps us allocate mentors and workshops. Shared with the named sponsors for
          recruitment — see the
          <NuxtLink to="/legal/privacy" target="_blank" class="link">Privacy Notice</NuxtLink>.
        </span>
        <select v-model="form.experience" required class="select select-bordered w-full">
          <option value="" disabled>Select your level…</option>
          <option value="beginner">Beginner — new to hacking / tech events</option>
          <option value="intermediate">Intermediate — been to a few, comfortable building</option>
          <option value="experienced">Experienced — seasoned hacker</option>
        </select>
      </label>

      <p class="text-sm leading-snug opacity-80">
        This creates your account (name, email, password). After you confirm your
        email you will finish registering for the edition: the rules and Code of
        Conduct, sponsor sharing, catering and email preferences are asked there.
        How we use your data:
        <NuxtLink to="/legal/privacy" target="_blank" class="link font-bold">Privacy Notice</NuxtLink>.
      </p>

      <button
        type="submit"
        :disabled="loading || registrationFull"
        class="btn btn-primary w-full font-black uppercase"
      >
        {{ loading ? "Registering…" : "Register" }}
      </button>

      <p class="text-sm text-center">
        Already registered?
        <NuxtLink to="/ops/login" class="link">Log in</NuxtLink>
      </p>
    </form>
  </main>
</template>
