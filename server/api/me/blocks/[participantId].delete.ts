import { requireRegistration } from "#server/utils/requireRegistration";

/** Lift a block the caller placed. */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const target = getRouterParam(event, "participantId")!;
  await supabase
    .from("participant_blocks")
    .delete()
    .eq("blocker_id", registration.participant_id)
    .eq("blocked_id", target);
  return { ok: true };
});
