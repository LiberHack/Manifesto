import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const { data, error } = await supabase.from("editions").select("reminder_mixer_days, reminder_reconfirm_days, reminder_arrival_hours, unanswered_request_hours, seat_offer_hours, arrival_host, team_formation_slot")
    .eq("slug", edition.slug).single();
  if (error) throw createError({ statusCode: 500, message: "Timing unavailable" });
  return data;
});
