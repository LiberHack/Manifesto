import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { isValidLinkTag } from "#shared/utils/source";

/**
 * Short links for QR codes and bios: `/go/poster-fmi` → `/?src=poster-fmi`.
 *
 * The destination is always the homepage, so this can never become an open
 * redirect. Unknown, inactive or archived tags go to `/` without a tag. The
 * redirect records nothing — only the landing page does, so a visit through a
 * short link is never counted twice.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  const tag = getRouterParam(event, "tag");
  if (!isValidLinkTag(tag)) return sendRedirect(event, "/", 302);

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);
  if (!edition) return sendRedirect(event, "/", 302);

  const { data: link } = await supabase
    .from("source_links")
    .select("tag")
    .eq("tag", tag)
    .eq("edition_slug", edition.slug)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  return sendRedirect(event, link ? `/?src=${encodeURIComponent(tag)}` : "/", 302);
});
