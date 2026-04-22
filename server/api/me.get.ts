import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const { data: participant, error } = await supabase
    .from("participants")
    .select(
      "id, name, email, skills, role, created_at, team:teams(id, name, skills_wanted, description, leader_id)",
    )
    .eq("id", user.sub)
    .single();

  if (error) throw createError({ statusCode: 500, message: error.message });
  return participant;
});
