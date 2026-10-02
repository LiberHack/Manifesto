<script setup lang="ts">
import { fromSofiaLocal, toSofiaLocal } from "~/utils/sofiaTime";

definePageMeta({ middleware: ["admin"] });
const { data, refresh } = await useFetch<any>("/api/admin/attendance");
const { data: timing, refresh: refreshTiming } = await useFetch<any>("/api/admin/attendance/config");

// The slot is stored as a UTC timestamp and edited as Sofia wall-clock time.
const formationSlot = computed({
  get: () => toSofiaLocal(timing.value?.team_formation_slot ?? null),
  set: (local: string) => {
    if (timing.value) timing.value.team_formation_slot = local ? fromSofiaLocal(local) : null;
  },
});
const message = ref("");
const reason = ref("Arrival desk");
async function checkin(id: string, checked_in: boolean) {
  try { await $fetch("/api/admin/attendance/checkin", { method: "POST", body: { registration_id: id, checked_in, reason: reason.value } }); await refresh(); message.value = "Check-in recorded."; }
  catch (e: any) { message.value = e.data?.message ?? "Check-in failed"; }
}
async function outreach(item: any, status: string) {
  try { await $fetch("/api/admin/attendance/outreach", { method: "POST", body: { queue: item.queue, subject_id: item.subject_id, status, outcome: item.outcome } }); await refresh(); }
  catch (e: any) { message.value = e.data?.message ?? "Outreach failed"; }
}
async function expireOffers() {
  try { const result = await $fetch<{ expired: number }>("/api/admin/attendance/expire", { method: "POST" }); await refresh(); message.value = `${result.expired} offers expired.`; }
  catch (e: any) { message.value = e.data?.message ?? "Could not expire offers"; }
}
async function saveTiming() {
  try {
    const body = { ...timing.value, arrival_host: timing.value.arrival_host?.trim() || null };
    await $fetch("/api/admin/attendance/config", { method: "PATCH", body }); await refreshTiming(); message.value = "Timing saved."; }
  catch (e: any) { message.value = e.data?.message ?? "Could not save timing"; }
}
async function snapshot(cutoff: string) {
  try { await $fetch("/api/admin/attendance/snapshot", { method: "POST", body: { cutoff } }); await refresh(); message.value = `${cutoff} snapshot captured.`; }
  catch (e: any) { message.value = e.data?.message ?? "Snapshot unavailable"; }
}
async function runOperations() {
  try {
    const r = await $fetch<any>("/api/admin/notifications/dispatch", { method: "POST" });
    await refresh();
    message.value = `Expired ${r.expired_offers} offers · snapshots ${r.snapshots.length ? r.snapshots.join(", ") : "none due"} · queued ${r.queued} · sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed}.`;
  } catch (e: any) { message.value = e.data?.message ?? "Operations run failed"; }
}
async function queueReminders() {
  try { const result = await $fetch<{ candidates: number }>("/api/admin/attendance/queue", { method: "POST" }); message.value = `${result.candidates} due reminder candidates queued (duplicates ignored).`; }
  catch (e: any) { message.value = e.data?.message ?? "Could not queue reminders"; }
}
</script>
<template>
  <main class="w-full max-w-5xl min-w-0 mx-auto p-4 md:p-8 space-y-8 bg-base-100 [overflow-wrap:break-word]">
    <div class="flex flex-wrap justify-between gap-3"><h1 class="text-3xl font-black uppercase">Attendance desk</h1><NuxtLink to="/ops/admin" class="btn btn-outline">← Admin</NuxtLink></div>
    <p v-if="message" role="status" class="alert alert-info">{{ message }}</p>
    <section v-if="timing" class="border-2 border-base-content p-4 space-y-3">
      <h2 class="text-xl font-black uppercase">Schedule and outreach</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 [&_label]:min-w-0 [&_input]:w-full [&_input]:min-w-0">
        <label v-for="field in ['reminder_mixer_days','reminder_reconfirm_days','reminder_arrival_hours','unanswered_request_hours','seat_offer_hours']" :key="field" class="form-control"><span class="label-text">{{ field.replaceAll('_', ' ') }}</span><input v-model.number="timing[field]" type="number" min="0" class="input input-bordered"></label>
        <label class="form-control"><span class="label-text">Arrival host</span><input v-model="timing.arrival_host" class="input input-bordered" maxlength="120"></label>
        <label class="form-control"><span class="label-text">Team formation slot</span><input v-model="formationSlot" type="datetime-local" class="input input-bordered"><span class="label-text-alt">Sofia time · clear to remove</span></label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" @click="saveTiming">Save timing</button>
        <button class="btn btn-outline" @click="queueReminders">Queue due reminders</button>
        <button class="btn btn-secondary" @click="runOperations">Run operations now</button>
      </div>
      <p class="text-xs opacity-70">Runs offer expiry, due snapshots, reminder queueing and email delivery. Until a schedule is configured, run it at least daily in the weeks before the event.</p>
      <div class="flex flex-wrap gap-2"><button v-for="cutoff in ['14_days','7_days','1_day']" :key="cutoff" class="btn btn-outline btn-sm" @click="snapshot(cutoff)">Capture {{ cutoff }} snapshot</button></div>
    </section>
    <section v-if="data" class="border-2 border-base-content p-4 space-y-3">
      <h2 class="text-xl font-black uppercase">{{ data.edition }} / metrics</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 [&_.stat]:min-w-0">
        <div class="stat bg-base-200"><div class="stat-title">Registered</div><div class="stat-value">{{ data.metrics.registered }}</div></div>
        <div class="stat bg-base-200"><div class="stat-title">Valid seats</div><div class="stat-value">{{ data.metrics.valid_registrations }}</div></div>
        <div class="stat bg-base-200"><div class="stat-title">Checked in</div><div class="stat-value">{{ data.metrics.checked_in }}</div></div>
        <div class="stat bg-base-200"><div class="stat-title">Cancelled</div><div class="stat-value">{{ data.metrics.cancelled }}</div></div>
      </div>
      <p>Attendance: {{ data.metrics.attendance_rate === null ? '—' : `${(data.metrics.attendance_rate * 100).toFixed(1)}%` }}. Denominator: accepted seats and active offers; no-shows stay included. {{ data.metrics.waitlisted }} waitlisted and {{ data.metrics.cancelled }} cancelled are separate.</p>
      <p>Matching opt-in {{ data.metrics.matching_opted_in }} · contacted {{ data.metrics.contacted }} · joined {{ data.metrics.joined }} · confirmed coming {{ data.metrics.reconfirmed }} · unanswered requests {{ data.metrics.unanswered_requests }} · whole-team cancellations {{ data.metrics.whole_team_cancellations }} · solo-to-team {{ data.metrics.solo_to_team }}</p>
      <p>Mean request response: {{ data.metrics.mean_response_hours === null ? '—' : `${data.metrics.mean_response_hours.toFixed(1)} hours` }}</p>
      <div v-for="c in data.metrics.cohort" :key="c.source">{{ c.source }}: {{ c.checked_in }} / {{ c.registrations }} checked in at 7-day snapshot</div>
      <button class="btn btn-outline btn-sm" @click="expireOffers">Expire due offers and offer next seats</button>
    </section>
    <section v-if="data" class="space-y-3">
      <h2 class="text-xl font-black uppercase">Follow-up queue</h2>
      <label class="form-control max-w-sm"><span class="label-text">Check-in / correction reason</span><input v-model="reason" class="input input-bordered w-full" maxlength="500"></label>
      <div v-for="item in data.queue" :key="`${item.queue}:${item.subject_id}`" class="border border-base-content p-3 flex flex-wrap items-center gap-2">
        <div class="min-w-0 flex-1"><strong>{{ item.queue.replaceAll('_', ' ') }}</strong> · {{ item.name }} <span class="text-sm break-all">{{ item.email }}</span><p class="text-xs">{{ item.status }} <span v-if="item.owner_id">· owner {{ item.owner_id.slice(0, 8) }}</span></p></div>
        <input v-model="item.outcome" maxlength="500" class="input input-bordered input-sm w-full sm:w-48" placeholder="Outreach outcome">
        <button class="btn btn-xs btn-outline" @click="outreach(item, 'assigned')">Assign</button>
        <button class="btn btn-xs btn-outline" @click="outreach(item, 'contacted')">Contacted</button>
        <button class="btn btn-xs btn-outline" @click="outreach(item, 'resolved')">Resolve</button>
        <button v-if="item.queue !== 'unanswered_request' && item.queue !== 'unconfirmed_team'" class="btn btn-xs btn-primary" @click="checkin(item.subject_id, true)">Check in</button>
        <button v-if="item.queue !== 'unanswered_request' && item.queue !== 'unconfirmed_team'" class="btn btn-xs btn-ghost" @click="checkin(item.subject_id, false)">Correct check-in</button>
      </div>
    </section>
    <section v-if="data" class="space-y-3">
      <h2 class="text-xl font-black uppercase">Arrival roster</h2>
      <div v-for="person in data.roster" :key="person.id" class="border border-base-content p-3 flex flex-wrap items-center gap-2">
        <div class="flex-1 min-w-0"><strong>{{ person.name }}</strong> <span class="text-sm break-all">{{ person.email }}</span><p class="text-xs">{{ person.seat_state }} · {{ person.intention ?? 'no response' }} · {{ person.checked_in_at ? 'checked in' : 'not checked in' }}</p><p v-if="person.barrier?.reasons?.length" class="text-xs">Private help request: {{ person.barrier.reasons.join(', ') }} · {{ person.barrier.details }}</p></div>
        <button v-if="!person.checked_in_at" class="btn btn-sm btn-primary" :disabled="person.seat_state !== 'accepted'" @click="checkin(person.id, true)">Check in</button>
        <button v-else class="btn btn-sm btn-outline" @click="checkin(person.id, false)">Correct check-in</button>
      </div>
    </section>
  </main>
</template>
