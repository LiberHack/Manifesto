<script setup lang="ts">
definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const router = useRouter();

const form = reactive({
  name: "",
  email: "",
  password: "",
  skills: [] as string[],
});
const error = ref("");
const loading = ref(false);

async function register() {
  error.value = "";
  loading.value = true;

  const skills = form.skills;

  const { error: authError } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: { data: { name: form.name, skills } },
  });

  loading.value = false;

  if (authError) {
    if (authError.message.includes("registration_closed"))
      error.value =
        "Registration is closed — the 120-participant limit has been reached.";
    else if (authError.message.includes("too_many_skills"))
      error.value = "You can add at most 5 skills.";
    else error.value = authError.message;
    return;
  }
  router.push('/ops/verify-email')
}
</script>

<template>
  <main class="fixed inset-0 w-screen h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md flex flex-col gap-2 bg-base-100 p-8 border-primary border-2"
      @submit.prevent="register">
      <h1 class="text-4xl font-black uppercase tracking-tight">Register</h1>

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

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? "Registering…" : "Register" }}
      </button>

      <p class="text-sm text-center">
        Already registered?
        <NuxtLink to="/ops/login" class="link">Log in</NuxtLink>
      </p>
    </form>
  </main>
</template>
