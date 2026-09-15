import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

/**
 * Public view of the edition currently open for registration, plus how many
 * places remain. Backs the signup form's "registration is full" state.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=30");

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  if (!edition) return { edition: null, seats_left: 0 };

  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("edition_slug", edition.slug);

  return {
    edition: {
      slug: edition.slug,
      name: edition.name,
      starts_at: edition.starts_at,
      ends_at: edition.ends_at,
    },
    seats_left: Math.max(0, edition.participant_cap - (count ?? 0)),
  };
});
