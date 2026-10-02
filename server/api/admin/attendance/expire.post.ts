import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const { data, error } = await supabase.rpc("expire_seat_offers", { p_edition: edition.slug });
  if (error) throw createError({ statusCode: 500, message: "Could not expire offers" });
  return { expired: data };
});
