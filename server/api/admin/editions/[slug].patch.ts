import { requireAdmin } from "#server/utils/adminAuth";
import { analyticsActivationAllowed } from "#server/utils/analytics";
import { dispatchDueJobs } from "#server/utils/notifications";

const MAX_NAME_LENGTH = 80;

interface Body {
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  participant_cap?: unknown;
  ops_enabled?: unknown;
  analytics_enabled?: unknown;
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

  if (body.ops_enabled !== undefined) {
    if (typeof body.ops_enabled !== "boolean") {
      throw createError({
        statusCode: 400,
        message: "ops_enabled must be a boolean",
      });
    }
    update.ops_enabled = body.ops_enabled;
  }

  // Turning analytics on is a deliberate decision gated on the launch blockers
  // in docs/privacy/README.md; nothing enables it automatically.
  if (body.analytics_enabled !== undefined) {
    if (typeof body.analytics_enabled !== "boolean") {
      throw createError({
        statusCode: 400,
        message: "analytics_enabled must be a boolean",
      });
    }
    if (body.analytics_enabled && !analyticsActivationAllowed(useRuntimeConfig())) {
      throw createError({ statusCode: 409, message: "analytics_activation_not_allowed" });
    }
    update.analytics_enabled = body.analytics_enabled;
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
    if (error.message?.includes("cap_below_reserved_seats")) {
      throw createError({
        statusCode: 409,
        message: "The cap can't be lower than the seats already accepted or offered",
      });
    }
    console.error("[admin/editions.patch] update failed:", error.message);
    throw createError({ statusCode: 500, message: "Failed to update edition" });
  }

  // A cap raise offers the new seats to the waitlist (DB trigger) with a
  // deadline; send those offers now rather than waiting for an operations run.
  if (update.participant_cap !== undefined) {
    await dispatchDueJobs(supabase, 100).catch(() => {});
  }

  return data;
});
