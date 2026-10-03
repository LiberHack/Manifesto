<script setup lang="ts">
definePageMeta({ middleware: [] });

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const route = useRoute();
const rawInvite = route.query.invite as string | undefined;
const invite = rawInvite?.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;
const timedOut = ref(false);
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let routed = false;

function finish(signedIn: boolean) {
  if (routed) return;
  routed = true;
  if (timeoutId) clearTimeout(timeoutId);
  if (signedIn) {
    navigateTo(invite ? `/ops/invite/${invite}` : "/ops/teams");
  } else {
    // No session from this link: it was opened in another browser (no PKCE
    // verifier here) or has expired. The email is confirmed either way.
    navigateTo(invite ? `/ops/login?confirmed=1&invite=${invite}` : "/ops/login?confirmed=1");
  }
}

watch(user, () => {
  if (user.value) finish(true);
}, { immediate: true });

// getSession() resolves only after the client has finished initialising,
// including the ?code= exchange, so "no session" is the outcome of this link.
// (Checking for the PKCE verifier instead raced the exchange, which deletes
// the verifier as soon as it succeeds.) A session is left to the user watch:
// the auth middleware reads useSupabaseUser(), which updates a tick later.
onMounted(async () => {
  if (user.value) return;
  timeoutId = setTimeout(() => {
    if (!routed) timedOut.value = true;
  }, 10000);
  const { data } = await supabase.auth.getSession();
  if (!data.session) finish(false);
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
