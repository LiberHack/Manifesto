import { requireRegistration } from "#server/utils/requireRegistration";
import { requireTeamLeadership } from "#server/utils/registrationContext";

export default defineEventHandler(async (event) => {
  const ctx = await requireRegistration(event);
  const { supabase } = ctx;

  const teamId = getRouterParam(event, "id");
  await requireTeamLeadership(
    ctx,
    teamId!,
    "Only the team leader can rotate the invite link",
  );

  const { data, error } = await supabase.rpc("rotate_team_invite_code", {
    team_id: teamId!,
  });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return { invite_code: data };
});
