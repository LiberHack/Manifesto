import {
  assertEditionWritable,
  requireAdmin,
  resolveAdminEdition,
} from "#server/utils/adminAuth";

const ALLOWED_FIELDS = ["name", "email", "skills", "experience"] as const;

/**
 * Add a named sponsor organisation to an edition. Participants who already
 * acknowledged sharing are *not* covered for it: their acknowledgment lists
 * the recipients they saw, so they are asked again on /ops/privacy.
 *
 * Organisation, purpose and fields cannot be edited afterwards — that would
 * change what people acknowledged. Retire it and add a new one instead.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const body = await readBody<{ organisation?: unknown; purpose?: unknown; shared_fields?: unknown }>(event);
  const organisation = typeof body?.organisation === "string" ? body.organisation.trim() : "";
  if (organisation.length < 1 || organisation.length > 120) {
    throw createError({ statusCode: 400, message: "organisation is required (max 120 chars)" });
  }
  const purpose =
    typeof body.purpose === "string" && body.purpose.trim() !== ""
      ? body.purpose.trim()
      : "Internship and job recruitment";
  if (purpose.length > 300) {
    throw createError({ statusCode: 400, message: "purpose must be 300 characters or fewer" });
  }
  const fields = body.shared_fields ?? ALLOWED_FIELDS;
  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !fields.every((f) => ALLOWED_FIELDS.includes(f as (typeof ALLOWED_FIELDS)[number]))
  ) {
    throw createError({
      statusCode: 400,
      message: `shared_fields may only contain: ${ALLOWED_FIELDS.join(", ")}`,
    });
  }

  const { data, error } = await supabase
    .from("sponsor_recipients")
    .insert({
      edition_slug: edition.slug,
      organisation,
      purpose,
      shared_fields: [...new Set(fields as string[])],
    })
    .select()
    .single();
  if (error) {
    console.error("[admin/sponsors.post] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
