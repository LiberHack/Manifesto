import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);

  if (!user) return { count: 0 };

  const supabase = useSupabaseAdmin();

  const { data: participant } = await supabase
    .from("participants")
    .select("team:teams(id, leader_id)")
    .eq("id", user.sub)
    .single();

  const team = participant?.team as { id: string; leader_id: string } | null;
  if (!team || team.leader_id !== user.sub) return { count: 0 };

  const { count } = await supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .eq("status", "pending");

  return { count: count ?? 0 };
});
