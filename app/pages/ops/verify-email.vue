<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const resending = ref(false)
const resendMessage = ref('')

watch(user, (u) => {
  if (u?.email_confirmed_at) router.replace('/ops/dashboard')
}, { immediate: true })

async function resend() {
  if (!user.value?.email) return
  resending.value = true
  resendMessage.value = ''
  const { error } = await supabase.auth.resend({ type: 'signup', email: user.value.email })
  resendMessage.value = error ? error.message : 'Email sent — check your inbox.'
  resending.value = false
}

async function logout() {
  await supabase.auth.signOut()
  router.push('/ops/login')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md flex flex-col gap-4">
      <h1 class="text-4xl font-black uppercase tracking-tight">Check your email</h1>
      <p class="text-base-content/70">
        We sent a verification link to <strong>{{ user?.email }}</strong>.<br />
        Click it to activate your account before continuing.
      </p>

      <div v-if="resendMessage" class="alert text-sm" :class="resendMessage.includes('sent') ? 'alert-success' : 'alert-error'">
        {{ resendMessage }}
      </div>

      <div class="flex flex-col gap-2">
        <button class="btn btn-outline font-black uppercase" :disabled="resending" @click="resend">
          {{ resending ? 'Sending…' : 'Resend verification email' }}
        </button>
        <button class="btn btn-ghost btn-sm" @click="logout">Log out</button>
      </div>
    </div>
  </main>
</template>
