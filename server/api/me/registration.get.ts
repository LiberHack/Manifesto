import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

interface Prefill {
  skills: string[];
  dietary: string | null;
  experience: "beginner" | "intermediate" | "experienced" | null;
  public: boolean;
}

/**
 * State for /ops/register-edition: the current edition, whether the caller is
 * already registered, how many seats remain, and the values to pre-fill.
 *
 * Pre-fill comes from the most recent prior registration; for a first-time
 * account it falls back to the metadata captured on the signup form.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  if (!edition) {
    return { edition: null, registered: false, full: true, prefill: null };
  }

  const [{ data: current }, { data: prior }, { count }] = await Promise.all([
    supabase
      .from("registrations")
      .select("id")
      .eq("participant_id", user.sub)
      .eq("edition_slug", edition.slug)
      .maybeSingle(),
    supabase
      .from("registrations")
      .select("skills, dietary, experience, public")
      .eq("participant_id", user.sub)
      .neq("edition_slug", edition.slug)
      .order("registered_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("edition_slug", edition.slug),
  ]);

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const experience = metadata.experience;

  const prefill: Prefill = prior
    ? (prior as Prefill)
    : {
        skills: Array.isArray(metadata.skills) ? (metadata.skills as string[]) : [],
        dietary:
          typeof metadata.dietary === "string" && metadata.dietary.trim()
            ? (metadata.dietary as string).trim()
            : null,
        experience:
          experience === "beginner" ||
          experience === "intermediate" ||
          experience === "experienced"
            ? experience
            : null,
        public: true,
      };

  return {
    // Public edition fields only: the cap is an implementation detail of `full`.
    edition: {
      slug: edition.slug,
      name: edition.name,
      starts_at: edition.starts_at,
      ends_at: edition.ends_at,
    },
    registered: Boolean(current),
    // Boolean only — see /api/editions/current for why no count is exposed.
    full: (count ?? 0) >= edition.participant_cap,
    // `experience` is deliberately surfaced as a pre-selected value that the
    // form re-requires, so the user consciously re-answers it each edition.
    prefill,
  };
});
