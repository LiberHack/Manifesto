import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

/** Source links of an edition, archived ones included (history stays). */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  setHeader(event, "Cache-Control", "no-store, private");

  const { data, error } = await supabase
    .from("source_links")
    .select("id, tag, label, note, channel, active, created_at, archived_at")
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  return data ?? [];
});
