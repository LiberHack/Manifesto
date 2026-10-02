import { requireRegistration } from "#server/utils/requireRegistration";

/** People the caller has blocked (not who blocked them). */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const { data } = await supabase
    .from("participant_blocks")
    .select("blocked_id, created_at, blocked:participants!participant_blocks_blocked_id_fkey(name)")
    .eq("blocker_id", registration.participant_id)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    blocked_id: string;
    created_at: string;
    blocked: { name: string } | null;
  }>).map((b) => ({ participant_id: b.blocked_id, name: b.blocked?.name ?? "", created_at: b.created_at }));
});
