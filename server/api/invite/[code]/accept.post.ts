import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const code = getRouterParam(event, "code");
  const body = await readBody<{ confirm_switch?: boolean }>(event).catch(
    () => ({}),
  );
  const supabase = useSupabaseAdmin();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("invite_code", code!)
    .single();

  if (!team) throw createError({ statusCode: 404, message: "Invite link not found" });

  const { data: participant } = await supabase
    .from("participants")
    .select("id, team_id")
    .eq("id", user.sub)
    .single();

  if (!participant) throw createError({ statusCode: 404, message: "Participant not found" });

  if (participant.team_id === team.id) {
    throw createError({ statusCode: 409, message: "Already in this team" });
  }

  if (participant.team_id && !body.confirm_switch) {
    throw createError({ statusCode: 409, message: "already_in_team" });
  }

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  if ((count ?? 0) >= 6) {
    throw createError({ statusCode: 409, message: "Team is full" });
  }

  const { error } = await supabase
    .from("participants")
    .update({ team_id: team.id })
    .eq("id", user.sub);

  if (error) throw createError({ statusCode: 500, message: error.message });

  // Cancel any pending join requests for the new member
  await supabase
    .from("join_requests")
    .update({ status: "rejected" })
    .eq("participant_id", user.sub)
    .eq("status", "pending");

  return { team_id: team.id, team_name: team.name };
});
