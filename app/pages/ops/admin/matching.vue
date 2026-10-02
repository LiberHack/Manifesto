<script setup lang="ts">
import { MAX_TEAM_SIZE, type PublicProfile } from "#shared/teamFormation";

definePageMeta({ middleware: ["admin"] });

interface QueueRow {
  profile: PublicProfile;
  registered_at: string;
  matching_status: string | null;
  help_requested_at: string | null;
  requests: { pending: number; closed: number };
}

interface ProposalRow {
  id: string;
  name: string;
  status: "open" | "formed" | "cancelled";
  created_at: string;
  members: Array<{
    position: number;
    response: string;
    registration: { id: string; participant: { name: string } | null } | null;
  }>;
}

interface ReportRow {
  id: string;
  status: "open" | "resolved";
  reason: string;
  created_at: string;
  conversation: { kind: string; team: { name: string } | null } | null;
  reporter: { participant: { name: string } | null } | null;
}

interface ReportDetail {
  report: { id: string; reason: string; status: string; message_id: number | null };
  messages: Array<{
    id: number;
    author_name: string;
    body: string;
    created_at: string;
    hidden_at: string | null;
    reported: boolean;
  }>;
}

const [{ data: queue, refresh: refreshQueue }, { data: proposals, refresh: refreshProposals }, { data: reports, refresh: refreshReports }] =
  await Promise.all([
    useFetch<QueueRow[]>("/api/admin/matching/queue", { default: () => [] }),
    useFetch<ProposalRow[]>("/api/admin/proposals", { default: () => [] }),
    useFetch<ReportRow[]>("/api/admin/reports", { default: () => [] }),
  ]);

function daysSince(iso: string) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

// ── Proposals ─────────────────────────────────────────────────────────────────
const picked = ref<string[]>([]);
const proposal = reactive({ name: "", note: "" });
const proposalError = ref("");
const proposing = ref(false);

async function propose() {
  proposing.value = true;
  proposalError.value = "";
  try {
    await $fetch("/api/admin/proposals", {
      method: "POST",
      body: { name: proposal.name, note: proposal.note, registration_ids: picked.value },
    });
    picked.value = [];
    proposal.name = "";
    proposal.note = "";
    await Promise.all([refreshProposals(), refreshQueue()]);
  } catch (e: any) {
    proposalError.value = e.data?.message ?? "Something went wrong";
  }
  proposing.value = false;
}

async function cancelProposal(id: string) {
  if (!confirm("Withdraw this proposal?")) return;
  await $fetch(`/api/admin/proposals/${id}`, { method: "DELETE" });
  await refreshProposals();
}

// ── Reports ───────────────────────────────────────────────────────────────────
const openReport = ref<ReportDetail | null>(null);
const resolutionNote = ref("");

async function viewReport(id: string) {
  openReport.value = await $fetch<ReportDetail>(`/api/admin/reports/${id}`);
  resolutionNote.value = "";
}

async function resolve(hideMessage: boolean) {
  if (!openReport.value) return;
  await $fetch(`/api/admin/reports/${openReport.value.report.id}`, {
    method: "PATCH",
    body: { hide_message: hideMessage, note: resolutionNote.value },
  });
  openReport.value = null;
  await refreshReports();
}
</script>

<template>
  <main class="w-full max-w-5xl min-w-0 mx-auto p-4 sm:p-6 my-8 space-y-10 bg-base-100 border-2 border-primary [overflow-wrap:anywhere]">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-xl md:text-4xl font-black uppercase">Matching &amp; reports</h1>
      <NuxtLink to="/ops/admin" class="btn btn-outline btn-sm font-black uppercase">> Admin</NuxtLink>
    </div>

    <section class="space-y-4">
      <h2 class="text-2xl font-bold">Unmatched participants ({{ queue.length }})</h2>
      <p class="text-sm opacity-70">
        Looking for a team or asked for help, with no team yet. Tick 2–{{ MAX_TEAM_SIZE }} people to
        propose a new team; it forms only if every one of them accepts.
      </p>

      <ul class="grid gap-3 md:grid-cols-2">
        <li v-for="row in queue" :key="row.profile.registration_id" class="p-3 border border-base-content/20 flex gap-3">
          <input
            v-model="picked"
            type="checkbox"
            class="checkbox checkbox-primary mt-1"
            :value="row.profile.registration_id"
            :aria-label="`Select ${row.profile.name}`"
          />
          <div class="flex flex-col gap-1 min-w-0">
            <ProfileCard :profile="row.profile" />
            <p class="text-xs opacity-70">
              Registered {{ daysSince(row.registered_at) }}d ago ·
              {{ row.requests.pending }} open / {{ row.requests.closed }} closed requests
              <span v-if="row.help_requested_at" class="badge badge-warning badge-xs ml-1">asked for help</span>
            </p>
          </div>
        </li>
      </ul>

      <form v-if="picked.length" class="p-4 border-2 border-primary flex flex-col gap-2" @submit.prevent="propose">
        <p class="font-bold">Propose a team of {{ picked.length }}</p>
        <input v-model="proposal.name" maxlength="32" required placeholder="Team name" class="input input-bordered input-sm" />
        <textarea
          v-model="proposal.note"
          maxlength="500"
          rows="2"
          placeholder="Why these people fit together (shown to them, not used as the team description)"
          class="textarea textarea-bordered"
        />
        <p v-if="proposalError" class="text-error text-sm">{{ proposalError }}</p>
        <button
          type="submit"
          class="btn btn-primary btn-sm self-start"
          :disabled="proposing || picked.length < 2 || picked.length > MAX_TEAM_SIZE"
        >
          Send proposal
        </button>
      </form>
    </section>

    <section class="space-y-3">
      <h2 class="text-2xl font-bold">Proposals</h2>
      <p v-if="!proposals.length" class="opacity-60 text-sm">None yet.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="p in proposals" :key="p.id" class="p-3 border border-base-content/20 flex flex-col gap-1">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-bold">{{ p.name }} <span class="badge badge-sm">{{ p.status }}</span></span>
            <button v-if="p.status === 'open'" class="btn btn-ghost btn-xs" @click="cancelProposal(p.id)">Withdraw</button>
          </div>
          <p class="text-xs">
            <span v-for="m in [...p.members].sort((a, b) => a.position - b.position)" :key="m.position" class="mr-3">
              {{ m.registration?.participant?.name }}: {{ m.response }}
            </span>
          </p>
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <h2 class="text-2xl font-bold">Conversation reports</h2>
      <p class="text-sm opacity-70">
        Organizers can read a conversation only through a report about it.
      </p>
      <p v-if="!reports.length" class="opacity-60 text-sm">No reports.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="r in reports" :key="r.id" class="p-3 border border-base-content/20 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm">
            <span class="badge badge-sm" :class="r.status === 'open' ? 'badge-warning' : ''">{{ r.status }}</span>
            {{ r.conversation?.team?.name }} ({{ r.conversation?.kind }}) — reported by
            {{ r.reporter?.participant?.name ?? "a removed account" }}: “{{ r.reason }}”
          </span>
          <button class="btn btn-outline btn-xs" @click="viewReport(r.id)">Review</button>
        </li>
      </ul>
    </section>

    <dialog v-if="openReport" class="modal modal-open" @click.self="openReport = null">
      <div class="modal-box max-w-2xl [overflow-wrap:anywhere]">
        <h3 class="font-black text-lg mb-2">Report</h3>
        <p class="text-sm mb-4">“{{ openReport.report.reason }}”</p>
        <ol class="flex flex-col gap-2 max-h-96 overflow-y-auto">
          <li
            v-for="m in openReport.messages"
            :key="m.id"
            class="text-sm p-2 border"
            :class="m.reported ? 'border-warning' : 'border-base-content/10'"
          >
            <span class="text-xs opacity-60">{{ m.author_name }} · {{ new Date(m.created_at).toLocaleString() }}</span>
            <span v-if="m.hidden_at" class="badge badge-xs ml-2">hidden</span>
            <p class="whitespace-pre-wrap break-words">{{ m.body }}</p>
          </li>
        </ol>
        <textarea v-model="resolutionNote" maxlength="1000" rows="2" placeholder="Note (internal)" class="textarea textarea-bordered w-full mt-4" />
        <div class="modal-action flex-wrap">
          <button v-if="openReport.report.message_id" class="btn btn-warning btn-sm" @click="resolve(true)">
            Hide message &amp; resolve
          </button>
          <button class="btn btn-sm" @click="resolve(false)">Resolve</button>
          <button class="btn btn-ghost btn-sm" @click="openReport = null">Close</button>
        </div>
      </div>
    </dialog>
  </main>
</template>
