import { requireAdmin } from "#server/utils/adminAuth";

const MAX_NAME_LENGTH = 80;

interface Body {
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  participant_cap?: unknown;
}

function readDate(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw createError({
      statusCode: 400,
      message: `${field} must be an ISO date string`,
    });
  }
  return new Date(value).toISOString();
}

/** Edit an edition's display fields. The slug is immutable by convention. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const slug = getRouterParam(event, "slug");
  const body = await readBody<Body>(event);

  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw createError({
        statusCode: 400,
        message: `name must be 1-${MAX_NAME_LENGTH} characters`,
      });
    }
    update.name = name;
  }

  if (body.starts_at !== undefined) update.starts_at = readDate(body.starts_at, "starts_at");
  if (body.ends_at !== undefined) update.ends_at = readDate(body.ends_at, "ends_at");

  if (body.participant_cap !== undefined) {
    const cap = Number(body.participant_cap);
    if (!Number.isInteger(cap) || cap < 1) {
      throw createError({
        statusCode: 400,
        message: "participant_cap must be a positive integer",
      });
    }
    update.participant_cap = cap;
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("editions")
    .update(update)
    .eq("slug", slug!)
    .select()
    .single();

  if (error) {
    console.error("[admin/editions.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to update edition" });
  }

  return data;
});
