<script setup lang="ts">
definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

const rawInvite = route.query.invite as string | undefined;
const inviteCode = rawInvite?.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;
const inviteTeam = ref<{ name: string } | null>(null);

if (inviteCode) {
  try {
    inviteTeam.value = await $fetch(`/api/invite/${inviteCode}`);
  } catch {
    // invalid invite — proceed without it
  }
}

const form = reactive({
  name: "",
  email: "",
  password: "",
  skills: [] as string[],
  dietary: "",
  experience: "" as "" | "beginner" | "intermediate" | "experienced",
  coc: false,
});
const error = ref("");
const loading = ref(false);

async function register() {
  error.value = "";
  loading.value = true;

  const { skills, dietary, experience } = form;

  const { error: authError } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: {
      data: { name: form.name, skills, dietary, experience },
      emailRedirectTo: inviteCode
        ? `${config.public.emailVerifiedUrl}?invite=${inviteCode}`
        : config.public.emailVerifiedUrl,
    },
  });

  loading.value = false;

  if (authError) {
    if (authError.message.includes("registration_closed"))
      error.value = "Registration is closed — the 120-participant limit has been reached.";
    else if (authError.message.includes("too_many_skills"))
      error.value = "You can add at most 5 skills.";
    else error.value = authError.message;
    return;
  }

  router.push(`/ops/verify-email?email=${encodeURIComponent(form.email)}`);
}
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4 py-12">
    <form
      class="w-full max-w-md flex flex-col gap-2 bg-base-100 p-8 border-primary border-2"
      @submit.prevent="register"
    >
      <h1 class="text-4xl font-black uppercase tracking-tight">Register</h1>

      <div v-if="inviteTeam" class="alert text-sm border-2 border-primary bg-base-200">
        <span>
          After verifying your email, you'll be invited to join
          <strong class="text-primary">{{ inviteTeam.name }}</strong>.
        </span>
      </div>

      <div v-if="error" role="alert" class="alert alert-error text-sm">
        {{ error }}
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

      <label class="form-control">
        <span class="label-text font-bold">Your Skills</span>
        <SkillPicker v-model="form.skills" allow-create />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Experience Level</span>
        <span class="label-text text-xs opacity-60 mb-1">
          Helps us allocate mentors and workshops. May be shared with sponsors for recruitment purposes — see our
          <NuxtLink to="/legal/privacy" target="_blank" class="link">Privacy Policy</NuxtLink>.
        </span>
        <select v-model="form.experience" required class="select select-bordered w-full">
          <option value="" disabled>Select your level…</option>
          <option value="beginner">Beginner — new to hacking / tech events</option>
          <option value="intermediate">Intermediate — been to a few, comfortable building</option>
          <option value="experienced">Experienced — seasoned hacker</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Dietary Requirements</span>
        <input
          v-model="form.dietary"
          type="text"
          placeholder="e.g. vegetarian, gluten-free, none"
          class="input input-bordered w-full"
        />
      </label>

      <label class="flex items-start gap-3 cursor-pointer">
        <input v-model="form.coc" type="checkbox" required class="checkbox checkbox-primary mt-1 shrink-0" />
        <span class="text-sm leading-snug">
          I have read and agree to the
          <NuxtLink to="/legal/coc" target="_blank" class="link font-bold">Code of Conduct</NuxtLink>
          and
          <NuxtLink to="/legal/privacy" target="_blank" class="link font-bold">Privacy Policy</NuxtLink>.
        </span>
      </label>

      <button type="submit" :disabled="loading || !form.coc" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? "Registering…" : "Register" }}
      </button>

      <p class="text-sm text-center">
        Already registered?
        <NuxtLink to="/ops/login" class="link">Log in</NuxtLink>
      </p>
    </form>
  </main>
</template>
