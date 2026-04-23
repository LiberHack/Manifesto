import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, members:participants(id, name, email)",
    )
    .order("created_at", { ascending: false });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
