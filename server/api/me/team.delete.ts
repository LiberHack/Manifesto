import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();

  const { data: participant } = await supabase
    .from("participants")
    .select("team_id, team:teams(leader_id)")
    .eq("id", user.sub)
    .single();

  if (!participant?.team_id) {
    throw createError({ statusCode: 400, message: "Not in a team" });
  }

  const teamId = participant.team_id;
  const team = participant.team as unknown as { leader_id: string } | null;

  if (team?.leader_id === user.sub) {
    const { data: otherMembers } = await supabase
      .from("participants")
      .select("id, created_at")
      .eq("team_id", teamId)
      .neq("id", user.sub)
      .order("created_at", { ascending: true });

    if (otherMembers && otherMembers.length > 0) {
      // Promote the longest-standing member to leader
      await supabase
        .from("teams")
        .update({ leader_id: otherMembers[0]?.id })
        .eq("id", teamId);
    } else {
      // Last member — delete the team (cascade sets team_id to null)
      await supabase.from("teams").delete().eq("id", teamId);
    }
  }

  await supabase
    .from("participants")
    .update({ team_id: null })
    .eq("id", user.sub);

  // Cancel any pending join requests
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("participant_id", user.sub)
    .eq("status", "pending");

  return { ok: true };
});
