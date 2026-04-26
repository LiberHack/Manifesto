<script setup lang="ts">
import { until } from "@vueuse/core";

definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();
const user = useSupabaseUser();

const form = reactive({ email: "", password: "" });
const error = ref("");
const loading = ref(false);
const confirmed = computed(() => route.query.confirmed === "1");

async function login() {
  error.value = "";
  loading.value = true;

  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      error.value = authError.message;
      return;
    }

    await until(user).toBeTruthy();

    const inviteCode = route.query.invite as string | undefined;
    router.push(inviteCode ? `/ops/invite/${inviteCode}` : "/ops/teams");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="fixed w-screen h-screen flex items-center justify-center p-4">
    <form
      class="w-full max-w-md flex flex-col gap-2 bg-base-100 p-8 border-primary border-2"
      @submit.prevent="login"
    >
      <h1 class="text-4xl font-black uppercase tracking-tight">Login</h1>

      <div
        v-if="confirmed"
        class="alert text-sm border-2 border-primary bg-base-200"
      >
        <span>Email confirmed. You can now log in.</span>
      </div>

      <div v-if="error" role="alert" class="alert alert-error text-sm">
        {{ error }}
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input
          v-model="form.email"
          type="email"
          required
          class="input input-bordered w-full"
        />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Password</span>
        <input
          v-model="form.password"
          type="password"
          required
          class="input input-bordered w-full"
        />
      </label>

      <button
        type="submit"
        :disabled="loading"
        class="btn btn-primary w-full font-black uppercase"
      >
        {{ loading ? "Logging in…" : "Log in" }}
      </button>

      <p class="text-sm text-center">
        No account?
        <NuxtLink to="/ops/register" class="link">Register</NuxtLink>
      </p>
    </form>
  </main>
</template>
