import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANALYTICS_CHOICE_COOKIE,
  ANALYTICS_ID_COOKIE,
  ANALYTICS_ID_DAYS,
  ANALYTICS_REJECTION_DAYS,
} from "#shared/utils/privacy";
import { computeAttribution, type Touch } from "#shared/utils/source";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_SECONDS = 24 * 60 * 60;

/**
 * Server-controlled gate, independent of the per-edition admin toggle: until
 * the age/parental-consent approach for analytics is decided and implemented,
 * NUXT_ANALYTICS_ACTIVATION_ALLOWED stays unset and nothing is collected,
 * whatever an admin toggles.
 */
export function analyticsActivationAllowed(config: { analyticsActivationAllowed?: unknown }): boolean {
  return config.analyticsActivationAllowed === true;
}

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
 * Record server-side completion of a successful edition registration for the
 * consenting browser behind this request, with its attribution.
 *
 * Called only by the request that created the registration, and only when
 * analyticsActivationAllowed() holds. Deduplicated per
 * registration (`analytics_completion_keys`), so a shared browser can record
 * two people's registrations while a retry for the same registration counts
 * once. The registration id is never stored with the event. Never throws —
 * a registration must not fail because analytics did.
 */
export async function recordRegistrationCompleted(
  event: H3Event,
  supabase: SupabaseClient,
  editionSlug: string,
  registrationId: string,
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
      p_registration: registrationId,
      p_first: attribution.first,
      p_last: attribution.last,
      p_assisted: attribution.assisted,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[analytics] completion not recorded:", (e as Error).message);
  }
}
