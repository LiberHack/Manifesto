import { requireRegistration } from "#server/utils/requireRegistration";

export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const { data, error } = await supabase.from("registrations")
    .select("intention, intention_at, seat_state, offer_expires_at, checked_in_at, cancelled_at")
    .eq("id", registration.id).single();
  if (error) throw createError({ statusCode: 500, message: "Attendance unavailable" });
  return data;
});
