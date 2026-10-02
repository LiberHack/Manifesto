import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { listActiveRecipients } from "#server/utils/sponsors";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";

interface ConsentRow {
  purpose: string;
  edition_slug: string | null;
  decision: string;
  recipient_ids: string[] | null;
}

/** "yes" / "no" for a current choice, "unanswered" when only a legacy
 * acknowledgment (or nothing) exists, "objected" for a recorded objection. */
export type SponsorChoiceState = "yes" | "no" | "unanswered" | "objected";

/**
 * The caller's current privacy choices, for /ops/privacy. Account-level
 * choices work without a registration; edition-level ones (sponsor sharing,
 * dietary note) only exist once registered.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });
  setHeader(event, "Cache-Control", "no-store, private");

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  // Ordered newest first, so the first match is the decision in force.
  const { data: rows, error } = await supabase
    .from("consent_records")
    .select("purpose, edition_slug, decision, recipient_ids")
    .eq("participant_id", user.sub)
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  const records = (rows ?? []) as ConsentRow[];

  const marketing = records.find((r) => r.purpose === "marketing_email" && r.edition_slug === null);
  const base = {
    notice_version: PRIVACY_NOTICE_VERSION,
    marketing_email: marketing?.decision === "granted",
    marketing_answered: marketing !== undefined,
  };

  if (!edition) return { ...base, edition: null, registration: null };

  const { data: registration } = await supabase
    .from("registrations")
    .select("id, public, recruitment_adult, catering:registration_catering(note)")
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration) {
    return { ...base, edition: { slug: edition.slug, name: edition.name }, registration: null };
  }

  const recipients = await listActiveRecipients(supabase, edition.slug);
  const choiceFor = (recipientId: string): SponsorChoiceState => {
    const current = records.find(
      (r) =>
        r.purpose === "sponsor_sharing" &&
        r.edition_slug === edition.slug &&
        r.recipient_ids !== null &&
        (r.recipient_ids.includes(recipientId) || r.recipient_ids.length === 0),
    );
    switch (current?.decision) {
      case "granted":
        return "yes";
      case "denied":
      case "withdrawn":
        return "no";
      case "objected":
        return "objected";
      default:
        // Includes legacy `acknowledged` rows: never treated as an answer.
        return "unanswered";
    }
  };

  const catering = registration.catering as { note: string | null } | { note: string | null }[] | null;
  const cateringRow = Array.isArray(catering) ? (catering[0] ?? null) : catering;

  return {
    ...base,
    edition: { slug: edition.slug, name: edition.name },
    registration: {
      public: registration.public as boolean,
      recruitment_adult: registration.recruitment_adult as boolean | null,
      has_dietary_note: Boolean(cateringRow?.note),
      sponsors: recipients.map((r) => ({ ...r, choice: choiceFor(r.id) })),
    },
  };
});
