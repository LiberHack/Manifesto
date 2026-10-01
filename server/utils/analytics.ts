import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANALYTICS_CHOICE_COOKIE,
  ANALYTICS_ID_COOKIE,
  ANALYTICS_ID_DAYS,
  ANALYTICS_REJECTION_DAYS,
} from "#shared/utils/privacy";
import { computeAttribution, sofiaDate, type Touch } from "#shared/utils/source";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_SECONDS = 24 * 60 * 60;

/** The consenting browser's id from its HttpOnly cookie, or null. */
export function readBrowserId(event: H3Event): string | null {
  const raw = getCookie(event, ANALYTICS_ID_COOKIE);
  return raw && UUID_PATTERN.test(raw) ? raw : null;
}

const baseCookie = { path: "/", sameSite: "lax", secure: true } as const;

/**
 * After "Allow analytics": the id cookie (HttpOnly, fixed 30 days, never
 * refreshed) plus the readable choice cookie carrying the same expiry so the
 * page can ask again exactly when the id lapses.
 */
export function setGrantedCookies(event: H3Event, browserId: string, expiresAt: Date): void {
  const maxAge = ANALYTICS_ID_DAYS * DAY_SECONDS;
  setCookie(event, ANALYTICS_ID_COOKIE, browserId, { ...baseCookie, httpOnly: true, maxAge });
  setCookie(event, ANALYTICS_CHOICE_COOKIE, `granted.${expiresAt.getTime()}`, {
    ...baseCookie,
    maxAge,
  });
}

/** After "Reject" or withdrawal: drop the id, remember the refusal. */
export function setDeniedCookies(event: H3Event): void {
  deleteCookie(event, ANALYTICS_ID_COOKIE, { ...baseCookie, httpOnly: true });
  setCookie(event, ANALYTICS_CHOICE_COOKIE, "denied", {
    ...baseCookie,
    maxAge: ANALYTICS_REJECTION_DAYS * DAY_SECONDS,
  });
}

/**
 * Record server-side completion for the consenting browser behind this
 * request, together with its attribution.
 *
 * The browser's landings are read first, then completion and the aggregate
 * increment are written in one transaction (`analytics_complete_registration`):
 * completion is unique per browser and edition, so a replay never counts twice,
 * and a failure rolls both back. Never throws — a registration must not fail
 * because analytics did.
 */
export async function recordRegistrationCompleted(
  event: H3Event,
  supabase: SupabaseClient,
  editionSlug: string,
): Promise<void> {
  const browserId = readBrowserId(event);
  if (!browserId) return;

  try {
    const { data: landings, error: touchError } = await supabase
      .from("analytics_events")
      .select("id, occurred_at, ref_category, link:source_links(tag)")
      .eq("browser_id", browserId)
      .eq("edition_slug", editionSlug)
      .eq("event", "landing_viewed");
    if (touchError) throw touchError;

    const touches: Touch[] = (
      (landings ?? []) as unknown as {
        id: number;
        occurred_at: string;
        ref_category: string | null;
        link: { tag: string } | null;
      }[]
    ).map((row) => ({
      at: new Date(row.occurred_at),
      source: row.link?.tag ?? row.ref_category ?? "direct",
      order: row.id,
    }));

    const completedAt = new Date();
    const attribution = computeAttribution(touches, completedAt);
    const { error } = await supabase.rpc("analytics_complete_registration", {
      p_browser: browserId,
      p_edition: editionSlug,
      p_day: sofiaDate(completedAt),
      p_first: attribution.first,
      p_last: attribution.last,
      p_assisted: attribution.assisted,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[analytics] completion not recorded:", (e as Error).message);
  }
}
