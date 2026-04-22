import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

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
  return request;
});
