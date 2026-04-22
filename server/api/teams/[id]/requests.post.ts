import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { sendJoinRequestNotification } from "#server/utils/email";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const teamId = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  // Block if already in a team
  const { data: participant } = await supabase
    .from("participants")
    .select("team_id")
    .eq("id", user.sub)
    .single();

  if (participant?.team_id) {
    throw createError({ statusCode: 409, message: "Already in a team" });
  }

  // Block if team is full
  const { data: members } = await supabase
    .from("participants")
    .select("id")
    .eq("team_id", teamId!);

  if ((members?.length ?? 0) >= 6) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  // Block if request already pending
  const { data: existing } = await supabase
    .from("join_requests")
    .select("id")
    .eq("participant_id", user.sub)
    .eq("team_id", teamId!)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    throw createError({ statusCode: 409, message: "Request already pending" });
  }

  const { data: request, error } = await supabase
    .from("join_requests")
    .insert({ participant_id: user.sub, team_id: teamId! })
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });

  // Notify team leader — fire and forget, don't block response
  void (async () => {
    const { data: team } = await supabase
      .from("teams")
      .select("name, leader_id")
      .eq("id", teamId!)
      .single();
    if (!team) return;

    const [requester, leader] = await Promise.all([
      supabase.from("participants").select("name").eq("id", user.sub).single(),
      supabase
        .from("participants")
        .select("email")
        .eq("id", team.leader_id)
        .single(),
    ]);

    if (leader.data?.email && requester.data?.name) {
      await sendJoinRequestNotification(
        leader.data.email,
        requester.data.name,
        team.name,
      ).catch(() => {});
    }
  })();

  return request;
});
