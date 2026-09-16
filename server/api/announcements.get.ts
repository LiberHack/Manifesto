import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

/**
 * Banner rows for the current edition: the `ops` and `site` channels, active and
 * inside their time window.
 *
 * `ops` rows are returned to anonymous callers too — they carry no personal
 * data, and gating the *rendering* rather than the fetch keeps this response
 * cacheable and saves AppBanners a second authenticated request.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=30");

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition) return [];

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, channel, audience, variant, body, href, dismissible, sort_order")
    .eq("edition_slug", edition.slug)
    .in("channel", ["ops", "site"])
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("channel", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[announcements.get] query failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to fetch announcements" });
  }

  return data ?? [];
});
