import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";
import { listActiveRecipients } from "#server/utils/sponsors";

interface Prefill {
  skills: string[];
  experience: "beginner" | "intermediate" | "experienced" | null;
}

/**
 * State for /ops/register-edition: the current edition, whether the caller is
 * already registered, whether it is full, the sponsor recipients the
 * acknowledgment covers, and values to pre-fill.
 *
 * Pre-fill carries skills and experience only — from the most recent prior
 * registration, or the signup form's metadata for a first-time account.
 * Catering, the public-archive choice and every consent are asked afresh.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  if (!edition) {
    return {
      edition: null,
      registered: false,
      full: true,
      ops_open: false,
      prefill: null,
      notice_version: PRIVACY_NOTICE_VERSION,
      sponsor_recipients: [],
      dietary_notes_enabled: false,
    };
  }

  const [{ data: current }, { data: prior }, { count }, recipients, notes] = await Promise.all([
    supabase
      .from("registrations")
      .select("id")
      .eq("participant_id", user.sub)
      .eq("edition_slug", edition.slug)
      .maybeSingle(),
    supabase
      .from("registrations")
      .select("skills, experience")
      .eq("participant_id", user.sub)
      .neq("edition_slug", edition.slug)
      .order("registered_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("edition_slug", edition.slug),
    listActiveRecipients(supabase, edition.slug),
    // Free-text dietary notes only once a catering retention period is decided.
    supabase.rpc("dietary_notes_enabled"),
  ]);

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const experience = metadata.experience;

  const prefill: Prefill = prior
    ? (prior as Prefill)
    : {
        skills: Array.isArray(metadata.skills) ? (metadata.skills as string[]) : [],
        experience:
          experience === "beginner" ||
          experience === "intermediate" ||
          experience === "experienced"
            ? experience
            : null,
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
    ops_open: edition.ops_enabled,
    // `experience` is deliberately surfaced as a pre-selected value that the
    // form re-requires, so the user consciously re-answers it each edition.
    prefill,
    notice_version: PRIVACY_NOTICE_VERSION,
    sponsor_recipients: recipients,
    dietary_notes_enabled: notes.data === true,
  };
});
