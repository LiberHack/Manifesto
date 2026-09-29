import { requireRegistration } from "#server/utils/requireRegistration";
import { membershipError } from "#server/utils/joinRequests";

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const code = getRouterParam(event, "code");
  const body = await readBody<{ confirm_switch?: boolean }>(event).catch(
    () => ({}) as { confirm_switch?: boolean },
  );

  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("invite_code", code!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!team) throw createError({ statusCode: 404, message: "Invite link not found" });

  if (registration.team_id === team.id) {
    throw createError({ statusCode: 409, message: "Already in this team" });
  }

  if (registration.team_id && !body?.confirm_switch) {
    throw createError({ statusCode: 409, message: "already_in_team" });
  }

  // One transaction: a switch leaves the old team (handing over or dissolving
  // it) only if the new team still has room, and closes the person's other
  // open requests as joined_other_team.
  const { error } = await supabase.rpc("join_team", {
    p_registration: registration.id,
    p_team: team.id,
    p_source: "invite_link",
    p_allow_switch: Boolean(body?.confirm_switch),
  });
  if (error) membershipError(error, "invite.accept");

  return { team_id: team.id, team_name: team.name };
});
