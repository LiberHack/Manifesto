import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, members:participants(id, name, email)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/teams] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
