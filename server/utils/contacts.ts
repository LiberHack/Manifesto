import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactInput } from "#server/utils/profileInput";

/** Columns of registration_contacts a participant may see about themselves. */
export const OWN_CONTACT_COLUMNS =
  "method, handle, other_label, share_with_team, reachable_confirmed_at, updated_at";

/**
 * Save a registration's preferred contact. Changing the method or handle
 * clears the organizer's reachability confirmation, since it no longer
 * describes the saved value.
 */
export async function saveContact(
  supabase: SupabaseClient,
  registrationId: string,
  contact: ContactInput,
): Promise<{ error: { message: string } | null }> {
  const { data: current } = await supabase
    .from("registration_contacts")
    .select("method, handle, other_label, reachable_confirmed_at")
    .eq("registration_id", registrationId)
    .maybeSingle();

  const unchanged =
    current &&
    current.method === contact.method &&
    current.handle === contact.handle &&
    current.other_label === contact.other_label;

  const { error } = await supabase.from("registration_contacts").upsert({
    registration_id: registrationId,
    ...contact,
    reachable_confirmed_at: unchanged ? current.reachable_confirmed_at : null,
    reachable_confirmed_by: unchanged ? undefined : null,
    updated_at: new Date().toISOString(),
  });

  return { error };
}
