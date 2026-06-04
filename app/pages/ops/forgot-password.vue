<script setup lang="ts">
const supabase = useSupabaseClient();
const email = ref("");
const error = ref("");
const message = ref("");
const loading = ref(false);

async function handlePasswordReset() {
  error.value = "";
  message.value = "";
  loading.value = true;

  try {
    const redirectTo = `${window.location.origin}/ops/reset-password`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.value,
      {
        redirectTo,
      },
    );

    if (resetError) {
      error.value = resetError.message;
      return;
    }

    message.value = "Check your email for a password reset link!";
  } catch (err) {
    error.value = "An unexpected error occurred.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="fixed w-screen h-screen flex items-center justify-center p-4">
    <form
      class="w-full max-w-md flex flex-col gap-4 bg-base-100 p-8 border-primary border-2"
      @submit.prevent="handlePasswordReset"
    >
      <h1 class="text-4xl font-black uppercase tracking-tight">
        Reset Password
      </h1>
      <p class="text-sm text-base-content/70">
        Enter your email address and we'll send you a link to reset your
        password.
      </p>

      <div v-if="error" role="alert" class="alert alert-error text-sm">
        {{ error }}
      </div>

      <div
        v-if="message"
        role="alert"
        class="alert border-2 border-primary bg-base-200 text-sm"
      >
        {{ message }}
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input
          v-model="email"
          type="email"
          required
          class="input input-bordered w-full"
          placeholder="you@example.com"
        />
      </label>

      <button
        type="submit"
        :disabled="loading"
        class="btn btn-primary w-full font-black uppercase"
      >
        {{ loading ? "Sending…" : "Send Reset Link" }}
      </button>

      <p class="text-sm text-center">
        Remembered it?
        <NuxtLink to="/ops/login" class="link">Back to Login</NuxtLink>
      </p>
    </form>
  </main>
</template>
