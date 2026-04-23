import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("participants")
    .select("id, name, email, skills, role, team_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw createError({ statusCode: 500, message: error.message });
  return data;
});
