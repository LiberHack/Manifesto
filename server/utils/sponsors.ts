import type { SupabaseClient } from "@supabase/supabase-js";

export interface SponsorRecipient {
  id: string;
  organisation: string;
  purpose: string;
  shared_fields: string[];
}

/**
 * The named organisations participant data may be shared with in an edition —
 * exactly what the registration form shows and the acknowledgment covers.
 */
export async function listActiveRecipients(
  supabase: SupabaseClient,
  editionSlug: string,
): Promise<SponsorRecipient[]> {
  const { data, error } = await supabase
    .from("sponsor_recipients")
    .select("id, organisation, purpose, shared_fields")
    .eq("edition_slug", editionSlug)
    .is("retired_at", null)
    .order("organisation");
  if (error) {
    console.error("[sponsors] list failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return (data ?? []) as SponsorRecipient[];
}
