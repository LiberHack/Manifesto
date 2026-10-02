import { requireRegistration } from "#server/utils/requireRegistration";
import { OWN_CONTACT_COLUMNS } from "#server/utils/contacts";

/** The caller's own preferred contact for the current edition, or null. */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);

  const { data } = await supabase
    .from("registration_contacts")
    .select(OWN_CONTACT_COLUMNS)
    .eq("registration_id", registration.id)
    .maybeSingle();

  return data ?? null;
});
