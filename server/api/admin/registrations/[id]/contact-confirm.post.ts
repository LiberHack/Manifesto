import {
  assertEditionWritable,
  requireAdmin,
  resolveAdminEdition,
} from "#server/utils/adminAuth";

/**
 * Record (or clear, with `{ confirmed: false }`) that an organizer reached the
 * participant on their preferred channel. This is a reachability note, not
 * identity verification.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const registrationId = getRouterParam(event, "id")!;
  const body = (await readBody<{ confirmed?: unknown }>(event)) ?? {};
  const confirmed = body.confirmed !== false;

  const { data: registration } = await supabase
    .from("registrations")
    .select("id")
    .eq("id", registrationId)
    .eq("edition_slug", edition.slug)
    .maybeSingle();
  if (!registration) throw createError({ statusCode: 404, message: "Registration not found" });

  const { data, error } = await supabase
    .from("registration_contacts")
    .update({
      reachable_confirmed_at: confirmed ? new Date().toISOString() : null,
      reachable_confirmed_by: confirmed ? user.sub : null,
    })
    .eq("registration_id", registrationId)
    .select("reachable_confirmed_at")
    .maybeSingle();

  if (error) {
    console.error("[admin/contact-confirm] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  if (!data) throw createError({ statusCode: 404, message: "No contact saved yet" });

  return data;
});
