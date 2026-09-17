import { requireAdmin } from "#server/utils/adminAuth";

/**
 * Promote a draft edition to live, archiving the outgoing one.
 *
 * Both flips happen inside promote_edition() so the one-current invariant is
 * never violated and the site is never left without a live edition.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const slug = getRouterParam(event, "slug");

  const { data, error } = await supabase.rpc("promote_edition", {
    target_slug: slug!,
  });

  if (error) {
    if (error.message?.includes("edition_not_draft")) {
      throw createError({
        statusCode: 409,
        message: "Only a draft edition can be promoted to live",
      });
    }
    console.error("[admin/editions.go-live] failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to promote edition" });
  }

  return data;
});
