<script setup lang="ts">
interface Recipient {
  id: string;
  organisation: string;
  purpose: string;
  shared_fields: string[];
  created_at: string;
  retired_at: string | null;
  eligible: number;
}

interface AuditRow {
  id: number;
  export_kind: string;
  row_count: number;
  exported_at: string;
  exporter: { name: string } | null;
  recipient: { organisation: string } | null;
}

const props = defineProps<{ editionQuery: { edition?: string }; readOnly: boolean }>();
const query = computed(() => props.editionQuery);

const { data: sponsorData, refresh } = await useFetch<{ exports_enabled: boolean; recipients: Recipient[] }>(
  "/api/admin/sponsors",
  { query },
);
const recipients = computed(() => sponsorData.value?.recipients ?? []);
const exportsEnabled = computed(() => sponsorData.value?.exports_enabled === true);
const { data: audit, refresh: refreshAudit } = await useFetch<AuditRow[]>("/api/admin/exports", { query });

const form = reactive({ organisation: "", purpose: "" });
const error = ref("");

async function addRecipient() {
  error.value = "";
  try {
    await $fetch("/api/admin/sponsors", {
      method: "POST",
      query: props.editionQuery,
      body: { organisation: form.organisation, purpose: form.purpose || undefined },
    });
    form.organisation = "";
    form.purpose = "";
    await refresh();
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? "Failed to add";
  }
}

async function retire(r: Recipient) {
  if (!confirm(`Stop sharing with ${r.organisation}? This cannot be undone.`)) return;
  await $fetch(`/api/admin/sponsors/${r.id}/retire`, { method: "POST" });
  await refresh();
}

// The download is a plain link; refresh the log once the server has written it.
function afterExport() {
  setTimeout(refreshAudit, 1500);
}

const editionParam = computed(() => props.editionQuery.edition ?? "");
</script>

<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-2xl font-bold">Sponsor sharing</h2>
    <p class="text-sm opacity-70 max-w-3xl">
      A sponsor export only contains people whose current acknowledgment names
      that organisation, and only name, email, skills and experience. Someone who
      registered before a sponsor was added is not included for it until they
      confirm in their privacy settings. Recorded objections are excluded. Each
      download is checked when it is generated and written to the export log.
    </p>

    <div v-if="!exportsEnabled" role="note" class="alert alert-warning text-sm">
      Sponsor exports are switched off until the legal basis for mandatory sharing
      is documented (docs/privacy/README.md). An operator enables them with
      NUXT_SPONSOR_EXPORTS_ENABLED=true.
    </div>

    <div class="overflow-x-auto">
      <table class="table table-sm">
        <thead>
          <tr><th>Organisation</th><th>Purpose</th><th>Fields</th><th class="text-right">Eligible now</th><th /></tr>
        </thead>
        <tbody>
          <tr v-if="!recipients?.length"><td colspan="5" class="opacity-60">No sponsor organisations named yet.</td></tr>
          <tr v-for="r in recipients" :key="r.id" :class="{ 'opacity-50': r.retired_at }">
            <td class="font-bold">{{ r.organisation }}<span v-if="r.retired_at" class="badge badge-ghost badge-sm ml-2">retired</span></td>
            <td>{{ r.purpose }}</td>
            <td>{{ r.shared_fields.join(", ") }}</td>
            <td class="text-right tabular-nums">{{ r.eligible }}</td>
            <td class="flex gap-2 justify-end">
              <a
                v-if="!r.retired_at && exportsEnabled"
                :href="`/api/admin/sponsors/${r.id}/export`"
                download
                class="btn btn-outline btn-xs"
                @click="afterExport"
              >↓ Export</a>
              <button v-if="!r.retired_at && !readOnly" class="btn btn-ghost btn-xs" @click="retire(r)">Retire</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="!readOnly" class="flex flex-wrap items-end gap-2" @submit.prevent="addRecipient">
      <label class="form-control">
        <span class="label-text font-bold">Organisation (legal name)</span>
        <input v-model="form.organisation" required maxlength="120" class="input input-bordered input-sm w-64" />
      </label>
      <label class="form-control">
        <span class="label-text font-bold">Purpose</span>
        <input v-model="form.purpose" maxlength="300" placeholder="Internship and job recruitment" class="input input-bordered input-sm w-72" />
      </label>
      <button type="submit" class="btn btn-primary btn-sm">Add sponsor</button>
      <span v-if="error" role="alert" class="text-error text-sm">{{ error }}</span>
    </form>

    <div class="flex flex-wrap gap-2">
      <a :href="`/api/admin/sponsors/report?edition=${editionParam}`" download class="btn btn-outline btn-sm">
        ↓ Aggregate sponsor report (small groups suppressed)
      </a>
      <a :href="`/api/admin/catering/export?edition=${editionParam}`" download class="btn btn-outline btn-sm">
        ↓ Catering list (organisers only)
      </a>
    </div>

    <details>
      <summary class="cursor-pointer font-bold">Export log ({{ audit?.length ?? 0 }})</summary>
      <table class="table table-xs mt-2">
        <thead><tr><th>When</th><th>Who</th><th>Kind</th><th>Recipient</th><th class="text-right">Rows</th></tr></thead>
        <tbody>
          <tr v-for="a in audit" :key="a.id">
            <td>{{ new Date(a.exported_at).toLocaleString("en-GB", { timeZone: "Europe/Sofia" }) }}</td>
            <td>{{ a.exporter?.name ?? "—" }}</td>
            <td>{{ a.export_kind }}</td>
            <td>{{ a.recipient?.organisation ?? "—" }}</td>
            <td class="text-right tabular-nums">{{ a.row_count }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>
</template>
