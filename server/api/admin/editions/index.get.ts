import { requireAdmin } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("editions")
    .select(
      "slug, name, starts_at, ends_at, status, is_current, participant_cap, ops_enabled, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/editions] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  return data ?? [];
});
