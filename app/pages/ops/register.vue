<script setup lang="ts">
definePageMeta({ middleware: [] })

const supabase = useSupabaseClient()
const router = useRouter()

const form = reactive({ name: '', email: '', password: '', skills: '' })
const error = ref('')
const loading = ref(false)

async function register() {
  error.value = ''
  loading.value = true

  const skills = form.skills.split(',').map((s) => s.trim()).filter(Boolean)

  const { error: authError } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: { data: { name: form.name, skills } },
  })

  loading.value = false

  if (authError) { error.value = authError.message; return }
  router.push('/ops/teams')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="w-full max-w-md flex flex-col gap-2" @submit.prevent="register">
      <h1 class="text-4xl font-black uppercase tracking-tight">Register</h1>

      <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

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
        <span class="label-text font-bold">Skills <span class="opacity-60">(comma-separated)</span></span>
        <input v-model="form.skills" type="text" placeholder="TypeScript, Rust, UI/UX"
          class="input input-bordered w-full" />
      </label>

      <button type="submit" :disabled="loading" class="btn btn-primary w-full font-black uppercase">
        {{ loading ? 'Registering…' : 'Register' }}
      </button>

      <p class="text-sm text-center">
        Already registered? <NuxtLink to="/ops/login" class="link">Log in</NuxtLink>
      </p>
    </form>
  </main>
</template>
