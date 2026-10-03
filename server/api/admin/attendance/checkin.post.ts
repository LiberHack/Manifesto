import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const body = await readBody<{ registration_id?: string; checked_in?: boolean; reason?: string }>(event);
  if (!body?.registration_id || typeof body.checked_in !== "boolean" ||
      !body.reason?.trim() || body.reason.length > 500)
    throw createError({ statusCode: 400, message: "Registration, check-in and reason required" });
  const { data: target } = await supabase.from("registrations").select("id")
    .eq("id", body.registration_id).eq("edition_slug", edition.slug).maybeSingle();
  if (!target) throw createError({ statusCode: 404, message: "Registration not found" });
  const { data, error } = await supabase.rpc("record_checkin", {
    p_registration: target.id, p_actor: user.sub,
    p_checked_in_at: body.checked_in ? new Date().toISOString() : null,
    p_reason: body.reason.trim(),
  });
  if (error) throw createError({ statusCode: 409, message: error.message });
  return { checked_in_at: data.checked_in_at };
});
