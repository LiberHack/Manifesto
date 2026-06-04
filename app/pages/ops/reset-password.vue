<script setup lang="ts">
definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const router = useRouter();
const form = reactive({ password: "", confirm: "" });
const error = ref("");
const loading = ref(false);
const ready = ref(false);

onMounted(async () => {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session) {
    error.value = "Invalid or expired reset link.";
  } else {
    ready.value = true;
  }
});

async function submit() {
  if (form.password !== form.confirm) {
    error.value = "Passwords do not match.";
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });
    if (updateError) {
      error.value = updateError.message;
      return;
    }
    router.push("/ops/login?confirmed=1");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="fixed w-screen h-screen flex items-center justify-center p-4">
    <form
      class="w-full max-w-md flex flex-col gap-2 bg-base-100 p-8 border-primary border-2"
      @submit.prevent="submit"
    >
      <h1 class="text-4xl font-black uppercase tracking-tight">New Password</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">
        {{ error }}
      </div>

      <template v-if="ready">
        <label class="form-control">
          <span class="label-text font-bold">New Password</span>
          <input
            v-model="form.password"
            type="password"
            required
            minlength="8"
            class="input input-bordered w-full"
          />
        </label>

        <label class="form-control">
          <span class="label-text font-bold">Confirm Password</span>
          <input
            v-model="form.confirm"
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
          {{ loading ? "Saving…" : "Set new password" }}
        </button>
      </template>
    </form>
  </main>
</template>
