import { requireAdmin } from "#server/utils/adminAuth";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 80;

interface Body {
  slug?: unknown;
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  participant_cap?: unknown;
}

function readDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw createError({
      statusCode: 400,
      message: `${field} must be an ISO date string`,
    });
  }
  return new Date(value).toISOString();
}

/**
 * Create the next edition as a draft. It stays invisible to participants until
 * it is promoted via /api/admin/editions/[slug]/go-live.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const body = await readBody<Body>(event);

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!SLUG_PATTERN.test(slug)) {
    throw createError({
      statusCode: 400,
      message: "slug must be lowercase alphanumeric words separated by hyphens",
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `name is required and must be ${MAX_NAME_LENGTH} characters or fewer`,
    });
  }

  const starts_at = readDate(body.starts_at, "starts_at");
  const ends_at = readDate(body.ends_at, "ends_at");

  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) {
    throw createError({ statusCode: 400, message: "ends_at must be after starts_at" });
  }

  const cap = body.participant_cap === undefined ? 120 : Number(body.participant_cap);
  if (!Number.isInteger(cap) || cap < 1) {
    throw createError({
      statusCode: 400,
      message: "participant_cap must be a positive integer",
    });
  }

  const { data, error } = await supabase
    .from("editions")
    .insert({ slug, name, starts_at, ends_at, status: "draft", participant_cap: cap })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, message: "An edition with that slug already exists" });
    }
    console.error("[admin/editions.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to create edition" });
  }

  return data;
});
