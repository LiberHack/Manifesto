import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, "code");
  setHeader(event, "Cache-Control", "public, max-age=300");
  const supabase = useSupabaseAdmin();

  const edition = await getCurrentEdition(supabase);
  if (!edition) {
    throw createError({ statusCode: 404, message: "Invite link not found" });
  }

  const { data: team, error } = await supabase
    .from("teams")
    .select("id, name, description, skills_wanted")
    .eq("invite_code", code!)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (error || !team) {
    throw createError({ statusCode: 404, message: "Invite link not found" });
  }

  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  return { ...team, member_count: count ?? 0 };
});
