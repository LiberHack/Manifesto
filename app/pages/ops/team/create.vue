<script setup lang="ts">
import { useForm } from 'vee-validate'
import { teamCreateSchema } from '~/schemas/team.schema'

definePageMeta({ middleware: ['auth'] })

const router = useRouter()
const serverError = ref('')

const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: teamCreateSchema,
  initialValues: {
    name: '',
    skills_wanted: '',
    description: ''
  }
})

const [name, nameAttrs] = defineField('name')
const [skillsWanted, skillsWantedAttrs] = defineField('skills_wanted')
const [description, descriptionAttrs] = defineField('description')

const createTeam = handleSubmit(async (values) => {
  serverError.value = ''

  const parsedSkills = values.skills_wanted
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(parsedSkills)

  const res = await $fetch('/api/teams', {
    method: 'POST',
    body: {
      name: values.name,
      skills_wanted: parsedSkills,
      description: values.description || null
    },
  }).catch((e) => e.data)

  if (res?.statusCode >= 400) {
    serverError.value = res.message ?? 'Something went wrong'
    return
  }

  router.push('/dashboard')
})
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="flex gap-2 items-center">
    </div>

    <form class="w-full max-w-md flex flex-col gap-2" @submit.prevent="createTeam">
      <div class="flex justify-between">
        <h1 class="text-4xl font-black uppercase tracking-tight">Form a Team</h1>
        <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase">> Back</NuxtLink>

      </div>

      <div v-if="serverError" role="alert" class="alert alert-error text-sm">
        {{ serverError }}
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Team Name</span>
        <input v-model="name" v-bind="nameAttrs" type="text" class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }" />
        <span v-if="errors.name" class="label-text-alt text-error mt-1">{{ errors.name }}</span>
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Skills Wanted <span class="opacity-60">(comma-separated)</span></span>
        <input v-model="skillsWanted" v-bind="skillsWantedAttrs" type="text" placeholder="Vue, Design, DevOps"
          class="input input-bordered w-full" :class="{ 'input-error': errors.skills_wanted }" />
        <span v-if="errors.skills_wanted" class="label-text-alt text-error mt-1">{{ errors.skills_wanted }}</span>
      </label>

      <label class="form-control">
        <span class="label-text font-bold">Description <span class="opacity-60">(optional)</span></span>
        <textarea v-model="description" v-bind="descriptionAttrs" class="textarea textarea-bordered w-full" rows="3" />
        <span v-if="errors.skills_wanted" class="label-text-alt text-error mt-1">{{ errors.description }}</span>

      </label>

      <button type="submit" :disabled="isSubmitting" class="btn btn-primary w-full font-black uppercase mt-2">
        {{ isSubmitting ? 'Creating…' : 'Create Team' }}
      </button>
    </form>
  </main>
</template>
