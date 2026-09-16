import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

/**
 * Pending join requests awaiting the caller's decision as team leader.
 * Returns 0 rather than erroring for spectators — it backs a passive banner.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) return { count: 0 };

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition) return { count: 0 };

  const { data: registration } = await supabase
    .from("registrations")
    .select("id, team_id")
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration?.team_id) return { count: 0 };

  const { data: team } = await supabase
    .from("teams")
    .select("id, leader_id")
    .eq("id", registration.team_id)
    .maybeSingle();

  if (!team || team.leader_id !== registration.id) return { count: 0 };

  const { count } = await supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending");

  return { count: count ?? 0 };
});
