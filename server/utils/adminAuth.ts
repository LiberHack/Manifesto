import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

export async function requireAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const { data: participant } = await supabase
    .from("participants")
    .select("role")
    .eq("id", user.sub)
    .single();

  if (participant?.role !== "admin") {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  return { user, supabase };
}
