import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const { skills } = getQuery(event) as { skills?: string };
  const supabase = useSupabaseAdmin();

  let query = supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, members:participants(id)",
    )
    .order("created_at", { ascending: false });

  if (skills) {
    const skillList = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    query = query.overlaps("skills_wanted", skillList);
  }

  const { data, error } = await query;
  if (error) throw createError({ statusCode: 500, message: error.message });

  // Only return teams with fewer than 6 members
  return (data ?? []).filter((team) => team.members.length < 6);
});
