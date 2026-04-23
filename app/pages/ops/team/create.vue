<script setup lang="ts">
import { useForm } from "vee-validate";
import { teamCreateSchema } from "~/schemas/team.schema";

definePageMeta({ middleware: ["auth"] });

const router = useRouter();
const serverError = ref("");
const skillsWanted = ref<string[]>([]);
const skillsError = ref("");

const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: teamCreateSchema,
  initialValues: { name: "", description: "" },
});

const [name, nameAttrs] = defineField("name");
const [description, descriptionAttrs] = defineField("description");

const createTeam = handleSubmit(async (values) => {
  serverError.value = "";
  skillsError.value = "";

  if (!skillsWanted.value.length) {
    skillsError.value = "Please select at least one skill";
    return;
  }

  const res = await $fetch("/api/teams", {
    method: "POST",
    body: {
      name: values.name,
      skills_wanted: skillsWanted.value,
      description: values.description || null,
    },
  }).catch((e) => e.data);

  if (res?.statusCode >= 400) {
    serverError.value = res.message ?? "Something went wrong";
    return;
  }

  router.push("/ops/dashboard");
});
</script>

<template>
  <main class="w-full flex flex-col items-center justify-center p-8">
    <form
      class="max-w-xl flex flex-col gap-2 bg-base-100 border-primary border-2 p-8"
      @submit.prevent="createTeam"
    >
      <div class="flex justify-between gap-2">
        <h1 class="text-4xl font-black uppercase tracking-tight">
          Form a Team
        </h1>
        <NuxtLink to="/ops/teams" class="btn btn-outline font-black uppercase"
          >> Back</NuxtLink
        >
      </div>

      <div v-if="serverError" role="alert" class="alert alert-error text-sm">
        {{ serverError }}
      </div>

      <label class="form-control">
        <span class="label-text font-bold">Team Name</span>
        <input
          v-model="name"
          v-bind="nameAttrs"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
        />
        <span v-if="errors.name" class="label-text-alt text-error mt-1">{{
          errors.name
        }}</span>
      </label>

      <div class="form-control">
        <span class="label-text font-bold">Skills Wanted</span>
        <SkillPicker v-model="skillsWanted" class="mt-1" />
        <span v-if="skillsError" class="label-text-alt text-error mt-1">{{
          skillsError
        }}</span>
      </div>

      <label class="form-control">
        <span class="label-text font-bold"
          >Description <span class="opacity-60">(optional)</span></span
        >
        <textarea
          v-model="description"
          v-bind="descriptionAttrs"
          class="textarea textarea-bordered w-full"
          rows="3"
        />
        <span
          v-if="errors.description"
          class="label-text-alt text-error mt-1"
          >{{ errors.description }}</span
        >
      </label>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="btn btn-primary w-full font-black uppercase mt-2"
      >
        {{ isSubmitting ? "Creating…" : "Create Team" }}
      </button>
    </form>
  </main>
</template>
