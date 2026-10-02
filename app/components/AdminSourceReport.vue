<script setup lang="ts">
type Model = "first" | "last" | "assisted";

interface FunnelRow {
  cohort_day: string;
  channel: string;
  landed: number;
  cta: number;
  started: number;
  completed_7d: number;
}

interface Report {
  model: Model;
  channel: string | null;
  consenting_registrations: number;
  all_registrations: number;
  sources: { source_key: string; label: string; channel: string; registrations: number }[];
  daily: { day: string; source_key: string; registrations: number }[];
  funnel: {
    closed: FunnelRow[];
    open: FunnelRow[];
    closed_totals: { landed: number; cta: number; started: number; completed_7d: number };
  };
  last_purge_at: string | null;
}

const MODEL_HELP: Record<Model, string> = {
  first: "Credits the earliest source in each registrant's last 30 days.",
  last: "Credits the last source before they registered.",
  assisted:
    "Counts every earlier source other than the last one, once per registration — so totals can exceed registrations.",
};
const CHANNELS = ["instagram", "poster", "print", "partner", "email", "other", "referral", "direct", "unknown"];
// Fixed categorical palette, legible on the dark admin theme.
const PALETTE = ["#f97316", "#22d3ee", "#a3e635", "#e879f9", "#facc15", "#60a5fa", "#9ca3af"];

const props = defineProps<{ editionQuery: { edition?: string } }>();
const model = ref<Model>("first");
const channel = ref("");

const query = computed(() => ({
  ...props.editionQuery,
  model: model.value,
  channel: channel.value || undefined,
}));
const { data: report } = await useFetch<Report>("/api/admin/sources/report", { query });

const maxSource = computed(() => Math.max(1, ...(report.value?.sources ?? []).map((s) => s.registrations)));

// Daily stacked columns: the six biggest sources get a colour, the rest "other".
const topKeys = computed(() => (report.value?.sources ?? []).slice(0, 6).map((s) => s.source_key));
const colorOf = (key: string) => {
  const i = topKeys.value.indexOf(key);
  return PALETTE[i === -1 ? 6 : i];
};
const days = computed(() => {
  const byDay = new Map<string, Map<string, number>>();
  for (const r of report.value?.daily ?? []) {
    const key = topKeys.value.includes(r.source_key) ? r.source_key : "other sources";
    const day = byDay.get(r.day) ?? new Map<string, number>();
    day.set(key, (day.get(key) ?? 0) + r.registrations);
    byDay.set(r.day, day);
  }
  return [...byDay.entries()].map(([day, parts]) => ({
    day,
    parts: [...parts.entries()],
    total: [...parts.values()].reduce((a, b) => a + b, 0),
  }));
});
const maxDay = computed(() => Math.max(1, ...days.value.map((d) => d.total)));

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

const exportBase = computed(() => {
  const params = new URLSearchParams({
    edition: props.editionQuery.edition ?? "",
    model: model.value,
    ...(channel.value ? { channel: channel.value } : {}),
  });
  return `/api/admin/sources/export?${params}`;
});

const purgeStale = computed(() => {
  const at = report.value?.last_purge_at;
  return !at || Date.now() - Date.parse(at) > 2 * 24 * 60 * 60 * 1000;
});
</script>

<template>
  <div v-if="report" class="min-w-0 flex flex-col gap-4 [overflow-wrap:break-word]">
    <h3 class="font-black text-lg uppercase">Where registrations come from</h3>
    <p class="text-sm opacity-70 max-w-3xl">
      Only browsers whose visitor clicked "Allow analytics" are counted, and only
      from that moment: a visit is recorded from the page the visitor was on when
      they allowed it, never earlier. So these are registrations from consenting
      browsers, not all visitors or all people.
      <strong>{{ report.consenting_registrations }}</strong> of
      <strong>{{ report.all_registrations }}</strong> registrations in this edition
      came from a consenting browser; the rest are not attributed anywhere. Each
      registration counts once, so two people registering on a shared browser are
      two; one person using two devices is two browsers. Dates are Europe/Sofia.
      Days in the last month stay live (a withdrawal removes them); older days
      are final totals.
    </p>
    <div v-if="purgeStale" role="alert" class="alert alert-warning text-sm">
      The retention job has not run in the last 2 days
      ({{ report.last_purge_at ?? "never" }}). See docs/privacy/retention-and-deletion.md.
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <div role="radiogroup" aria-label="Attribution model" class="join">
        <button
          v-for="m in (['first', 'last', 'assisted'] as Model[])"
          :key="m"
          type="button"
          role="radio"
          :aria-checked="model === m"
          class="btn btn-sm join-item"
          :class="{ 'btn-primary': model === m }"
          @click="model = m"
        >
          {{ m === "first" ? "First touch" : m === "last" ? "Last touch" : "Assisted" }}
        </button>
      </div>
      <label class="form-control">
        <span class="label-text text-xs">Channel</span>
        <select v-model="channel" class="select select-bordered select-sm">
          <option value="">All channels</option>
          <option v-for="c in CHANNELS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <a :href="`${exportBase}&kind=sources`" download class="btn btn-outline btn-sm">↓ Sources CSV</a>
      <a :href="`${exportBase}&kind=funnel`" download class="btn btn-outline btn-sm">↓ Funnel CSV</a>
    </div>
    <p class="text-xs opacity-70">
      {{ MODEL_HELP[model] }} <code>direct</code> = landed with no link or referrer;
      <code>unknown</code> = no recorded landing; <code>ref-other</code> = a site not
      on our referrer list.
    </p>

    <!-- Registrations by source -->
    <figure>
      <figcaption class="font-bold text-sm mb-2">Registrations by source</figcaption>
      <p v-if="!report.sources.length" class="text-sm opacity-60">Nothing recorded yet.</p>
      <div v-for="s in report.sources" :key="s.source_key" class="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
        <span class="truncate" :title="s.source_key">{{ s.label }} <span class="opacity-50 text-xs">{{ s.channel }}</span></span>
        <svg :viewBox="`0 0 100 6`" preserveAspectRatio="none" class="h-4 w-full" aria-hidden="true">
          <rect x="0" y="0" :width="(s.registrations / maxSource) * 100" height="6" :fill="colorOf(s.source_key)" />
        </svg>
        <span class="tabular-nums text-right">{{ s.registrations }}</span>
      </div>
    </figure>

    <!-- Registrations by date -->
    <figure v-if="days.length">
      <figcaption class="font-bold text-sm mb-2">Registrations by date and source</figcaption>
      <svg :viewBox="`0 0 ${days.length * 12} 104`" class="w-full h-40" role="img" aria-label="Daily registrations stacked by source">
        <g v-for="(d, i) in days" :key="d.day">
          <title>{{ d.day }}: {{ d.total }}</title>
          <template v-for="(part, j) in d.parts" :key="part[0]">
            <rect
              :x="i * 12 + 1"
              :width="10"
              :y="100 - (d.parts.slice(0, j + 1).reduce((a, p) => a + p[1], 0) / maxDay) * 100"
              :height="(part[1] / maxDay) * 100"
              :fill="colorOf(part[0])"
            />
          </template>
        </g>
      </svg>
      <div class="flex flex-wrap gap-3 text-xs mt-1">
        <span v-for="key in [...topKeys, 'other sources']" :key="key" class="flex items-center gap-1">
          <span class="inline-block w-3 h-3" :style="{ background: colorOf(key) }" />{{ key }}
        </span>
        <span class="opacity-60">{{ days[0]?.day }} → {{ days.at(-1)?.day }}</span>
      </div>
    </figure>

    <!-- Funnel -->
    <div>
      <h4 class="font-bold text-sm mb-1">Funnel (consenting browsers, 7-day window)</h4>
      <p class="text-xs opacity-70 mb-2">
        Counts browsers, not registrations: each browser once per edition, from its
        first recorded landing (which is at or after consent). Conversion =
        browsers with a registration within 7 days ÷ browsers that landed, both
        from the same closed cohorts. Time before consent is not measured.
      </p>
      <div class="max-w-full overflow-x-auto">
        <table class="table table-sm w-auto">
          <thead><tr><th>Step</th><th class="text-right">Browsers</th><th class="text-right">Of landed</th></tr></thead>
          <tbody>
            <tr><td>Landed</td><td class="text-right tabular-nums">{{ report.funnel.closed_totals.landed }}</td><td class="text-right">100%</td></tr>
            <tr><td>Clicked register</td><td class="text-right tabular-nums">{{ report.funnel.closed_totals.cta }}</td><td class="text-right">{{ pct(report.funnel.closed_totals.cta, report.funnel.closed_totals.landed) }}</td></tr>
            <tr><td>Started the form</td><td class="text-right tabular-nums">{{ report.funnel.closed_totals.started }}</td><td class="text-right">{{ pct(report.funnel.closed_totals.started, report.funnel.closed_totals.landed) }}</td></tr>
            <tr class="font-bold"><td>Converted browsers (registered within 7 days)</td><td class="text-right tabular-nums">{{ report.funnel.closed_totals.completed_7d }}</td><td class="text-right">{{ pct(report.funnel.closed_totals.completed_7d, report.funnel.closed_totals.landed) }}</td></tr>
          </tbody>
        </table>
      </div>
      <p v-if="report.funnel.open.length" class="text-xs opacity-70 mt-2">
        Not included above, because their 7 days are not over yet:
        {{ report.funnel.open.reduce((a, r) => a + r.landed, 0) }} browsers that landed
        {{ report.funnel.open[0]?.cohort_day }} – {{ report.funnel.open.at(-1)?.cohort_day }}
        ({{ report.funnel.open.reduce((a, r) => a + r.completed_7d, 0) }} registered so far).
      </p>
    </div>
  </div>
</template>
