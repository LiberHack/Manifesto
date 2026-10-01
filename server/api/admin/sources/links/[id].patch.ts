import { assertEditionWritable, requireAdmin } from "#server/utils/adminAuth";
import type { Edition } from "#server/utils/registrationContext";
import { SOURCE_CHANNELS, type SourceChannel } from "#shared/utils/source";

/**
 * Edit a link's label, note, channel or active flag, or archive it. The tag is
 * immutable and archiving is one-way (both enforced by a trigger too).
 * Disabling stops new visits from counting; recorded history is untouched.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const id = getRouterParam(event, "id");
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};

  const { data: owner } = await supabase
    .from("source_links")
    .select("edition:editions(status)")
    .eq("id", id!)
    .maybeSingle();
  if (!owner) throw createError({ statusCode: 404, message: "Link not found" });
  assertEditionWritable((owner as unknown as { edition: Edition }).edition);

  const update: Record<string, unknown> = {};
  if (body.tag !== undefined) {
    throw createError({ statusCode: 400, message: "tag cannot be changed" });
  }
  if (body.label !== undefined) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 80) {
      throw createError({ statusCode: 400, message: "label is required (max 80 chars)" });
    }
    update.label = label;
  }
  if (body.note !== undefined) {
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (note && note.length > 300) {
      throw createError({ statusCode: 400, message: "note must be 300 characters or fewer" });
    }
    update.note = note || null;
  }
  if (body.channel !== undefined) {
    if (!SOURCE_CHANNELS.includes(body.channel as SourceChannel)) {
      throw createError({ statusCode: 400, message: "invalid channel" });
    }
    update.channel = body.channel;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      throw createError({ statusCode: 400, message: "active must be a boolean" });
    }
    update.active = body.active;
  }
  if (body.archived === true) {
    update.archived_at = new Date().toISOString();
    update.active = false;
  }
  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("source_links")
    .update(update)
    .eq("id", id!)
    .select("id, tag, label, note, channel, active, created_at, archived_at")
    .maybeSingle();
  if (error) {
    if (error.message.includes("archived source link")) {
      throw createError({ statusCode: 409, message: "Archived links cannot be restored" });
    }
    console.error("[admin/sources/links.patch] failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  if (!data) throw createError({ statusCode: 404, message: "Link not found" });
  return data;
});
