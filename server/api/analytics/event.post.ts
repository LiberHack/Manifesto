import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { analyticsActivationAllowed, readBrowserId } from "#server/utils/analytics";
import { CLIENT_ANALYTICS_EVENTS, type ClientAnalyticsEvent } from "#shared/utils/privacy";
import { categorizeReferrerHost, isValidLinkTag } from "#shared/utils/source";

const MAX_BODY_BYTES = 512;

/**
 * Record one predefined event for a consenting browser.
 *
 * Without the HttpOnly id cookie this is a no-op: nothing is stored, nothing
 * is queued, and no substitute identifier (account, IP, fingerprint) is used.
 * The browser sends only the event name, the `?src=` tag it landed with and the
 * referrer's hostname; the server keeps the link id or a referrer category.
 *
 * Completion is not accepted here — the registration endpoint records it after
 * the registration row exists.
 */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 204);
  setHeader(event, "Cache-Control", "no-store");

  const length = Number(getRequestHeader(event, "content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, message: "payload_too_large" });
  }

  const body = await readBody<{ event?: unknown; src?: unknown; ref_host?: unknown }>(event);
  if (!CLIENT_ANALYTICS_EVENTS.includes(body?.event as ClientAnalyticsEvent)) {
    throw createError({ statusCode: 400, message: "invalid_event" });
  }
  if (body.ref_host !== undefined && typeof body.ref_host !== "string") {
    throw createError({ statusCode: 400, message: "invalid_ref_host" });
  }

  const browserId = readBrowserId(event);
  if (!browserId || !analyticsActivationAllowed(useRuntimeConfig())) return null;

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition?.analytics_enabled) return null;

  let sourceLinkId: string | null = null;
  let refCategory: string | null = null;

  if (body.event === "landing_viewed") {
    // An explicit, known, active tag wins; anything else falls back to the
    // referrer category and the submitted tag is discarded.
    if (isValidLinkTag(body.src)) {
      const { data: link } = await supabase
        .from("source_links")
        .select("id")
        .eq("tag", body.src)
        .eq("edition_slug", edition.slug)
        .eq("active", true)
        .is("archived_at", null)
        .maybeSingle();
      sourceLinkId = (link as { id: string } | null)?.id ?? null;
    }
    if (!sourceLinkId) {
      refCategory = categorizeReferrerHost(body.ref_host, getRequestURL(event).hostname);
      // Internal navigation is not a landing.
      if (refCategory === null) return null;
    }
  }

  const { error } = await supabase.rpc("analytics_record", {
    p_browser: browserId,
    p_event: body.event,
    p_edition: edition.slug,
    p_source_link: sourceLinkId,
    p_ref: refCategory,
  });
  if (error) console.error("[analytics/event] record failed:", error.message);
  return null;
});
