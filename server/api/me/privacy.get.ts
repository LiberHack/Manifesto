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
  recorded_at: string;
}

/**
 * The caller's current privacy choices, for /ops/privacy. Account-level
 * choices work without a registration; edition-level ones (sponsor
 * acknowledgment, dietary note) only exist once registered.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });
  setHeader(event, "Cache-Control", "no-store, private");

  const supabase = useSupabaseAdmin();
  const edition = await getCurrentEdition(supabase);

  const { data: rows, error } = await supabase
    .from("consent_records")
    .select("purpose, edition_slug, decision, recipient_ids, recorded_at")
    .eq("participant_id", user.sub)
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw createError({ statusCode: 500, message: "Internal server error" });

  const latest = (purpose: string, editionSlug: string | null) =>
    ((rows ?? []) as ConsentRow[]).find(
      (r) => r.purpose === purpose && r.edition_slug === editionSlug,
    ) ?? null;

  const marketing = latest("marketing_email", null);
  const base = {
    notice_version: PRIVACY_NOTICE_VERSION,
    marketing_email: marketing?.decision === "granted",
    marketing_answered: marketing !== null,
  };

  if (!edition) return { ...base, edition: null, registration: null };

  const { data: registration } = await supabase
    .from("registrations")
    .select("id, public, catering:registration_catering(diet, note)")
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration) {
    return { ...base, edition: { slug: edition.slug, name: edition.name }, registration: null };
  }

  const recipients = await listActiveRecipients(supabase, edition.slug);
  const sponsor = latest("sponsor_sharing", edition.slug);
  const acknowledged = sponsor?.decision === "acknowledged" ? (sponsor.recipient_ids ?? []) : [];
  const catering = registration.catering as
    | { diet: string; note: string | null }
    | { diet: string; note: string | null }[]
    | null;
  const cateringRow = Array.isArray(catering) ? (catering[0] ?? null) : catering;

  return {
    ...base,
    edition: { slug: edition.slug, name: edition.name },
    registration: {
      public: registration.public as boolean,
      has_dietary_note: Boolean(cateringRow?.note),
      sponsor: {
        recipients,
        acknowledged_recipient_ids: acknowledged,
        // A recipient added after the person acknowledged is not covered.
        covers_current: recipients.every((r) => acknowledged.includes(r.id)),
        objected: sponsor?.decision === "objected",
      },
    },
  };
});
