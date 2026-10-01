import type { SupabaseClient } from "@supabase/supabase-js";
import { DIRECT, UNKNOWN } from "#shared/utils/source";

export type AttributionModel = "first" | "last" | "assisted";
export const ATTRIBUTION_MODELS: readonly AttributionModel[] = ["first", "last", "assisted"];

export interface FunnelRow {
  cohort_day: string;
  channel: string;
  landed: number;
  cta: number;
  started: number;
  completed_7d: number;
}

export interface SourceReport {
  model: AttributionModel;
  channel: string | null;
  /** Registrations from consenting browsers (each counted once). */
  consenting_registrations: number;
  /** Every registration in the edition — context only, never a denominator. */
  all_registrations: number;
  sources: { source_key: string; label: string; channel: string; registrations: number }[];
  daily: { day: string; source_key: string; registrations: number }[];
  funnel: {
    closed: FunnelRow[];
    open: FunnelRow[];
    closed_totals: Omit<FunnelRow, "cohort_day" | "channel">;
  };
  last_purge_at: string | null;
}

/** The reporting channel of a source key: a link's channel, or a system group. */
export function channelOf(sourceKey: string, linkChannels: Map<string, string>): string {
  if (linkChannels.has(sourceKey)) return linkChannels.get(sourceKey)!;
  if (sourceKey.startsWith("ref-")) return "referral";
  if (sourceKey === DIRECT) return "direct";
  if (sourceKey === UNKNOWN) return "unknown";
  return "other";
}

function sumFunnel(rows: FunnelRow[]): Omit<FunnelRow, "cohort_day" | "channel"> {
  return rows.reduce(
    (t, r) => ({
      landed: t.landed + r.landed,
      cta: t.cta + r.cta,
      started: t.started + r.started,
      completed_7d: t.completed_7d + r.completed_7d,
    }),
    { landed: 0, cta: 0, started: 0, completed_7d: 0 },
  );
}

/**
 * Everything the Sources view shows, from aggregates only (attribution_daily,
 * funnel_cohort_daily) plus live cohorts still inside the retention window.
 */
export async function buildSourceReport(
  supabase: SupabaseClient,
  editionSlug: string,
  model: AttributionModel,
  channel: string | null,
): Promise<SourceReport> {
  const [links, attribution, firstTouch, rolled, live, total, purge] = await Promise.all([
    supabase.from("source_links").select("tag, label, channel").eq("edition_slug", editionSlug),
    supabase
      .from("attribution_daily")
      .select("day, source_key, registrations")
      .eq("edition_slug", editionSlug)
      .eq("model", model),
    supabase
      .from("attribution_daily")
      .select("source_key, registrations")
      .eq("edition_slug", editionSlug)
      .eq("model", "first"),
    supabase
      .from("funnel_cohort_daily")
      .select("cohort_day, channel, landed, cta, started, completed_7d")
      .eq("edition_slug", editionSlug),
    supabase.rpc("funnel_cohorts", { p_edition: editionSlug }),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("edition_slug", editionSlug),
    supabase
      .from("maintenance_runs")
      .select("ran_at")
      .eq("job", "analytics_purge")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const r of [links, attribution, firstTouch, rolled, live]) {
    if (r.error) {
      console.error("[source-report] query failed:", r.error.message);
      throw createError({ statusCode: 500, message: "Internal server error" });
    }
  }

  const linkRows = (links.data ?? []) as { tag: string; label: string; channel: string }[];
  const linkChannels = new Map(linkRows.map((l) => [l.tag, l.channel]));
  const labels = new Map(linkRows.map((l) => [l.tag, l.label]));
  const inChannel = (key: string) => channel === null || channelOf(key, linkChannels) === channel;

  const daily = ((attribution.data ?? []) as { day: string; source_key: string; registrations: number }[])
    .filter((r) => inChannel(r.source_key))
    .toSorted((a, b) => a.day.localeCompare(b.day));

  const bySource = new Map<string, number>();
  for (const r of daily) bySource.set(r.source_key, (bySource.get(r.source_key) ?? 0) + r.registrations);
  const sources = [...bySource.entries()]
    .map(([source_key, registrations]) => ({
      source_key,
      label: labels.get(source_key) ?? source_key,
      channel: channelOf(source_key, linkChannels),
      registrations,
    }))
    .toSorted((a, b) => b.registrations - a.registrations);

  const consenting = ((firstTouch.data ?? []) as { source_key: string; registrations: number }[])
    .filter((r) => inChannel(r.source_key))
    .reduce((sum, r) => sum + r.registrations, 0);

  // Rolled-up cohorts are final; live rows only fill days not rolled up yet.
  const rolledRows = ((rolled.data ?? []) as FunnelRow[]).map((r) => ({ ...r }));
  const rolledKeys = new Set(rolledRows.map((r) => `${r.cohort_day}|${r.channel}`));
  const liveRows = ((live.data ?? []) as (FunnelRow & { window_closed: boolean })[])
    .filter((r) => !rolledKeys.has(`${r.cohort_day}|${r.channel}`))
    .map((r) => ({
      ...r,
      landed: Number(r.landed),
      cta: Number(r.cta),
      started: Number(r.started),
      completed_7d: Number(r.completed_7d),
    }));

  const funnelChannel = (r: FunnelRow) => channel === null || r.channel === channel;
  const strip = ({ cohort_day, channel: c, landed, cta, started, completed_7d }: FunnelRow) => ({
    cohort_day,
    channel: c,
    landed,
    cta,
    started,
    completed_7d,
  });
  const closed = [...rolledRows, ...liveRows.filter((r) => r.window_closed)]
    .filter(funnelChannel)
    .map(strip)
    .toSorted((a, b) => a.cohort_day.localeCompare(b.cohort_day));
  const open = liveRows
    .filter((r) => !r.window_closed)
    .filter(funnelChannel)
    .map(strip)
    .toSorted((a, b) => a.cohort_day.localeCompare(b.cohort_day));

  return {
    model,
    channel,
    consenting_registrations: consenting,
    all_registrations: total.count ?? 0,
    sources,
    daily,
    funnel: { closed, open, closed_totals: sumFunnel(closed) },
    last_purge_at: (purge.data as { ran_at: string } | null)?.ran_at ?? null,
  };
}

/** Validate `?model=` and `?channel=` from the query string. */
export function readReportQuery(query: Record<string, unknown>): {
  model: AttributionModel;
  channel: string | null;
} {
  const model = (query.model ?? "first") as AttributionModel;
  if (!ATTRIBUTION_MODELS.includes(model)) {
    throw createError({ statusCode: 400, message: "model must be first, last or assisted" });
  }
  const channel = typeof query.channel === "string" && query.channel !== "" ? query.channel : null;
  if (channel !== null && !/^[a-z]{1,20}$/.test(channel)) {
    throw createError({ statusCode: 400, message: "invalid channel" });
  }
  return { model, channel };
}
