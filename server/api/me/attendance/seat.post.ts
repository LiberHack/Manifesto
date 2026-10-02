import { requireRegistration } from "#server/utils/requireRegistration";
import { dispatchDueJobs } from "#server/utils/notifications";
export default defineEventHandler(async (event) => {
  const { user, registration, supabase } = await requireRegistration(event);
  const body = await readBody<{ action?: string }>(event);
  if (body?.action !== "cancel" && body?.action !== "accept")
    throw createError({ statusCode: 400, message: "Invalid action" });
  const { data, error } = await supabase.rpc("change_seat", {
    p_registration: registration.id, p_participant: user.sub, p_action: body.action,
  });
  if (error) throw createError({ statusCode: 409, message: "Seat change unavailable" });
  // A cancellation may have offered the seat to the next person: tell them now.
  await dispatchDueJobs(supabase, 5).catch(() => {});
  return { seat_state: data.seat_state, offer_expires_at: data.offer_expires_at };
});
