import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import {
  analyticsActivationAllowed,
  readBrowserId,
  setDeniedCookies,
  setGrantedCookies,
} from "#server/utils/analytics";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";

/**
 * The visitor's answer to the analytics banner. No account needed.
 *
 * - `granted`: a fresh random id (30 days, fixed) in an HttpOnly cookie. A
 *   previous id is withdrawn first, so a re-grant never extends a journey.
 * - `denied`: any existing id and its events are deleted, then the refusal is
 *   remembered so the banner does not ask again on every visit.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  const body = await readBody<{ decision?: unknown }>(event);
  const decision = body?.decision;
  if (decision !== "granted" && decision !== "denied") {
    throw createError({ statusCode: 400, message: "decision must be granted or denied" });
  }

  const supabase = useSupabaseAdmin();
  const previous = readBrowserId(event);
  if (previous) {
    const { error } = await supabase.rpc("analytics_withdraw", { p_browser: previous });
    if (error) {
      console.error("[analytics/consent] withdraw failed:", error.message);
      throw createError({ statusCode: 500, message: "Internal server error" });
    }
  }

  if (decision === "denied") {
    setDeniedCookies(event);
    return { state: "denied" };
  }

  const edition = await getCurrentEdition(supabase);
  if (!analyticsActivationAllowed(useRuntimeConfig()) || !edition?.analytics_enabled) {
    throw createError({ statusCode: 409, message: "analytics_disabled" });
  }

  const { data: browserId, error } = await supabase.rpc("analytics_grant", {
    p_notice_version: PRIVACY_NOTICE_VERSION,
  });
  if (error || typeof browserId !== "string") {
    console.error("[analytics/consent] grant failed:", error?.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const { data: row } = await supabase
    .from("analytics_browsers")
    .select("expires_at")
    .eq("id", browserId)
    .single();
  const expiresAt = new Date((row as { expires_at: string } | null)?.expires_at ?? Date.now());

  setGrantedCookies(event, browserId, expiresAt);
  return { state: "granted", expires_at: expiresAt.toISOString() };
});
