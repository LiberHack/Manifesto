<script setup lang="ts">
definePageMeta({ middleware: [] });

const user = useSupabaseUser();
const route = useRoute();
const rawInvite = route.query.invite as string | undefined;
const invite = rawInvite?.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;
const timedOut = ref(false);
let timeoutId: ReturnType<typeof setTimeout> | null = null;

watch(user, () => {
  if (user.value) {
    if (timeoutId) clearTimeout(timeoutId);
    navigateTo(invite ? `/ops/invite/${invite}` : "/ops/teams");
  }
}, { immediate: true });

// If there are no Supabase auth tokens in the URL, the confirmation link was
// opened on a different device — redirect immediately instead of waiting forever.
onMounted(() => {
  if (user.value) return;

  const hasCodeVerifier = Object.keys(localStorage).some((k) =>
    k.includes("code-verifier")
  );

  if (!hasCodeVerifier) {
    const loginPath = invite
      ? `/ops/login?confirmed=1&invite=${invite}`
      : "/ops/login?confirmed=1";
    navigateTo(loginPath);
    return;
  }

  timeoutId = setTimeout(() => {
    if (!user.value) timedOut.value = true;
  }, 10000);
});

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId);
});
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4">
    <p v-if="!timedOut" class="text-sm opacity-50 font-mono uppercase tracking-widest">
      Verifying…
    </p>
    <div v-else class="w-full max-w-md flex flex-col gap-4 bg-base-100 p-8 border-primary border-2 text-center">
      <p class="text-sm">This didn't work — try signing in again.</p>
      <NuxtLink to="/ops/login" class="btn btn-outline font-black uppercase">Go to login</NuxtLink>
    </div>
  </main>
</template>
