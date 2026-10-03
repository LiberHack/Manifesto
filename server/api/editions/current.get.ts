import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition, isEditionFull } from "#server/utils/registrationContext";
import { analyticsActivationAllowed } from "#server/utils/analytics";

/**
 * Public view of the edition currently open for registration. Backs the signup
 * form's "registration is full" and "not open yet" states.
 *
 * Only the boolean is exposed: an exact remaining-places count either pressures
 * people or slows them down, and returning it would put the number one devtools
 * tab away however the page chooses to render it.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=30");

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  if (!edition) return { edition: null, full: true, ops_open: false, analytics_enabled: false };

  return {
    edition: {
      slug: edition.slug,
      name: edition.name,
      starts_at: edition.starts_at,
      ends_at: edition.ends_at,
    },
    full: await isEditionFull(supabase, edition),
    // An edition can be live and current while registration has not opened.
    ops_open: edition.ops_enabled,
    // Whether to show the analytics consent banner at all.
    analytics_enabled:
      edition.analytics_enabled && analyticsActivationAllowed(useRuntimeConfig()),
  };
});
