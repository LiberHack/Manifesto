import { requireRegistration } from "#server/utils/requireRegistration";

const intentions = ["coming", "unsure", "cannot_come"];
const reasons = ["transport", "equipment", "timing", "team", "other"];
export default defineEventHandler(async (event) => {
  const { user, registration, supabase } = await requireRegistration(event);
  const body = await readBody<{ intention?: string; reasons?: string[]; details?: string }>(event);
  if (!intentions.includes(body?.intention ?? "") ||
      (body.reasons !== undefined && (!Array.isArray(body.reasons) || body.reasons.some((r) => !reasons.includes(r)))) ||
      (body.details !== undefined && (typeof body.details !== "string" || body.details.length > 500))) {
    throw createError({ statusCode: 400, message: "Invalid attendance response" });
  }
  const { data, error } = await supabase.rpc("set_attendance_intention", {
    p_registration: registration.id, p_participant: user.sub,
    p_intention: body.intention, p_reasons: body.reasons ?? null, p_details: body.details ?? null,
  });
  if (error) throw createError({ statusCode: error.message.includes("not_eligible") ? 409 : 500, message: error.message.includes("not_eligible") ? "not_eligible" : "Unable to save attendance" });
  return { intention: data.intention, intention_at: data.intention_at };
});
