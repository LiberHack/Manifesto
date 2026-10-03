import { requireRegistration } from "#server/utils/requireRegistration";
import { parseContact } from "#server/utils/profileInput";
import { OWN_CONTACT_COLUMNS, saveContact } from "#server/utils/contacts";

/**
 * Set the caller's preferred contact. This is how participants registered
 * before contacts were required complete it.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const contact = parseContact(await readBody(event));

  const { error } = await saveContact(supabase, registration.id, contact);
  if (error) {
    console.error("[me/contact.put] save failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to save contact" });
  }

  const { data } = await supabase
    .from("registration_contacts")
    .select(OWN_CONTACT_COLUMNS)
    .eq("registration_id", registration.id)
    .single();

  return data;
});
