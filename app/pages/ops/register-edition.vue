<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

interface RegistrationState {
  edition: {
    slug: string;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
  registered: boolean;
  full: boolean;
  prefill: {
    skills: string[];
    dietary: string | null;
    experience: "" | "beginner" | "intermediate" | "experienced" | null;
    public: boolean;
  } | null;
}

const router = useRouter();
const route = useRoute();
const { refresh: refreshMe } = await useMe();

// Only ever an internal path, so a crafted ?next= cannot redirect off-site.
const nextPath = computed(() => {
  const next = route.query.next;
  return typeof next === "string" && /^\/(?!\/)/.test(next)
    ? next
    : "/ops/dashboard";
});
const { data: state } = await useFetch<RegistrationState>("/api/me/registration");

const form = reactive({
  skills: [...(state.value?.prefill?.skills ?? [])],
  dietary: state.value?.prefill?.dietary ?? "",
  // Pre-selected from the prior edition but still required, so the user
  // consciously re-answers it.
  experience: (state.value?.prefill?.experience ?? "") as
    | ""
    | "beginner"
    | "intermediate"
    | "experienced",
  public: state.value?.prefill?.public ?? true,
  coc: false,
});

const error = ref("");
const loading = ref(false);

const isFull = computed(() => state.value?.full ?? true);
const editionName = computed(() => state.value?.edition?.name ?? "this edition");

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await $fetch("/api/me/registration", {
      method: "POST",
      body: {
        skills: form.skills,
        dietary: form.dietary,
        experience: form.experience,
        public: form.public,
        accepted_terms: form.coc,
      },
    });
    await refreshMe();
    await router.push(nextPath.value);
  } catch (e: unknown) {
    const message = (e as { data?: { message?: string } }).data?.message;
    error.value =
      message === "registration_closed"
        ? `Registration for ${editionName.value} is full.`
        : (message ?? "Something went wrong");
  }
  loading.value = false;
}
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4 py-12">
    <div class="w-full max-w-md bg-base-100 p-8 border-primary border-2 flex flex-col gap-3">
      <template v-if="!state?.edition">
        <h1 class="text-3xl font-black uppercase tracking-tight">Not open yet</h1>
        <p class="text-sm opacity-70">
          There is no edition open for registration right now. Check back soon.
        </p>
      </template>

      <template v-else-if="state.registered">
        <h1 class="text-3xl font-black uppercase tracking-tight">You're in</h1>
        <p class="text-sm opacity-70">
          You're already registered for {{ state.edition.name }}.
        </p>
        <NuxtLink :to="nextPath" class="btn btn-primary font-black uppercase">
          Continue
        </NuxtLink>
      </template>

      <template v-else-if="isFull">
        <h1 class="text-3xl font-black uppercase tracking-tight">Registration full</h1>
        <p class="text-sm opacity-70">
          {{ state.edition.name }} has reached its participant limit. Your
          account is safe — you'll be able to register for the next edition.
        </p>
      </template>

      <form v-else class="flex flex-col gap-2" @submit.prevent="submit">
        <h1 class="text-3xl font-black uppercase tracking-tight">
          Register for {{ state.edition.name }}
        </h1>
        <p class="text-sm opacity-70">
          Your account carries over. Confirm your details for this edition.
        </p>

        <div v-if="error" role="alert" class="alert alert-error text-sm">
          {{ error }}
        </div>

        <div class="form-control">
          <span class="label-text font-bold">Your Skills</span>
          <span class="label-text text-xs opacity-60 mb-1">
            Carried over from your last edition — edit as you like.
          </span>
          <SkillPicker v-model="form.skills" allow-create />
        </div>

        <label class="form-control">
          <span class="label-text font-bold">Experience Level</span>
          <span class="label-text text-xs opacity-60 mb-1">
            Please re-confirm this for {{ state.edition.name }}.
          </span>
          <select v-model="form.experience" required class="select select-bordered w-full">
            <option value="" disabled>Select your level…</option>
            <option value="beginner">Beginner — new to hacking / tech events</option>
            <option value="intermediate">Intermediate — been to a few, comfortable building</option>
            <option value="experienced">Experienced — seasoned hacker</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text font-bold">Dietary Requirements</span>
          <input
            v-model="form.dietary"
            type="text"
            maxlength="200"
            placeholder="e.g. vegetarian, gluten-free, none"
            class="input input-bordered w-full"
          />
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            :checked="!form.public"
            type="checkbox"
            class="checkbox checkbox-primary mt-1 shrink-0"
            @change="form.public = !($event.target as HTMLInputElement).checked"
          />
          <span class="text-sm leading-snug">
            Hide my profile from the public archive.
            <span class="opacity-60">
              Your profile and team are shown in the public showcase by default.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="form.coc" type="checkbox" required class="checkbox checkbox-primary mt-1 shrink-0" />
          <span class="text-sm leading-snug">
            I have read and agree to the
            <NuxtLink to="/legal/coc" target="_blank" class="link font-bold">Code of Conduct</NuxtLink>,
            <NuxtLink to="/legal/privacy" target="_blank" class="link font-bold">Privacy Policy</NuxtLink>,
            and the
            <NuxtLink to="/reglament" target="_blank" class="link font-bold">Регламент</NuxtLink>.
          </span>
        </label>

        <button
          type="submit"
          :disabled="loading || !form.coc || !form.experience"
          class="btn btn-primary w-full font-black uppercase"
        >
          {{ loading ? "Registering…" : `Register for ${state.edition.name}` }}
        </button>
      </form>
    </div>
  </main>
</template>
