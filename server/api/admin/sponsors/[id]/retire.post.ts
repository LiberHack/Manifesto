import { assertEditionWritable, requireAdmin } from "#server/utils/adminAuth";
import type { Edition } from "#server/utils/registrationContext";

/** Stop sharing with a recipient. Kept, not deleted: past acknowledgments and
 * the export audit still reference it. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");

  const { data: owner } = await supabase
    .from("sponsor_recipients")
    .select("edition:editions(status)")
    .eq("id", id!)
    .maybeSingle();
  if (!owner) throw createError({ statusCode: 404, message: "Recipient not found" });
  assertEditionWritable((owner as unknown as { edition: Edition }).edition);

  const { data, error } = await supabase
    .from("sponsor_recipients")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", id!)
    .is("retired_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  if (!data) throw createError({ statusCode: 404, message: "Active recipient not found" });
  return { ok: true };
});
