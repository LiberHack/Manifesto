<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const router = useRouter()

const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function login() {
  error.value = ''
  loading.value = true

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
  })

  loading.value = false

  if (authError) { error.value = authError.message; return }
  router.push('/teams')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md space-y-4" @submit.prevent="login">
      <h1 class="text-4xl font-black uppercase tracking-tight">Login</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <label class="form-control">
        <span class="label-text font-bold">Email</span>
        <input v-model="form.email" type="email" required class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Password</span>
        <input v-model="form.password" type="password" required class="input input-bordered w-full" />
      </label>

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? 'Logging in…' : 'Log in' }}
      </button>

      <p class="text-sm text-center">
        No account? <NuxtLink to="/register" class="link">Register</NuxtLink>
      </p>
    </form>
  </main>
</template>
