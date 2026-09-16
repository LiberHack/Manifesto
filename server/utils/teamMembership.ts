import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Detach a registration from the team it currently belongs to.
 *
 * If the departing member leads that team, leadership passes to the
 * earliest-registered remaining member; a sole leader's team is dissolved.
 * This mirrors the `handle_leader_departure` trigger, which covers the
 * registration-delete path that never reaches app code.
 *
 * Leaves `registrations.team_id` untouched — the caller decides whether the
 * member becomes teamless or joins another team.
 */
export async function releaseTeamLeadership(
  supabase: SupabaseClient,
  registrationId: string,
  teamId: string,
): Promise<void> {
  const { data: team } = await supabase
    .from("teams")
    .select("id, leader_id")
    .eq("id", teamId)
    .maybeSingle();

  if (!team || team.leader_id !== registrationId) return;

  const { data: otherMembers } = await supabase
    .from("registrations")
    .select("id")
    .eq("team_id", teamId)
    .neq("id", registrationId)
    .order("registered_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  const successor = otherMembers?.[0];

  if (successor) {
    await supabase
      .from("teams")
      .update({ leader_id: successor.id })
      .eq("id", teamId);
    await supabase
      .from("registrations")
      .update({ role: "leader" })
      .eq("id", successor.id);
    return;
  }

  // Last member — dissolve the team. registrations.team_id is ON DELETE SET NULL.
  await supabase.from("teams").delete().eq("id", teamId);
}
