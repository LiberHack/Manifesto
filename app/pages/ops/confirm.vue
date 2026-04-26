<script setup lang="ts">
definePageMeta({ middleware: [] });

const user = useSupabaseUser();
const route = useRoute();
const rawInvite = route.query.invite as string | undefined;
const invite = rawInvite?.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;

watch(user, () => {
  if (user.value) {
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
  }
});
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center">
    <p class="text-sm opacity-50 font-mono uppercase tracking-widest">Verifying…</p>
  </main>
</template>
