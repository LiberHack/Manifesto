<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

const email = computed(
  () => user.value?.email ?? (route.query.email as string | undefined) ?? ''
)

const resending = ref(false)
const resendMessage = ref('')
const resendError = ref(false)
const cooldownSecs = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

function startCooldown(secs: number) {
  cooldownSecs.value = secs
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldownSecs.value--
    if (cooldownSecs.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

onUnmounted(() => { if (cooldownTimer) clearInterval(cooldownTimer) })

function onConfirmed() {
  router.replace('/ops/dashboard')
}

watch(user, (u) => {
  if (u?.email_confirmed_at) onConfirmed()
}, { immediate: true })

const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'USER_UPDATED' && session?.user?.email_confirmed_at) onConfirmed()
})

onUnmounted(() => subscription.unsubscribe())

async function resend() {
  if (!email.value || cooldownSecs.value > 0) return
  resending.value = true
  resendMessage.value = ''
  resendError.value = false

  const { error } = await supabase.auth.resend({ type: 'signup', email: email.value })
  resending.value = false

  if (error) {
    resendError.value = true
    resendMessage.value = error.status === 429
      ? 'Too many attempts — try again later.'
      : error.message
    startCooldown(error.status === 429 ? 300 : 60)
  } else {
    resendMessage.value = 'Email sent — check your inbox.'
    startCooldown(60)
  }
}

async function logout() {
  await supabase.auth.signOut()
  router.push('/ops/login')
}
</script>

<template>
  <main class="fixed inset-0 w-screen h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md flex flex-col gap-4 bg-base-100 p-8 border-primary border-2">
      <h1 class="text-4xl font-black uppercase tracking-tight">Check your email</h1>
      <p class="text-base-content/70">
        We sent a verification link to <strong>{{ email || '…' }}</strong>.<br />
        Click it to activate your account — then proceed in the new window
      </p>

      <div v-if="resendMessage" class="alert text-sm" :class="resendError ? 'alert-error' : 'alert-success'">
        {{ resendMessage }}
      </div>

      <div class="flex flex-col gap-2">
        <button class="btn btn-outline font-black uppercase" :disabled="resending || cooldownSecs > 0 || !email"
          @click="resend">
          <template v-if="resending">Sending…</template>
          <template v-else-if="cooldownSecs > 0">Resend in {{ cooldownSecs }}s</template>
          <template v-else>Resend verification email</template>
        </button>
        <button class="btn btn-ghost btn-sm" @click="logout">Log out</button>
      </div>
    </div>
  </main>
</template>
