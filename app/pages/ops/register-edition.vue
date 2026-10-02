<script setup lang="ts">
import { DIETS, MAX_DIETARY_NOTE_LENGTH, type Diet } from "#shared/utils/privacy";
import {
  contactFormFrom,
  profileFormFrom,
  type ContactForm,
  type ProfileForm,
} from "#shared/teamFormation";

definePageMeta({ middleware: ["auth"] });

interface SponsorRecipient {
  id: string;
  organisation: string;
  purpose: string;
  shared_fields: string[];
}

interface RegistrationState {
  edition: {
    slug: string;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
  registered: boolean;
  full: boolean;
  prefill: (Partial<ProfileForm> & {
    skills: string[];
    experience: "" | "beginner" | "intermediate" | "experienced" | null;
    contact?: Parameters<typeof contactFormFrom>[0];
  }) | null;
  notice_version: string;
  sponsor_recipients: SponsorRecipient[];
  dietary_notes_enabled: boolean;
}

const DIET_LABELS: Record<Diet, string> = {
  none: "No requirements",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  other: "Something else — I'll add a short note",
};
const FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  skills: "skills",
  experience: "experience level",
};

const router = useRouter();
const route = useRoute();
const { refresh: refreshMe } = await useMe();
const { track } = useAnalyticsConsent();
onMounted(() => track("registration_started"));

// Only ever an internal path, so a crafted ?next= cannot redirect off-site.
const nextPath = computed(() => {
  const next = route.query.next;
  return typeof next === "string" && /^\/(?!\/)/.test(next)
    ? next
    : "/ops/dashboard";
});
const { data: state, refresh: refreshState } =
  await useFetch<RegistrationState>("/api/me/registration");

const form = reactive({
  skills: [...(state.value?.prefill?.skills ?? [])],
  // Pre-selected from the prior edition but still required, so the user
  // consciously re-answers it.
  experience: (state.value?.prefill?.experience ?? "") as
    | ""
    | "beginner"
    | "intermediate"
    | "experienced",
  diet: "" as "" | Diet,
  dietaryNote: "",
  dietaryNoteConsent: false,
  // Opt-in: nothing is published unless ticked.
  public: false,
  terms: false,
  privacyNotice: false,
  // recipient id → true (share) / false (don't). No preselected answer.
  sponsorChoices: {} as Record<string, boolean>,
  recruitmentAdult: null as boolean | null,
  marketingEmail: false,
});

// Matching status is never prefilled: discovery consent is given per edition.
const profile = ref<ProfileForm>({
  ...profileFormFrom(state.value?.prefill),
  matching_status: null,
});
const contact = ref<ContactForm>(contactFormFrom(state.value?.prefill?.contact));

const error = ref("");
const loading = ref(false);

const isFull = computed(() => state.value?.full ?? true);
const editionName = computed(() => state.value?.edition?.name ?? "this edition");
const recipients = computed(() => state.value?.sponsor_recipients ?? []);
const notesEnabled = computed(() => state.value?.dietary_notes_enabled === true);
const hasNote = computed(
  () => notesEnabled.value && form.diet === "other" && form.dietaryNote.trim() !== "",
);
const allSponsorsAnswered = computed(() =>
  recipients.value.every((r) => typeof form.sponsorChoices[r.id] === "boolean"),
);
const anySponsorYes = computed(() => recipients.value.some((r) => form.sponsorChoices[r.id] === true));
const canSubmit = computed(
  () =>
    form.terms &&
    form.privacyNotice &&
    allSponsorsAnswered.value &&
    (!anySponsorYes.value || form.recruitmentAdult !== null) &&
    form.experience !== "" &&
    form.diet !== "" &&
    (!hasNote.value || form.dietaryNoteConsent) &&
    // A preferred contact is required ("Email only" is the explicit opt-out).
    !!contact.value.method,
);

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await $fetch("/api/me/registration", {
      method: "POST",
      body: {
        skills: form.skills,
        experience: form.experience,
        public: form.public,
        diet: form.diet,
        dietary_note: hasNote.value ? form.dietaryNote : null,
        dietary_note_consent: hasNote.value ? form.dietaryNoteConsent : false,
        accepted_terms: form.terms,
        privacy_notice_acknowledged: form.privacyNotice,
        notice_version: state.value?.notice_version,
        sponsor_choices: Object.fromEntries(
          recipients.value.map((r) => [r.id, form.sponsorChoices[r.id]]),
        ),
        recruitment_adult: anySponsorYes.value ? form.recruitmentAdult : null,
        marketing_email: form.marketingEmail,
        ...profile.value,
        contact: contact.value,
      },
    });
    await refreshMe();
    await router.push(nextPath.value);
  } catch (e: unknown) {
    const message = (e as { data?: { message?: string } }).data?.message;
    if (message === "email_unverified") {
      loading.value = false;
      await router.push("/ops/verify-email");
      return;
    }
    if (message === "sponsor_recipients_changed" || message === "notice_changed") {
      // What the person is acknowledging changed while the form was open.
      await refreshState();
      form.sponsorChoices = {};
      form.privacyNotice = false;
      error.value =
        "The sponsor list or the Privacy Notice changed while you were filling this in. Please review it and confirm again.";
    } else {
      error.value =
        message === "registration_closed"
          ? `Registration for ${editionName.value} is full.`
          : (message ?? "Something went wrong");
    }
  }
  loading.value = false;
}
</script>

<template>
  <main class="w-full min-h-screen flex items-center justify-center p-4 py-12">
    <div class="w-full max-w-lg bg-base-100 p-8 border-primary border-2 flex flex-col gap-3">
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

      <form v-else class="flex flex-col gap-3" @submit.prevent="submit">
        <h1 class="text-3xl font-black uppercase tracking-tight">
          Register for {{ state.edition.name }}
        </h1>
        <p class="text-sm opacity-70">
          Your account carries over. Confirm your details for this edition.
        </p>
        <p v-if="isFull" class="alert alert-info text-sm">Seats are full. Register to join the waitlist; an offer will show its expiry time on your dashboard.</p>

        <div v-if="error" role="alert" class="alert alert-error text-sm">
          {{ error }}
        </div>

        <div class="form-control">
          <span class="label-text font-bold">Your Skills</span>
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

        <!-- Catering: structured first, free text only with explicit consent. -->
        <fieldset class="flex flex-col gap-2 border-2 border-base-content/20 p-3">
          <legend class="font-bold px-1">Food</legend>
          <label class="form-control">
            <span class="label-text text-xs opacity-60 mb-1">
              Only the organisers and the caterer see this. It is never shared with sponsors.
            </span>
            <select v-model="form.diet" required class="select select-bordered w-full">
              <option value="" disabled>Choose one…</option>
              <option v-for="diet in DIETS" :key="diet" :value="diet">{{ DIET_LABELS[diet] }}</option>
            </select>
          </label>
          <label v-if="form.diet === 'other' && notesEnabled" class="form-control">
            <span class="label-text font-bold">Short note (optional)</span>
            <span class="label-text text-xs opacity-60 mb-1">
              Just what the kitchen needs, e.g. "no nuts" or "halal". Please don't
              include medical details beyond that.
            </span>
            <input
              v-model="form.dietaryNote"
              type="text"
              :maxlength="MAX_DIETARY_NOTE_LENGTH"
              class="input input-bordered w-full"
            />
          </label>
          <label v-if="hasNote" class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="form.dietaryNoteConsent"
              type="checkbox"
              class="checkbox checkbox-primary mt-1 shrink-0"
            />
            <span class="text-sm leading-snug">
              I explicitly consent to LiberHack storing this note to arrange my
              food. It may reveal health or religious information. I can delete it
              any time in my privacy settings.
            </span>
          </label>
        </fieldset>

        <!-- Sponsor sharing: voluntary, an explicit Yes/No per named organisation. -->
        <fieldset v-if="recipients.length" class="flex flex-col gap-3 border-2 border-primary p-3">
          <legend class="font-bold px-1">Jobs and internships · Стажове и работа</legend>
          <p class="text-sm leading-snug">
            Would you like us to share your name, email, skills and experience
            level with
            {{ recipients.length === 1 ? "the organisation" : "each organisation" }}
            below so they can contact you about jobs and internships?
            <strong>Your answer does not affect your participation.</strong>
          </p>
          <p lang="bg" class="text-sm leading-snug opacity-80">
            Искате ли да споделим вашите име, имейл, умения и ниво на опит с
            {{ recipients.length === 1 ? "организацията" : "всяка от организациите" }}
            по-долу, за да се свържат с вас за стажове и работа?
            <strong>Отговорът ви не влияе на участието ви.</strong>
          </p>

          <div
            v-for="r in recipients"
            :key="r.id"
            role="radiogroup"
            :aria-labelledby="`sponsor-${r.id}`"
            class="flex flex-col gap-1"
          >
            <p :id="`sponsor-${r.id}`" class="text-sm">
              <strong>{{ r.organisation }}</strong> — {{ r.purpose }}
            </p>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input
                v-model="form.sponsorChoices[r.id]"
                type="radio"
                :name="`sponsor-${r.id}`"
                :value="true"
                required
                class="radio radio-primary radio-sm"
              />
              Yes, share my profile · Да, споделете профила ми
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input
                v-model="form.sponsorChoices[r.id]"
                type="radio"
                :name="`sponsor-${r.id}`"
                :value="false"
                class="radio radio-primary radio-sm"
              />
              No, do not share my profile · Не, не споделяйте профила ми
            </label>
          </div>

          <div v-if="anySponsorYes" role="radiogroup" aria-labelledby="recruitment-age" class="flex flex-col gap-1">
            <p id="recruitment-age" class="text-sm">
              Are you 18 or older? · Навършили ли сте 18 години?
              <span class="opacity-60">We only share profiles of people aged 18 or over.</span>
            </p>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input v-model="form.recruitmentAdult" type="radio" name="recruitment-age" :value="true" required class="radio radio-primary radio-sm" />
              Yes · Да
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input v-model="form.recruitmentAdult" type="radio" name="recruitment-age" :value="false" class="radio radio-primary radio-sm" />
              No · Не
            </label>
          </div>

          <p class="text-xs opacity-70 leading-snug">
            Never shared: food choices, analytics, password or account data. Each
            organisation uses the profile independently under its own privacy
            policy. You can change your answer any time in your
            <NuxtLink to="/ops/privacy" target="_blank" class="link">privacy settings</NuxtLink>.
          </p>
        </fieldset>

        <ContactFields v-model="contact" />

        <div class="divider my-1" />
        <ProfileFields v-model="profile" />
        <div class="divider my-1" />

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="form.public" type="checkbox" class="checkbox checkbox-primary mt-1 shrink-0" />
          <span class="text-sm leading-snug">
            Show my name and team in the public archive after the event.
            <span class="opacity-60">Optional. Off unless you tick it.</span>
          </span>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="form.marketingEmail" type="checkbox" class="checkbox checkbox-primary mt-1 shrink-0" />
          <span class="text-sm leading-snug">
            Email me about future LiberHack events.
            <span class="opacity-60">Optional. You can unsubscribe any time.</span>
          </span>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="form.terms" type="checkbox" required class="checkbox checkbox-primary mt-1 shrink-0" />
          <span class="text-sm leading-snug">
            I agree to the
            <NuxtLink to="/reglament" target="_blank" class="link font-bold">Регламент</NuxtLink>
            and the
            <NuxtLink to="/legal/coc" target="_blank" class="link font-bold">Code of Conduct</NuxtLink>.
          </span>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="form.privacyNotice" type="checkbox" required class="checkbox checkbox-primary mt-1 shrink-0" />
          <span class="text-sm leading-snug">
            I have read the
            <NuxtLink to="/legal/privacy" target="_blank" class="link font-bold">Privacy Notice</NuxtLink>
            (<NuxtLink to="/legal/privacy-bg" target="_blank" class="link">на български</NuxtLink>).
          </span>
        </label>

        <button
          type="submit"
          :disabled="loading || !canSubmit"
          class="btn btn-primary w-full font-black uppercase"
        >
          {{ loading ? "Registering…" : isFull ? "Join waitlist" : `Register for ${state.edition.name}` }}
        </button>
      </form>
    </div>
  </main>
</template>
