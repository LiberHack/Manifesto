import { requireRegistration } from "#server/utils/requireRegistration";

export default defineEventHandler(async (event) => {
  const { edition, supabase } = await requireRegistration(event);

  const { skills } = getQuery(event) as { skills?: string };

  let query = supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, members:registrations!registrations_team_id_fkey(id)",
    )
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: false });

  if (skills) {
    const skillList = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    query = query.overlaps("skills_wanted", skillList);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[teams.get] query failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to fetch teams" });
  }

  return data ?? [];
});
