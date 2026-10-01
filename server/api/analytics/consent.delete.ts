import { useSupabaseAdmin } from "#server/utils/supabase";
import { readBrowserId, setDeniedCookies } from "#server/utils/analytics";

/**
 * Withdraw analytics consent: stop collection, delete this browser's
 * individual events and id, then clear the cookie. No account needed.
 *
 * The database deletion happens before the cookie is cleared; an event already
 * in flight either commits first and is removed by the cascade, or arrives
 * after and finds no id to record against (see analytics_record).
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  const browserId = readBrowserId(event);
  if (browserId) {
    const { error } = await useSupabaseAdmin().rpc("analytics_withdraw", {
      p_browser: browserId,
    });
    if (error) {
      console.error("[analytics/consent.delete] withdraw failed:", error.message);
      throw createError({ statusCode: 500, message: "Internal server error" });
    }
  }
  setDeniedCookies(event);
  return { state: "denied" };
});
