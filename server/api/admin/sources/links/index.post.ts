import {
  assertEditionWritable,
  requireAdmin,
  resolveAdminEdition,
} from "#server/utils/adminAuth";
import { SOURCE_CHANNELS, isValidLinkTag, type SourceChannel } from "#shared/utils/source";

/**
 * Create a source link. Tags are unique forever — an archived tag is never
 * reissued — so a 409 means "pick another tag", even across editions.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const body = await readBody<Record<string, unknown>>(event);
  const tag = typeof body?.tag === "string" ? body.tag.trim().toLowerCase() : "";
  if (!isValidLinkTag(tag)) {
    throw createError({
      statusCode: 400,
      message:
        "tag must be 2–48 characters of a–z, 0–9 and '-', and not direct, unknown or ref-*",
    });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (label.length < 1 || label.length > 80) {
    throw createError({ statusCode: 400, message: "label is required (max 80 chars)" });
  }
  const note = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;
  if (note && note.length > 300) {
    throw createError({ statusCode: 400, message: "note must be 300 characters or fewer" });
  }
  if (!SOURCE_CHANNELS.includes(body.channel as SourceChannel)) {
    throw createError({
      statusCode: 400,
      message: `channel must be one of: ${SOURCE_CHANNELS.join(", ")}`,
    });
  }

  const { data, error } = await supabase
    .from("source_links")
    .insert({ tag, label, note, channel: body.channel, edition_slug: edition.slug })
    .select("id, tag, label, note, channel, active, created_at, archived_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, message: "That tag has already been used" });
    }
    console.error("[admin/sources/links.post] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data;
});
