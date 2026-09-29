import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
const bounds: Record<string, [number, number]> = {
  reminder_mixer_days: [0, 30], reminder_reconfirm_days: [0, 30],
  reminder_arrival_hours: [0, 168], unanswered_request_hours: [1, 336], seat_offer_hours: [1, 168],
};
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const body = await readBody<Record<string, unknown>>(event);
  const update: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(body ?? {})) {
    if (field in bounds) {
      const [min, max] = bounds[field];
      if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
        throw createError({ statusCode: 400, message: `Invalid ${field}` });
      update[field] = value;
    } else if (field === "arrival_host") {
      if (value !== null && (typeof value !== "string" || value.length > 120))
        throw createError({ statusCode: 400, message: "Invalid arrival host" });
      update[field] = value;
    } else if (field === "team_formation_slot") {
      if (value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value))))
        throw createError({ statusCode: 400, message: "Invalid team formation slot" });
      update[field] = value;
    } else throw createError({ statusCode: 400, message: `Unknown field ${field}` });
  }
  const { error } = await supabase.from("editions").update(update).eq("slug", edition.slug);
  if (error) throw createError({ statusCode: 500, message: "Could not save timing" });
  return { ok: true };
});
