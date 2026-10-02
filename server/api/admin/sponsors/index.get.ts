import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

/** Sponsor recipients of an edition, including retired ones, with how many
 * registrations are currently eligible for each. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  setHeader(event, "Cache-Control", "no-store, private");

  const { data, error } = await supabase
    .from("sponsor_recipients")
    .select("id, organisation, purpose, shared_fields, created_at, retired_at")
    .eq("edition_slug", edition.slug)
    .order("created_at");
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });

  const recipients = await Promise.all(
    (data ?? []).map(async (recipient) => {
      if (recipient.retired_at) return { ...recipient, eligible: 0 };
      const { data: rows } = await supabase.rpc("sponsor_export_rows", {
        p_recipient: recipient.id,
      });
      return { ...recipient, eligible: (rows ?? []).length };
    }),
  );
  return { exports_enabled: useRuntimeConfig().sponsorExportsEnabled === true, recipients };
});
