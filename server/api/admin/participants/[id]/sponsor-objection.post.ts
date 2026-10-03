import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";

/**
 * Record a participant's objection to / withdrawal from sponsor sharing,
 * received as a rights request. It excludes them from every later sponsor
 * export; it does not cancel their registration. Copies already sent to a
 * sponsor are handled by the process in docs/privacy/rights-requests.md.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const participantId = getRouterParam(event, "id");

  const { data: registration } = await supabase
    .from("registrations")
    .select("id")
    .eq("participant_id", participantId!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();
  if (!registration) throw createError({ statusCode: 404, message: "Registration not found" });

  const { error } = await supabase.from("consent_records").insert({
    participant_id: participantId,
    purpose: "sponsor_sharing",
    edition_slug: edition.slug,
    decision: "objected",
    notice_version: PRIVACY_NOTICE_VERSION,
    recipient_ids: [],
    recorded_by: user.sub,
  });
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  return { ok: true };
});
